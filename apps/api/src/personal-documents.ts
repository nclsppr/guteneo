import {
  type PersonalDocumentItem, type PersonalDocumentView, type SecureAuditEvent,
  type SecureDistributionPolicy,
} from "../../../packages/contracts/src/secure-distribution";
import { DomainError, canonicalJson } from "../../../packages/domain/src/index";
import type { Env } from "./env";
import { requirePersonalDocumentAuthentication, type PersonalPrincipal } from "./personal-auth";
import { getSecureObject, putSecureObject, secureSha256 } from "./secure-storage";
import { secureSharedBinding, type SecureDistributionRow, type SecurePageRow } from "./secure-distributions";
import { personalSessionFence as sessionFence, sensitiveSessionPolicy } from "./sensitive-session";

type PersonalRow={id:string;user_id:string;source_organization_id:string;source_distribution_id:string;source_sha256:string;source_name:string;sender_name:string;policy_json:string;original_key:string;manifest_sha256:string;status:"active"|"deleted"|"expired";created_at:string;expires_at:string};
type DepositOperation={id:string;organization_id:string;distribution_id:string;user_id:string;personal_document_id:string;status:string;lease_token:string;lease_expires_at:string;next_page:number;original_ready:number;auth_session_hash:string|null};
const now=()=>new Date().toISOString();
const uid=(prefix:string)=>`${prefix}_${crypto.randomUUID().replaceAll("-","")}`;
const unavailable=()=>new DomainError("NOT_FOUND","Document indisponible.",404);
function personalBinding(userId:string,documentId:string,suffix:string) {return `personal:${userId}:${documentId}:${suffix}`;}
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Cross-Origin-Resource-Policy":"same-origin","X-Robots-Tag":"noindex, nofollow"};

