# Gare experience

## Scope and ownership

Gare is a separately built first-party browser client in `apps/experience/`.
Its intended production origin is `https://gare.guteneo.com`; the canonical
application and API remain at `https://guteneo.com`. The independent station
direction is explicitly requested for this experience. It does not replace the
shared design language of the existing five applications, alter their routes,
or create another backend or identity store.

The logo uses the approved original portrait and lowercase wordmark. Station
signage, Barlow typography, day/night materials and decorative split-flap cells
belong to this application. Optional synthesized sound starts disabled; text
equivalents and reduced-motion handling remain necessary independently of sound.
The four interface languages are French, English, German and Luxembourgish;
canonical routes and API identifiers remain English.

## Surfaces and completion boundary

| Route           | Current purpose                                                                                        | Authority                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `/`             | Public entry, language/theme and canonical sign-in                                                     | None for public content                                          |
| `/departures`   | Dispatch list, filters, selected dispatch and tracking                                                 | Current workspace membership                                     |
| `/counter`      | Explicit fax/email preparation and bounded plain-text email review; canonical specialist continuations | Preparation permission                                           |
| `/documents`    | Workspace PDF library, import/render and selected-document viewing                                     | Current document visibility; preparation permission for creation |
| `/arrivals`     | Personal received documents and personal vault                                                         | Current personal browser principal and document policy           |
| `/lockers`      | Secure distributions and canonical continuation                                                        | Workspace/document visibility; existing secure approval policy   |
| `/destinations` | Saved recipients                                                                                       | Preparation permission for reading and changes                   |
| `/timetable`    | Scheduled dispatches and explicit eligible cancellation                                                | Current workspace authority and existing schedule rules          |
| `/studio`       | Template discovery and canonical authoring continuation                                                | Current template/workspace rights                                |
| `/office`       | Workspace usage and management continuations                                                           | Administrator or supervisor with reports option, as appropriate  |
| `/account`      | Current identity, workspace switching and account continuations                                        | Current browser session                                          |

Specialist authoring, financial controls and specialized final approval continue
through the existing canonical interfaces where a complete equivalent review is
not implemented in Gare. Such links are explicit continuations, not a claim that
every existing page has been recreated. In particular, a prepared dispatch does
not imply approval, acceptance or sending. Opening or rendering a page never
approves a dispatch, purchases a check, transfers a postal draft, enables expert
delegation or invokes a delivery provider.

## Role and permission matrix

| Operation                                    | Administrator                          | Supervisor                           | Operator                             | Observer                             | Assistant                                                       |
| -------------------------------------------- | -------------------------------------- | ------------------------------------ | ------------------------------------ | ------------------------------------ | --------------------------------------------------------------- |
| Read permitted workspace resources           | Yes                                    | Yes                                  | Yes                                  | Yes                                  | Existing scoped APIs only                                       |
| Prepare a dispatch or edit a saved recipient | Yes                                    | Yes                                  | Yes                                  | No                                   | Existing scoped APIs only                                       |
| Approve an ordinary dispatch                 | Existing browser review                | Only with approval option            | No                                   | No                                   | Existing bounded delegated API only; never Gare browser consent |
| Read reports                                 | Yes                                    | Only with report option              | No                                   | No                                   | Existing API policy only                                        |
| Manage members, billing or expert mandates   | Existing administrator browser surface | No                                   | No                                   | No                                   | No                                                              |
| Read personally received documents           | Independent personal/document policy   | Independent personal/document policy | Independent personal/document policy | Independent personal/document policy | No browser authority                                            |

This table projects `packages/contracts/src/roles.ts`. The server recomputes
membership and permissions on every request; hiding a control grants no
authority. Personal document access is independent of workspace membership.

## Session and origin contract

`apps/api/src/experience-origin.ts` owns the exact-origin grant. An unset or
invalid `EXPERIENCE_ORIGIN` leaves cross-origin access disabled. A hosted origin
must be an HTTPS subdomain of the configured application host, with no path,
credentials or custom port. The platform host is reserved. Local simulation
allows only HTTP loopback origins with the same hostname and a separate port.

The static app uses `credentials: include` for the canonical application's
`/api/` requests. The authentication cookie remains host-only on the canonical
application; Gare cannot read or forward it. CORS is restricted to the exact
configured origin and application host. Preflights advertise only the required
methods, content/CSRF/idempotency headers, with no bearer Authorization header.
Upload-capability routes, Auth0 callbacks and other non-API routes do not inherit
the CORS grant. Browser writes retain CSRF, membership and role checks.

