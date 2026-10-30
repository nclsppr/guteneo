# ChatGPT qualification — 17 September 2026

The new local candidate removes the hostname allowlist for public HTTPS sources in hosted environments, with the network and scanning controls described in [PUBLIC_PDF_IMPORT.md](PUBLIC_PDF_IMPORT.md). This work does not deploy it. The paragraphs below retain exact-host configurations and historical trials; the candidate replaces that host policy. Evidence of the first delivered fax concerns a different journey and does not establish the state of the document reported today.

## First delivered real fax — evidence bounded to the observed journey

After native PDF import in ChatGPT, manual quote renewal and user approval in Guteneo, a single Telnyx attempt was created on 17 September 2026 at 11:13:55.422 UTC. It was accepted at 11:13:59.101 UTC. The provider `delivered` event occurred at 11:15:17.154 UTC, arrived at 11:15:18.497 UTC and was applied at 11:15:18.892 UTC. A D1 read confirms delivered status and a single attempt. The diagnostic agent neither approved nor resent this fax.

The first redacted proof, `test-results/chatgpt-import/first-live-fax-delivery.json`, observed at 11:22:18.366 UTC, still held the 200-cent ceiling in reserve. One-off operator/service reconciliation was then applied that day at **11:48:48.891 UTC**: customer usage **88,411,200 nanoEUR**, **9-cent** debit, reservations reduced to zero, still one attempt and one approval. The redacted readback is in `test-results/fax-quote-release/first-fax-redacted-proof.json`. No new dispatch was triggered for reconciliation. This does not qualify a general automatic provider-usage collector. Delivery and settlement remain separate facts; an estimated-bound field is not a debit.

This observation qualifies one document and one Luxembourg recipient route. It certifies neither Telnyx Local Calling, fax reception by all Luxembourg numbers, nor the catalog's 42 routes. Private installation and the initial read-only tests below remain separate historical evidence. No new communication was sent to correct quote renewal.

## Initial read-only installation

In Safari, the user was signed into Guteneo and ChatGPT. With explicit consent, developer mode was enabled and the remote connector `https://guteneo.com/mcp` created. Auth0 consent was then accepted with authorization for email address, `documents:read` and `dispatches:read` only. No import, preparation or sending permission was granted for this qualification.

A dedicated Guteneo OAuth client for ChatGPT was registered with the exact callback supplied by the interface. This public client uses Authorization Code and existing PKCE checks. Guteneo Actions also check audience and identity; their configuration, the browser client and Cloudflare secrets were unchanged. No client secret was copied into ChatGPT.

The interface confirmed “Guteneo is installed”. After metadata refresh it discovered 16 tools and indicated that writing tools would require reconnection with additional permissions. Reloading ChatGPT made the connector available in the `@Guteneo` selector.

A conversation explicitly restricted to reads returned:

| Call | Observed result in ChatGPT |
| --- | --- |
| `get_capabilities` | Success; `production` mode, no simulation |
| `list_documents` with `limit:1` | Success; empty list |
| `list_dispatches` with `limit:1` | Success; empty list |

This is evidence from the real interface: installation, consent, discovered schemas and conversation response. This note stores no token, OAuth callback code, signed URL or document content. The published application source at the test was `44d1d5bb64418372c5174faa1ce5601681fcc813`.

This qualification does not cover PDF import/generation, exact transfer/hash, approval journeys, token refresh, revocation or real communication. No document was created or sent. The connector is a private development installation; the complete skill package and directory publication are separate steps.