export class PersonalDocumentsService {
  constructor(public readonly env:Env) {}
  private async rate(principal:PersonalPrincipal) {
    requirePersonalDocumentAuthentication(principal,this.env);
    const hash=await secureSha256(`personal-documents:${principal.userId}`),window=Math.floor(Date.now()/60000),fence=sessionFence(principal,900,this.env);
    const count=await this.env.DB.prepare(`INSERT INTO secure_document_rate_limits(scope_hash,window,count) SELECT ?,?,1 WHERE ${fence.condition} ON CONFLICT(scope_hash,window) DO UPDATE SET count=count+1 RETURNING count`)
      .bind(hash,window,...fence.values).first<{count:number}>();
    if(!count)throw new DomainError("DOCUMENT_AUTHENTICATION_REQUIRED","Reconnectez-vous pour accéder à vos documents.",403);
    if(count.count>180)throw new DomainError("RATE_LIMITED","Trop de requêtes. Réessayez dans une minute.",429);
  }
  async claim(principal:PersonalPrincipal,token:string) {
    await this.rate(principal);
    const row=await this.env.DB.prepare("SELECT * FROM secure_distributions WHERE token_hash=? AND status='active' AND expires_at>?")
      .bind(await secureSha256(token),now()).first<SecureDistributionRow>();
    if(!row || row.recipient_address!==principal.email?.toLowerCase() || (row.recipient_user_id && row.recipient_user_id!==principal.userId))throw unavailable();
    const fence=sessionFence(principal,900,this.env);
    const results=await this.env.DB.batch([this.env.DB.prepare(`UPDATE secure_distributions SET recipient_user_id=?,claimed_at=COALESCE(claimed_at,?)
      WHERE organization_id=? AND id=? AND status='active' AND expires_at>? AND recipient_address=?
      AND (recipient_user_id IS NULL OR recipient_user_id=?) AND ${fence.condition} RETURNING id`)
      .bind(principal.userId,now(),row.organization_id,row.id,now(),principal.email!.toLowerCase(),principal.userId,...fence.values),
      this.env.DB.prepare(`INSERT OR IGNORE INTO secure_document_events(id,organization_id,distribution_id,user_id,session_hash,type,provenance,created_at)
        SELECT ?,?,?,?,?, 'recipient_association_requested','server',? WHERE EXISTS(SELECT 1 FROM secure_distributions WHERE organization_id=? AND id=? AND recipient_user_id=? AND status='active' AND expires_at>?) AND ${fence.condition}`)
        .bind(`secure_claim_${row.id}_${principal.userId}`,row.organization_id,row.id,principal.userId,principal.tokenHash,now(),row.organization_id,row.id,principal.userId,now(),...fence.values),
    ]);
    if(!results[0].results.length)throw unavailable();
    return {id:row.id,status:row.bound_at?"active":"pending",recipientBinding:row.bound_at?"confirmed":"pending"};
  }
  private async shared(principal:PersonalPrincipal,id:string,allowPending=false) {
    const row=await this.env.DB.prepare("SELECT * FROM secure_distributions WHERE id=? AND recipient_user_id=?")
      .bind(id,principal.userId).first<SecureDistributionRow>();
    if(!row || (!allowPending && (!row.bound_at || row.status!=="active" || !row.expires_at || row.expires_at<=now())))throw unavailable();
    return row;
  }
  private async personal(principal:PersonalPrincipal,id:string,allowInactive=false) {
    const row=await this.env.DB.prepare("SELECT * FROM secure_personal_documents WHERE user_id=? AND id=?")
      .bind(principal.userId,id).first<PersonalRow>();
    if(!row || (!allowInactive && (row.status!=="active" || row.expires_at<=now())))throw unavailable();
    return row;
  }
  private async item(principal:PersonalPrincipal,id:string):Promise<PersonalDocumentItem> {
    if(id.startsWith("pd_")) {
      const row=await this.personal(principal,id,true);
      return {id:row.id,kind:"personal",title:row.source_name,sender:row.sender_name,status:row.status==="active"&&row.expires_at>now()?"active":row.status==="deleted"?"revoked":"expired",expiresAt:row.expires_at,createdAt:row.created_at,allowOriginalDownload:true,allowVaultDeposit:false};
    }
    const row=await this.shared(principal,id,true),policy:SecureDistributionPolicy=JSON.parse(row.policy_json);
    const sender=await this.env.DB.prepare("SELECT name FROM organizations WHERE id=?").bind(row.organization_id).first<{name:string}>();
    const deposited=await this.env.DB.prepare("SELECT id,status,expires_at FROM secure_personal_documents WHERE user_id=? AND source_organization_id=? AND source_distribution_id=?").bind(principal.userId,row.organization_id,row.id).first<{id:string;status:string;expires_at:string}>();
    const status=row.status==="revoked"?"revoked":!row.expires_at || row.expires_at<=now()?"expired":row.bound_at?"active":"pending";
    return {id:row.id,kind:"shared",title:row.bound_at?row.source_name:"Document en attente de vérification",sender:sender?.name??"Atelier Guteneo",status,expiresAt:row.expires_at!,createdAt:row.activated_at!,allowOriginalDownload:policy.allowOriginalDownload,allowVaultDeposit:policy.allowVaultDeposit&&!deposited,...(deposited?.status==="active"&&deposited.expires_at>now()?{depositedDocumentId:deposited.id}:{})};
  }
  async list(principal:PersonalPrincipal,query:{cursor?:string;limit?:number;kind?:"shared"|"personal";q?:string}={}) {
    await this.rate(principal);
    let after:{createdAt:string;id:string}|null=null;
    if(query.cursor) {
      try {after=JSON.parse(atob(query.cursor));if(!after || typeof after.createdAt!=="string"||typeof after.id!=="string")throw new Error();}
      catch {throw new DomainError("INVALID_CURSOR","Curseur invalide.");}
    }
    const limit=Math.min(50,Math.max(1,query.limit??30));
    const search=(query.q??"").trim().slice(0,200).toLowerCase();
    const rows=await this.env.DB.prepare(`SELECT id,created_at FROM (
      SELECT s.id,s.activated_at AS created_at,'shared' AS kind,CASE WHEN s.bound_at IS NOT NULL THEN lower(s.source_name) ELSE '' END AS title,lower(COALESCE(o.name,'')) AS sender FROM secure_distributions s LEFT JOIN organizations o ON o.id=s.organization_id WHERE s.recipient_user_id=? AND s.activated_at IS NOT NULL
      UNION ALL SELECT id,created_at,'personal' AS kind,lower(source_name) AS title,lower(sender_name) AS sender FROM secure_personal_documents WHERE user_id=? AND status<>'deleted')
      WHERE (? IS NULL OR kind=?) AND (?='' OR instr(title,?)>0 OR instr(sender,?)>0)
      ${after?"AND (created_at<? OR (created_at=? AND id<?))":""} ORDER BY created_at DESC,id DESC LIMIT ?`)
      .bind(principal.userId,principal.userId,query.kind??null,query.kind??null,search,search,search,...(after?[after.createdAt,after.createdAt,after.id]:[]),limit+1).all<{id:string;created_at:string}>();
    const slice=rows.results.slice(0,limit),last=slice.at(-1);
    return {items:await Promise.all(slice.map((row)=>this.item(principal,row.id))),nextCursor:rows.results.length>limit&&last?btoa(JSON.stringify({createdAt:last.created_at,id:last.id})):null};
  }
  async events(principal:PersonalPrincipal,id:string,query:{cursor?:string;limit?:number}={}) {
    await this.rate(principal);
    const personal=id.startsWith("pd_"),row=personal?await this.personal(principal,id,true):await this.shared(principal,id,true);
    let after:{createdAt:string;id:string}|null=null;
    if(query.cursor)try{after=JSON.parse(atob(query.cursor));if(!after||typeof after.id!=="string"||typeof after.createdAt!=="string")throw new Error();}catch{throw new DomainError("INVALID_CURSOR","Curseur invalide.");}
    const limit=Math.min(100,Math.max(1,query.limit??50));
    const scope=personal?"personal_document_id=? AND user_id=?":"organization_id=? AND distribution_id=? AND (user_id=? OR type IN ('distribution_activated','access_revoked','recipient_binding_confirmed'))";
    const values=personal?[id,principal.userId]:[(row as SecureDistributionRow).organization_id,id,principal.userId];
    const events=await this.env.DB.prepare(`SELECT id,type,created_at,provenance,page_number FROM secure_document_events WHERE ${scope} ${after?"AND (created_at<? OR (created_at=? AND id<?))":""} ORDER BY created_at DESC,id DESC LIMIT ?`)
      .bind(...values,...(after?[after.createdAt,after.createdAt,after.id]:[]),limit+1).all<{id:string;type:string;created_at:string;provenance:SecureAuditEvent["provenance"];page_number:number|null}>();
    const slice=events.results.slice(0,limit),last=slice.at(-1);
    return {items:slice.map((event)=>({id:event.id,type:event.type,createdAt:event.created_at,provenance:event.provenance,...(event.page_number?{page:event.page_number}:{})})),nextCursor:events.results.length>limit&&last?btoa(JSON.stringify({createdAt:last.created_at,id:last.id})):null};
  }
  async get(principal:PersonalPrincipal,id:string):Promise<PersonalDocumentView> {
    await this.rate(principal);
    const item=await this.item(principal,id);
    if(item.status!=="active")return {...item,pages:[],audit:[],policy:id.startsWith("pd_")?JSON.parse((await this.personal(principal,id,true)).policy_json):JSON.parse((await this.shared(principal,id,true)).policy_json)};
    const isPersonal=item.kind==="personal";
    const row=isPersonal?await this.personal(principal,id):await this.shared(principal,id);
    const pages=isPersonal ? await this.env.DB.prepare("SELECT * FROM secure_personal_pages WHERE user_id=? AND personal_document_id=? ORDER BY page_number").bind(principal.userId,id).all<SecurePageRow>() :
      await this.env.DB.prepare("SELECT * FROM secure_distribution_pages WHERE organization_id=? AND distribution_id=? ORDER BY page_number").bind((row as SecureDistributionRow).organization_id,id).all<SecurePageRow>();
    const events=await this.events(principal,id,{limit:100});
    return {...item,policy:JSON.parse(row.policy_json),pages:pages.results.map((page)=>({number:page.page_number,width:page.width,height:page.height,url:`/api/personal/documents/${id}/pages/${page.page_number}`,textUrl:`/api/personal/documents/${id}/pages/${page.page_number}/text`,accessibleText:""})),audit:events.items,auditNextCursor:events.nextCursor};
  }
  /** The audit insert is the authorization decision and rechecks the session and
   * grant in the same primary write. Decryption alone never authorizes a response. */
  private async authorize(principal:PersonalPrincipal,id:string,type:string,page?:number) {
    requirePersonalDocumentAuthentication(principal,this.env);
    const eventId=uid("sev"),fence=sessionFence(principal,type.startsWith("original_")?300:900,this.env);
    const personal=id.startsWith("pd_");
    const sql=personal ? `INSERT INTO secure_document_events(id,personal_document_id,user_id,session_hash,type,provenance,page_number,created_at)
      SELECT ?,d.id,?,?,?,'server',?,? FROM secure_personal_documents d WHERE d.user_id=? AND d.id=? AND d.status='active' AND d.expires_at>? AND ${fence.condition} RETURNING id` :
      `INSERT INTO secure_document_events(id,organization_id,distribution_id,user_id,session_hash,type,provenance,page_number,created_at)
      SELECT ?,d.organization_id,d.id,?,?,?,'server',?,? FROM secure_distributions d WHERE d.recipient_user_id=? AND d.id=? AND d.bound_at IS NOT NULL AND d.status='active' AND d.expires_at>? AND ${fence.condition} RETURNING id`;
    const record=await this.env.DB.prepare(sql).bind(eventId,principal.userId,principal.tokenHash,type,page??null,now(),principal.userId,id,now(),...fence.values).first();
    if(!record)throw unavailable();
  }
  async page(principal:PersonalPrincipal,id:string,pageNumber:number,text=false) {
    await this.rate(principal);
    const personal=id.startsWith("pd_");
    const row=personal?await this.personal(principal,id):await this.shared(principal,id);
    const page=personal ? await this.env.DB.prepare("SELECT * FROM secure_personal_pages WHERE user_id=? AND personal_document_id=? AND page_number=?").bind(principal.userId,id,pageNumber).first<SecurePageRow>():
      await this.env.DB.prepare("SELECT * FROM secure_distribution_pages WHERE organization_id=? AND distribution_id=? AND page_number=?").bind((row as SecureDistributionRow).organization_id,id,pageNumber).first<SecurePageRow>();
    if(!page)throw unavailable();
    const suffix=`page:${pageNumber}:${text?"text":"image"}`;
    const object=await getSecureObject(this.env,text?page.text_key:page.image_key,
      personal?personalBinding(principal.userId,id,suffix):secureSharedBinding(row as SecureDistributionRow,suffix),text?page.text_sha256:page.image_sha256);
    await this.authorize(principal,id,text?"accessible_text_access_authorized":"page_access_authorized",pageNumber);
    return text?Response.json({text:new TextDecoder().decode(object.bytes)},{headers}):new Response(new Uint8Array(object.bytes).buffer,{headers:{...headers,"Content-Type":"image/jpeg"}});
  }
  async displayEvent(principal:PersonalPrincipal,id:string,page:number) {
    await this.rate(principal);
    const personal=id.startsWith("pd_");
    const row=personal?await this.personal(principal,id):await this.shared(principal,id);
    const fence=sessionFence(principal,900,this.env),eventId=uid("sev");
    const authorized=personal ? await this.env.DB.prepare(`INSERT INTO secure_document_events(id,personal_document_id,user_id,session_hash,type,provenance,page_number,created_at)
      SELECT ?,?,?,?,?, 'browser',?,? WHERE EXISTS(SELECT 1 FROM secure_personal_documents d JOIN secure_personal_pages p ON p.user_id=d.user_id AND p.personal_document_id=d.id WHERE d.user_id=? AND d.id=? AND d.status='active' AND d.expires_at>? AND p.page_number=?) AND ${fence.condition} RETURNING id`)
      .bind(eventId,id,principal.userId,principal.tokenHash,"page_displayed",page,now(),principal.userId,id,now(),page,...fence.values).first():
      await this.env.DB.prepare(`INSERT INTO secure_document_events(id,organization_id,distribution_id,user_id,session_hash,type,provenance,page_number,created_at)
      SELECT ?,?,?,?,?,?,'browser',?,? WHERE EXISTS(SELECT 1 FROM secure_distributions d JOIN secure_distribution_pages p ON p.organization_id=d.organization_id AND p.distribution_id=d.id WHERE d.organization_id=? AND d.id=? AND d.recipient_user_id=? AND d.bound_at IS NOT NULL AND d.status='active' AND d.expires_at>? AND p.page_number=?) AND ${fence.condition} RETURNING id`)
      .bind(eventId,(row as SecureDistributionRow).organization_id,id,principal.userId,principal.tokenHash,"page_displayed",page,now(),(row as SecureDistributionRow).organization_id,id,principal.userId,now(),page,...fence.values).first();
    if(!authorized)throw unavailable();
    return {recorded:true,provenance:"browser"};
  }
  async download(principal:PersonalPrincipal,id:string) {
    await this.rate(principal);
    requirePersonalDocumentAuthentication(principal,this.env,{maxAgeSeconds:300});
    const personal=id.startsWith("pd_"),row=personal?await this.personal(principal,id):await this.shared(principal,id);
    if(!personal && !(JSON.parse(row.policy_json) as SecureDistributionPolicy).allowOriginalDownload)
      throw new DomainError("ORIGINAL_DOWNLOAD_FORBIDDEN","Le téléchargement du PDF original n’est pas autorisé.",403);
    const object=await getSecureObject(this.env,row.original_key!,personal?personalBinding(principal.userId,id,"original"):secureSharedBinding(row as SecureDistributionRow,"original"),row.source_sha256);
    await this.authorize(principal,id,"original_download_requested");
    await this.authorize(principal,id,"original_transfer_started");
    return new Response(new Uint8Array(object.bytes).buffer,{headers:{...headers,"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(row.source_name)}`}});
  }
  async deposit(principal:PersonalPrincipal,id:string) {
    await this.rate(principal);
    requirePersonalDocumentAuthentication(principal,this.env,{maxAgeSeconds:300});
    const row=await this.shared(principal,id),policy:SecureDistributionPolicy=JSON.parse(row.policy_json);
    if(!policy.allowVaultDeposit)throw new DomainError("PERSONAL_COPY_FORBIDDEN","L’atelier n’a pas autorisé de copie personnelle.",403);
    const existing=await this.env.DB.prepare("SELECT id,status,expires_at FROM secure_personal_documents WHERE user_id=? AND source_organization_id=? AND source_distribution_id=?")
      .bind(principal.userId,row.organization_id,id).first<{id:string;status:string;expires_at:string}>();
    if(existing) {
      if(existing.status!=="active" || existing.expires_at<=now())
        throw new DomainError("PERSONAL_COPY_UNAVAILABLE","La copie n’est plus disponible.",410);
      return {id:existing.id,status:existing.status,expiresAt:existing.expires_at};
    }
    const operationId=uid("deposit"),personalId=uid("pd"),time=now(),fence=sessionFence(principal,300,this.env);
    await this.env.DB.prepare(`INSERT INTO secure_deposit_operations(id,organization_id,distribution_id,user_id,personal_document_id,status,created_at,updated_at,lease_token,lease_expires_at,auth_session_hash)
      SELECT ?,?,?,?,?,'preparing',?,?,'',?,? WHERE ${fence.condition} ON CONFLICT(organization_id,distribution_id,user_id) DO NOTHING`)
      .bind(operationId,row.organization_id,id,principal.userId,personalId,time,time,time,principal.tokenHash,...fence.values).run();
    const operation=await this.env.DB.prepare("SELECT * FROM secure_deposit_operations WHERE organization_id=? AND distribution_id=? AND user_id=?")
      .bind(row.organization_id,id,principal.userId).first<DepositOperation>();
    if(!operation || operation.status==="aborted")throw new DomainError("PERSONAL_COPY_UNAVAILABLE","La copie n’est plus disponible.",409);
    await this.env.DB.prepare(`UPDATE secure_deposit_operations SET auth_session_hash=? WHERE id=? AND status='preparing' AND lease_expires_at<=? AND ${fence.condition}`).bind(principal.tokenHash,operation.id,time,...fence.values).run();
    await this.processDeposit(operation.id);
    const completed=await this.env.DB.prepare("SELECT id,status,expires_at FROM secure_personal_documents WHERE user_id=? AND id=?").bind(principal.userId,operation.personal_document_id).first<{id:string;status:string;expires_at:string}>();
    return completed?{id:completed.id,status:completed.status,expiresAt:completed.expires_at}:{id:operation.personal_document_id,status:"preparing",expiresAt:null};
  }
  async processDeposit(operationId:string) {
    const lease=uid("lease"),time=now();
    const operation=await this.env.DB.prepare(`UPDATE secure_deposit_operations SET lease_token=?,lease_expires_at=?,updated_at=? WHERE id=? AND status='preparing' AND lease_expires_at<=? RETURNING *`)
      .bind(lease,new Date(Date.now()+60000).toISOString(),time,operationId,time).first<DepositOperation>();
    if(!operation)return;
    // A job resumes from authoritative session evidence, never a serialized token.
    const session=await this.env.DB.prepare(`SELECT ps.*,u.email,EXISTS(SELECT 1 FROM auth_identities ai WHERE ai.user_id=ps.user_id AND ai.issuer=ps.identity_issuer AND ai.subject=ps.identity_subject) identity_verified FROM personal_sessions ps JOIN users u ON u.id=ps.user_id WHERE ps.token_hash=? AND ps.user_id=? AND ps.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND ${sensitiveSessionPolicy(this.env)} AND ps.authenticated_at BETWEEN CAST(strftime('%s','now') AS INTEGER)-300 AND CAST(strftime('%s','now') AS INTEGER)+5 AND ps.verified_email=u.email`)
      .bind(operation.auth_session_hash,operation.user_id).first<{token_hash:string;user_id:string;email:string;authenticated_at:number;verified_email:string;is_development:number;identity_verified:number;mfa:number;verified_account:number;amr_json:string;acr:string|null;strong_authentication:number;authentication_policy_version:string|null}>();
    if(!session){await this.env.DB.prepare("UPDATE secure_deposit_operations SET lease_expires_at=? WHERE id=? AND lease_token=?").bind(time,operation.id,lease).run();return;}
    const principal:PersonalPrincipal={userId:session.user_id,name:"",email:session.email,verifiedEmail:true,mfa:session.mfa===1,verifiedAccount:session.verified_account===1,identityVerified:session.identity_verified===1,authenticatedAt:session.authenticated_at,amr:JSON.parse(session.amr_json),acr:session.acr,strongAuthentication:session.strong_authentication===1,authenticationPolicyVersion:session.authentication_policy_version,preferredLocale:null,preferredDashboardAppearance:"classic",csrfToken:"",tokenHash:session.token_hash,simulation:this.env.MODE==="simulation",development:Boolean(session.is_development)};
    const row=await this.env.DB.prepare("SELECT * FROM secure_distributions WHERE organization_id=? AND id=? AND recipient_user_id=? AND bound_at IS NOT NULL AND status='active' AND expires_at>?").bind(operation.organization_id,operation.distribution_id,operation.user_id,time).first<SecureDistributionRow>();
    if(!row || !(JSON.parse(row.policy_json) as SecureDistributionPolicy).allowVaultDeposit){await this.env.DB.prepare("UPDATE secure_deposit_operations SET status='aborted',updated_at=? WHERE id=? AND lease_token=?").bind(time,operation.id,lease).run();return;}
    const id=row.id,policy:SecureDistributionPolicy=JSON.parse(row.policy_json);
    const targetId=operation.personal_document_id,prefix=`secure/personal/${principal.userId}/${targetId}`;
    if(!operation.original_ready) {
      const original=await getSecureObject(this.env,row.original_key!,secureSharedBinding(row,"original"),row.source_sha256);
      await putSecureObject(this.env,`${prefix}/original.bin`,personalBinding(principal.userId,targetId,"original"),original.bytes,"application/pdf");
      await this.env.DB.prepare("UPDATE secure_deposit_operations SET original_ready=1 WHERE id=? AND lease_token=?").bind(operation.id,lease).run();
    }
    const pages=await this.env.DB.prepare("SELECT * FROM secure_distribution_pages WHERE organization_id=? AND distribution_id=? AND page_number>=? ORDER BY page_number LIMIT 3")
      .bind(row.organization_id,id,operation.next_page).all<SecurePageRow>();
    for(const page of pages.results) {
      const image=await getSecureObject(this.env,page.image_key,secureSharedBinding(row,`page:${page.page_number}:image`),page.image_sha256);
      const text=await getSecureObject(this.env,page.text_key,secureSharedBinding(row,`page:${page.page_number}:text`),page.text_sha256);
      const imageKey=`${prefix}/${page.page_number}.image`,textKey=`${prefix}/${page.page_number}.text`;
      await Promise.all([putSecureObject(this.env,imageKey,personalBinding(principal.userId,targetId,`page:${page.page_number}:image`),image.bytes,"image/jpeg"),putSecureObject(this.env,textKey,personalBinding(principal.userId,targetId,`page:${page.page_number}:text`),text.bytes,"text/plain;charset=utf-8")]);
    }
    const nextPage=(pages.results.at(-1)?.page_number??operation.next_page-1)+1;
    if(nextPage<=row.source_pages){await this.env.DB.prepare("UPDATE secure_deposit_operations SET next_page=?,lease_expires_at=?,updated_at=? WHERE id=? AND lease_token=?").bind(nextPage,now(),now(),operation.id,lease).run();await this.env.DISPATCH_QUEUE.send({dispatchId:`secure_deposit:${operation.id}`});return;}
    const allPages=await this.env.DB.prepare("SELECT * FROM secure_distribution_pages WHERE organization_id=? AND distribution_id=? ORDER BY page_number").bind(row.organization_id,id).all<SecurePageRow>();
    if(allPages.results.length!==row.source_pages)throw unavailable();
    const personalPages=allPages.results.map((page)=>({...page,image_key:`${prefix}/${page.page_number}.image`,text_key:`${prefix}/${page.page_number}.text`}));
    const sender=await this.env.DB.prepare("SELECT name FROM organizations WHERE id=?").bind(row.organization_id).first<{name:string}>();
    const expiresAt=new Date(Date.now()+policy.personalRetentionDays*86400000).toISOString(),fence=sessionFence(principal,300,this.env);
    const manifest=await secureSha256(canonicalJson(personalPages.map((page)=>({number:page.page_number,image:page.image_sha256,text:page.text_sha256}))));
    const statements=[this.env.DB.prepare(`INSERT INTO secure_personal_documents(id,user_id,source_organization_id,source_distribution_id,source_sha256,source_name,sender_name,policy_json,original_key,manifest_sha256,status,created_at,expires_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,'active',?,? WHERE EXISTS(SELECT 1 FROM secure_distributions s JOIN secure_distribution_charges c ON c.organization_id=s.organization_id AND c.distribution_id=s.id JOIN secure_deposit_operations op ON op.organization_id=s.organization_id AND op.distribution_id=s.id AND op.user_id=s.recipient_user_id
      WHERE s.organization_id=? AND s.id=? AND s.recipient_user_id=? AND s.bound_at IS NOT NULL AND s.status='active' AND s.expires_at>? AND json_extract(s.policy_json,'$.allowVaultDeposit')=1 AND op.status='preparing' AND op.lease_token=? AND op.auth_session_hash=?) AND ${fence.condition}
      ON CONFLICT(user_id,source_organization_id,source_distribution_id) DO NOTHING RETURNING id`)
      .bind(targetId,principal.userId,row.organization_id,id,row.source_sha256,row.source_name,sender?.name??"Atelier Guteneo",row.policy_json,`${prefix}/original.bin`,manifest,time,expiresAt,row.organization_id,id,principal.userId,now(),lease,principal.tokenHash,...fence.values)];
    for(const page of personalPages)statements.push(this.env.DB.prepare(`INSERT INTO secure_personal_pages(user_id,personal_document_id,page_number,image_key,image_sha256,text_key,text_sha256,width,height)
      SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM secure_personal_documents WHERE user_id=? AND id=? AND status='active') ON CONFLICT(user_id,personal_document_id,page_number) DO NOTHING`)
      .bind(principal.userId,targetId,page.page_number,page.image_key,page.image_sha256,page.text_key,page.text_sha256,page.width,page.height,principal.userId,targetId));
    statements.push(this.env.DB.prepare("UPDATE secure_deposit_operations SET status='active',updated_at=? WHERE id=? AND lease_token=? AND EXISTS(SELECT 1 FROM secure_personal_documents WHERE user_id=? AND id=?)").bind(now(),operation.id,lease,principal.userId,targetId));
    statements.push(this.env.DB.prepare(`INSERT OR IGNORE INTO secure_document_events(id,organization_id,distribution_id,user_id,type,provenance,created_at) SELECT ?,?,?,?,'personal_copy_delivered','server',? WHERE EXISTS(SELECT 1 FROM secure_personal_documents WHERE user_id=? AND id=?)`)
      .bind(`deposit_shared_${operation.id}`,row.organization_id,id,principal.userId,now(),principal.userId,targetId));
    statements.push(this.env.DB.prepare(`INSERT OR IGNORE INTO secure_document_events(id,personal_document_id,user_id,type,provenance,created_at) SELECT ?,?,?,'personal_copy_received','server',? WHERE EXISTS(SELECT 1 FROM secure_personal_documents WHERE user_id=? AND id=?)`)
      .bind(`deposit_personal_${operation.id}`,targetId,principal.userId,now(),principal.userId,targetId));
    const results=await this.env.DB.batch(statements);
    if(!results[0].results.length) {
      const raced=await this.env.DB.prepare("SELECT id,expires_at FROM secure_personal_documents WHERE user_id=? AND source_organization_id=? AND source_distribution_id=?").bind(principal.userId,row.organization_id,id).first<{id:string;expires_at:string}>();
      if(raced)return {id:raced.id,status:"active",expiresAt:raced.expires_at};
      // A lost session pauses a paid copy; only loss of the shared grant makes
      // it terminal. Drop the credential so a cron job cannot resume this copy
      // until an explicit POST supplies a newly authenticated session that meets the configured policy.
      const pending=await this.env.DB.prepare(`UPDATE secure_deposit_operations SET
        status=CASE WHEN EXISTS(SELECT 1 FROM secure_distributions s JOIN secure_distribution_charges c ON c.organization_id=s.organization_id AND c.distribution_id=s.id
          WHERE s.organization_id=secure_deposit_operations.organization_id AND s.id=secure_deposit_operations.distribution_id
          AND s.recipient_user_id=secure_deposit_operations.user_id AND s.bound_at IS NOT NULL AND s.status='active'
          AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND json_extract(s.policy_json,'$.allowVaultDeposit')=1)
          THEN 'preparing' ELSE 'aborted' END,
        auth_session_hash=NULL,lease_token='',lease_expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=? AND lease_token=? AND status='preparing' RETURNING status`).bind(operation.id,lease).first<{status:string}>();
      if(pending?.status==='preparing')throw new DomainError(this.env.SENSITIVE_DOCUMENT_AUTHENTICATION==='verified_account'?"DOCUMENT_AUTHENTICATION_REQUIRED":"STRONG_AUTHENTICATION_REQUIRED","Reconnectez-vous pour terminer votre copie personnelle.",403);
      throw unavailable();
    }
    return {id:targetId,status:"active",expiresAt};
  }
  async recoverPending() {
    const rows=await this.env.DB.prepare(`SELECT op.id FROM secure_deposit_operations op JOIN personal_sessions ps ON ps.token_hash=op.auth_session_hash AND ps.user_id=op.user_id JOIN secure_distributions s ON s.organization_id=op.organization_id AND s.id=op.distribution_id
      WHERE op.status='preparing' AND op.lease_expires_at<? AND s.status='active' AND s.expires_at>? AND ps.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND ${sensitiveSessionPolicy(this.env)} AND ps.authenticated_at BETWEEN CAST(strftime('%s','now') AS INTEGER)-300 AND CAST(strftime('%s','now') AS INTEGER)+5 ORDER BY op.created_at LIMIT 10`)
      .bind(now(),now()).all<{id:string}>();
    for(const row of rows.results)await this.env.DISPATCH_QUEUE.send({dispatchId:`secure_deposit:${row.id}`});
    await this.env.DB.prepare("UPDATE secure_deposit_operations SET status='aborted',updated_at=? WHERE id IN (SELECT op.id FROM secure_deposit_operations op JOIN secure_distributions s ON s.organization_id=op.organization_id AND s.id=op.distribution_id WHERE op.status='preparing' AND (s.status<>'active' OR s.expires_at<?) LIMIT 100)").bind(now(),now()).run();
  }
  async remove(principal:PersonalPrincipal,id:string) {
    await this.rate(principal);requirePersonalDocumentAuthentication(principal,this.env,{maxAgeSeconds:300});
    const row=await this.personal(principal,id),fence=sessionFence(principal,300,this.env);
    const results=await this.env.DB.batch([
      this.env.DB.prepare(`UPDATE secure_personal_documents SET status='deleted' WHERE user_id=? AND id=? AND status='active' AND ${fence.condition} RETURNING id`).bind(principal.userId,id,...fence.values),
      this.env.DB.prepare(`INSERT OR IGNORE INTO secure_document_events(id,personal_document_id,user_id,session_hash,type,provenance,created_at) SELECT ?,?,?,?,'personal_copy_deleted','server',? WHERE EXISTS(SELECT 1 FROM secure_personal_documents WHERE user_id=? AND id=? AND status='deleted') AND ${fence.condition}`).bind(`personal_deleted_${row.id}`,row.id,principal.userId,principal.tokenHash,now(),principal.userId,row.id,...fence.values),
    ]);
    if(!results[0].results.length)throw unavailable();
    return {deleted:true};
  }
}