Sign-in starts on the canonical application. Auth0 returns there under the
existing callback and cookie rules; `/auth/experience` then returns to the
configured experience origin and a bounded internal path. The destination host
is never taken from caller input. This approach adds no Auth0 callback hostname
and does not broaden an assistant's OAuth scopes or authority.

The client isolates every request by an in-memory authority revision. Session
probes must agree on person and CSRF/session identity before publishing a ready
state. A change of account, workspace, effective permissions or document-policy
facts invalidates old work and remounts the protected subtree. Loss of authority
clears previously loaded private resources, including after 401/403. A prior
account's response cannot be accepted after switching away and back.

Private PDF and page bytes are read with current authorization, held in memory
and displayed with revocable object URLs. No private content, recipients, tokens
or signed URLs belong in persistent browser storage, logs, screenshots or release
assets. Device-local theme/language preferences are presentation only.

## Customer journeys

1. **Enter:** open Gare, choose a language, follow canonical sign-in, return to
   the same valid experience route, then load current personal/workspace rights.
   An unavailable session offers recovery without inventing a signed-in identity.
2. **Prepare and follow:** choose an eligible channel and source, enter the exact
   recipient and content, explicitly prepare, then inspect the resulting record.
   For the narrow plain-text email variant, show the exact sender, recipient,
   subject, text, fingerprint-bound price and expiry, require explicit content
   review and the required recipient-request attestation, then invoke existing
   approval and confirmation endpoints. Documents, custom HTML, secure/postal
   options and scheduled holds continue to canonical review. Read actual status
   after the action and require explicit reconciliation after an uncertain write. Unknown outcomes are not retried
   automatically and no sample price enables a live channel.
3. **Work with documents:** read only permitted originals, explicitly import or
   generate a new PDF, and retain its own immutable identity. Scanning and
   readiness remain backend gates. Personal arrivals use the personal principal,
   current recipient binding and the active document policy.
4. **Change workspace:** explicitly choose a current membership; invalidate old
   requests and private views before showing the newly selected workspace. A
   failed change never claims success or silently selects another membership.
5. **Continue specialist work:** open the explicitly named canonical Studio,
   administration or review destination with its existing permission checks.
   Navigation itself grants no consent and replays no mutation.

## Build, activation and recovery

Gare's production artifact is static assets only. It has no D1, R2, queue,
provider, Auth0 secret or development-session binding. Build-time
`GUTENEO_API_ORIGIN` must identify the canonical production API; loopback is for
local development only. The generated `_headers` constrains scripts/fonts to
the static origin and API connections to the configured application. The
experience is noindex and is not added to the canonical marketing sitemap.

Publication requires a reviewed source revision, successful relevant checks,
verified static bytes, the separate static deployment/custom domain, and the
canonical backend's exact `EXPERIENCE_ORIGIN` activation. Domain/TLS readiness,
backend CORS, a real browser login and business/provider qualification are
separate evidence. Never weaken release or browser gates when a local runtime
cannot open a port. A failed or uncertain deployment must first be inspected,
not blindly retried. Removing the backend origin grant closes cross-origin API
access without changing canonical sign-in or an accepted dispatch.

`.github/workflows/manual-experience-release.yml` is the manual Linux publication
entry. The operator supplies the full `source_commit` and successful main CI
`ci_run_id`/`ci_run_attempt`. It installs locked dependencies before qualification,
requires exact clean main, complete successful CI, the matching remote version
tag and a canonical production `/release.json` serving that same source. The
backend's exact Gare origin grant must already be published. The workflow then
installs Chromium, rebuilds Gare and runs the full synthetic browser suite with
`EXPERIENCE_TEST_BUILD=1` against the actual production assets through Vite preview.
It rechecks CI, tag, served backend and source before submitting to Wrangler.

This workflow reuses `CLOUDFLARE_APP_RELEASE_API_TOKEN` and serializes with the
canonical publisher in `guteneo-production-application`. It does not create a
credential, expand its permissions, migrate D1 or enable a provider. The existing
token's actual scope for the new static Worker/domain remains an independent
qualification; a refusal stops publication. The
`manual-experience-release-<run>-<attempt>` artifact retains qualification,
publication status, release manifest and synthetic browser evidence for 30 days.
On failure, inspect those records and current served state before another
explicit attempt. An artifact created after a failed step is not a successful
publication receipt.

