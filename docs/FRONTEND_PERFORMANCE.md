# Frontend loading and personal bootstrap

## Independent application code — 29 October 2026 local candidate

The host loads My documents with `import()` just like the other applications.
`PersonalEntry` starts its one personal-session read alongside the code request;
`PersonalSpace` consumes that visit-scoped result and retains its normal focus
revalidation, cancellation and identity fences. Leaving aborts the entry read.
Neither authority nor the result is cached across visits or account identities.
Personal navigation keeps the same shell/session; document reads still wait for
personal authority. Opening the shared account menu adds no request.

The direct-preparation preference helper now loads with Correspondence. Studio
styles load with Studio; its reused entry-link rule belongs to shared styles.
Locale changes emit a shared event that the public sharing adapter observes,
removing the shared locale module's dependency on public-site code. The four
import exceptions in `applications.json` are removed rather than expanded.

The [final loading record](evidence/studio-space-loading-2026-10-29.json)
compares `1e013dbc` with the resolved-module candidate `08df95d5`. Eighteen fresh
Chromium contexts (three per route/variant, interleaved) use local uncompressed
static HTTP, a 1440 × 900 viewport and read-only synthetic APIs delayed by 40 ms.
The complete backend suite runs concurrently; no CPU isolation is claimed.

| Route | First useful median | JS requests | API reads | JS body-byte delta | CSS body-byte delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| my-documents | 173 → 173 ms | 19 → 25 | 2 → 2 | +44,529 | -8,948 |
| correspondence | 173 → 176 ms | 28 → 30 | 6 → 6 | +6,358 | -8,948 |
| studio | 139 → 136 ms | 22 → 23 | 3 → 3 | +12,610 | -1,843 |

First useful means an available document title, correspondence row or visible
built-in template title followed by a rendering opportunity; the below-fold
private Studio row has its separate DOM-readiness field. The figures are
DOM/rAF observations, not physical first-paint or server/provider latency.
No viewer, PDF worker, designer or globe implementation is requested by these
three entry scenarios; writes, unexpected APIs, external requests and errors are
zero. Independent application chunks add requests and some code; this is not a
general loading reduction. The exact terminology table alone is 42,330 source
bytes / 11,854 gzip bytes when minified and compressed separately, not its
incremental bundled network cost.

The initial `1ceb29ff` experiment exposed a consistent personal delay around
300 ms despite code/session readiness. Rendering the resolved imported component
directly removes the first `React.lazy` retry; the final median is 173 ms, matching
the 173 ms baseline within the observed ranges. Identity prefetch remains
visit-scoped, visibility-invalidated and independent of workspace bootstrap.
A failed code request uses the shared explicit reload boundary. Final exact-source
functional acceptance belongs to [the reprise record](STUDIO_SPACE_REPRISE.md).

## Space switcher and Studio routes — 29 October 2026 candidate

The space switcher adds no request when a page loads. A local check of `/app`
read the same six API resources as before (session, capabilities, contacts,
connections, overview, dispatches); the first switcher opening read
`/api/account/workspaces` once and a second opening read nothing. Earlier Studio
links are rewritten in the browser with `history.replaceState`, without a
request, and Studio route code keeps its own lazy chunk.

Production builds of the candidate and of its base (`claude/retire-classic`,
same locked dependencies) compare as follows: main JavaScript 651,468 → 654,726
bytes raw, 186,445 → 187,301 gzip (+856); main CSS 163,304 → 165,787 raw,
30,431 → 30,875 gzip (+444); Studio chunk 35,231 → 35,248 gzip. Environment:
macOS arm64, Node 24, local Vite build and a local Wrangler simulation server in
Chromium. These are single local observations, not a latency or production
measurement.

## Anonymous production observation — 28 October 2026

The published `a93e7334f603b818a689385f73c33757cdfeea38` release was compared
with application `f3ba8d0` and status `03daa413` using the same frozen probe,
Chromium 153.0.8010.12, Node 24.18.0 and macOS arm64. Twelve fresh anonymous
contexts cover three samples per desktop/Pixel 7 profile and public/status
surface, with French, light appearance, reduced motion and no CPU/network
throttling. Normal HTTP cache remains enabled within each public journey. Only
GET requests occurred; no authentication, refresh, collection or business write
was initiated. The [dated measurement](evidence/frontend-loading-2026-10-28.json)
records environment, source identities, probe digest, samples and resource counts.

