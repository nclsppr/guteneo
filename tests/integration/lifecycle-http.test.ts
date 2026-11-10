import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../../apps/api/src/index";
import { createSession, memberships } from "../../apps/api/src/auth";
import type { Env } from "../../apps/api/src/env";
import { migratedD1 } from "../helpers/migrated-d1";
let fixture: Awaited<ReturnType<typeof migratedD1>>, env: Env, cookie: string, csrf: string;
beforeAll(async()=>{
  fixture=await migratedD1("lifecycle-http");
  for(const sql of readFileSync(new URL("../../scripts/seed.sql",import.meta.url),"utf8").replace(/^--.*$/gm,"").split(";").filter(x=>x.trim()))await fixture.db.prepare(sql).run();
  env={DB:fixture.db,MODE:"simulation",ENVIRONMENT:"local",APP_ORIGIN:"http://localhost:8787",CUSTOMER_WEBHOOK_ENCRYPTION_KEY:"a".repeat(64)} as Env;
  const login=await createSession(env,(await memberships(env,"user_atelier"))[0],false,true,true,{verifiedEmail:"camille@example.invalid",authenticatedAt:Math.floor(Date.now()/1000)});
  cookie=login.cookie.split(";")[0];csrf=login.session.csrfToken;
});
afterAll(async()=>{await fixture?.mf.dispose();});
it("mounts private metadata and configuration routes behind real cookie/origin/CSRF guards",async()=>{
  const request=(path:string,init:RequestInit={})=>worker.fetch(new Request(`http://localhost:8787${path}`,init),env,{} as ExecutionContext);
  expect((await request("/api/customer-webhooks")).status).toBe(401);
  const input={name:"Synthetic HTTP callback",url:"https://example.com/lifecycle",revealSigningSecret:true};
  expect((await request("/api/customer-webhooks",{method:"POST",headers:{Cookie:cookie,"Content-Type":"application/json","Idempotency-Key":"synthetic-http"},body:JSON.stringify(input)})).status).toBe(403);
  expect((await request("/api/customer-webhooks",{method:"POST",headers:{Cookie:cookie,Origin:"https://example.invalid","X-CSRF-Token":csrf,"Content-Type":"application/json","Idempotency-Key":"synthetic-http"},body:JSON.stringify(input)})).status).toBe(403);
  const created=await request("/api/customer-webhooks",{method:"POST",headers:{Cookie:cookie,Origin:env.APP_ORIGIN,"X-CSRF-Token":csrf,"Content-Type":"application/json","Idempotency-Key":"synthetic-http"},body:JSON.stringify(input)});
  expect(created.status).toBe(201);
  expect(await created.json()).toMatchObject({endpoint:{enabled:false,status:"active"},signingSecret:expect.any(String)});
  const attention=await request("/api/attention",{headers:{Cookie:cookie}});
  expect(attention.status).toBe(200);expect(await attention.json()).toMatchObject({items:[],nextCursor:null});
});
