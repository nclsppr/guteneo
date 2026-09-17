# Public HTTPS PDF imports

Local candidate, 17 September 2026. This change removes the source-domain
allowlist from hosted PDF imports. It has not been deployed or qualified in a
real assistant session. Current local validation is recorded in
[TEST_RESULTS.md](TEST_RESULTS.md).

## Source refusal and document quarantine are separate stages

`SOURCE_NOT_ALLOWED` rejects the source URL before downloading its bytes. That
failed attempt does not reach the antivirus and does not create a quarantined
document. A PDF created separately through `render_pdf` follows a different
path: Guteneo generates new bytes and verifies that new document.

`quarantined` means Guteneo has not obtained all proof needed to use the stored
PDF. It does not itself mean that malware was detected. Scanner availability,
configuration, signature freshness, an incomplete analysis, PDF validation or
an actual security rejection can all prevent promotion. Only an exact clean
scan and isolated PDF validation allow `ready`; neither authorizing a source
nor granting expert approval can replace them. The recovery contract is in
[DOCUMENT_ANALYSIS_RECOVERY.md](DOCUMENT_ANALYSIS_RECOVERY.md).

The reported regional Azure source refusal and the separately generated PDF
must therefore be diagnosed independently. This candidate does not establish
the affected document's current state or the cause of its quarantine.

## Hosted import contract

The API no longer uses `IMPORT_ALLOWED_HOSTS`. A source does not need a known
assistant provider, storage account or region. Hosted staging and production
accept public DNS hostnames with these download constraints:

- HTTPS on the default port 443; no embedded credentials, URL fragment, IP
  literal or reserved local hostname.
- Direct download only. Redirects are returned as failures and never followed.
- A 15-second download deadline and a 10 MiB limit enforced on the received
  stream, followed by exact-byte hashing, quarantine and verification. The
  existing 100-page maximum, authenticated tenant membership and organization
  quotas remain in force.

The API Workers enable `global_fetch_strictly_public`. In the deployed
Cloudflare runtime, global fetch uses public network egress and the runtime
filters resolved addresses. This avoids a separate DNS check followed by an
independent resolution at download time. Private scanner and renderer calls
continue through their explicit service bindings. See Cloudflare's
[compatibility flag reference](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public)
and [network and binding explanation](https://blog.cloudflare.com/workers-environment-live-object-bindings/).

Miniflare's local network does not provide the same public-only guarantee.
Remote URL imports are therefore disabled when `ENVIRONMENT=local`, with
`local_import_disabled`; capabilities report `urlImport:false`. Local clients
can still use authenticated multipart upload, including `upload_local_pdf`.
Hosted deployments advertise URL import subject to the guards above. A local
test intercepting fetch is not evidence of deployed public-egress behavior.

A model-supplied URL must still be real, accessible and unexpired. Guteneo does
not forward browser cookies or an assistant account's credentials. A local
filesystem path, private attachment handle or link to a login page is not a
downloadable PDF. No arbitrary source hostname, signed URL, content, recipient
or access token is added to logs.

## Qualification and release boundary

Removing provider-specific domain configuration prevents the observed regional
storage-host mismatch. It does not prove that ChatGPT, Claude, Grok, Copilot or
Cursor can each supply an accessible exact-file link. Each host's tool
availability, OAuth scopes, byte transfer and resulting SHA-256 still need
separate real-client evidence. Historical ChatGPT attempts remain in
[CHATGPT_QUALIFICATION.md](CHATGPT_QUALIFICATION.md).

Before claiming hosted completion, publish and verify the exact application
release, confirm the deployed compatibility flag, and qualify a bounded
synthetic import through verification to `ready`. The recovery feature has its
own migration and coordinated scanner release requirements. This work neither
changes human or delegated approval authority nor sends a fax, email or letter.
