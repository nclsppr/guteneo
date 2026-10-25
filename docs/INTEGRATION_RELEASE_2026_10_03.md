# Integration — 3 October 2026

The user authorized PR review, integration into `main`, merged-commit tests and
deployment. Additional scope required a repository-only feature/journey tree with
immediately readable permissions.

## Inventory and boundaries

| PR | Content | Preserved source |
| --- | --- | --- |
| #43 | Multilingual sharing/read buttons | `c232f2e`; merged in `5417aa0` after full CI |
| #38 | Skill metadata/email safeguards | `fde084a`; ancestry preserved in #41 |
| #41 | PDF verification/PDF diagnostics | `f46aae9`; public-entry correction/integration with #43 |
| #47 | Technical atlas/roles/journeys/maintenance | `417c414`; ancestry preserved in #41 |

#41 combines remaining sources with parent commits, without squashing/replacing
features. The only plugin conflict was release notes: retain 0.3.2, diagnostics,
consent boundaries and email/reviewer safeguards.

PDF verification stays closed without the PDF verification activation flag set to true, qualified private `PDF_VALIDATOR`
and production scanner. Review found billing possible without scanner; shared
availability was corrected to block subscription/renewal actions/debits even with
sufficient funds. D1 tests cover both and atlas matches. Apply 0050–0051 before
backend code reads their tables. Merge/app deployment qualifies neither hosted
validator, commercial obligations nor recurring purchases. Channels, mandates and
real sends retain separate authority; integration activated/executed none.

## Corrected integration regression

Desktop/iPhone initially found public `#/app/plan` without a fragment target.
The offer now uses explicit private `/app/plan`, served `no-store`,
`noindex,nofollow`, then handed to the existing router. Tests retain real-target
requirements without exceptions. Server assertions cover GET/HEAD/preview mutation
refusal; browser covers click/route/reload and no preview backend traffic.
After #43 integration, 147 public-entry/subscription/diagnostic assertions and two
desktop browser journeys passed.

## Documentation and roles

At that date [atlas](FEATURE_MAP.md) described 16 domains, 118 features, 15 journeys
with contracts/source/interfaces/tests; [HTML](FEATURE_MAP.html) was standalone,
responsive/searchable. Four human roles plus assistant column do not create a
fifth membership role. Supervisor approval/reporting remain independent. Private
data/template/PDF ownership overrides general workspace-read rights.

AGENTS/PR template require tree/rights/journey updates per feature change. Both
views share JSON source; none belongs in official site assets/navigation/generator.

## Verification and publication

Second iPhone attempt passed app/mobile menu but French roles video stalled at
0.006 seconds on Linux, fully buffered/visible/unpaused without media error.
Five local WebKit plays passed. Preview CI sessions became exclusive to avoid
concurrent audio/GStreamer contention; playback, dimensions, duration and decoded
final-card assertions remained. This stabilizes without proving internal cause.
Candidate `8ef13c8` then passed all thirteen jobs including iPhone; scanner-lock
commit still needed its own CI.

Final-candidate and merged-main full CI are separate required gates. Merged
`fd33771` passed 28 XCTest unit/eight UI cases and unsigned archive; first web CI
failed French playback, rerun failed uncertain-PDF third click. Touch-qualification
fix preserves assertions and needs fresh full PR/main CI. Release requires clean
`main` synced with origin plus exact-source assets/manifest.

That cloud environment had no configured Cloudflare identity/secret; `wrangler
whoami` confirmed unauthenticated. No deployment, remote schema change or private
service publication was claimed. After secure authorized access, follow
[MAIN_RELEASE.md](MAIN_RELEASE.md), check D1 ledger/bookmark/integrity and then
canonical manifest/assets/health under the current origin contract. Historical
instructions checked two then-public hosts.
