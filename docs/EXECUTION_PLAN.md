# Execution plan and handoff

Updated 2026-09-16. Baseline: `nclsppr/guteneo` main `2578118cc1c2d091a6ab62c9e0e5b81dedd1150d`, README only; clean clone. Branch `feat/guteneo-foundation`. GitHub is accessible. No Cloudflare account connector is exposed in this session, including plugin discovery. No deployment, DNS change, paid resource, real document transfer or communication was executed.

## Delivered increment

| Step                              | State and observable evidence                                                                                                                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspect and qualify initial risks | Repository preserved; dated official sources, Auth0/Clerk comparison, Telnyx/SES/Pingen verification in VERIFICATION, IDENTITY_MCP and PROVIDERS. Real-client risks remain open.                                                                                 |
| Build local vertical              | Implemented on Wrangler/workerd, D1, R2 and Queues: two fictional organizations, exact import or explicit HTML rendering, preview, immutable preparation, browser approval, atomic quota/outbox, conditional attempt, per-channel simulated result and timeline. |
| Connect providers and identity    | Auth0 BFF/PKCE/JWT and official stateless MCP implemented; real clients and live provider bridge tested with signed/intercepted fixtures. These are not live account tests.                                                                                      |
| Product experience                | French printing-house landing, dither asset, onboarding, assistant connections, documents, preparation, CSV/campaigns, dispatch review, senders, usage and administration. Desktop/mobile E2E and actual PDF canvas evidence retained.                           |
| Hardening and operations          | Invariant/concurrency/content/auth/provider tests, queue/DLQ tests, local restore rehearsal, cost model, dry-runs, CI and incident runbook. See TEST_RESULTS for exact final counts and commands.                                                                |

The increment is a usable local product with closed live gates. It does not complete every production requirement in the brief. No external account success or assistant compatibility is inferred from simulation.

## Decisions

- One TypeScript package with modular source folders; private R2 and D1 as the authority, separate browser service, two service classes of Queue. No VBS dependency, custom identity server, internal LLM, KV budget, microservices deployment, or automatic channel substitution.
- Approval binds the final normalized recipient, immutable document/hash, HTML/text, sender, options and monetary ceiling. The assistant can prepare/confirm after approval, but cannot create the human approval.
- Unknown provider acceptance retains its reservation and never auto-resubmits, including after lease expiry or the tested restoration. Outbox publication may duplicate safely.
- Production without a qualified scanner keeps imports in quarantine before PDF parsing. Local scan bypass is visible and forbidden on a hosted deployment.
- Do not invent live prices to unlock the product. A production preparation returns `LIVE_PRICING_REQUIRED`; the live bridge does not remove it.
- Campaigns are capped at500 rows and use individual approvals. Marketing is explicitly disabled until the complete unsubscribe/reputation flow is implemented and qualified.

## Next executable work, in priority order

| Work                                      | Remaining implementation or qualification                                                                                                                                                                                                                                                                                             | Completion evidence                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Trusted live quote snapshots              | Implement a persisted, organization-scoped quote resolver tied to the complete normalized input, provider/account, currency, amount/ceiling, expiry and source. Reject stale/changed quotes at confirmation and preflight. Obtain real account tariffs and clarify provider cost guarantees; no client-supplied price can be trusted. | Concurrency, mutation, expiry and cost-change tests; reviewed tariff/source and authorized staging acceptance.                |
| Hosted infrastructure and scan            | Authorize/access the Guteneo Cloudflare account; provision separate EU D1/R2 and queues from the plan; select and connect a real isolated scanner. Configure monitoring and independent encrypted backups.                                                                                                                            | Account jurisdiction evidence, clean/hostile scanner fixtures, staging Browser Run byte/render proof, restored remote backup. |
| Real identity and assistants              | Configure Auth0 tenant, MFA and OAuth client registrations. Verify consent, refresh, revoke, scopes and exact file transfer from a PDF generated inside each supported assistant.                                                                                                                                                     | Real ChatGPT/Claude/Cursor matrix entries with dates and byte hashes, not Inspector results.                                  |
| Real provider execution                   | Configure owned senders, callbacks, country policy, provider concurrency and transient-error scheduling. Add bounded provider-status reconciliation for known references; qualify uncertainty handling against accounts.                                                                                                              | Explicitly authorized fixture destinations and actual sandbox/live results, no invented numbers.                              |
| Postal human preflight                    | Expose the implemented non-sending Pingen draft preparation through authenticated browser consent; verify printed/return address, provider preview, tariff and draft cleanup before approval. Current helper is intentionally not a public route.                                                                                     | Reviewable exact-PDF/address proof and approved staged send; no address overlay on an imported original.                      |
| Larger campaigns and marketing            | Frozen manifest acceptance/materialization in bounded idempotent batches; complete unsubscribe/suppression/reputation policy and authorized funded quotas.                                                                                                                                                                            | Large-campaign interruption/concurrency tests, isolation and unsubscribe E2E.                                                 |
| Public onboarding and platform operations | Turnstile/risk gating, guided verified sender management, separate least-privilege platform operators, content-access consent/audit, final metadata retention policy and alerts.                                                                                                                                                      | Abuse tests, role tests, actual operational qualification.                                                                    |

## Reversible improvements implemented

See IMPROVEMENTS.md: final-content preflight, actionable uncertainty/channel stop, separate document budgets/resumable purge, assistant diagnostics. Native MCP Apps preview remains deferred until host authentication and file transfer are actually qualified.

## Resume safely

Read AGENTS.md and TEST_RESULTS.md. Run `npm ci`, then `npm run demo` for local simulation; run the documented tests before further changes. Do not edit applied remote migrations, refill real quotas, clear uncertain commands, or activate live sending to make a test pass. Fixtures can set up controlled production-mode rows only inside isolated automated tests; application routes retain their gates.

No work is scheduled to continue after this session. Follow the remaining-work table and retain the existing evidence when a later milestone adds live qualification.

Read-only account check on2026-09-16: `npx wrangler whoami` returned “You are not authenticated.” No login, temporary account or deployment was initiated.