The static frontend has no new long-running container, polling worker or
database. Route modules and locale catalogs load on demand; resource reads are
bounded and hidden-tab polling stops. A cached CORS preflight reduces repeated
requests without changing write authorization. These design choices are not a
measured production cost or latency claim. Record requests, transfer sizes,
first useful content and operational costs for the actual released revision.

## Qualification ledger

The dedicated `playwright.experience.config.ts` suite uses intercepted synthetic
API responses and no real account, database or provider. It checks public locales,
read-only route entry, explicit document actions, exact email review, role
refusals, account replacement/purge, unsaved-draft navigation, narrow layouts, reduced motion and
accessibility; attached screenshots and timing records are
explicitly synthetic. `tests/unit/experience-origin.test.ts` separately qualifies
the backend origin/session contract. Passing browser fixtures cannot establish
real Auth0 cookies, production CORS, genuine supplier behavior or delivery.
Interception matches the `/api/` pathname root only. Development modules under
`/src/api/` must remain real JavaScript; intercepting those modules as synthetic
JSON prevented all initial renders in the first hosted Gare attempt. That failed
attempt is not browser qualification, and the correction retains every route,
privacy, consent and accessibility assertion for the next complete CI run.

The next hosted run,
[43125751253](https://github.com/nclsppr/guteneo/actions/runs/43125751253),
tested `d19f4da35244397f9c61877a56f197635b8d00fc`: 73 of 75 Gare cases passed on
each viewport, or 146 of 150 overall. The two unsaved-navigation cases on each
viewport failed at the fixture's exact label lookup for the message field;
the trace retained the textbox and its draft. The corrected selector uses the
textbox role and exact accessible name, retaining the cancel/accept, URL and
draft-preservation assertions. This partial result is not a complete successful
browser gate; a new full run must qualify the corrected source before release.

The initial audit found missing entry/catalog files, TypeScript/lint errors and
session-cache weaknesses. Those observations describe the inherited incomplete
source, not the result of the continuation. Record exact final checks and hosted
verification below rather than carrying historical test totals forward.

| Evidence                                                           | Status on 12 November 2026                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Full repository lint and documentation consistency                 | Passed locally after implementation and CI integration                                                                                                                                                                                                             |
| Origin, client authority, navigation and integration archive tests | 71 passed: 19 origin/session, 9 client authority, 8 navigation and 35 integration tests                                                                                                                                                                            |
| CI inventory, validation policy and deployment guards              | 106 passed: 87 CI policy/inventory and 19 deployment guards; Gare reports are required by the existing exact-ID browser verifier                                                                                                                                   |
| Engineering publication build                                      | Passed; 424 static assets, 61 documentation pages, 29 authored MDX pages lint clean and 4 publication-boundary tests passed                                                                                                                                        |
| Dedicated synthetic browser suite                                  | 150 cases discovered; hosted d19f4da3 run passed 146, with two navigation fixture selector failures per viewport. Corrected-source complete CI remains required. Local Chromium startup remains unavailable                                                        |
| Portable release evidence renderer                                 | Nine non-browser checks passed; candidate notes accepted by the real renderer. The offline-browser case remains blocked by the same local Chromium startup denial                                                                                                  |
| Static experience artifact                                         | Production static build passed locally: 34 static assets, canonical API origin and release manifest; the dirty candidate build is not a deployable clean-main proof                                                                                                |
| Published static artifact and custom domain                        | Not yet verified in this ledger                                                                                                                                                                                                                                    |
| Manual browser with the actual local API                           | Demo sign-in, French plain-text email preparation, EUR 0.01 simulation quote with EUR 5 ceiling, exact review, explicit simulation approval and resulting queued state followed by accepted and accepted_by_server events observed; no external communication sent |
| Real Auth0 browser return and authenticated production API reads   | Not yet qualified                                                                                                                                                                                                                                                  |
| Real communication/provider delivery                               | Not performed by this work                                                                                                                                                                                                                                         |

The existing Linux CI browser jobs run the dedicated suite once per viewport and
preserve its synthetic JSON reports and failure traces. The final verifier
discovers the current test inventory independently and rejects missing results,
undeclared skips, retries and mismatched source/run evidence. The main browser
configuration and Vitest do not discover this suite implicitly; its explicit
configuration and CI steps are required.
