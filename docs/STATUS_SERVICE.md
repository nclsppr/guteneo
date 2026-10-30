# Guteneo service status

`https://status.guteneo.com/` is the customer-facing public availability page.
Its independent Worker and European D1 have no business bindings, credentials,
documents, accounts or provider access. Both Guteneo and status still depend on
Cloudflare. Anonymous reading grants no workshop or platform authority.

## Customer interface — 25 October 2026 release

The release replaces the Service/Verification/Operations report interface with
one availability surface: a recent public-access summary, its observation time,
three service groups and actual availability history. Public website, service
response and access protection describe the fourteen anonymous checks below;
these labels do not qualify sign-in, document processing or delivery.

Technical probe details, provider/engine configuration, local qualification,
GitHub executions and business-journey coverage no longer appear in the customer
page. Their removal changes presentation and reads, not activation or evidence.
Protected platform oversight remains a separate Belvédère capability; this page
creates no operations console or repair action. Seasonal effects and their
presentation assets are removed.

### Entry, actor and journey

| Item                | Contract                                                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry               | Open the public status URL or the main site's common footer; no sign-in is required                                                                                                           |
| Actor and authority | An anonymous visitor, customer, any of the four human membership roles or an assistant reading public information receives the same public facts and no additional authority                  |
| Steps               | Read the current summary and last observation, inspect the three groups, choose 7/30/365 days, select a day/month or expand daily history, then use Refresh or a canonical footer destination |
| Result              | A bounded observation of public access and recorded history; document delivery stays in the authenticated workspace                                                                           |
| Recovery            | Unavailable, missing, stale or inconsistent observations make current availability unknown; refresh reads the existing records and creates no probe or business operation                     |
| Surfaces            | Browser UI and the existing status REST reads; no new native or MCP command, account preference, mutation or sending authority                                                                |

### Language and formatting

English is the source language. `apps/status/public/locales/messages.js` provides
French, German and Luxembourgish values for static text, dynamic states, metadata
and accessible names. `apps/status/public/i18n.js` applies the same public locale
priority as the main site:

1. Exactly one normalized, supported `lang` parameter selects French (`fr`),
   English (`en`), German (`de`) or Luxembourgish (`lb`), including regional tags
   such as `de-AT`. Duplicate, malformed or unsupported explicit parameters select
   no locale and do not bypass the remaining priority.
2. A valid `guteneo.locale` choice saved on the **status origin** comes next.
3. Otherwise select the first supported `navigator.languages` entry, or French
   when none is supported. Storage refusal never prevents the page from working.

Explicit selection saves that origin's choice and updates `lang` while retaining
other parameters and the fragment. Automatic selection removes both this saved
choice and `lang`, then returns to the browser preference. Switching language
updates in place without new status/history reads, preserving the selected period,
selected day/month, daily disclosure and language-control focus.

Status cannot read the main site's storage or authenticated personal preference.
Main-site and status footer links retain the resolved language through `lang`;
canonical English paths never change. `mailto:` destinations remain unchanged.
Current observation times use Europe/Paris with a visible time-zone label; daily
history dates use UTC. Dates, numbers and percentages follow the selected locale.
If ICU lacks Luxembourgish support, text remains Luxembourgish while date/number
formatting uses `de-LU`.

### Appearance and access

`apps/status/public/theme.js` applies `guteneo.theme = system | light | dark`
before the stylesheet is read. The default is system appearance. The resolved
value is in `document.documentElement.dataset.theme`; the preference is in
`dataset.themePreference`. System changes update system mode, the standard
`storage` event synchronizes same-origin tabs, and `guteneo-theme-change` carries
`{ preference, resolved }` within the page. Storage refusal leaves in-page choice
working. The browser theme color remains royal blue `#2450db` in either mode.
With JavaScript disabled, a CSS-only system fallback supplies the page palette;
it does not invent an observation or a saved explicit choice.

Status reads no preference cookie and writes none. The main site's separate
`guteneo_theme` presentation cookie supports its standalone server-rendered HTML:
it is host-only, contains only the same enum, uses `Path=/`, one-year `Max-Age`,
`SameSite=Lax` and `Secure` on HTTPS. It conveys no account/session authority and
is not shared with the status subdomain. Status's same-named local-storage key
likewise remains scoped to its own origin.

