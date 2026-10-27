# Frontend loading and personal bootstrap

25 October 2026 local candidate. This contract owns route-loading behavior and
its bounded local measurements. It establishes no production latency, server CPU,
provider readiness, price, deployment or physical-device qualification.

## Secure-distribution recovery and V2 — 27 October 2026

The list, composer, detail and reader share the existing workspace/personal V2
primitives; Classic keeps its saved presentation. Recovery stays within the
current route module. Sign-in links require no discovery request, renewal metadata
travels in the existing detail response, and only an explicit **Refresh quote**
performs the renewal mutation. Detail metadata and audit reads run in parallel;
list and MCP reads add no renewal query. Existing visibility polling, document
authorization and fresh human approval remain unchanged.

The final `tests/e2e/secure-distribution-recovery.spec.ts` run started at
`2026-10-27T16:04:05.433Z` and passed 18/18 cases in 28.954 seconds, with no
skips, flaky results or unexpected failures. Vite production assets ran on local
Wrangler with intercepted synthetic APIs, French locale and no network/CPU
throttling. The browser contexts were fresh per test; each of the three routes
used a full navigation through `about:blank`, within that test's browser context.
The table reports light/dark ranges from two samples per route/browser. It is
not a baseline comparison. These samples precede reconciliation with the 1.1.10
main release and qualify the recovery source committed as `adc8f5343927`; merged-
source CI and hosted publication remain separate.

| Surface / browser | Completed resource entries | Transferred bytes | Reported decoded JavaScript bytes | First useful panel observed (ms) |
| --- | ---: | ---: | ---: | ---: |
| List / Desktop Chromium | 40 | 662,141 | 1,527,726 | 171.7–181.1 |
| Composer / Desktop Chromium | 42 | 677,208 | 1,527,726 | 454.5–923.1 |
| Review and reader / Desktop Chromium | 41 | 671,228 | 1,527,726 | 415.4–423.7 |
| List / Pixel 7 Chromium emulation | 40 | 662,141 | 1,527,726 | 177.3–188.5 |
| Composer / Pixel 7 Chromium emulation | 42 | 677,208 | 1,527,726 | 939.8–943.2 |
| Review and reader / Pixel 7 Chromium emulation | 41 | 671,228 | 1,527,726 | 929.2–937.5 |
| List / iPhone 13 WebKit emulation | 41–42 | 680,782–696,138 | 1,527,726 | 194.0–467.0 |
| Composer / iPhone 13 WebKit emulation | 43–44 | 342,927–711,127 | 476,739–1,527,726 | 185.0–197.0 |
| Review and reader / iPhone 13 WebKit emulation | 42–43 | 343,287–680,782 | 476,739–1,527,726 | 139.0–446.0 |

The first-useful marker is `performance.now()` after the primary panel/list is
visible and its loading indicator is gone; it is not a standardized paint metric.
Resource totals are collected later, after preview/image assertions, so they have
a different completion boundary. Counts cover completed Resource Timing entries,
not the navigation document. Transfer sizes include reported headers; decoded
JavaScript sums each script's reported `decodedBodySize`. Cached WebKit resources
can report zero sizes, explaining the lower composer/detail totals without proving
a smaller application bundle. Resource completion and test load also vary.

Observed API reads were session/capabilities plus the list; session/capabilities
plus catalog/documents for the composer; and session/capabilities plus detail and
one page preview for review. The change adds no eager heavyweight dependency,
background timer or duplicate browser read for recovery. No speed improvement,
physical iPhone result, hosted Auth0/recipient journey, production latency, CPU,
memory or billed-cost qualification is inferred. Local screenshots and the
light/dark loading JSON attachments accompany the final Playwright evidence in
`/tmp/guteneo-secure-recovery-evidence/`.

