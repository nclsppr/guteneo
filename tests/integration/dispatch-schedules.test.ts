import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { DomainService, sha256, type ActorContext, type Dispatch } from "../../packages/domain/src/index";
import { DispatchScheduleService } from "../../apps/api/src/dispatch-schedules";
import { FUTURE_SPENDING_ACKNOWLEDGEMENT, type DispatchScheduleView } from "../../packages/contracts/src/dispatch-schedules";
import { migratedD1 } from "../helpers/migrated-d1";
import { scheduledProductionFixtures } from "../helpers/scheduled-production-fixture";
import { createLiveProviderHook } from "../../apps/api/src/live-providers";

let fixture: Awaited<ReturnType<typeof migratedD1>>, domain: DomainService, schedules: DispatchScheduleService;
const admin: ActorContext = { organizationId: "org_atelier", userId: "user_atelier", role: "admin", actor: "browser", documentSessionHash: "a".repeat(64) };
const member: ActorContext = { ...admin, userId: "schedule_member", role: "member", documentSessionHash: undefined };
const other: ActorContext = { ...admin, organizationId: "org_studio", userId: "user_studio", documentSessionHash: undefined };
const items = new Map<string, { source: Dispatch; schedule: DispatchScheduleView }>();
let executeAt: string;
let production: Awaited<ReturnType<typeof scheduledProductionFixtures>>;
async function draft(label: string, actor = admin, fax = false) {
  const document = fax ? await domain.registerDocument(actor, { name: `Synthetic ${label}.pdf`, sha256: await sha256(label), size: 30, pages: 1, status: "ready", source: "import", storageKey: `synthetic/${label}.pdf`, privateToCreator: label === "fax" }) : undefined;
  const source = await domain.prepareDispatch(actor, fax ? { channel: "fax", recipient: { phone: "+35242123456" }, documentId: document!.id } : { channel: "email", recipient: { email: `${label}@example.invalid` }, subject: `Synthetic ${label} fixture`, text: "Immutable synthetic future message" }, crypto.randomUUID());
  const schedule = await schedules.create(actor, { dispatchId: source.id, executeAt, maxTotalMinor: source.estimated_minor }, crypto.randomUUID());
  items.set(label, { source, schedule });
  return { source, schedule };
}
async function approve(schedule: DispatchScheduleView) {
  return schedules.approve(admin, schedule.id, { expectedRevision: schedule.revision, snapshotHash: schedule.snapshotHash, acknowledgement: FUTURE_SPENDING_ACKNOWLEDGEMENT, recipientRequested: true });
}
beforeAll(async () => {
  fixture = await migratedD1("dispatch-schedules");
  for (const sql of readFileSync(new URL("../../scripts/seed.sql", import.meta.url), "utf8").replace(/^--.*$/gm, "").split(";").filter((sql) => sql.trim())) await fixture.db.prepare(sql).run();
  const now = new Date().toISOString();
  await fixture.db.prepare("INSERT INTO users(id,name,email,created_at) VALUES('schedule_member','Synthetic member','member@example.invalid',?)").bind(now).run();
  await fixture.db.prepare("INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,'schedule_member','member',?)").bind(admin.organizationId,now).run();
  await fixture.db.prepare("INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at) VALUES(?,?,?,'synthetic',0,1,?,?)").bind(admin.documentSessionHash, admin.userId,admin.organizationId,now,new Date(Date.now()+3600_000).toISOString()).run();
  domain = new DomainService(fixture.db, { mode: "simulation" });
  schedules = new DispatchScheduleService({ MODE: "simulation", SCHEDULED_DISPATCH_ENABLED: "true" }, domain);
  executeAt = new Date(Date.now()+65_000).toISOString();
  for (const label of ["success","cancel","cap","revoked","fax","purged","draft","revocation_race"])
    await draft(label, label === "revoked" ? member : admin, label === "fax" || label === "purged");
  for (const [label,item] of items) if (label !== "draft") item.schedule = await approve(item.schedule);
  production = await scheduledProductionFixtures(executeAt);
  executeAt = new Date(Math.max(Date.parse(executeAt),...production.map((f)=>Date.parse(f.schedule.executeAt)))).toISOString();
}, 30_000);
afterAll(async () => { await fixture?.mf.dispose(); for(const f of production??[])await f.dispose(); });