History has labeled native buttons with one tab stop, arrow/Home/End navigation
and a persistent selected-period explanation. The daily table is an independently
focusable scroll region. Phone controls meet the checked touch bounds; focus,
contrast, reduced motion and forced colors retain state distinctions without
relying only on color. JavaScript is required to display observations; its
absence never becomes a successful measurement.

### Shared public footer and generated assets

`packages/contracts/src/public-footer.json` owns the four navigation groups and
sixteen canonical destinations, including labels in all four languages. React
and status consume that same source. Status adds no React runtime and keeps no
second checked-in footer catalog.
Resources includes Engineering documentation after Developers. Its localized
label always opens `https://engineering.guteneo.com/` without a language
parameter because the separate engineering site is English-authored. The shared
catalog change is a local candidate until each consuming site is released.
The founding stamp and postmark provide the footer signature; the current stamp
is an exact copy of the approved transparent-outer-edge web derivative, retaining
its printed white interior. The opaque official source remains unchanged.
Dark lettering follows the approved ivory brand role. The header preserves white
paper inside the portrait's actual inner blue frame, with transparent exterior
and perforations rather than an outer white contour. The status surface includes no Luxembourg panorama
or other city decoration.

`scripts/build-status.mjs` validates the four-language labels and writes the
small generated `footer.js` only into the build output. The loopback-only
`scripts/tests/status-preview.mjs` serves the same generated script from that
catalog for presentation tests, without importing the Worker or collecting data.
The shared JSON belongs to `statusScope`: changing it changes the source
fingerprint, while generated footer bytes belong to the asset manifest. A missing
or incomplete required catalog fails the build. Existing qualification-source,
clean-main, migration and served-asset checks remain in force.

The browser icon family is generated from the exact five approved product
files listed in `packages/contracts/src/brand-icons.json`, using
`scripts/brand-icons.mjs` after copying the status public directory.
The status head declares the same SVG, ICO, PNG and Apple touch choices as the
main site. The shared contract, helper and five product source paths belong to
`statusScope`; changing an icon invalidates the status source fingerprint and
the resulting output is covered by its asset manifest. Keep icon identity
separate from the status stamp and header portrait. These are local source/build
contracts; a status publication and served-byte verification remain separate.

## Observation scope, state and read cadence

The collector still performs fourteen fixed anonymous reads every fifteen
minutes: public pages, release/health/configuration contracts and expected
unauthenticated access refusals. It creates no quote, approval, reservation,
outbox entry, account, purchase, communication, hosted scan or paid rendering.
Only the latest fresh, valid and internally consistent complete result can show
public access as available. A fresh failed check identifies an observed issue in
its group; it does not invent a provider outage.

Public HTML language is read from the actual opening `html` element by
`packages/contracts/src/public-html-language.ts`, shared with the Node monitor.
Additional presentation attributes and attribute order do not change language.
Missing, duplicate, malformed or incorrect language still fails the check. This
semantic check follows the existing exact received-byte and SHA verification;
it relaxes no content, header, freshness or access-control requirement. The
shared parser is included in the status release source fingerprint.

No observation, unavailable storage/network, malformed or contradictory data,
a server-reported unknown/stale result, a measurement past its freshness limit,
or an implausibly future time makes the current summary and service rows unknown.
The current server freshness limit is thirty minutes. A failed refresh retains
the earlier observation time while removing current green service badges.
Only evidence that is actually too old uses the old-observation explanation.
Future or otherwise unconfirmed current results use neutral confirmation/retry
copy in every supported language rather than claiming the observation is old.
History remains a separate dated record. Missing authenticated or provider
qualification neither becomes success nor turns into a public outage.

Opening and explicit Refresh read `/api/status` and `/api/history?days=30`
concurrently; later refreshes use the selected period. These are **two dynamic
JSON reads**, not two total asset requests. The customer page no longer reads
`/api/e2e-status` or `/qualification.json`. Changing a history period reads that
history only when its bounded browser snapshot is unavailable; changing language
or theme reads neither endpoint.

