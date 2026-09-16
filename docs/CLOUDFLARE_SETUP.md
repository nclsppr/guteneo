# Guteneo hosted setup

Provisioned on 2026-09-16 under the user's instruction to activate the real application. This records resource creation, not a completed application release or a successful fax.

Cloudflare account: `39ac9fada6cba44d9ecf09d467609e69`. Domain zone `guteneo.com`: `b1765d7fe9186a8b821ef4d52d46d244`.

## Created resources

| Resource          | Name                             | Identifier / evidence                                                                                        |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| D1                | `guteneo-production`             | `f86235fa-58c1-404f-a9a6-e2d657315854`; jurisdiction `eu`, observed region `EEUR`, read replication disabled |
| Private R2        | `guteneo-production-documents`   | Jurisdiction `eu`, observed region `EEUR`, storage class Standard; `r2.dev` public access verified disabled  |
| Interactive queue | `guteneo-production-interactive` | `d50ea1b42d5040918c6cde960b34df26`                                                                           |
| Bulk queue        | `guteneo-production-bulk`        | `f9dcc61bdffa4f8bbe5f8b6520134fe6`                                                                           |
| Dead-letter queue | `guteneo-production-dlq`         | `f418222a5ca94c3888858486f75b879d`                                                                           |

At creation, the database had no application tables, R2 had zero objects, and every queue had zero producers and consumers. Queue retention is 86,400 seconds. This setup did not apply migrations, upload a document, attach a consumer, change a paid plan or send a communication.

The D1 creation response and subsequent `wrangler d1 info` both report `jurisdiction: eu`; this is stronger than a location hint. R2 was created with `--jurisdiction eu`, inspected using that jurisdiction, and its public development URL was confirmed disabled. These facts do not imply that Worker execution, identity, queues, Browser Run or providers remain within the EU.

The current Cloudflare Queues API documentation advertises `jurisdiction: eu`, but the account rejected that creation request with code `10026` (could not parse request body). Wrangler 4.132.0 does not expose a queue jurisdiction option. Creation through the supported Wrangler command succeeded without a jurisdiction setting; the resulting API records omit jurisdiction. No EU locality guarantee is claimed for queues. Their application payload contains the dispatch identifier, while content and recipients remain in D1/R2.

## Deployment configuration

`wrangler.live.jsonc` targets Worker `guteneo-app` and includes only the actual Guteneo resources above. It sets `ENVIRONMENT=production`, `MODE=production`, `LIVE_SENDS_ENABLED=false`, enables the bootstrap `workers.dev` hostname and disables preview URLs. The custom-domain routes list is empty. The release owner will add `guteneo.com` only after real authentication is configured and checked; preparing or deploying this configuration does not move the domain.

Identity and private service bindings are added only after real services are configured. Scanner and document renderer were subsequently deployed and qualified as recorded below; their bindings are coordinated by the main release owner. No fabricated client identifier, secret, provider quote or scanner result is supplied. The ordinary local and preview configurations remain separate.

Before a coordinated release, apply the repository's ordered migrations to this new database, inspect `foreign_key_check` and `quick_check`, and verify the actual deployed version. Do not seed fictional organizations or simulated credits into this database.

## External account status

- **Auth0:** the configured CLI tenant is `pieper.eu.auth0.com`, but its former session had expired. An official user login flow was opened in Safari and left awaiting the user's authentication. The tenant's applications and API registrations have not yet been inspected. This setup did not authorize access on the user's behalf or create a new tenant.
- **Stripe:** the CLI identifies account `acct_1TvJW3RM0v8xMCio`, but its stored test credential is expired and no live credential is available. The Projects plugin is not installed; its metadata request was rejected because of expired authentication. No catalog, service provisioning, account eligibility or live billing readiness is inferred. An official browser approval flow was launched; its completion poll timed out, so a fresh login may be required.
- **Telnyx:** the initial scoped discovery found no credential. The main release owner subsequently installed the API key and public webhook key in `guteneo-app` and created a Guteneo fax application. User account activation, outbound profile configuration and delivery proof are separate steps; no real fax was sent during infrastructure qualification.
- **Scanner and Browser Run:** `guteneo-scanner` and `guteneo-documents` were deployed privately and qualified against the hosted services. Real ClamAV clean/EICAR tests, exact-byte PDF parsing and actual Browser Run HTML-to-PDF generation passed. See `docs/SCANNER.md` for versions, fixture hashes, placement and cold-start limits.
- **Cloudflare billing:** resource creation, private Containers deployment and Browser Run execution succeeded on the existing account. The subscriptions API was not authorized; its exact billing plan remains uninspected. No upgrade, terms acceptance or new subscription was performed. Bounded qualification used the existing account entitlement.

Temporary login URLs and pairing codes are intentionally not persisted in this document. Secrets belong in the configured secure entry flow or Worker secret storage, never source files, logs, browser bundles or chat.

## Qualified scanning dependency

The `guteneo.com` zone reports the **Free Website** plan. Its content scanning setting was read through the official API and is `disabled`. Cloudflare's documented malicious-upload detection requires an Enterprise plan with a paid add-on. It scans incoming HTTP content and exposes detection fields for WAF rules; enabling detection alone does not block anything. This feature has not been purchased or enabled.

No documented native R2 object-scanning API or malware-scanner Worker binding was found in the current Cloudflare documentation. The WAF feature would also require deliberate coverage of server-side URL imports and generated documents, which do not arrive as PDF upload bodies.

A real ClamAV engine was implemented and deployed in a private, isolated Cloudflare Container behind a service-binding-only Worker. Its deployment enforces `constraints.jurisdiction: eu`, uses one `standard-1` instance with 4 GiB memory, limits instances to one, disables runtime Internet access and stops after two idle minutes. The observed instance location was `cdg08`. Containers accrue usage charges; the bounded deployment and qualification were authorized under the existing account without upgrading its plan. See `docs/SCANNER.md` for the cost estimate and daily definitions maintenance.

Qualification must verify current antivirus signatures, actual byte scanning, an exact SHA-256 match, clean and antivirus-positive fixtures, and quarantine on stale definitions, incomplete scans, timeout or engine errors. The scanner must never execute documents or expose file bytes in logs. A PDF parser, magic-byte check or successful browser rendering is not an antivirus verdict. The existing application requires both a clean scanner response and isolated PDF validation before removing quarantine; preserve that boundary.

The original application's scanner call had a 30-second timeout. Hosted initial provisioning and signature loading took 125.627 seconds, while a warm scan took 0.054 seconds through the private bridge. Prewarming or an asynchronous quarantine-to-ready flow is therefore required. The isolated service proofs do not establish a complete application release or fax delivery.

## Official references checked

- [D1 jurisdiction and location](https://developers.cloudflare.com/d1/configuration/data-location/)
- [R2 data location](https://developers.cloudflare.com/r2/reference/data-location/)
- [Queue creation](https://developers.cloudflare.com/api/resources/queues/methods/create/)
- [Wrangler Queues commands](https://developers.cloudflare.com/workers/wrangler/commands/queues/)
- [Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Cloudflare malicious-upload detection](https://developers.cloudflare.com/waf/detections/malicious-uploads/)
- [Container placement and jurisdiction](https://developers.cloudflare.com/containers/concepts/placement/)
- [Container instance sizes and pricing](https://developers.cloudflare.com/containers/platform/pricing/)
- [ClamAV Docker requirements](https://docs.clamav.net/manual/Installing/Docker.html)