| First useful destination, median | Before | Published |
| --- | ---: | ---: |
| Desktop → Pricing | 424 ms | 24 ms |
| Desktop → Support | 412 ms | 23 ms |
| Pixel 7 emulation → Pricing | 560 ms | 28 ms |
| Pixel 7 emulation → Support | 95 ms | 23 ms |

Each enhanced transition requests zero new HTML documents and zero scripts;
the baseline starts one document and requests 24–26 scripts, including browser
cache reuse. Initial JavaScript network bytes increase by about one percent.
Status goes from five to two scripts, about 14.8 to 10.2 KB reported JavaScript
network bytes and 33,182 to 24,672 decoded body bytes. Status useful-content
medians are 453 → 353 ms on desktop and 380 → 365 ms on mobile; the mobile ranges
overlap, so this is no general latency promise. These three-sample observations
are separate from private-account, physical-device, Worker CPU and billing proof.

All fourteen production browser journeys passed. The same report exposed seven
false HTTP language failures because the collector required an exact opening tag
without the new presentation attributes. The shared parser correction follows
the [status observation contract](STATUS_SERVICE.md#observation-scope-state-and-read-cadence)
and requires its own publication; these measurements do not waive that failure.

## Navigation without restarting the page — 28 October 2026 candidate

Public page links previously started a new HTML document and React application
on every click, even when the browser already held the requested code. The
client now enhances ordinary links between exact registered public routes on
the same origin. All public page components belong to the initial application
graph, so an interactive click changes the URL through browser history and
renders the destination without another HTML or route-code request. This avoids
a first-tap code waterfall as well as repeated application startup. Navigation
does not prefetch HTML, private data, a session or a provider.

The route registry still owns the canonical English paths and static HTML.
Direct entry, reload, disabled or unavailable JavaScript retain
ordinary document navigation. Downloads, external origins, new-tab/modifier
clicks, private application hashes and authentication/recovery query values
keep their existing browser behavior. Supported visitor language remains in the
URL and synchronous catalog. History, section anchors, keyboard focus, page
metadata and route-specific effects must follow the visible destination. No
authorization or customer document is stored in public navigation history.

The 29 October route-focus candidate keeps public and workshop page changes
focused on the new `main` with
`tabindex="-1"`. Safari can mark this script focus as `:focus-visible` after a
pointer click, drawing a ring around the whole page. The early
`installInputModality` listener records pointer and non-modifier keyboard input
in `document.documentElement.dataset.input`; modifier keys alone leave the
previous modality unchanged.

Pointer navigation suppresses the outline of script-focused containers.
Keyboard navigation underlines the focused main's page title in the brand blue
instead of framing the page. Other keyboard-focused containers and interactive
controls retain their existing focus indicators. This changes presentation only;
route focus, scroll, authorization and navigation behavior remain unchanged.

Regression sources are `tests/unit/input-modality.test.ts` and the pointer and
keyboard route-focus case in `tests/preview-e2e/public-navigation.spec.ts`.
Playwright Chromium and WebKit evidence remains separate from physical Safari
and assistive-technology qualification; no production publication is claimed.

Personal navigation had a different repeated-work defect: `PersonalArea`
replaced its authenticated shell with a loading fallback whenever its route
changed. Returning the shell immediately afterwards remounted `PersonalSpace`
and repeated `GET /api/personal/session` before the requested page could load.
The shell now remains mounted while a layout effect captures and removes any
new invitation. Children receive only the captured route, so secret removal
still precedes route rendering. Initial entry and focus/visibility revalidation
retain the authenticated personal-session read. Account identity changes still
remount user-bound state; every personal data endpoint checks current authority.
This changes neither human roles nor REST/MCP/native permissions, activation
gates, approval or sending behavior.

Regression sources are `tests/preview-e2e/public-navigation.spec.ts` and
`tests/e2e/personal-document-performance.spec.ts`. The public suite passes 33
cases across desktop Chromium, Pixel 7 Chromium and iPhone 13 WebKit emulation,
covering all 22 registered pages in four languages, metadata/schema parity,
keyboard focus, menus, history positions, Automatic language and native links
before unavailable/delayed entry JavaScript. A first-click regression blocks new
HTML and script requests after home becomes interactive; public navigation still
works without either request type. Existing public capability reads and newly
visible images are independent resources, not proof of a failed navigation.
The existing locale, initial-layout, static metadata/sitemap and JavaScript-free
browser regressions pass 40 cases on desktop Chromium and iPhone WebKit; four
preview-only fixture cases are intentionally skipped on the production build.
The focused unit suite passes 258 tests, and the three static-asset/release
security checks pass. Typecheck, lint, documentation checks and the engineering
build also pass. These local checks alone establish neither merged-source CI nor
publication; the separate production observation above records the later release.

The unthrottled comparison uses production Vite/static HTML on local Wrangler
with actual public-asset middleware, reduced motion, English and five fresh
contexts per browser. Each context opens home, then activates pricing, support
and home links. The first-useful marker samples the expected visible main
heading in `requestAnimationFrame`; the next-frame marker is one frame later.
These are probe measurements, not standardized paint metrics or physical devices.
Ranges below are the three route medians, each from five samples.

| Browser profile | Before: useful heading (ms) | Candidate: useful heading (ms) | Candidate: next frame (ms) |
| --- | ---: | ---: | ---: |
| Desktop Chromium | 46.4–49.7 | 9.6–15.8 | 22.4–28.3 |
| Pixel 7 Chromium emulation | 47.3–48.0 | 10.1–15.8 | 19.3–29.1 |
| iPhone 13 WebKit emulation | 50–53 | 12–16 | 24–27 |

All 45 candidate transitions retain their document and issue no new HTML or
script request. All 45 baseline transitions create a new document, producing
40–44 browser request events per click; those include cache hits and must not
be counted as billed or transferred network requests. The first pricing entry
previously loaded 21,626 decoded script bytes; the candidate loads none during
navigation. Desktop pricing still performs its public capability read (370
reported transferred resource bytes); mobile pricing can also fetch the newly
visible footer stamp. Support and home report zero completed new resources in
these samples. Resource accounting ends when the destination header is
interactive, separately from the useful-heading marker, and excludes the
navigation document itself.

A second comparison isolates the navigation mechanism on the same final build:
the native-link opt-out versus enhanced links, with five fresh contexts per
Chromium profile, CDP latency 150 ms, download 200,000 B/s, upload 93,750 B/s
and 4× CPU slowdown. It uses the same link activation and animation-frame
markers, without other browser suites running concurrently.

| Profile | Pricing: native → enhanced (ms) | Support: native → enhanced (ms) | Home: native → enhanced (ms) |
| --- | ---: | ---: | ---: |
| Desktop Chromium | 528.3 → 65.1 | 506.2 → 32.2 | 522.5 → 27.9 |
| Pixel 7 Chromium emulation | 521.9 → 66.2 | 517.6 → 32.9 | 530.7 → 30.7 |

All 30 enhanced controlled transitions issue no document or script request;
all 30 native transitions issue one document and 30–31 browser request events.
Pricing retains its public capability read, which can still be in flight at
the resource-accounting boundary. Zero completed resource bytes at that boundary
therefore do not prove zero network traffic. These are local simulated-network
and CPU observations, not deployed or physical-phone measurements.

Including the small public detail UI in the repaired navigation candidate's
initial graph increases it by 18,099 decoded bytes and 2,649 independently
computed gzip bytes. The graph changes from 24 to 19 linked JavaScript entries;
its final total is 1,539,314 decoded bytes / 483,734 computed gzip bytes. This
isolated eager-versus-lazy build comparison includes the final locale/history
guards and is not the original-branch or HTTP-wire comparison. It makes no
cold-entry JavaScript reduction claim. Server CPU, memory and billed savings
were not measured; no provider/configuration or activation change is introduced.

Raw browser reports, the reproducible probe and the initial-graph inventories
remain in `/Users/nclsppr/.codex/artifacts/guteneo-navigation-2026-10-28/`.
Local fixtures establish neither deployed latency nor a real account journey.

The personal-shell comparison uses Vite production assets on local Wrangler,
desktop Chromium, synthetic read-only APIs and a fixed 600 ms delay only on
`/api/personal/session`, without CPU throttling. Services changed from 857 to
80 ms, Account from 810 to 46 ms and Documents from 807 to 65 ms, measured until
the useful destination was observed by the probe. Each transition removes one
redundant session read: completed API resource counts are 1/2/2 before and 0/1/1
after. The required account/document reads remain, with no route JavaScript
added. The focused browser suite passes 63 cases across desktop Chromium,
Pixel 7 Chromium and iPhone 13 WebKit emulation. These synthetic session-delay
figures do not describe public page navigation or deployed account latency.

## Stable public rendering — 27 October 2026 candidate

Public HTML is no longer a temporary French page awaiting a session-language
response. The Worker selects one existing immutable document from the explicit
URL, bounded presentation hint or browser negotiation before returning it.
The client uses bundled synchronous catalogs and makes no `/api/session` read
on a public route. Independent public capability reads remain available where
the page needs them. Authenticated workshop and personal routes still resolve
their own sessions before showing useful private content. The
[multilingual contract](MULTILINGUAL.md#selection-and-retention) owns precedence,
cookie limits, visitor/account separation and the small legacy-storage head
migration; it adds no account lookup, timer or polling to public rendering.

The 27 October candidate kept public detail JavaScript lazy; the 28 October
navigation correction above includes it in the initial graph to remove the
first-tap waterfall. Slow or failed initial JavaScript retains complete static
content. Required layout styles belong to the entry CSS graph. The build
inspection found that public detail/header styles were already in the initial
stylesheet links through the eager support component; moving their import to the
entry makes that dependency explicit. The guided example's `landing-example.css`
was actually deferred with its route chunk and is now in the initial graph.
This removes the late CSS request and its unstyled example layout on
`/how-it-works/`. The change does not replace the existing React mounting API.

The comparison below used `npm run build:web` in the isolated current-main
worktree on macOS, with the same installed dependencies, before and after those
CSS import changes. It sums the CSS files linked by generated `dist/web/index.html`;
gzip sizes use Node's `gzipSync` independently per file. It is a build-graph
comparison, not observed browser transfer, FCP, CLS or production latency.

| Initial stylesheet graph | Before | Candidate |
| --- | ---: | ---: |
| Linked stylesheet requests | 5 | 5 |
| Total stylesheet bytes | 159,270 | 166,218 |
| Sum of gzip stylesheet bytes | 31,798 | 32,890 |
| Guided example styled before route JavaScript | No | Yes |

The entry graph adds 1,092 compressed bytes while avoiding one later stylesheet
request. No general speed percentage, final-source first-paint timing, hosted
CPU/memory, billed-cost or physical-device claim follows from that measurement.
Browser regressions must hold route JavaScript and authentication responses,
compare the initial heading and example geometry with the interactive result,
exercise four languages and verify that an explicit public language cannot be
replaced by a conflicting account preference. Final check results remain separate
from this implementation contract and from authorized publication.

## Cold webfonts — 27 October 2026 candidate

The shared `apps/web/src/fonts.css` retains the packaged IBM Plex Sans, IBM Plex
Mono and EB Garamond faces with `font-display: optional`. A font available during
the browser's brief initial period uses the approved typography. If it arrives
later, visible text keeps its fallback for that document instead of rewrapping.
A later cached navigation can use the packaged face immediately. This preserves
stable readable content without hiding the page behind a font-loading gate.

Public titles share `overflow-wrap: anywhere` under `.public-site h1`, so long
translated words also fit when an unavailable font leaves a wider system face.
The narrow-viewport regression blocks WOFF2 and checks journal/legal headings in
all four languages at 320 px. This preserves the text and private typography;
it neither hides overflow nor waits for a font before showing useful content.
The narrow public header reserves its three 44 px actions and scales only the
wordmark at the smallest widths. The portrait and action targets remain intact;
fallback tests check their rectangles as well as document overflow.

The Vite HTML hook preloads IBM Plex Sans 400 and EB Garamond 400/500 WOFF2 files,
totaling 71,672 bytes. It derives each hashed URL from the emitted asset metadata
and supplies the matching anonymous font request attributes. Those faces were
already requested by the measured home/pricing pages; preloading starts the
existing requests earlier rather than introducing another font family. Other
weights and italic/code faces remain CSS-driven. WOFF2 is supported by the
application's Chromium/WebKit browser targets. The build retains the original
font bytes and their package provenance.

The baseline isolated font loading after the language/CSS correction: fresh
French Chromium contexts at 1440 × 1000 and 390 × 844, reduced motion, local
Wrangler assets, no CPU/network throttling, and all font requests explicitly held.
The public header was interactive and above-fold images complete before measuring
fallback text; then only the held font requests were released. Six requested files
totaled 135,952 decoded bytes. Their original `swap` declarations produced these
observations:

| Surface / viewport | Baseline pricing heading height change | Baseline pricing paragraph top change | Baseline layout-shift sum after font release | Candidate sum |
| --- | ---: | ---: | ---: | ---: |
| Home / desktop | Not applicable | Not applicable | 0.01413 | 0 |
| Pricing / desktop | 103.031 → 51.516 px | −51.516 px | 0.00860 | 0 |
| Home / mobile | Not applicable | Not applicable | 0.00985 | 0 |
| Pricing / mobile | 71.656 → 35.828 px | −35.828 px | 0.03574 | 0 |

Pricing's first section heading changed from two lines to one. The homepage's
main heading height stayed fixed, but its desktop intro grew 44.203 px wider and
the full document height changed by +31 px desktop and −107 px mobile. These are
controlled font-release observations, not field Core Web Vitals or a physical
phone result. The entry-CSS comparison in the preceding section predates this
font-source change and must not be presented as the final combined asset total.

Repeating the same held-font diagnostic against the combined candidate produced
zero change in every sampled title, body, button and footer rectangle, and zero
layout-shift entries after font release, at both widths on both pages. The same
six font files totaled 135,952 decoded bytes. Separate ordinary local pricing
navigation with no request interception retained the branded heading's single
line on both a fresh context and a cached reload: 51.516 px desktop and 35.828 px
mobile. Those local observations do not guarantee font arrival on a slow network;
that case intentionally keeps its stable fallback for the document.

`tests/preview-e2e/font-render-stability.spec.ts` passes 4/4 cases across desktop
Chromium and iPhone WebKit emulation on the final combined Vite/static-HTML build,
served by the local production-wrapper Worker with intercepted synthetic APIs.
It holds fonts beyond the optional period, then releases them, waits for network
completion and compares every main heading/paragraph rectangle and literal text.
It also checks the three emitted font preloads. WebKit may mark optional faces
unavailable before their network request completes; the regression verifies that
no custom face was loaded during the held period instead of assuming a shared
FontFaceSet status across engines.

The diagnostic script, raw measurements and before/after screenshots remain in
`/tmp/guteneo-font-swap-2026-10-27/`, including the `candidate/` measurements and
`font-tests-final.json`. No hosted, physical-device, CPU, memory or cost
qualification is inferred.

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

The 28 October workshop follow-up starts only the requested screen's static
module alongside the initial `/api/session` read. `workspace-route-loader.ts`
shares that import with the actual route component. The screen and its private
reads still mount only after session verification; module bytes contain no
account data or additional authority. PDF workers and template-design engines
remain deferred. No hover/focus import or private-data prefetch is introduced:
browsers can retain a failed speculative module for the document, so that path
was rejected during qualification.

Accepted hash-route changes use a React transition. The current page remains
available while the requested module loads, instead of entering a short loading
fallback and waiting for React's reveal window. Existing unsaved-work vetoes run
before accepting the transition. While it is pending, native `inert` and
`aria-busy` fence the retained main content; the sidebar remains available. A
previously clean editor cannot receive new edits after its departure check and
silently discard them on commit. Scroll and focus follow the committed page;
the existing user/workspace key and resource-path fences still discard old
identity or resource state. `workspace-route-boundary.tsx` keeps the identity
and navigation visible after a route-code failure and offers a fixed localized
explicit reload. It exposes no raw exception and automatically replays no read
or business write. A reload is a new document attempt, not a guarantee that a
browser has discarded every failed network-cache entry.

Account deep-link selection uses the committed route passed by the application,
not the browser hash during an urgent pending render. The retained account view
keeps its current connection selection until commit; unavailable-connection
notices receive focus only after the inert fence clears. The unchanged expert
onboarding tests cover valid, foreign and malformed connection links without
granting or mutating authority.

The application owns the only workspace hash subscription, transition and
departure veto. Child `useRoute` readers share that committed route through
context. Generic focus runs during commit, before specific page effects, so no
later animation frame steals a fresh keyboard interaction. Closing a document
restores its connected list trigger after selection clears; unmounted pages
cannot restore an old trigger, and focused alerts retain priority.

Bootstrap readiness is bound to the public/workshop context. A public document's
ready state cannot briefly mount private sign-in before its session read starts,
then mount it again after a refusal. A public-to-workshop hash entry performs its
normal authority checks before one hosted sign-in handoff. This changes neither
Auth0 configuration nor the bounded personal-session fallback.

Local production-asset measurements used fresh desktop Chromium contexts,
synthetic read-only APIs and no real account/provider operation. With 600 ms
added separately to the session and account-module requests, direct Account
entry changed from 1,456.9 to 942.6 ms because the requests overlap; all 45
resources and six API reads remain. Final JavaScript totals are 499,560 reported
transferred bytes versus 498,796 (+764), and 1,570,716 decoded bytes versus
1,569,179 (+1,537). That controlled delay does not describe deployed latency.
In a separate unthrottled cold Account hash-navigation probe, the first useful
heading was sampled on an animation frame: three samples changed from
319.6/327.3/327.5 ms to 23.5/23.6/34.9 ms, a median of 327.3 → 23.6 ms. The
final route loads two JS/CSS resources: 28,317 decoded and 8,623 transferred
bytes. This
isolates the route reveal behavior; it is not a standardized paint or physical
device metric. Raw reports remain beside the public-navigation evidence in
`/Users/nclsppr/.codex/artifacts/guteneo-navigation-2026-10-28/app/`; the final
context/focus probes are `router-paint-final.json` and
`router-bootstrap-final.json` in the adjacent `guteneo-perf-release-2026-10-28/`.

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

Public page components belong to the initial application graph so the first
interactive link needs no route-code request. Complete, correctly styled initial
HTML remains useful before the entry JavaScript is available. Same-origin public
navigation reuses that application; private task engines remain deferred. The
stable-language contract above is separate from private
authenticated loading. The public-route contract is in
[homepage and navigation](HOMEPAGE_REDESIGN.md).

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
| `apps/web/src/main.tsx`, `public-navigation.ts`, `public-page-metadata.ts` | Eager public page graph, same-document navigation and metadata shared with static generation                 |
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

## Explicit module-preload recovery

The tested iPhone WebKit runtime retains a failed module-preload resource after
an ordinary page reload. A minimal HTML/Node HTTP reproduction outside React
and outside request interception confirms this for a non-cacheable HTTP 503;
physical Safari remains separately unqualified. The explicit reload action first
refreshes failed or zero-size/unknown-status same-origin `/assets/*.js|css`
resources, consuming each successful response before navigation.

The recovery allowlist rejects private paths, queries, fragments, credentials,
foreign origins and non-code files. It sends no cookies or referrer, requests at
most eight assets, reads at most eight MiB per response and stops after five
seconds. It runs only after the person's reload gesture and never retries an
API, provider operation or authorization action. Navigating elsewhere cancels
the pending page reload. Fourteen unit cases cover its privacy/bounds; twelve
entry/recovery browser cases pass on Chromium, mobile Chromium and iPhone WebKit.
