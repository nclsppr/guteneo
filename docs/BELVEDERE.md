# Belvédère — guteneo control tower

**Watcher** names Nicolas's personal access to this read-only
surface. It is neither a workspace role nor an assistant mandate.
The [visual system](belvedere/DESIGN.md) documents the implemented interface.

The initial 25 October 2026 release from
`03daa4136de8999cc79018f33f2a22038917c621` added `https://belvedere.guteneo.com/` as a dedicated
protected entry. DNS/TLS, normal Auth0 sign-in and the authenticated overview were verified
separately after publication. The V2 visual alignment was then published from
`06d92bd345c955254f71e4707d8a90d0de1a9c87`; exact public assets and configuration
passed at **2026-10-25T22:01Z**. Native Safari subsequently traversed all seven
sections at **22:14Z**, with normal SSO, one theme action, no layout menu and no
business write or persistent preference change.

The **26 October 01:47Z** public check on source
`f94664ff77c532c0c6b352109f565f6768091c2b` retained the dedicated-host login
redirect and customer/MCP/bearer refusals. It did not repeat an authenticated
callback or section journey on that newer source. Dated browser navigation,
provider configuration and public routing remain separate evidence; no physical
iPhone or provider-delivery qualification follows from them.

The exact additional browser callback, root logout return and web origin were
saved in Auth0 and reread after a full dashboard reload at
**2026-10-25T08:29Z**, preserving their canonical counterparts. This provider
configuration is verified separately from application publication, DNS/certificate
activation and the authenticated journey on the new host.

Since the 10 October contract, language follows saved account preference:
French, English, German or Luxembourgish. Belvédère adds no selector. Direct
entry receives the validated preference in private HTML after the normal
guard; tab return rereads the session. Without a preference, browser languages
apply. Labels, accessible messages, numbers, dates and charts follow that
choice. Known source-authored finance explanations are localized with their
original accounting meaning; unknown explanations remain verbatim. Names,
identifiers and business data retain their values. Preference
grants no role or access. See [MULTILINGUAL.md](MULTILINGUAL.md).

## Presentation

Belvédère uses the workshop V2 visual vocabulary: shared portrait/wordmark, a
258 px desktop sidebar (232 px on compact desktop), 44 px navigation and actions,
simple section titles, shared typography, rounded panels and readable tables.
Navigation scrolls locally while account utilities remain reachable. At tablet
and phone widths a labeled, keyboard-operable drawer preserves all seven views;
wide tables retain their own scroll region. No workshop shell or customer
bootstrap is imported to obtain this appearance. The dedicated host allows only
the exact 128/192 px portrait files required by the shared mark, alongside its
existing bounded assets; query-bearing or unrelated brand paths remain refused.

One shared `ThemeToggle` in page actions replaces the sidebar appearance menu at
every width. It defaults to the operating system, supports pointer and native
keyboard activation and retains a local explicit light/dark choice. Theme changes
preserve the selected view, search and filters without rereading business data or
writing the account. [Interface appearance](THEMES.md) owns the bootstrap and
origin-scoped color preference. Belvédère always uses this visual shell; it neither
changes the account's Classic/V2 preference nor extends platform authority.

The focused browser suites cover all views, four account languages, mobile
navigation, read refusal/recovery, exact customer names and theme persistence.
Their synthetic results and rendered screenshots do not establish deployed or
physical-device proof.

## Journeys

- **Overview**: daily activity, chart metric selection, customer consumption,
  workspaces/members, sessions/authorizations, observed countries, channel
  distribution and incidents needing review. The “guteneo's world” globe
  switches between connections and distribution, retains a textual ranking
  and opens selected-country dispatches. See
  [geography and interaction](BELVEDERE_GLOBE.md).
- **Workspaces**: search, pagination, dispatch/member details. Every operation
  distinguishes quote, cap, settled consumption, reservation and verified
  provider cost. No document content or recipient is exposed.
- **Dispatches**: global tracking filtered by channel, state, destination
  country and workspace. Incident/globe links retain period/mode filters;
  opening an incident retries no operation.
- **Members**: global searchable directory with workspace memberships, roles,
  supervisor permissions and connections. Memberships remain current.
- **Connections**: valid browser/native sessions, MCP authorizations, successful
  login history and Cloudflare-supplied country. Authorization is not online
  presence; an MCP call is not a new user.
- **Finance**: credit consumption, reservations, promotional grants, verified
  Stripe payments per currency and available provider costs. Net result remains
  unavailable until charges/refunds are reconciled. Consumption uses **ledger
  debit dates**, including subsequently deleted dispatches; hosting fees appear
  once. Overview/workspaces instead use dispatches **created** in the period
  and their settled consumption to date. Verified payments use the available
  Stripe creation date without claiming bank-receipt dates. Balances/reservations
  are current. Provider costs use reconciliation-recording dates; dispatches
  without verified cost use the period-created cohort. These bases are disclosed
  in the interface.
