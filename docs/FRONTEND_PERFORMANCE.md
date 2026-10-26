# Frontend loading and personal bootstrap

25 October 2026 local candidate. This contract owns route-loading behavior and
its bounded local measurements. It establishes no production latency, server CPU,
provider readiness, price, deployment or physical-device qualification.

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