Visible pages refresh availability and history every fifteen minutes. Returning
from a hidden page refreshes once the last successful status read is at least
fifteen minutes old. A thirty-second local age check downgrades expired evidence
without collecting a probe. Browser reads omit credentials, reject redirects and
are bounded by timeout/body limits. They never launch tests or write results.

### Browser loading and period reuse — 28 October 2026 candidate

The production head loads one deferred `/app.bundle.js`, with an early script
preload. `statusApplicationScript` in `scripts/build-status.mjs` compiles the
authored messages, generated shared footer, localization adapter and application
in that order with the repository's pinned esbuild. No framework runtime or new
dependency is introduced. The loopback fixture host generates the same script at
startup. The source files remain authoritative; the generated bundle belongs only
in the build output and its release asset manifest. Existing raw script assets
remain available for already opened older documents. A syntax error or incomplete
footer catalog fails generation rather than publishing a partial bundle.

The same three approved WOFF2 files are preloaded before stylesheet discovery.
Their faces use `font-display: optional`: an early font can paint immediately,
while a late font does not replace an already painted fallback in that document.
The source font bytes and brand images are unchanged. This prevents a late font
response from moving the service summary and history controls.

The browser retains at most the three supported history windows. A snapshot can
be reused only for less than fifteen minutes and within the same UTC date on
which it was read. Re-selecting a loaded or currently loading period creates no
duplicate request. Selecting a different uncached period cancels the obsolete
history request, and an older result cannot overwrite the current selection.
Explicit Refresh, the existing fifteen-minute visible refresh and a qualifying
return to the tab request the current period from the server; they do not extend
a cached snapshot's age without a successful read. A failed or invalid selected
history refresh clears its cache entry and unusable chart/table as before.
Cancellation reduces obsolete browser work; it does not prove cancellation of a
database query which the server has already accepted.

Daily rows are constructed when the native daily-history disclosure is opened.
The 365-day response and monthly chart remain complete before opening it. While
the table is open, period and language changes rebuild all relevant rows from the
same validated records. This changes when hidden DOM is created, not the recorded
observations, percentages, unknown periods or disclosure semantics.

Local Chromium measurements used immutable built status fixtures, synthetic JSON,
150 ms added delay per request, a fourfold CPU slowdown, and 850 ms font delay.
Three desktop and three mobile cold contexts were measured before and after:

| Measure                                                    | Before  | Candidate |
| ---------------------------------------------------------- | ------- | --------- |
| Desktop median first useful availability and history       | 764 ms  | 638 ms    |
| Mobile median first useful availability and history        | 748 ms  | 635 ms    |
| Mobile late-font movement of the history panel             | -26 px  | 0 px      |
| Mobile observed layout-shift sum                           | 0.01881 | 0         |
| History reads for `30 → 365 → 365 → 7 → 365 → 30 → 365`    | 7       | 3         |
| Daily rows constructed while annual disclosure is unopened | 365     | 0         |

Bundling alone removed three script requests but produced no material useful-state
timing improvement in this environment. The final timings include the early
script/font hints and optional fonts. The first uncached annual selection remained
network-bound at 183–187 ms against 189–191 ms before; no substantial improvement
is claimed for that operation. These are local browser comparisons, not production
latency, Worker CPU, billed-request or provider evidence. Remote release and served
asset verification remain separate.

The candidate passed fifty Chromium status browser cases, five focused iPhone
WebKit performance cases, 112 status locale/service/report-ingestion checks and
eleven release-safety checks. The browser additions cover reused periods, forced
refresh, fifteen-minute expiry, UTC rollover, cancelled obsolete reads, deferred
daily rows and late-font geometry. Source locations are
`tests/status-e2e/performance.spec.ts`, `tests/status-e2e/status.spec.ts` and
`tests/security/status-release.test.mjs`. They qualify local fixtures and source
contracts, not a hosted release or an authenticated business journey.

## History and interpretation