Followed journey: [official OpenAI documentation](https://developers.openai.com/plugins/deploy/connect-chatgpt). Limits and next qualification steps: [LLM_SETUP.md](LLM_SETUP.md).

## Remote import correction — 17 September 2026 history

`SOURCE_NOT_ALLOWED` was caused in part by production configuration lacking `IMPORT_ALLOWED_HOSTS`: all remote sources were refused independently of fax activation. The exact domain `files.oaiusercontent.com` was then configured in `wrangler.live.jsonc`. No arbitrary subdomain, redirect or non-HTTPS URL was accepted. The native `openai/fileParams` contract retained required `download_url` and `file_id`; bytes are downloaded, bounded, scanned and stored before any dispatch preparation.

Import errors then returned a precise reason, normalized public domain and correlation. The server logs only closed categories and the recognized OpenAI domain; logs retain no signed URL, path, filename, OpenAI identifier or unknown domain. Expired links, redirects and the 15-second download timeout have distinct codes.

Local validation: 73 focused tests passed, including simulated D1/R2 transfer with byte and SHA-256 comparison. These fixtures are not evidence of real transfer from ChatGPT.

A new real trial in the existing conversation reread the original PDF (136,018 bytes, one page, SHA-256 `c976528ff2a30ef6374c3df5aaf171036132e12a00c6d180dc19cf35da734e63`), but the session exposed only seven read tools, without `import_document`. `list_documents` confirmed an empty list. There was no new import call or fax: the session's actual source domain, import and matching hash in Guteneo still required qualification after refreshing the writing connection. A configuration correction is not evidence of a real dispatch.

## Native source observed in ChatGPT — 17 September 2026 history

After refreshing connector metadata and explicitly selecting Guteneo in a new Chat conversation, the original PDF was attached from ChatGPT's native library without local download, manual upload or reconstruction. The request actually called `import_document`: its authenticated response identified `oaisdmntprnortheu.blob.core.windows.net` with reason `untrusted_host`. Refusal of this specific Azure domain explains why allowing `files.oaiusercontent.com` was insufficient for the file.

Both exact hosts were then configured in `wrangler.live.jsonc`. The observed Azure domain joined the closed list of loggable hosts; no other Azure account, subdomain, deceptive suffix or wildcard was allowed. Tests check exact-byte import from this host and refusal of variants without exposing the signed URL. Production configuration was reread on 17 September at 10:18 UTC with fax active. No fax was sent during this qualification.

A follow-up message without explicitly selecting the connector exposed only read tools and performed no new import. A native retry with the connector and file attached still needed observation to confirm `ready`, size and matching SHA-256 in Guteneo. Identifying and allowing the domain did not establish that evidence.

The native retry then supplied a second regional account for the same file: `oaisdmntprdenmarkeast.blob.core.windows.net`, refused with `untrusted_host`. This exact host joined configuration and tests alongside the first observed Azure account and `files.oaiusercontent.com`. Storage region could therefore vary between attempts; the list remained restricted to observed hosts. No generic `blob.core.windows.net` authorization was added.

## Exact transfer qualified in the real client — 17 September 2026

A new Chat conversation in Safari, with Guteneo explicitly selected and the original PDF attached from the native library, succeeded at `import_document` then `get_document` with **GPT-5.6 Sol, Extra High**. Guteneo received **136,018 bytes** with expected SHA-256 `c976528ff2a30ef6374c3df5aaf171036132e12a00c6d180dc19cf35da734e63`. No local download, manual upload, rendering or PDF reconstruction was used. The D1 record has source `import` and timestamp **2026-09-17T10:40:40.146Z**.

The first result was `quarantined`, with no validated page count. Repeating analysis was insufficient. Separate private-service diagnostics then qualified antivirus and four synthetic rendering cases, without Pingen or D1/R2 changes. With the scanner ready, `rescan_document` then `get_document` in ChatGPT confirmed **`ready`, one page, the same bytes and hash**. A direct D1 read confirms it. No quarantine was manually lifted. Cold start remains an operational limit: `sleepAfter=2m`, availability after three checks 30 seconds apart in this diagnostic; a quarantined document must never be presented as ready.

Recent GPT-6 Pro trials, including a native request with the connector attached, exposed only read tools. Switching models enabled this trial, but does not prove a general Pro-tier restriction: consulted official sources contradicted each other and the first import calls had reached the server. Distinguish host tool availability, domain authorization, byte transfer and security validation. Evidence applies to this observed journey, rather than all models or sessions.

No fax, email or postal mail was prepared, approved or sent to qualify this transfer. The connector remains a private development installation.