See the [recovery contract](SECURE_DISTRIBUTION_JOURNEYS.md#recover-an-expired-invitation-quote)
for lifecycle boundaries and [dated implementation checks](SECURE_DISTRIBUTION_IMPLEMENTATION.md#quote-and-sign-in-recovery--27-october-2026-candidate)
for backend, package and UI validation.

## Personal documents start with personal authority

A direct personal route starts the small `PersonalArea` shell with the first
application render. It does not wait for workshop `/api/session`, a workshop
membership or an unrelated route chunk. The required order is still authenticated
`GET /api/personal/session`, then the account-bound document list. Personal access
continues to use its own current server session, document policy and recipient
binding; removing an unrelated workshop read bypasses none of those checks.

When a route enters the personal area, the application clears cached workshop
session state. Leaving a workshop aborts its pending bootstrap and marks its
result obsolete: even a transport that finishes after abort cannot apply the old
identity, language, redirect or ready state. Returning to a workshop performs a
fresh workspace session read and rechecks its authority.

The personal shell rereads its session on focus/visibility while visible,
coalescing overlapping or subsecond events. Component cleanup aborts reads and
ignores their late results. The main personal content is keyed by current user
identity, so a newly observed account remounts its document state instead of
reusing the previous person's list. A list failure has its own explicit retry;
retrying that list need not reload an already valid personal session. An expired
session returns to the existing sign-in recovery. Logout remains an explicit
protected request and leaves the private route; none of this starts a provider
login or communication merely to improve a loading measure.

Workshop, personal, native and OAuth credentials remain distinct. Four human
membership roles and their rights do not change. The browser still cannot assert
human consent, activate a mandate, open a channel or replace a failed read with
fictional documents.

## Route dependencies follow the requested task

Workshop dispatch, membership, billing, account and Studio screens are lazy
route imports. The personal shell is small and available immediately. PDF viewing,
PDF workers, template design and Swagger remain deferred until their actual
reader/editor task is entered. Starting My documents does not eagerly request
those engines. Functional fonts, document previews and accessibility controls
remain; source decoration never substitutes for content.

The personal Classic/V2 follow-up reuses the small appearance context and
`appearance-preferences.tsx` controls, without importing the workshop account
page, contacts, Studio or document engines. Its saved layout comes from the
already required personal session; changing browser color performs no business
read or write. A successful existing personal profile PATCH returns the updated
personal session directly, avoiding a second session waterfall. Acceptance is
bound to the source account and CSRF/session generation; an obsolete response
cannot replace a newly observed identity, language or layout. These request and
bundle boundaries are checked by `tests/e2e/personal-appearance.spec.ts`; they do
not establish a production timing improvement.

Public detail pages use a separate lazy chunk. Their lightweight path/metadata
module lets the entry point preload that chunk before React replaces complete
initial HTML. Slow or failed chunk loading must preserve the useful static page;
this is separate from private authenticated loading. The public-route contract
is in [homepage and navigation](HOMEPAGE_REDESIGN.md).

Brand, panorama and editorial pictures share `apps/web/src/theme-media.ts`;
`editorial/article-picture.tsx` supplies responsive dark/light sources for public
home thumbnails, journal and article pages. Native picture media selects the
requested theme and image size rather than loading a second image to fake a
palette with CSS filters. Small public-only swallow sprites and the restored home
closing section do not add logged-in decoration or change personal bootstrap.
Their final asset inventory is separate from the earlier controlled timing below.

Decorative `DashboardArtwork` panels and their swallow styling are removed from
V2 overview, empty Documents and the assistant introduction. Official identity,
actual documents, metrics, actions and permission notices remain. Historical
illustration files/provenance do not establish current runtime use; see
[workspace presentation](DASHBOARD_V2.md).

## Local controlled comparison — 25 October 2026

`/tmp/guteneo-frontend-performance-2026-10-25/controlled-profile.mjs` captured
five fresh Chromium contexts per variant at 1440 × 1000 with English labels.
All API responses were read-only synthetic fixtures, each delayed by 300 ms.
Static files were intercepted from local builds; no real account, document,
provider, backend mutation or network/CPU throttling was involved.

The baseline substituted only `App.tsx` from
`8067b8687ee128482a7bbf1bc712fb635f115008` into otherwise current candidate build
inputs. It is a controlled loading comparison, not a rebuild of an entire
historical release. Baseline contexts ran before candidate contexts. The browser
process, host load and local file interception were not a production network or
a cold physical device.

| Median of five contexts                   | Controlled baseline                           | Candidate                   |
| ----------------------------------------- | --------------------------------------------- | --------------------------- |
| First synthetic document heading observed | 1,317.9 ms                                    | 704.3 ms                    |
| Next animation-frame marker               | 1,318.1 ms                                    | 704.3 ms                    |
| Loaded decoded JavaScript per run         | 1,623,462 bytes                               | 1,451,870 bytes             |
| Initial API reads                         | Workshop session, personal session, documents | Personal session, documents |

Under that fixture, the first document marker was about 614 ms earlier. The
animation-frame marker is an instrumentation point, not a standardized paint or
Core Web Vitals measure. Decoded JavaScript bytes are not compressed wire bytes.
The measurements do not prove a general percentage improvement, current final-
source timing, hosted CPU/memory savings, cost reduction or end-user production
latency. Later theme/public-source changes require a new comparison before
reusing timing claims for that changed source.

Raw trials, baseline substitution and screenshots remain outside Git in the
same evidence directory, including `controlled-profile.json`. Preserve the
protocol and failed attempts when repeating a comparison; do not replace old
values with a new environment's results.

## Regression contract and sources

`tests/e2e/personal-document-performance.spec.ts` covers:

- Personal documents opening while a workshop session read is held, with no
  unused document/editor engine requested and no API mutation.
- A failed list recovering through list retry without another session read.
- Focus revalidation switching the observed personal account and discarding the
  earlier person's visible document and identity.
- A workspace transport completing after navigation without overwriting personal
  language/state, followed by fresh workspace authority on return.

These are controlled browser fixtures, separate from real Auth0, sensitive-file
access, business delivery and distribution qualification. A declared regression
scenario is not a hosted pass. Exact-source CI and final authenticated publication
checks remain separate.

| Source                                                         | Responsibility                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/App.tsx`                                         | Route splitting, personal bootstrap independence, obsolete workspace-result fence and fresh workspace return |
| `apps/web/src/personal-area.tsx`                               | Immediate personal shell and invitation handoff                                                              |
| `apps/web/src/personal-space.tsx`                              | Personal session lifecycle, identity remount, focus recovery and explicit logout                             |
| `apps/web/src/personal-documents.tsx`, `personal-api.ts`       | Account-bound document reads, list retry, aborted-read refusal and unchanged credential/privacy behavior     |
| `apps/web/src/main.tsx`, `public-site-metadata.ts`             | Public detail preloading while initial HTML remains useful                                                   |
| `apps/web/src/theme-media.ts`, `editorial/article-picture.tsx` | Native theme/size source selection and responsive public editorial exports                                   |
| `tests/e2e/personal-document-performance.spec.ts`              | Bounded loading and account-transition regressions                                                           |

## Document email and recipient controls — 26 October 2026

The new fragment preference page is lazy loaded and bypasses workshop/personal
bootstrap. Loading the link makes **zero business API calls**; confirmation makes
one POST. It reuses public chrome. Account email preparation retains the four
existing reads (`session`, `capabilities`, `documents`, `senders`), without loading
the PDF viewer before review. The email itself uses table markup, system font
fallbacks and no remote image, stylesheet, font or script request.

Local Vite production assets served by Wrangler on localhost, intercepted
synthetic APIs, FR locale, fresh Playwright contexts, no network/CPU throttling;
other offline validation was running concurrently. Measurements below are one
preparation sample and two recipient-control samples per browser, not a baseline
comparison or production latency claim. Resource bytes are browser-reported
`transferSize` including headers; resource completion can vary at measurement.

| Surface / browser | Requests | Total transferred bytes | JavaScript bytes | FCP (ms) | First useful control/heading observed (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Preparation / desktop Chromium | 55 | 709,765 | 519,052 | 172 | 507 |
| Preparation / mobile Chromium | 55 | 709,765 | 519,052 | 352 | 772 |
| Preparation / iPhone WebKit emulation | 56 | 729,117 | 520,851 | 332 | 890 |
| Recipient controls / desktop Chromium | 39–40 | 849,419–922,059 | 478,491 | 164–176 | 475–500 |
| Recipient controls / mobile Chromium | 40 | 922,055–922,059 | 478,491 | 248–588 | 575–1,113 |
| Recipient controls / iPhone WebKit emulation | 41 | 942,434–942,486 | 480,026–480,060 | 312–1,146 | 663–1,061 |

The useful-content marker follows an awaited visible field/heading; it is test
instrumentation rather than a standardized paint metric. Preference-page totals
include the explicit confirmation and shared footer assets. These observations
qualify neither a physical phone, inbox client nor hosted CPU, memory or billing.
No worker, cron, polling or provider operation was added for preferences; a token
hash/mapping joins preparation, and explicit feedback uses one database batch.
Cloud CPU and billed cost remain unmeasured; existing tariff sources are unchanged.

Evidence outside Git:
`/Users/nclsppr/Documents/Codex/Reports/guteneo-account-email-2026-10-26/browser-performance-final.json`
and `performance-browser-9.json`. Sources: `email-preferences.spec.ts` and
`protected-email.spec.ts`; final behavior is defined in
[recipient feedback](EMAIL_RECIPIENT_FEEDBACK.md).

## Email reconciliation with main — 26 October 2026

Candidate 1.1.4 incorporates main `f94664f`. The composer now inserts its recipient
button using the shared final-email renderer and notification locale. Resolving a
selected source through the existing candidate map keeps directly loaded/uploaded
titles without an added request or an eager PDF-viewer import. No loading route,
account authorization, recovery, polling or infrastructure configuration changes.

The final focused run passes 18/18 scenarios: both composers with English UI and
no saved account language (French notification fallback), initial selection outside
page one, preserved custom HTML/text, and title quotation after inline upload.
Fresh contexts use prebuilt Vite production assets on local Wrangler, intercepted
synthetic APIs, no CPU/network throttling and browser-reported transfer sizes.
The sample below is taken from one normal-email scenario per browser after the
generated button is visible; the first-composer marker is an awaited field check.
Other offline checks may run concurrently. It is not a before/after comparison.

| Browser | Resources | Total transferred bytes | JavaScript bytes | FCP (ms) | First composer observed (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop Chromium | 54 | 711,754 | 521,041 | 172 | 528.8000000119209 |
| Pixel 7 Chromium emulation | 54 | 711,754 | 521,041 | 132 | 468.59999999403954 |
| iPhone 13 WebKit emulation | 55 | 731,094 | 522,822 | 187 | 566 |

No physical phone, inbox, hosted latency, CPU/memory or billed-cost qualification
is inferred. The shared renderer retains system-font/inline-style email rendering
without remote resources. Type/lint, source contracts and browser behavior are
separate from the full CI and any authorized production release.

Evidence: `/Users/nclsppr/Documents/Codex/Reports/guteneo-email-refresh-2026-10-26/`
contains the final browser report, extracted metrics, three screenshots and
package-integrity verification. Source: `tests/e2e/protected-email.spec.ts`.

## Recursive capability diagnostics — 26 October 2026

The added account-email content limits exposed a recursive diagnostic grid that
could collapse leaf values to zero width. The nested selector now stacks each
key above its value, while the outer list retains its key/value columns. The
original responsive test passes on all three engines; its twelve administration
contexts (Classic/V2 × native/320 px) have document width equal to viewport.
The Chromium reproduction before the fix measured 1,307 px at a 1,280 px viewport;
CI on `e805b10` measured 1,316 px. No content was hidden to pass the check.

One additional Chromium run measured warm hash navigation to `/admin` in the
existing all-routes sequence. Vite production assets run on local Wrangler with
synthetic local account/data, no throttling. Resource deltas below belong to
that navigation. The heading marker follows its visible-heading assertion; it is
not a standardized paint metric. Document FCP is cumulative document evidence,
not a paint measurement for the hash route. No before/after speed gain is claimed.

| Appearance / width | Route resources | Route transferred bytes | Route JavaScript bytes | Heading observed after navigation (ms) | Document FCP (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Classic / 1280 | 5 | 8,421 | 3,669 | 815.6 | 88 |
| V2 / 1280 | 5 | 5,052 | 300 | 813.6 | 60 |
| Classic / 320 | 5 | 5,052 | 300 | 814.2 | 68 |
| V2 / 320 | 5 | 5,052 | 300 | 811.0 | 68 |

The CSS adds no API read, authority or polling path. CPU, memory, production
latency and billed cost were not measured. Raw reports, geometry samples and
screenshots are retained alongside the email evidence in
`/Users/nclsppr/Documents/Codex/Reports/guteneo-email-refresh-2026-10-26/`, with
`diagnostics-fixed-performance.json` and `diagnostics-route-performance.json`.

## Single-action secure sending — 27 October 2026 local candidate

The built local browser with intercepted API measured first useful content at
220ms on desktop and 183ms on mobile. Both observations transferred 677,302 bytes
across 43 resources. These are synthetic local timings, without a measured prior
latency baseline or production claim. The final action uses one detail GET,
then two dependent mutations (approval, activation), with no intermediate detail
read. It replaces three successive final controls with one priced Send button;
review and recipient attestations remain explicit. Failure recovery adds only an
explicit read before any same-key mutation. All four locales reuse existing
labels and the brand/layout remains unchanged. Desktop/mobile screenshots and
24 Playwright cases were inspected; actual local verified-account lifecycles
separately qualify both viewports with a 30-minute-old active session.

## Policy-aware authentication recovery — 27 October 2026 candidate

Recovery changes the existing hosted-login URL only. It adds no dependency,
initial API request, polling, automatic navigation or write replay. A user gesture
still starts the existing OAuth redirect/callback path; verified-account recovery
can reuse eligible SSO instead of unconditionally requesting a new ceremony.
Primary authentication may still be required by Auth0. Local link tests cover all
four locales, safe return paths and strong-policy fallback. The live Safari
observation reached Auth0 with a legacy cookie missing signed authentication time;
no callback timing or first-content improvement is claimed from that incomplete
journey. Build byte comparisons and executed checks are recorded in
[the test evidence](TEST_RESULTS.md).

On macOS with Node 24.18.0, comparing the existing 1.1.15 live-build files with
the freshly built 1.1.16 local application gives 51 JavaScript assets in each.
The three core chunks below add 96 raw bytes, or 38 bytes using the same local
`gzipSync` defaults. This is a file-size comparison, not measured HTTP transfer,
first-content timing, production compression or an Auth0 latency improvement.

| Core chunk | 1.1.15 bytes / local gzip | 1.1.16 bytes / local gzip |
| --- | ---: | ---: |
| Application entry | 475,450 / 136,948 | 475,470 / 136,962 |
| Shared components | 29,730 / 9,726 | 29,792 / 9,741 |
| Authentication navigation | 663 / 412 | 677 / 421 |