- **Infrastructure**: read-only Cloudflare connectors with explicit unconfigured
  states. See [sources and limits](BELVEDERE_CLOUDFLARE.md).

Seven-, thirty-, ninety-day/custom periods use UTC. Production and simulation
are viewed separately. Tables use server pagination; missing measures never
become invented numbers.

## Access

The dedicated host serves Belvédère at `/`; it keeps that hostname throughout
sign-in and navigation. The compatible private route on the canonical application
is `/belvedere/<BELVEDERE_SECRET_SLUG>`. The secret segment is 32–128
alphanumeric, hyphen or underscore characters, configured server-side and
never an interface constant. Use strong randomness, for example 32
cryptographically generated bytes encoded as hexadecimal. Store it in neither
Git nor `VITE_*` variables.

The address alone grants nothing. The server requires:

1. Production environment/mode, valid route configuration and canonical app
   origin, or the exact server-selected dedicated origin.
2. Valid authenticated browser session with current membership.
3. Evidence of the latest Auth0 journey bound to session hash/provider
   identity: expected issuer, signed subject and verified email exactly
   `nicolas@pieper.fr` after lowercase normalization.
4. If `BELVEDERE_AUTH0_SUBJECT` is configured, that same Auth0 subject. This
   additional protection avoids relying only on a reassignable address.

Evidence is captured after both JWTs and verified email validate. Old sessions
must reconnect. Editing `users.email`, holding workspace administrator role
or supplying MCP/native tokens grants no such privilege. Existing MFA policy
still applies through authentication.

Every JSON read repeats access checking. Routes expose no business mutation.
Refusals/unknown addresses remain discreet; visiting the exact address without
a session may start Auth0. Private responses use `no-store`, `noindex`,
`no-referrer`, existing CSP and an inert HTML marker to open React. The secret
is sent to neither asset binding, integrations, ordinary navigation nor sitemap.
Public preview refuses this route family and cannot activate it. Read refusal
removes displayed data. Tab return/browser restoration triggers new access
checking without periodic background polling.

### Dedicated-host isolation and release qualification

`belvedere-host.ts` intercepts the exact HTTPS hostname before generic API,
authentication and asset fallback. It requires reviewed canonical production
configuration and the existing private-entry configuration. Forwarding headers,
lookalike hosts and arbitrary request origins cannot select an authentication base.
The old private address is never redirected, embedded or exposed on this host.

Sign-in reuses the existing Auth0 Authorization Code + PKCE/state flow and
normal identity/MFA policy. The fixed callback is
`https://belvedere.guteneo.com/auth/callback`; successful sign-in returns only to
the host root. Callback processing requires the existing signed allowed identity
and current membership before creating a session. It cannot create a new user,
accept a workshop invitation or provision a customer workspace. An invalid
identity gets a private recovery page with no identity/error details. Its explicit
retry requests a fresh Auth0 login, so the same denied SSO identity cannot trap
the operator in an automatic retry loop.

The existing `__Host-guteneo_session` cookie remains `Secure`, `HttpOnly`,
`SameSite=Lax`, `Path=/` and **host-only**. Canonical and dedicated browsers do not
share it through a parent-domain cookie. No custom token handoff or browser
storage authority is added. GET session and CSRF-protected POST logout retain the
Watcher guard. The dedicated host permits only its guarded read APIs, the two
sign-in endpoints, that session/logout pair, a robots refusal and bounded static
assets. Customer APIs, signup, MCP/native/OAuth entry, writes and public HTML
fallback refuse without touching customer business routes. Asset requests never
forward browser credentials to the asset binding.

Before publication, configure the same reviewed Auth0 browser client with the
**exact** additional callback above, allowed logout URL
`https://belvedere.guteneo.com/` and allowed web origin
`https://belvedere.guteneo.com`, preserving canonical entries. Do not add wildcard
URLs, a new broad audience or cross-domain cookies. `wrangler.live.jsonc` declares
the exact custom domain; actual Cloudflare routing/certificate and Auth0 provider
configuration must each be observed separately.

After release, verify the dedicated root starts normal sign-in without exposing
the private path, the allowed identity returns to that same root, every view reads
only its dedicated-origin endpoint and “Back to guteneo” opens the canonical site.
Verify a second identity, bearer caller, expired session, foreign Origin, unknown
API, signup and customer write are refused. Check that a missing/invalid callback
fails discreetly, and that canonical application sign-in and the compatible private
entry still work. Record redacted host, callback, cookie attributes and served
release versions; no session token or secret path belongs in public proof.

## Data and isolation

Global access is a dedicated read capability separate from workspace
permissions/APIs. Relations between operations, reservations, documents,
reconciliations and members retain organization keys. Business operations
and approval/send/quota rules are not bypassed.

