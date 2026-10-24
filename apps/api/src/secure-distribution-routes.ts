import { z } from "zod";
import { DomainError, membershipPermissionFence, type ActorContext } from "../../../packages/domain/src/index";
import { secureClaimSchema, securePageEventSchema } from "../../../packages/contracts/src/secure-distribution";
import type { Env } from "./env";
import { authenticatePersonalBrowser, requirePersonalStrongAuthentication } from "./personal-auth";
import { PersonalDocumentsService } from "./personal-documents";
import { SecureDistributionService, secureSharedBinding } from "./secure-distributions";
import { getSecureObject } from "./secure-storage";
import { personalSessionFence } from "./sensitive-session";

export async function secureJson<T>(request:Request,schema:z.ZodType<T>,maxBytes=32*1024):Promise<T> {
  if(!request.headers.get("Content-Type")?.startsWith("application/json"))throw new DomainError("INVALID_INPUT","Une requête JSON est requise.");
  const reader=request.body?.getReader();if(!reader)throw new DomainError("INVALID_INPUT","Requête vide.");
  const decoder=new TextDecoder();let content="",size=0;
  try {for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>maxBytes){await reader.cancel();throw new DomainError("CONTENT_TOO_LARGE","La requête dépasse la limite.",413);}content+=decoder.decode(chunk.value,{stream:true});}content+=decoder.decode();}
  finally{reader.releaseLock();}
  try{return schema.parse(JSON.parse(content));}catch(error){if(error instanceof z.ZodError)throw error;throw new DomainError("INVALID_INPUT","Requête JSON invalide.");}
}
const noStore={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"};

export async function handlePersonalDocumentRoute(request:Request,env:Env):Promise<Response|null> {
  const url=new URL(request.url),path=url.pathname;
  if(path!=="/api/personal/documents" && !path.startsWith("/api/personal/documents/"))return null;
  const mutating=!["GET","HEAD","OPTIONS"].includes(request.method);
  const principal=await authenticatePersonalBrowser(request,env,mutating),service=new PersonalDocumentsService(env);
  if(path==="/api/personal/documents" && request.method==="GET") {
    const query=z.object({cursor:z.string().max(2048).optional(),limit:z.coerce.number().int().min(1).max(50).default(30),kind:z.enum(["shared","personal"]).optional(),q:z.string().max(200).optional()}).parse(Object.fromEntries(url.searchParams));
    return Response.json(await service.list(principal,query),{headers:noStore});
  }
  if(path==="/api/personal/documents/claim" && request.method==="POST") {
    const body=await secureJson(request,secureClaimSchema);
    return Response.json(await service.claim(principal,body.token),{headers:noStore});
  }
  const match=/^\/api\/personal\/documents\/((?:sd|pd)_[a-f0-9]{32})(?:\/(pages\/([1-9][0-9]{0,2})(\/text)?|events|download|deposit|delete))?$/.exec(path);
  if(!match)return new Response("Not found",{status:404,headers:noStore});
  const [,id,action,page,text]=match;
  if(!action && request.method==="GET")return Response.json(await service.get(principal,id),{headers:noStore});
  if(page && request.method==="GET")return service.page(principal,id,Number(page),Boolean(text));
  if(action==="events" && request.method==="GET") {
    const query=z.object({cursor:z.string().max(2048).optional(),limit:z.coerce.number().int().min(1).max(100).default(50)}).parse(Object.fromEntries(url.searchParams));
    return Response.json(await service.events(principal,id,query),{headers:noStore});
  }
  if(action==="events" && request.method==="POST") {
    const event=await secureJson(request,securePageEventSchema);
    return Response.json(await service.displayEvent(principal,id,event.page),{headers:noStore});
  }
  if(action==="download" && request.method==="POST")return service.download(principal,id);
  if(action==="deposit" && request.method==="POST")return Response.json(await service.deposit(principal,id),{headers:noStore});
  if(action==="delete" && request.method==="POST")return Response.json(await service.remove(principal,id),{headers:noStore});
  return new Response("Method not allowed",{status:405,headers:noStore});
}

export async function secureWorkshopPreview(request:Request,env:Env,service:SecureDistributionService,ctx:ActorContext,id:string,page:number,text=false) {
  if(ctx.actor!=="browser")throw new DomainError("BROWSER_REQUIRED","Ouvrez l’aperçu dans Guteneo.",403);
  const principal=await authenticatePersonalBrowser(request,env);
  requirePersonalStrongAuthentication(principal);
  if(principal.userId!==ctx.userId)throw new DomainError("FORBIDDEN","Identité incohérente.",403);
  const row=await service.row(ctx,id);
  if(!["prepared","active"].includes(row.status)||(row.status==="prepared"&&row.prepared_expires_at<=new Date().toISOString())||(row.status==="active"&&row.expires_at!<=new Date().toISOString()))throw new DomainError("INVALID_STATE","Le rendu n’est pas disponible.",409);
  const image=await env.DB.prepare("SELECT image_key,image_sha256,text_key,text_sha256 FROM secure_distribution_pages WHERE organization_id=? AND distribution_id=? AND page_number=?")
    .bind(ctx.organizationId,id,page).first<{image_key:string;image_sha256:string;text_key:string;text_sha256:string}>();
  if(!image)throw new DomainError("NOT_FOUND","Page indisponible.",404);
  const object=await getSecureObject(env,text?image.text_key:image.image_key,secureSharedBinding(row,`page:${page}:${text?"text":"image"}`),text?image.text_sha256:image.image_sha256);
  // Recheck current workshop authority after the private object read.
  await service.row(ctx,id);
  const fence=membershipPermissionFence(ctx,"prepareDispatches"),session=personalSessionFence(principal);
  const audited=await env.DB.prepare(`INSERT INTO secure_document_events(id,organization_id,distribution_id,user_id,session_hash,type,provenance,page_number,created_at)
    SELECT ?,organization_id,id,?,?,?,'server',?,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM secure_distributions WHERE organization_id=? AND id=? AND ((status='prepared' AND prepared_expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) OR (status='active' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) AND (created_by=? OR EXISTS(SELECT 1 FROM memberships reviewer WHERE reviewer.organization_id=secure_distributions.organization_id AND reviewer.user_id=? AND (reviewer.role='admin' OR (reviewer.role='supervisor' AND reviewer.supervisor_can_approve=1)))) AND ${fence.condition} AND ${session.condition} RETURNING id`)
    .bind(`sev_${crypto.randomUUID().replaceAll("-","")}`,ctx.userId,principal.tokenHash,text?"workshop_accessible_text_access_authorized":"workshop_page_access_authorized",page,ctx.organizationId,id,ctx.userId,ctx.userId,...fence.values,...session.values).first();
  if(!audited)throw new DomainError("FORBIDDEN","Votre session ou vos droits ont changé.",403);
  return text?Response.json({text:new TextDecoder().decode(object.bytes)},{headers:noStore}):new Response(new Uint8Array(object.bytes).buffer,{headers:{...noStore,"Content-Type":"image/jpeg"}});
}