The default is thirty days; seven days and one year retain the exact API windows.
Availability is the percentage of successful **received observations**. Received
and expected counts are shown separately; a missing slot is not a pass. A day
without observations is unknown, including precollection days. A measured day
with missing expected observations has a dashed partial-data outline even if all
received observations passed.

Seven- and thirty-day cells represent days. The annual view groups actual daily
counts into calendar-month cells, including partial boundary months; its daily
table still contains all 365 records. A monthly success percentage does not
qualify every day in that month. Cell selection exposes exact dates and received/
expected counts, and the table keeps empty days explicit. No past is reconstructed
before `collectionStartedAt`. History load/validation failure clears unusable
cells and daily rows and offers Refresh; no percentage is inferred.

One snapshot per slot and daily aggregates continue to bound annual database
reads. Retention remains 366 days. Query validation, aggregation, historical
records and APIs are unchanged by this interface candidate. Historical check URLs
retain the URL that was actually observed, including the former developer route;
new probes use canonical English paths.

## Separate business and browser evidence

`GET /api/status` retains its bounded coverage projection. In particular,
`pdfValidation.available === false` still means the paid PDF feature is disabled;
other values supply no paid-check qualification. Antivirus/import/rendering remain
a separate capability. A reported connected scanner proves no hosted scan,
signature freshness or exact-file result. These records are no longer customer
page rows and their underlying meaning has not changed.

The separate production-browser monitor still runs 28 fixed public checks on
GitHub `main` every six hours or manually. Its fourteen Chromium desktop/simulated-
phone page journeys and fourteen HTTP contracts establish no physical-device,
authenticated distribution, recipient delivery or provider qualification.
`GET /api/e2e-status` remains public read-only; `POST /api/e2e-reports` retains
body-bound GitHub OIDC authority, bounded sanitized ingestion and its existing
workflow/replay guards. The status customer UI no longer fetches these reports.
An absent, old or version-mismatched browser result cannot qualify the current
release. Authenticated distribution and receipt still need dedicated identities
and a real journey under the selected document authentication policy.

Local qualification still uses real production-mode domain code, local D1/R2,
synthetic scenarios and simulated final providers with separate external-network
restrictions. `build-status.mjs` includes a dated local qualification asset only
when its approved source scope and fingerprint match. Removing its public page
presentation neither deletes the source report nor weakens this release gate.
See [offline tests](TESTING_OFFLINE.md),
[nonconsuming dispatch validation](PRODUCTION_DRY_RUN.md) and
[production browser monitoring](PRODUCTION_BROWSER_MONITOR.md).

## Operations and maintenance

1. Read the observation time and distinguish a failed current check from unknown
   availability. Inspect bounded status/history APIs rather than creating a
   business operation to diagnose public access.
2. For stale or missing collection, investigate the status Cron, Worker and
   dedicated status database through authorized operations access. A customer
   page refresh cannot repair them.
3. For an actual public-contract failure, compare that observation with the
   served response and release. Keep browser reports, authenticated journeys,
   scanner evidence and provider outcomes separate.
4. Changes to public routes, locale catalogs or the shared footer require
   canonical-link, four-language, keyboard/phone and source-manifest checks.
   Keep the status adapter and local preview tied to the shared catalog.
5. Corrected sources require fresh relevant checks and a separately authorized
   publication. Wait for new collection after correction; never rewrite history
   or replace unknown slots with green values.

No customer content, recipient, dispatch identifier, token, signed URL or raw
provider error is added to the public page. Browser preferences affect display
only and grant no new approval, payment or sending authority.

## Publication and qualification evidence — 25–26 October 2026

The customer interface was independently published from source
`03daa4136de8999cc79018f33f2a22038917c621` as status Worker
`3d415d9e-f670-4ed3-ac8c-e91e3afd97e5` at 100% traffic. Read-only verification at
**2026-10-25T20:16Z** matched all thirteen public asset bodies, security headers
and unknown-route refusal. The natural collector observation at **20:15:47Z**
passed fourteen anonymous checks; it was not forced by publication or page reads.
The 7/30/365-day APIs retained exactly those daily windows, collection start
`2026-10-10T02:45:05.570Z`, received/expected counts and explicit precollection
days. Four languages, all three periods and fifteen footer destinations per
language were verified separately from business qualification.