`0052_belvedere.sql` adds browser-identity evidence, opaque native-session
public IDs, login history, read audit and indexes. Projections exclude cookies,
credential hashes, content, recipients, IPs and user agents.

**Connection** countries come only from `request.cf.country`, never a
client-supplied header. **Destinations** use normalized postal country or
qualified fax-tariff country; email/older fax lacking that evidence remain
country unknown. No country is inferred from an email domain. Markers indicate
countries, never precise positions. Events do not retrospectively reconstruct
old-session countries. MCP deduplicates to one observation per connection/day;
browser/native sessions are observed at opening. Browser rotation after
workspace change also observes the new public ID with current-request country.
This history is optional: unavailability does not reject valid authentication.
A cache bounded by D1 binding, actor, workspace, type, identifier and UTC day
avoids repeated writes within an isolate; the SQL constraint deduplicates
across isolates. Failed writes may be observed on a later request without
business mutation or dispatch retry. Auth0 login failures are absent and would
require a separate provider-log connector.

Reads exclude events older than 90 days. Cron deletes up to 1,000 old rows
per table/run. Private audit records only actor, date and action code, without
secret address/query. Privacy policy describes this in FR/EN/DE/LB.

## Local review

```sh
npm ci
npm run preview:belvedere
```

Open the printed `127.0.0.1:8794` URL. This standalone server loads no business
configuration/binding. Workspaces, people, events and costs are screen-labeled
fixtures. It listens only on loopback, rejecting other Host headers and write
requests. It is not Worker authentication mode or Auth0 qualification.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:belvedere
```

Dedicated browser tests verify the actual bundle with fictional responses.
Access/SQL tests use actual migrations in D1/Miniflare. These evidence classes
remain separate from hosted Auth0 journeys/Cloudflare calls.

## Release authority and historical evidence

The user has authorized production delivery during the 25 October task. Actual
provider configuration and authenticated runtime qualification remain separate
from the source candidate. For an authorized release, apply the additive
migration under repository procedure, install server secrets, verify Nicolas's
Auth0 subject/reconnection, then verify refusals for another account, an
assistant, expired session and public preview. Configure Cloudflare connectors
with minimal permissions and verify real-account data. Do not infer operation
from fictional responses.

## Evidence

Local candidate verification on 2 October 2026:

| Check                                            | Result                                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| TypeScript/ESLint                                | Passed on final source                                                                        |
| `npm run build`                                  | Web bundle/Worker compiled; dry-run only                                                      |
| `npm run build:live` and `npm run build:preview` | Passed without publication                                                                    |
| Local migration verification                     | 44 migrations, equivalent schema, `quickCheck: ok`, no FK violation                           |
| Backend Belvédère tests                          | 16 passed: signed identity, refusals, isolation, projections, globe, dispatch filters/finance |
| Targeted accounting regressions                  | 3 passed: actual fractional debit, retention after deletion, hosting counted once             |
| Cloudflare connectors                            | 65 passed on fictional responses: 31 metrics, 34 billing                                      |
| Globe geography                                  | 16 passed: projection, hemispheres, coordinates/unknown countries                             |
| Node security                                    | 215 passed, including refusal to omit private prefix from public rules                        |
| Belvédère browsers                               | 18 passed, desktop Chromium/iPhone WebKit, also with production bundle                        |
| Affected public pages                            | 10 passed, privacy/legal/SEO/language selectors on both browsers                              |
| Visual review                                    | 16 captures inspected, mobile menu corrected, then `ship` verdict                             |

The initial general Vitest run validated 84 files/1,657 tests. Two Belvédère
cases failed while module/new tests were still changing; the complete file
was rerun on final source with 16 passes. Sixteen globe tests, added after
initial file discovery, ran separately. This is combined local general-suite/
targeted-rerun evidence, not remote CI. Security also needed its `robots.txt`
fixture updated for the private prefix before passing completely.

Browser tests cover seven views, search/pagination, workspace opening/return,
country/channel/state filters, keyboard globe, unknown-country distinction,
empty/error states and data removal after expiry/tab return. Captures contain
fixtures only. These results claim no hosted Auth0 login, actual Cloudflare
spending, remote migration or publication.

## Integration on 9 October 2026

The candidate is reconciled with templates, PDF verification and current main migrations.
Belvédère migration is now `0052_belvedere.sql`. The above 2 October local
evidence remains historical. PDF verification debits are distinguished from dispatches/
hosting in posted consumption; dispatch counts do not treat them as dispatches.
Watcher guard remains independent of workspace roles. Private configuration
and hosted Auth0/Cloudflare qualification remain separate from merge. See
[DASHBOARD_IDENTITY_PROOF.md](DASHBOARD_IDENTITY_PROOF.md).
