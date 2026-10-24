/** Local synthetic capacity probe, never Cloudflare CPU or a provider invoice. */
import { mkdir,writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { getSecureObject,putSecureObject } from "../apps/api/src/secure-storage";
import type { Env } from "../apps/api/src/env";

type Stored={bytes:ArrayBuffer;customMetadata:Record<string,string>};
const objects=new Map<string,Stored>();
let writes=0,reads=0,storedBytes=0;
const bucket={
  async put(key:string,value:ArrayBuffer,options:{customMetadata:Record<string,string>}){writes++;if(objects.has(key))return null;const bytes=value.slice(0);storedBytes+=bytes.byteLength;objects.set(key,{bytes,customMetadata:options.customMetadata});return {};},
  async get(key:string){reads++;const object=objects.get(key);return object?{size:object.bytes.byteLength,customMetadata:object.customMetadata,arrayBuffer:async()=>object.bytes.slice(0)}:null;},
} as unknown as R2Bucket;
const env={ENVIRONMENT:"local",MODE:"simulation",DOCUMENTS:bucket} as Env;
const cpu=process.cpuUsage(),start=performance.now(),memoryBefore=process.memoryUsage();
const original=new Uint8Array(10*1024*1024),image=new Uint8Array(350*1024*3/4),text=new Uint8Array(8000*4);
const proof=await putSecureObject(env,"synthetic/original","capacity:original",original,"application/pdf");
await getSecureObject(env,"synthetic/original","capacity:original",proof.sha256);
for(let offset=0;offset<100;offset++){
  const page=offset+1;
  await putSecureObject(env,`synthetic/${page}.image`,`capacity:${page}:image`,image,"image/jpeg");
  await putSecureObject(env,`synthetic/${page}.text`,`capacity:${page}:text`,text,"text/plain;charset=utf-8");
}
const used=process.cpuUsage(cpu),memoryAfter=process.memoryUsage();
const report={measuredAt:new Date().toISOString(),environment:"local_node_in_memory_r2_synthetic",node:process.version,cloudflareCpuMeasured:false,validPdfRendered:false,pages:100,inputOriginalBytes:original.byteLength,imageBytesPerPage:image.byteLength,textBytesPerPage:text.byteLength,wallMs:Math.round(performance.now()-start),processCpuMs:Math.round((used.user+used.system)/1000),r2Writes:writes,r2Reads:reads,ciphertextBytes:storedBytes,memoryBefore,memoryAfter,limitations:["Local process CPU and memory differ from Workers billing and limits.","R2 operations counted by an in-memory adapter, no network latency.","Buffers represent maximum storage envelopes, not a rendered PDF corpus."]};
await mkdir("test-results",{recursive:true});
await writeFile("test-results/secure-storage-capacity.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