A **26 October** source audit on application main
`f94664ff77c532c0c6b352109f565f6768091c2b` found the status runtime, shared footer,
configuration and status build/deploy scripts unchanged from that publication;
all fourteen manifest entries, including generated footer and header
configuration, matched current source bytes and hashes. The broad source scope
also includes package/release tooling changed for the application preview, so
its complete source fingerprint is not claimed unchanged. This source comparison
does not by itself establish a served-status observation or new deployment.

Separate public reads at **2026-10-26T01:57:49Z** confirmed the entire historical
manifest was still served: thirteen public assets, 350,684 bytes and matching
SHA-256/security headers. The static service still identified source `03daa413`;
it was not redeployed as `f94664ff`. The 7/30/365-day histories retained their
exact bucket counts and original collection start. The latest natural
observation was fresh and `public_checks_passed`, checked at **01:45:45Z** against
application source `c81ea94a1f60fab8776a130a7fc9d446abc72911`, before the later
application publication. It does not claim a collector observation of `f94664ff`
or authenticated business qualification. The application release does not
independently publish status, and a page read does not force collection.

The initial local candidate's forty synthetic status browser checks passed
across French/English/German/Luxembourgish, light/dark and
1440/390/320 px. They covered keyboard/touch sizing, stale/unknown/error states,
partial history, language retention, theme synchronization and contrast.
Three locale/shared-footer unit
checks, 109 status-service/OIDC integration checks and ten release-safety checks
passed. Scoped formatting/lint/diff checks and `build:status` passed. Reports and
captures were retained outside the repository. They establish neither exact-source
remote CI nor hosted execution of this candidate.

That initial matrix predates the later official footer-stamp and final theme/copy
amendments. Their narrower follow-ups remain separate rather than retroactively
qualifying the whole amended source.

After the final unknown-state copy and script-free theme fixes, eight focused
local browser checks passed: all four languages for future/server-unknown
recovery, no-JavaScript dark appearance, persistence/system changes, blocked
storage and text contrast. Their report is
`/tmp/guteneo-theme-final-status.json`; this narrower follow-up does not replace
the broader history matrix or qualify a deployed service.

Separate **read-only observations of the existing public service**, generated
25 October at 09:42 UTC, found:

| Window   | Received / expected observations | Successful received observations | Days without observations |
| -------- | -------------------------------- | -------------------------------- | ------------------------- |
| 7 days   | 615 / 615                        | 615                              | 0                         |
| 30 days  | 1,467 / 1,468                    | 1,467                            | 14                        |
| 365 days | 1,467 / 1,468                    | 1,467                            | 349                       |

Those responses reported collection beginning `2026-10-10T02:45:05.570Z`.
The latest status observation was `2026-10-25T09:31:44.058Z`, reported fresh with
fourteen successful public checks. A local browser replay of these unchanged
public JSON records showed the new interface preserving the missing slot,
partial day and precollection gaps. This is a replay, not served-byte proof of
the candidate. No production record, provider setting, service, migration or
business operation was changed.

Before the later official-stamp and final theme amendments, the 09:49 UTC local
static output contained thirteen assets totaling 161,463 bytes,
excluding `release.json`, compared with 1,035,102 bytes in the previous checked-in
public-file inventory. These inventories explain removed artwork/diagnostic
presentation weight; they are not a controlled hosted transfer, CPU, memory,
latency or billing measurement. Production publication, exact manifest/served
verification and fresh collection remain separate work.

## Historical browser-report observations — 24 October 2026

The previous public report presentation and its 37 synthetic UI checks belonged
to the 24 October candidate. That view is removed by the customer interface above;
its dated executions and ingestion limits remain historical evidence.

The first hosted run on 24 October, `40128432279` attempt 1, passed 21/28 checks
and failed overall; ingestion is unqualified. All fourteen browser checks passed,
while seven page comparisons failed on received size. The diagnostic candidate
requests an untransformed representation in Node, preserves strict size/SHA
checks, and distinguishes OIDC/ingestion refusals without logging secrets. The
Worker, Cron probes and OIDC authority were unchanged by that first Node correction. See
[the detailed observation and its limits](PRODUCTION_BROWSER_MONITOR.md).

