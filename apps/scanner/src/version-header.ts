/** Bind qualification responses to the Worker that actually handled the request. */
export function scannerVersionHeader(
  response: Response,
  env: { WRANGLER_VERSION_METADATA?: { id?: unknown } },
): Response {
  const version = env.WRANGLER_VERSION_METADATA?.id;
  const headers = new Headers(response.headers);
  headers.delete("x-guteneo-worker-version");
  if (
    typeof version === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      version,
    )
  )
    headers.set("x-guteneo-worker-version", version.toLowerCase());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
