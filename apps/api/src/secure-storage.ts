import type { Env } from "./env";
import { DomainError } from "../../../packages/domain/src/index";

const encoder = new TextEncoder();
function base64(bytes: Uint8Array) {
  let out = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    out += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(out);
}
function unbase64(value: string) {
  try { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
  catch { throw new DomainError("SECURE_STORAGE_INTEGRITY", "Le document est temporairement indisponible.", 503); }
}
export async function secureSha256(bytes: Uint8Array | string) {
  const input = typeof bytes === "string" ? encoder.encode(bytes) : bytes;
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(input).buffer)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function masterKey(env: Env,requestedId?:string) {
  const activeId=env.SECURE_DOCUMENTS_KEY_ID??"v1",keyId=requestedId??activeId;
  if(!/^[A-Za-z0-9_-]{1,32}$/.test(keyId))throw new DomainError("SECURE_STORAGE_NOT_CONFIGURED", "La version de clé est invalide.",503);
  let keyRing:Record<string,string>={};
  if(env.SECURE_DOCUMENTS_KEYS)try{const parsed:unknown=JSON.parse(env.SECURE_DOCUMENTS_KEYS);if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||Object.keys(parsed).length>10)throw new Error();keyRing=parsed as Record<string,string>;}catch{throw new DomainError("SECURE_STORAGE_NOT_CONFIGURED","Le trousseau de stockage sécurisé est invalide.",503);}
  const raw = keyRing[keyId] ?? (keyId===activeId?env.SECURE_DOCUMENTS_KEY:undefined) ?? (
    env.ENVIRONMENT === "local" && env.MODE === "simulation"
      && keyId==="v1"? "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" : ""
  );
  if (typeof raw!=="string"||!raw) throw new DomainError("SECURE_STORAGE_NOT_CONFIGURED", "Le stockage sécurisé n’est pas configuré.", 503);
  const bytes = unbase64(raw);
  if (bytes.length !== 32) throw new DomainError("SECURE_STORAGE_NOT_CONFIGURED", "La clé de stockage sécurisé est invalide.", 503);
  return {keyId,key:await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"])};
}
/** One random data key per immutable object, wrapped by the configured server
 * key. This is provider-readable encryption, not end-to-end or HSM attestation. */
export async function putSecureObject(env: Env, key: string, binding: string, bytes: Uint8Array, contentType: string) {
  const wrapping = await masterKey(env);
  const dataKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const keyNonce = crypto.getRandomValues(new Uint8Array(12));
  const aad = encoder.encode(`guteneo-secure-object-v1:${binding}`);
  const dataKey = await crypto.subtle.importKey("raw", dataKeyBytes, "AES-GCM", false, ["encrypt"]);
  const sealedKey = await crypto.subtle.encrypt({ name: "AES-GCM", iv: keyNonce, additionalData: aad }, wrapping.key, dataKeyBytes);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad }, dataKey, new Uint8Array(bytes).buffer);
  dataKeyBytes.fill(0);
  const sha256 = await secureSha256(bytes);
  await env.DOCUMENTS.put(key, ciphertext, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: {
      format: "guteneo-secure-object-v1", keyId:wrapping.keyId, nonce: base64(nonce), keyNonce: base64(keyNonce),
      sealedKey: base64(new Uint8Array(sealedKey)), binding: await secureSha256(binding),
      sha256, contentType,
    },
    onlyIf: { etagDoesNotMatch: "*" },
  });
  // A repeated preparation must verify the previously committed immutable object.
  const existing = await getSecureObject(env, key, binding, sha256);
  if (existing.bytes.length !== bytes.length)
    throw new DomainError("SECURE_STORAGE_INTEGRITY", "Le document est temporairement indisponible.", 503);
  return { sha256, size: bytes.length };
}
export async function getSecureObject(env: Env, key: string, binding: string, expectedSha256: string) {
  const object = await env.DOCUMENTS.get(key);
  const metadata = object?.customMetadata;
  if (!object || object.size>10*1024*1024+1024 || metadata?.format !== "guteneo-secure-object-v1" || metadata.binding !== await secureSha256(binding) || metadata.sha256 !== expectedSha256)
    throw new DomainError("SECURE_STORAGE_INTEGRITY", "Le document est temporairement indisponible.", 503);
  try {
    const aad = encoder.encode(`guteneo-secure-object-v1:${binding}`);
    const dataKeyBytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(metadata.keyNonce), additionalData: aad }, (await masterKey(env,metadata.keyId??"v1")).key, unbase64(metadata.sealedKey));
    const dataKey = await crypto.subtle.importKey("raw", dataKeyBytes, "AES-GCM", false, ["decrypt"]);
    new Uint8Array(dataKeyBytes).fill(0);
    const bytes = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(metadata.nonce), additionalData: aad }, dataKey, await object.arrayBuffer()));
    if (await secureSha256(bytes) !== expectedSha256) throw new Error("INTEGRITY");
    return { bytes, contentType: metadata.contentType };
  } catch {
    throw new DomainError("SECURE_STORAGE_INTEGRITY", "Le document est temporairement indisponible.", 503);
  }
}

export async function sealSecureSecret(env: Env, binding: string, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapping=await masterKey(env);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(binding) }, wrapping.key, encoder.encode(value));
  return `${wrapping.keyId}.${base64(iv)}.${base64(new Uint8Array(ciphertext))}`;
}
export async function openSecureSecret(env: Env, binding: string, sealed: string) {
  const parts=sealed.split("."),[keyId,iv,ciphertext]=parts.length===2?["v1",...parts]:parts;
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(iv), additionalData: encoder.encode(binding) }, (await masterKey(env,keyId)).key, unbase64(ciphertext)));
  } catch { throw new DomainError("SECURE_STORAGE_INTEGRITY", "L’invitation est indisponible.", 503); }
}
