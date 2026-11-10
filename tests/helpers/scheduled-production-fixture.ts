import { vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { DomainService, canonicalJson, sha256, type ActorContext } from "../../packages/domain/src/index";
import { emailRateComponents } from "../../packages/domain/src/live-delivery-quotes";
import { createLiveDeliveryQuoteConfig, createLiveProviderHook, type LiveProviderEnv } from "../../apps/api/src/live-providers";
import { DispatchScheduleService } from "../../apps/api/src/dispatch-schedules";
import { FUTURE_SPENDING_ACKNOWLEDGEMENT } from "../../packages/contracts/src/dispatch-schedules";
import { createFaxUsageFixture } from "./fax-usage-fixture";
import { migratedD1 } from "./migrated-d1";

/** Production-mode domain + real bridge/connectors, with only synthetic transport. */
export async function scheduledProductionFixtures(executeAt: string) {
  const result = [];
  for (const provider of ["telnyx", "ses", "resend"] as const) {
    const fixture = await migratedD1(`scheduled-production-${provider}`), db = fixture.db;
    const now = new Date().toISOString(), hash = await sha256(`scheduled-production-${provider}`);
    let ctx: ActorContext, domain: DomainService, env: LiveProviderEnv, documentId: string | undefined;
    if (provider === "telnyx") {
      const f = await createFaxUsageFixture(db, Date.now);
      ctx = { ...f.ctx, documentSessionHash: hash };
      domain = f.domain;
      const pdf = await PDFDocument.create(); pdf.addPage();
      const bytes = new Uint8Array(await pdf.save());
      const document = await domain.registerDocument(ctx, { name: "Synthetic scheduled PDF.pdf", sha256: await sha256(bytes), size: bytes.length, pages: 1, status: "ready", source: "import", storageKey: `synthetic/${f.ctx.organizationId}`, scanVerified: true });
      documentId = document.id;
      env = { DB: db, DOCUMENTS: { get: async () => ({ size: bytes.length, arrayBuffer: async () => bytes.buffer }) } as unknown as R2Bucket,
        MODE: "production", ENVIRONMENT: "staging", APP_ORIGIN: "https://guteneo.example", LIVE_SENDS_ENABLED: "true", LIVE_SEND_CHANNELS: "fax",
        TELNYX_API_KEY: "synthetic-never-production", TELNYX_ACCOUNT_ID: f.identity.accountId, TELNYX_CONNECTION_ID: f.identity.connectionId,
        TELNYX_OUTBOUND_VOICE_PROFILE_ID: f.identity.outboundProfileId, TELNYX_FROM: "+35220000000", TELNYX_ALLOWED_PREFIXES: "+33" } as LiveProviderEnv;
    } else {
      const org = `scheduled_${provider}_${crypto.randomUUID()}`;
      ctx = { organizationId: org, userId: `user_${org}`, role: "admin", actor: "browser", documentSessionHash: hash };
      await db.batch([
        db.prepare("INSERT INTO organizations VALUES(?,'Synthetic future transport','production',?)").bind(org,now),
        db.prepare("INSERT INTO users(id,name,email,created_at) VALUES(?,'Synthetic future approver','fixture@example.invalid',?)").bind(ctx.userId,now),
        db.prepare("INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)").bind(org,ctx.userId,now),
        db.prepare("INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,'email','Synthetic sender',?,'verified','production',?)").bind(`sender_${org}`,org,provider==="resend" ? "fixture@guteneo.com" : "fixture@example.invalid",now),
        db.prepare("INSERT INTO channel_controls VALUES(?,'email',1)").bind(org),
        db.prepare("INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,'email',?,100,5000,'EUR')").bind(org,now.slice(0,7)),
      ]);
      env = { DB:db, MODE:"production", ENVIRONMENT:"staging", APP_ORIGIN:"https://guteneo.example", LIVE_SENDS_ENABLED:"true", LIVE_SEND_CHANNELS:"email", EMAIL_PROVIDER:provider,
        AWS_ACCESS_KEY_ID:"SYNTHETIC", AWS_SECRET_ACCESS_KEY:"synthetic-never-production", AWS_REGION:"eu-west-1", SES_CONFIGURATION_SET:"synthetic", SES_SANDBOX:"true", SES_ACCOUNT_ID:"123456789012", SES_SNS_TOPIC_ARN:"arn:aws:sns:eu-west-1:123456789012:synthetic", SES_VERIFIED_RECIPIENTS:"recipient@example.invalid",
        RESEND_ACCOUNT_ID:`fixture_${org}`, RESEND_DOMAIN_ID:"synthetic_domain", RESEND_VERIFIED_DOMAIN:"guteneo.com", RESEND_API_KEY:"re_synthetic_never_production", RESEND_WEBHOOK_SECRET:"synthetic", RESEND_SENDS_ENABLED:"true" } as LiveProviderEnv;
      const config = createLiveDeliveryQuoteConfig(env), identity=config.liveDeliveryIdentity.email!;
      const rate = { usdMicrosPerMessage:100, usdMicrosPerGb:120000, bytesPerGb:1_000_000_000, eurPerUsdNumerator:1, eurPerUsdDenominator:1, attachmentBasis:"raw_pdf_bytes" as const };
      const components=emailRateComponents(rate);
      await db.prepare("INSERT INTO trusted_delivery_costs(id,organization_id,sender_id,channel,provider,account_id,route_id,options_json,rate_json,base_numerator,byte_numerator,rate_denominator,currency,fiscal_basis,quote_ttl_seconds,source_reference,source_sha256,valid_from,expires_at,status,created_at) VALUES(?,?,?,'email',?,?,?,'{}',?,?,?,?,'EUR','qualified_final_variable_cost',300,'SYNTHETIC SCHEDULE QUALIFICATION',?,?,?,'qualified',?)")
        .bind(`policy_${org}`,org,`sender_${org}`,provider,identity.accountId,identity.routeId,canonicalJson(rate),components.base_numerator,components.byte_numerator,components.rate_denominator,"b".repeat(64),now,new Date(Date.now()+3600_000).toISOString(),now).run();
      if(provider==="resend")await db.prepare("INSERT INTO resend_send_limit_policies(account_id,max_recipients_24h,max_recipients_month,min_interval_ms,qualified_at_ms,expires_at_ms,source_sha256,status) VALUES(?,100,3000,200,?,?,?,'qualified')").bind(identity.accountId,Date.now()-1000,Date.now()+3600_000,"c".repeat(64)).run();
      domain = new DomainService(db,{mode:"production",...config});
    }
    await db.prepare("INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at) VALUES(?,?,?,'synthetic',1,0,?,?)").bind(hash,ctx.userId,ctx.organizationId,now,new Date(Date.now()+3600_000).toISOString()).run();
    const source = await domain.prepareDispatch(ctx,provider==="telnyx" ? {channel:"fax",recipient:{phone:"+33100000001"},documentId,ceilingMinor:100} : {channel:"email",recipient:{email:"recipient@example.invalid"},subject:"Synthetic future notification",text:"Exact immutable future message",ceilingMinor:100},crypto.randomUUID());
    const service = new DispatchScheduleService({...env,SCHEDULED_DISPATCH_ENABLED:"true"},domain);
    const futureAt = new Date(Math.max(Date.parse(executeAt),Date.now()+65_000)).toISOString();
    const draft = await service.create(ctx,{dispatchId:source.id,executeAt:futureAt,maxTotalMinor:100},crypto.randomUUID());
    const schedule = await service.approve(ctx,draft.id,{expectedRevision:1,snapshotHash:draft.snapshotHash,acknowledgement:FUTURE_SPENDING_ACKNOWLEDGEMENT,recipientRequested:true});
    let expirySchedule: Awaited<ReturnType<DispatchScheduleService["create"]>> | undefined;
    if(provider==="resend"){
      const expirySource=await domain.prepareDispatch(ctx,{channel:"email",recipient:{email:"recipient@example.invalid"},subject:"Synthetic quote expiry",text:"Exact synthetic expiry content",ceilingMinor:100},crypto.randomUUID());
      const expiryDraft=await service.create(ctx,{dispatchId:expirySource.id,executeAt:futureAt,maxTotalMinor:100},crypto.randomUUID());
      expirySchedule=await service.approve(ctx,expiryDraft.id,{expectedRevision:1,snapshotHash:expiryDraft.snapshotHash,acknowledgement:FUTURE_SPENDING_ACKNOWLEDGEMENT,recipientRequested:true});
    }
    const transport = vi.fn(async()=>{
      if(provider==="telnyx")throw new Error("Synthetic uncertain provider response");
      return Response.json(provider==="ses" ? {MessageId:`synthetic-${provider}`} : {id:"11111111-2222-4333-8444-555555555555"});
    });
    const hook = createLiveProviderHook(env,provider==="telnyx" ? "fax" : "email",{fetcher:transport});
    result.push({provider,ctx,domain,service,source,schedule,expirySchedule,env,transport,hook,db,dispose:()=>fixture.mf.dispose()});
  }
  return result;
}
