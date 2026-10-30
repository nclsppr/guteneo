# Pingen qualification with a synthetic document

Developed from `118ce087`, published from
`5b91ad312ec14b40fa3441382d69782cc6343c96`, Worker
`0cac0373-eca4-454d-af8c-322d76fcc8d9`, on 17 September 2026 at 03:42:43 UTC.
The real provider exercise then created, inspected and deleted one synthetic draft
without sending. Local tests are separate evidence with synthetic provider replies
and an R2 lock exercised on real local runtime.

## Observed provider result

Configured production account; `LIVE_SENDS_ENABLED=false`.
Filtered report: `reports/pingen-synthetic-qualification-20260917.json`.

| UTC, 17 September 2026 | Step | Result |
| --- | --- | --- |
| 03:43:35 | Calculator | 151 EUR cents, one normal-paper LU page, cheap/simplex/grayscale |
| 03:43:56 | Upload/create | Only embedded synthetic PDF; `auto_send:false`, `created` |
| 03:44:16 | Inspect | One page; expected address/country/paper/embedded fonts; provider submit/delete abilities present; no submission |
| 03:44:43 | Cleanup | API deletion confirmed, `deleted` |
| 03:45:22 | Journal reread | Durable `deleted` tombstone retained |

**EUR1.51** is an account/date/option observation, not universal customer pricing,
tax qualification or final invoice. Inspection observed `/file` 302 without reading
or following Location; no final print preview download/qualification. API deletion
proves no immediate erasure of all provider copies/backups.

After cleanup, D1 users, organizations, documents, dispatches and fax-v3 tariff/
quote/settlement tables each had zero rows
(`reports/pingen-synthetic-d1-counts-20260917.json`). No customer document, app
consent, letter, active tariff or credit purchase was created. R2 technical journal
remains nonreplayable. No tenant, business document, approval, dispatch, quota or
credit was created; `appJourneyVerified`, `liveSendingVerified`, `canSend` stay false.

The embedded PDF is entirely synthetic: one A4 page, left address x25/y62 mm,
embedded Arial, white reserved areas and an instruction not to print/send.
Local rendering was checked; provider testing proves no customer upload, business
antivirus analysis or browser consent.

## Authority and scope

Authorized Cloudflare operators call private service-binding RPC
`ProviderInspection.qualifyPingenSynthetic`. `fetch()` remains 404; no REST/MCP/public
route is added. Cloudflare operator authority is separate from Auth0. Never bind
unapproved Workers to this entrypoint. The documented run is finished; never reset
its journal to create another draft.

Only `{phase:"calculator"|"create"|"inspect"|"cleanup"}` is accepted; extra fields
are refused. Inputs cannot control PDF, URL, recipient, organization, letter ID,
date or dependency. PDF/hash/name/run `20260917-synthetic-v1` and LU/left/cheap/
simplex/grayscale options are source-fixed. Only configured organization is usable,
reread as EUR/LU/left. Configuration requires explicit production,
`PINGEN_SANDBOX=false`, `LIVE_SENDS_ENABLED=false`, and the single already qualified
upload origin. Calculator/create expired **18 September 2026 at 12:00 UTC**, also
checked after network waits. Later inspect/cleanup remain limited to the recorded
draft. Another run needs a new decision/reviewed change, not a renewed invocation.
No send flag or active tariff is changed.

## Separate operator commands

Never deploy the local driver or binding configuration. It uses a dedicated proxy,
`persist:false`, `envFiles:[]`, no routes/observability; secrets stay in the Worker.
Use only within explicit provider-test authorization:

```sh
node scripts/qualify-pingen-draft.mjs --price-only
node scripts/qualify-pingen-draft.mjs --create-synthetic-draft
node scripts/qualify-pingen-draft.mjs --inspect-created
node scripts/qualify-pingen-draft.mjs --delete-created
```

One phase per command, no polling/retry. Connection deadline 20 seconds, RPC 50,
close three. Timeout before proxy receipt means no RPC; after `create` starts,
outcome may be unknown: inspect only, never recreate. Worker and driver both filter
results/errors. No provider message, token, letter ID, address, font name, URL or
signature is printed.

## Bounded protocol

OAuth explicitly requests `letter organisation_read`, without escalation. `letter`
can send; closed probe code, rather than a read-only scope, prevents sending. No
`/send`, `/cancel`, preset or batch path exists. Calculator accepts only 200 as
usable EUR pricing; 202 remains `price_pending`. Parse decimals exactly into integer
cents. Creation claims the durable journal, obtains upload URL, PUTs only embedded
bytes without Bearer, then creates with literal `auto_send:false` and fixed key.
Requests including bodies: eight seconds; JSON: 64 KiB; redirects manual.

Inspect verifies letter/organization identity, unique name and creation time near
the claim, requiring `submitted_at:null`. Project only match booleans, page count
and delete/submit abilities. `get-pdf-raw:ok` permits observation of `/file` 302
without reading/returning/following Location; this proves no print preview/download.

## Journal, concurrency and cleanup

Private `qualification/pingen/20260917-synthetic-v1.json` stores run, synthetic SHA,
account/client-binding hash, time, revision, state and optional known technical ID.
No signed URL, credential or user data; no other R2 object is written.

`If-None-Match:*` claims before upload. Every transition requires `etagMatches` and
increasing revision. Missing/uncertain claim forbids provider network. Inspect is
read-only; never delete old claims or the `deleted` tombstone to permit creation.

Unusable POST acknowledgement becomes nonreplayable `create_unknown`; hard crashes
may leave nonreplayable `claimed`. Received 201/ID plus later write failure attempts
a fallback ID write. A hard crash between acknowledgement and durable recording
may leave an unknown-ID draft: this probe does not list arbitrary letters and needs
separate operator reconciliation. Successful PUT then failed creation may leave a
provider temporary file; no upload-deletion endpoint is claimed.

Cleanup reads only journal ID, rechecks organization/name/date/no submission and
`abilities.self.delete === "ok"`. It CAS-claims deletion, verifies ownership and
DELETEs without body. Concurrent commands cannot delete another letter. Explicit
recovery may reclaim after 120 seconds; an old invocation cannot DELETE beyond its
30-second window. 204 durably records `deleted`; lost response keeps
`delete_unknown`. An explicit command may reconcile 404/410 after attempted
deletion without new POST. Cleanup proves API deletion, not immediate erasure.

Primary sources checked 17 September 2026:
[Pingen OpenAPI](https://api.pingen.com/documentation/swagger-docs),
[official SDK](https://github.com/pingencom/pingen2-sdk-go/blob/main/letters/letters.go),
[R2 conditional writes/strong consistency](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
OpenAPI describes DELETE 204, GET file 302 and 24-hour provider idempotency;
Guteneo's journal remains necessary beyond that period.

## Local and connection evidence

Three Wrangler 4.132.0 attempts stalled during remote binding. Isolated 4.133.0 then
completed private Telnyx/Pingen reads and normal close. The project moved to
Wrangler 4.133.0/matching Miniflare; precise earlier cause remains unknown.
Successful reads are no Pingen-upload proof.

Passed: 45 Vitest cases (31 new qualification, 14 Pingen reads), seven driver cases,
typecheck and focused lint, including with updated dependencies. Global Vitest
report was not replaced. Final synthetic A4 SHA-256:
`ee8217b869d6e552df3582ea2f886e4c7889964000ef26c975424ece5ba53385`.
Local rendering was inspected after fixing exact A4 size; tests also verify embedded fonts.