The second attempt `40131421762` also failed at 21/28: every HTML response gained
367 bytes despite `identity` encoding, then ingestion returned
`401 REPORT_REJECTED`. The proposed origin guard appends `no-transform` only to
canonical public HTML responses while retaining complete hashes. Monitor request
headers cannot replace that response rule. Application publication and fresh
observation are required; both failures remain recorded without inferred success.

Isolated signed diagnostic `40132056947`, without a production request, confirms
that a direct GitHub job can also carry `job_workflow_ref` and `job_workflow_sha`.
The server accepts their joint legacy absence or the exact canonical-main
workflow/runner-commit pair. Foreign reference/SHA, one field alone or null remain
denied; signature, body, repository, branch and replay authority do not expand.
This correction needs a new status publication, separately from application
publication for the HTML guard. All 28 results and exact ingestion remain to be
qualified.

## Resources and cost

On 10 October 2026 the user explicitly allowed existing Cloudflare quotas with
**no business cost**. Workers Standard applies; a Free Website domain does not
make Workers free. Available credentials cannot read subscription/invoice, so no
final bill is inferred. Official prices checked on that date:

| Resource            | Workers Paid account inclusion | Overage            |
| ------------------- | ------------------------------ | ------------------ |
| Worker requests     | 10 million/month               | USD0.30/million    |
| Worker CPU          | 30 million ms/month            | USD0.02/million ms |
| D1 reads            | 25 billion rows/month          | USD0.001/million   |
| D1 writes           | 50 million rows/month          | USD1/million       |
| D1 storage          | 5 GB                           | USD0.75/GB-month   |
| Direct static files | Unlimited                      | Free               |

[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).
Allowances are **account-shared**, not reserved. The subscription already exists;
none is added.

Fifteen-minute collection means 2,880 runs/40,320 Guteneo reads in thirty days;
Guteneo's own incoming quotas may also apply. Direct static pages bypass Worker;
state/history reads invoke it according to audience. Cache reduces D1 reads without
promising free Worker requests. Do not enable Workers Caching before static files,
which changes their billing.

Annual aggregates read at most 1,460 rows/request. Collection launches no hosted
browser/container. Bounds reduce cost without capping invoice. Build/startup/
latency/resource observations belong with publication proof. Historical 10 October local
measurement: eleven row writes for first collection excluding purge; 1,462 full-year
reads (1,460 aggregates plus two metadata). The then-prepared Worker was approximately 22 KB,
under 8 KB compressed; this is not a new candidate measurement. 50 ms invocation CPU cap is a setting, not measured use.
Hosted memory/CPU still need Cloudflare metrics; do not extrapolate local timings.

`npx playwright test -c playwright.status.config.ts --project=chromium` uses synthetic
responses and loopback static serving without collection/D1. CI retains UI, service,
security and product tests. Production measurements/first actual Cron remain separate.

## Publication and rollback

Observed **10 October 2026**: service/application exposed
`c953596dc0650961a7294da622703f5edc3a764d`; **20 status assets** were verified.
The first Cron completed **02:45:05.570 UTC**, with **14/14 public checks passed**.
A 02:45:37.358 reread found one sample in each 7/30/365 window; earlier days stayed
unobserved. This historical proof qualifies no authenticated business journey
or delivery and does not publish the 25 October interface.

`npm run build:status` creates the static files, generated shared footer and
source-bound manifest. Local qualification is included only when its approved
scope/fingerprint matches current sources. Source and asset fingerprints are
rechecked after migration before publication.
`npm run deploy:status` still requires clean `main` matching freshly fetched
`origin/main`, applies only dedicated status migrations and deploys its Worker,
never business migrations. Publication needs its separate explicit authority.
Verify domain, headers, manifest assets, localized/themes/links, all three history
windows and fresh real collection. Empty precollection periods remain unknown.
Main-site changes use their normal `npm run deploy:live` release.

Rollback selects a verified Cloudflare version while retaining observations and
checking schema/API compatibility. Do not delete history as a rollback mechanism.