describe("separate future browser spending authority", () => {
  it("stores a distinct immutable grant, cancels the original and reserves no money before due", async () => {
    const item = items.get("success")!;
    expect(item.schedule.approvalKind).toBe("future_browser");
    expect((await domain.getDispatch(admin,item.source.id)).dispatch.status).toBe("cancelled");
    for (const actor of ["browser","mcp","native"] as const)
      await expect(domain.cancelDispatch({...admin,actor},item.source.id)).rejects.toMatchObject({code:"SCHEDULE_SOURCE_LOCKED"});
    expect(await fixture.db.prepare("SELECT revoked_at FROM dispatch_schedule_approvals WHERE schedule_id=?").bind(item.schedule.id).first()).toEqual({revoked_at:null});
    expect(await fixture.db.prepare("SELECT count(*) AS n FROM approvals").first()).toEqual({n:0});
    expect(await fixture.db.prepare("SELECT count(*) AS n FROM outbox").first()).toEqual({n:0});
    expect(await fixture.db.prepare("SELECT count(*) AS n FROM reservations").first()).toEqual({n:0});
    await expect(fixture.db.prepare("UPDATE dispatch_schedule_approvals SET user_id=? WHERE schedule_id=?").bind(member.userId,item.schedule.id).run()).rejects.toThrow("future_approval_immutable");
    await expect(fixture.db.prepare("UPDATE dispatch_schedules SET max_total_minor=max_total_minor+1,revision=revision+1 WHERE id=?").bind(item.schedule.id).run()).rejects.toThrow("dispatch_schedule_immutable");
  });
  it("does not let an assistant or native actor assert future human approval or borrow another tenant", async () => {
    const item=items.get("draft")!;
    for (const actor of ["mcp","native"] as const)
      await expect(schedules.approve({...admin,actor},item.schedule.id,{expectedRevision:1,snapshotHash:item.schedule.snapshotHash,acknowledgement:FUTURE_SPENDING_ACKNOWLEDGEMENT,recipientRequested:true})).rejects.toMatchObject({code:"BROWSER_REQUIRED"});
    await expect(schedules.get(other,item.schedule.id)).rejects.toMatchObject({code:"NOT_FOUND"});
    expect((await domain.getDispatch(admin,item.source.id)).activeSchedule).toEqual({id:item.schedule.id,status:"draft",executeAt:item.schedule.executeAt,maxTotalMinor:item.schedule.maxTotalMinor});
    await expect(domain.getDispatch(other,item.source.id)).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(domain.approveDispatch(admin,item.source.id,item.source.fingerprint,{recipientRequested:true})).rejects.toMatchObject({code:"SCHEDULE_SOURCE_LOCKED"});
    expect(await fixture.db.prepare("SELECT 1 FROM approvals WHERE dispatch_id=?").bind(item.source.id).first()).toBeNull();
    await expect(fixture.db.prepare("INSERT INTO approvals(id,organization_id,dispatch_id,user_id,fingerprint,expires_at,created_at,recipient_requested) VALUES(?,?,?,?,?,?,?,1)").bind(crypto.randomUUID(),admin.organizationId,item.source.id,admin.userId,item.source.fingerprint,new Date(Date.now()+600_000).toISOString(),new Date().toISOString()).run()).rejects.toThrow("scheduled_source_locked");
    await expect(domain.confirmDispatch(admin,item.source.id,crypto.randomUUID())).rejects.toMatchObject({code:"SCHEDULE_SOURCE_LOCKED"});
    for (const actor of ["browser","mcp","native"] as const)
      await expect(domain.cancelDispatch({...admin,actor},item.source.id)).rejects.toMatchObject({code:"SCHEDULE_SOURCE_LOCKED"});
    await expect(fixture.db.prepare("UPDATE dispatches SET status='cancelled' WHERE organization_id=? AND id=?").bind(admin.organizationId,item.source.id).run()).rejects.toThrow("scheduled_source_locked");
    expect((await domain.getDispatch(admin,item.source.id)).dispatch.status).toBe("prepared");
    expect(await schedules.get(admin,item.schedule.id)).toMatchObject({status:"draft",revision:1,approvalKind:null});
    const cancelled=await schedules.cancel(admin,item.schedule.id,{expectedRevision:1});
    expect(cancelled.status).toBe("cancelled");
    expect((await domain.getDispatch(admin,item.source.id)).activeSchedule).toBeUndefined();
    expect((await domain.cancelDispatch(admin,item.source.id)).status).toBe("cancelled");
  });
  it("refuses expired drafts and an expiry at the final approval write without cancelling the source",async()=>{
    async function historicalDraft(label:string,until:string){
      const source=await domain.prepareDispatch(admin,{channel:"email",recipient:{email:"expiry@example.invalid"},subject:`Synthetic ${label}`,text:"Exact synthetic expiry content"},crypto.randomUUID());
      const id=`sch_${crypto.randomUUID()}`,created=new Date(Date.now()-1000).toISOString(),at=new Date(Date.parse(until)-900_000).toISOString();
      // A persisted draft may age without a processor. Use historical draft
      // fixtures rather than mutating approved evidence or bypassing real time.
      await fixture.db.prepare("INSERT INTO dispatch_schedules(id,organization_id,source_dispatch_id,created_by,mode,channel,snapshot_hash,execute_at,release_until,max_total_minor,request_key,request_hash,status,revision,created_at,updated_at) VALUES(?,?,?,?,'simulation','email',?,?,?,100,?,?,'draft',1,?,?)").bind(id,admin.organizationId,source.id,admin.userId,"e".repeat(64),at,until,crypto.randomUUID(),"f".repeat(64),created,created).run();
      return {source,schedule:await schedules.get(admin,id)};
    }
    const expired=await historicalDraft("expired draft",new Date(Date.now()-1).toISOString());
    await expect(approve(expired.schedule)).rejects.toMatchObject({code:"SCHEDULE_WINDOW_EXPIRED"});
    const ending=await historicalDraft("expiry at commit",new Date(Date.now()+800).toISOString());
    let intercepted=0;
    const delayedDb={prepare:fixture.db.prepare.bind(fixture.db),batch:async(statements:D1PreparedStatement[])=>{
      intercepted++;
      await new Promise(resolve=>setTimeout(resolve,Math.max(0,Date.parse(ending.schedule.releaseUntil)-Date.now()+75)));
      return fixture.db.batch(statements);
    }} as unknown as D1Database;
    const racing=new DispatchScheduleService({MODE:"simulation",SCHEDULED_DISPATCH_ENABLED:"true"},new DomainService(delayedDb,{mode:"simulation"}));
    await expect(racing.approve(admin,ending.schedule.id,{expectedRevision:1,snapshotHash:ending.schedule.snapshotHash,acknowledgement:FUTURE_SPENDING_ACKNOWLEDGEMENT,recipientRequested:true})).rejects.toMatchObject({code:"SCHEDULE_WINDOW_EXPIRED"});
    expect(intercepted).toBe(1);
    for(const item of [expired,ending]){
      expect(await fixture.db.prepare("SELECT 1 FROM dispatch_schedule_approvals WHERE schedule_id=?").bind(item.schedule.id).first()).toBeNull();
      expect((await domain.getDispatch(admin,item.source.id)).dispatch.status).toBe("prepared");
      await schedules.cancel(admin,item.schedule.id,{expectedRevision:1});
    }
    const window=await historicalDraft("still in release window",new Date(Date.now()+60_000).toISOString());
    const granted=await approve(window.schedule);
    expect(granted.status).toBe("approved");
    await schedules.cancel(admin,granted.id,{expectedRevision:granted.revision});
  });
  it("cancels a grant without reopening its original and cannot revive revoked membership", async () => {
    const item=items.get("cancel")!;
    const cancelled=await schedules.cancel(admin,item.schedule.id,{expectedRevision:item.schedule.revision});
    expect(cancelled.status).toBe("cancelled");
    expect((await domain.getDispatch(admin,item.source.id)).dispatch.status).toBe("cancelled");
    await fixture.db.prepare("UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?").bind(member.organizationId,member.userId).run();
    await fixture.db.prepare("UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?").bind(member.organizationId,member.userId).run();
    expect(await schedules.get(admin,items.get("revoked")!.schedule.id)).toMatchObject({status:"blocked",errorCode:"MEMBERSHIP_CHANGED"});
    const purged=items.get("purged")!;
    await fixture.db.prepare("UPDATE documents SET status='purged' WHERE organization_id=? AND id=?").bind(admin.organizationId,purged.source.document_id).run();
  });
  it("keeps the activation gate closed, validates horizons and refuses sensitive/transfer workflows", async () => {
    expect(await new DispatchScheduleService({MODE:"simulation"},domain).processDue()).toEqual({processed:0,enabled:false});
    const item=items.get("success")!;
    await expect(schedules.create(admin,{dispatchId:item.source.id,executeAt:new Date(Date.now()-60_000).toISOString(),maxTotalMinor:1},crypto.randomUUID())).rejects.toBeInstanceOf(Error);
    const doc=await domain.registerDocument(admin,{name:"Synthetic PDF.pdf",sha256:await sha256("pdf email"),size:20,pages:1,status:"ready",source:"import",storageKey:"synthetic/pdf-email.pdf"});
    const pdf=await domain.prepareDispatch(admin,{channel:"email",documentId:doc.id,recipient:{email:"pdf@example.invalid"}},crypto.randomUUID());
    await expect(schedules.create(admin,{dispatchId:pdf.id,executeAt,maxTotalMinor:1000},crypto.randomUUID())).rejects.toMatchObject({code:"SCHEDULE_CHANNEL_UNSUPPORTED"});
  });
  it("requires a new explicit draft and grant after known cancellation and locks late orphan preparations",async()=>{
    const source=await domain.prepareDispatch(admin,{channel:"email",recipient:{email:"recover@example.invalid"},subject:"Synthetic recovery",text:"Exact synthetic recovery content"},crypto.randomUUID());
    const prior=await schedules.create(admin,{dispatchId:source.id,executeAt:new Date(Date.now()+120_000).toISOString(),maxTotalMinor:100},crypto.randomUUID());
    const approved=await approve(prior);
    const cancelled=await schedules.cancel(admin,prior.id,{expectedRevision:approved.revision});
    expect(cancelled.canReschedule).toBe(true);
    const next=await schedules.create(admin,{dispatchId:source.id,executeAt:new Date(Date.now()+180_000).toISOString(),maxTotalMinor:150},crypto.randomUUID());
    expect(next).toMatchObject({status:"draft",approvalKind:null,approvedBy:null,canReschedule:false});
    expect(next.id).not.toBe(prior.id);
    expect(await fixture.db.prepare("SELECT 1 FROM dispatch_schedule_approvals WHERE schedule_id=?").bind(next.id).first()).toBeNull();
    const orphan=await domain.prepareDispatch(admin,{channel:"email",recipient:JSON.parse(source.recipient_json),subject:source.subject!,html:source.html!,text:source.text!,ceilingMinor:100},`schedule:${prior.id}`);
    await domain.approveDispatch(admin,orphan.id,orphan.fingerprint,{recipientRequested:true});
    await expect(domain.confirmDispatch(admin,orphan.id,crypto.randomUUID())).rejects.toMatchObject({code:"FUTURE_APPROVAL_REQUIRED"});
    expect(await fixture.db.prepare("SELECT 1 FROM outbox WHERE dispatch_id=?").bind(orphan.id).first()).toBeNull();
    const halted=await schedules.cancel(admin,next.id,{expectedRevision:next.revision});
    expect(halted.status).toBe("cancelled");
  });
  it("keeps foreign private review separate from preparation before creating a schedule hold",async()=>{
    const document=await domain.registerDocument(member,{name:"Synthetic private fax.pdf",sha256:await sha256("private schedule source"),size:30,pages:1,status:"ready",source:"import",storageKey:"synthetic/private-schedule.pdf",privateToCreator:true});
    const source=await domain.prepareDispatch(member,{channel:"fax",documentId:document.id,recipient:{phone:"+35242123456"},ceilingMinor:100},crypto.randomUUID());
    expect((await domain.getDispatch(admin,source.id)).dispatch.document_id).toBe(document.id);
    await expect(domain.getDocument(admin,document.id)).rejects.toMatchObject({code:"NOT_FOUND"});
    const input={dispatchId:source.id,executeAt:new Date(Date.now()+120_000).toISOString(),maxTotalMinor:100};
    await expect(schedules.create(admin,input,crypto.randomUUID())).rejects.toMatchObject({code:"NOT_FOUND"});
    expect(await fixture.db.prepare("SELECT 1 FROM dispatch_schedules WHERE source_dispatch_id=?").bind(source.id).first()).toBeNull();
    expect(await fixture.db.prepare("SELECT 1 FROM approvals WHERE dispatch_id=?").bind(source.id).first()).toBeNull();
    expect(await fixture.db.prepare("SELECT 1 FROM outbox WHERE dispatch_id=?").bind(source.id).first()).toBeNull();
    expect(await domain.getDispatch(member,source.id)).toMatchObject({dispatch:{status:"prepared"}});
    expect((await domain.getDispatch(member,source.id)).activeSchedule).toBeUndefined();
    const own=await schedules.create(member,input,crypto.randomUUID());
    expect(own.status).toBe("draft");
    await schedules.cancel(member,own.id,{expectedRevision:own.revision});
    await domain.approveDispatch(admin,source.id,source.fingerprint);
    expect((await domain.confirmDispatch(admin,source.id,crypto.randomUUID())).status).toBe("queued");
    const stale=await domain.prepareDispatch(member,{channel:"fax",documentId:document.id,recipient:{phone:"+35242123456"},ceilingMinor:100},crypto.randomUUID());
    await fixture.db.prepare("UPDATE documents SET status='purged' WHERE organization_id=? AND id=?").bind(member.organizationId,document.id).run();
    await expect(schedules.create(member,{...input,dispatchId:stale.id},crypto.randomUUID())).rejects.toMatchObject({code:"DOCUMENT_QUARANTINED"});
    expect(await fixture.db.prepare("SELECT 1 FROM dispatch_schedules WHERE source_dispatch_id=?").bind(stale.id).first()).toBeNull();
  });
  it("releases at most one exact command at the real due instant, freshly fences caps and queues atomically", async () => {
    // Exercise the actual D1 clock. Never rewrite approved times or bypass the
    // immutable grant to make a schedule due in a synthetic database.
    const remaining=Date.parse(executeAt)-Date.now()+100;
    if(remaining>0) await new Promise((resolve)=>setTimeout(resolve,remaining));
    const original=domain.prepareDispatch.bind(domain);
    const fresh=vi.spyOn(domain,"prepareDispatch").mockImplementation((ctx,input,key)=>original(ctx,input.subject==="Synthetic cap fixture" ? {...input,ceilingMinor:2} : input,key));
    const originalConfirm=domain.confirmDispatch.bind(domain);
    const revoke=vi.spyOn(domain,"confirmDispatch").mockImplementation(async(...args)=>{
      const raced=items.get("revocation_race")!;
      if(args[2]===`schedule:${raced.schedule.id}:accept`){
        const current=await schedules.get(admin,raced.schedule.id);
        await schedules.cancel(admin,raced.schedule.id,{expectedRevision:current.revision});
      }
      return originalConfirm(...args);
    });
    try {
      await Promise.all([schedules.processDue(20),schedules.processDue(20)]);
      for(const label of ["success","fax"]){
        const item=items.get(label)!, released=await schedules.get(admin,item.schedule.id);
        expect(released).toMatchObject({status:"released",approvalKind:"future_browser",releaseDispatchId:expect.any(String)});
        const dispatch=(await domain.getDispatch(admin,released.releaseDispatchId!)).dispatch;
        expect(dispatch.status).toBe("queued");
        expect(dispatch.recipient_json).toBe(item.source.recipient_json);
        expect(dispatch.sender_address).toBe(item.source.sender_address);
        expect(dispatch.document_id).toBe(item.source.document_id);
        expect(dispatch.html).toBe(item.source.html);
        expect(dispatch.text).toBe(item.source.text);
        expect(dispatch.ceiling_minor).toBeLessThanOrEqual(item.schedule.maxTotalMinor);
        expect(await fixture.db.prepare("SELECT count(*) AS n FROM outbox WHERE organization_id=? AND dispatch_id=?").bind(admin.organizationId,dispatch.id).first()).toEqual({n:1});
        expect(await fixture.db.prepare("SELECT count(*) AS n FROM reservations WHERE organization_id=? AND dispatch_id=?").bind(admin.organizationId,dispatch.id).first()).toEqual({n:1});
        await expect(schedules.cancel(admin,item.schedule.id,{expectedRevision:released.revision})).rejects.toMatchObject({code:"SCHEDULE_CHANGED"});
      }
      expect(await schedules.get(admin,items.get("cap")!.schedule.id)).toMatchObject({status:"blocked",errorCode:"SCHEDULE_CAP_EXCEEDED"});
      expect(await schedules.get(admin,items.get("purged")!.schedule.id)).toMatchObject({status:"blocked",errorCode:"DOCUMENT_QUARANTINED"});
      expect(await schedules.get(admin,items.get("revocation_race")!.schedule.id)).toMatchObject({status:"cancelled"});
      expect(await schedules.processDue(20)).toMatchObject({processed:0});
      expect(await fixture.db.prepare("SELECT count(*) AS n FROM dispatch_schedule_releases r WHERE EXISTS(SELECT 1 FROM outbox o WHERE o.organization_id=r.organization_id AND o.dispatch_id=r.dispatch_id)").first()).toEqual({n:2});
      expect(await fixture.db.prepare("SELECT count(*) AS n FROM attempts").first()).toEqual({n:0});
    } finally {fresh.mockRestore();revoke.mockRestore();}
  }, 90_000);
  it("carries separate future evidence through production-mode Telnyx, SES and Resend bridges without fabricated approvals or uncertain retries",async()=>{
    const remaining=Date.parse(executeAt)-Date.now()+100;
    if(remaining>0) await new Promise((resolve)=>setTimeout(resolve,remaining));
    for(const f of production){
      await f.service.processDue(20);
      const scheduled=await f.service.get(f.ctx,f.schedule.id);
      expect(scheduled.status,JSON.stringify({provider:f.provider,errorCode:scheduled.errorCode})).toBe("released");
      const released=scheduled.releaseDispatchId!;
      const refreshed=(await f.domain.getDispatch(f.ctx,released)).dispatch;
      expect(refreshed.quote_fingerprint).not.toBe(f.source.quote_fingerprint);
      expect(refreshed.quote_expires_at!>f.source.quote_expires_at!).toBe(true);
      expect(await f.db.prepare("SELECT 1 FROM approvals WHERE organization_id=? AND dispatch_id=?").bind(f.ctx.organizationId,released).first()).toBeNull();
      await f.domain.processDispatch(released,f.hook);
      const dispatch=(await f.domain.getDispatch(f.ctx,released)).dispatch;
      const attempt=await f.db.prepare("SELECT error_code FROM attempts WHERE organization_id=? AND dispatch_id=?").bind(f.ctx.organizationId,released).first();
      expect(dispatch.status,JSON.stringify({provider:f.provider,attempt,calls:f.transport.mock.calls.length})).toBe(f.provider==="telnyx"?"submission_unknown":"accepted");
      expect(f.transport).toHaveBeenCalledTimes(1);
      await Promise.all([f.domain.processDispatch(released,f.hook),f.service.processDue(20)]);
      expect(f.transport).toHaveBeenCalledTimes(1);
      if(f.provider==="telnyx")expect(await f.db.prepare("SELECT status FROM welcome_credit_reservations WHERE organization_id=? AND dispatch_id=?").bind(f.ctx.organizationId,released).first()).toEqual({status:"reserved"});
      if(f.expirySchedule){
        const expiry=await f.service.get(f.ctx,f.expirySchedule.id), releaseId=expiry.releaseDispatchId!;
        expect(expiry.status).toBe("released");
        const expiring=(await f.domain.getDispatch(f.ctx,releaseId)).dispatch;
        const closed=createLiveProviderHook(f.env,"email",{fetcher:f.transport,now:()=>Date.parse(expiring.quote_expires_at!)+1});
        await f.domain.processDispatch(releaseId,closed);
        expect((await f.domain.getDispatch(f.ctx,releaseId)).dispatch.status).toBe("failed");
        expect(await f.db.prepare("SELECT error_code FROM attempts WHERE organization_id=? AND dispatch_id=?").bind(f.ctx.organizationId,releaseId).first()).toEqual({error_code:"LIVE_QUOTE_INVALID"});
        expect(f.transport).toHaveBeenCalledTimes(1);
      }
    }
  },90_000);
});
