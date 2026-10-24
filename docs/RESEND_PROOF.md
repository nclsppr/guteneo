# Resend and protected-document evidence

## Integration — 2 October 2026

Resend/protected links were reconciled with FR/EN/DE/LB web, native API and dashboard
fixes. Migrations became `0039_resend_email_transport.sql`,
`0040_protected_documents.sql`, `0041_prepare_only_accounts.sql`, after native 0037
and preference 0038; applied migrations unchanged.

Release configuration keeps `LIVE_SEND_CHANNELS=fax,postal`,
`RESEND_SENDS_ENABLED=false`. Provider selection grants no email-send authority.
Package 0.3.1 preserves existing app identity and PR34 welcome. Dated 2 October
portal observations establish no new submission, reviewer login or delivery.

Local combined runtime `2255da8` plus JSON-discovery fix `5f26dde` passed typecheck,
lint, web build/plugin package. Eight focused Resend/protection/configuration/MCP/
catalog files: **142/142**. Resend/reviewer/main-only-release Node checks:
**89/89**. Protected-email/recipient browser journeys: **30/30** desktop/mobile
Chromium/iPhone WebKit. Locale negotiation retains explicit choice through unlock
and checks exact unchanged PDF without password leakage on locked page.

Synthetic accounts/documents/intercepted transports qualify no real delivery,
production webhook or private settings. Initial fixture used four implicit users
values after preference-column addition; it now names columns explicitly without
migration/runtime-rule changes.

## Candidate — 21 September 2026

[PR #27](https://github.com/nclsppr/guteneo/pull/27) tracks validation/publication;
[PROTECTED_EMAIL.md](PROTECTED_EMAIL.md)/[PROTECTED_DOCUMENTS.md](PROTECTED_DOCUMENTS.md)
own contracts. September17 history below is separate.

Observed during preparation: verified guteneo.com in personal `nclsppr`, eu-west-1,
Free plan 100/day/3,000 month/10 requests-second, no opening/click tracking. Existing
Worker key stayed domain-limited. In-memory AES-GCM `PROTECTED_DOCUMENTS_KEY` was
installed in Cloudflare and only presence reread; no secret retained here.

At that stage, six-event webhook awaited requested creation confirmation;
`RESEND_WEBHOOK_SECRET` absent. Production retained fax/postal; Resend code and
then-numbered 0037–0039 not published. No real email; personal-inbox trials awaited
owner-supplied address/authorization.

Local proof: types/lint/web/Worker build; normalized equivalent 39-migration schema
after streamlined postal/window/review-fax integration, `quick_check=ok`, no FK
violation. Eight Resend cases cover three modes/exact bytes/atomic acceptance/
revocation/expiry before submit/no duplicate debit. Existing SES/Pingen quotes
stayed byte-identical after migration. Nineteen protection/config cases include
prepare-only reviewer. MCP/browser use synthetic data/intercepted provider.
[Full CI for `590818a`](https://github.com/nclsppr/guteneo/actions/runs/35551544452)
passed scanner/types/lint/migrations/unit/integration/security/build/three browsers.
It preceded final PR28 integration; PR27 tracks reconciled-source checks. Provider/
browser results remain synthetic.

After local PR28 integration, **215 focused server tests/45 protected-email/postal
browser scenarios** passed across three profiles. Fixture fix `9b35098` then passed
**33 postal setup scenarios** plus **three EUR5.25→525-cent input checks**.
Types/lint/web/plugin/Worker builds passed. These supplement earlier proof; full
final-source CI remained required before release. Candidate plugin 0.3.0 and
ChatGPT/Claude contracts were no new marketplace submission/publication.

# Historical Resend preparation — 17 September 2026

Branch `feat/resend-email-connector`, base `c3798f5`.

## Verified external configuration

- Authorized Safari Google login opened personal `nclsppr`.
- Added guteneo.com, domain `0140c1df-a406-495d-adb7-78a1204607b3`, Ireland eu-west-1.
- Cloudflare API added three records after conflict checks. Reread found ten records: seven previous unchanged plus three new.
- Resend showed domain/DKIM/rsend/send **Verified**, browser-local verification 17 September 17:19. Independent public DKIM/DNS reads completed.
- Receiving off, no opening/click tracking, no purchase/paid overage activation, no real email.
- Two authorized Sending-access keys limited to guteneo.com, separately for Worker/Auth0, were created in personal workspace, not a dedicated account. Values were never displayed or stored in files/reports/commands. Historical dashboard labels identified each purpose.
- Secure form installed `RESEND_API_KEY`; Wrangler secret listing confirmed presence. Secret Change version `9698a3ae-6ec0-4f94-b464-403fefabe567`, `2026-09-17T15:40:55.658Z`, 100% traffic.
- Native Auth0 Resend with no-reply sender remained **disabled**. Final projection: `nativeResend:true`, `enabled:false`, `guteneoSender:true`. Initial false failure arose because Auth0 returns only name/enabled without explicit selection. Corrected read also requests `default_from_address`, never credentials, confirming existing setup without new key/provider rewrite.
- Usage displayed transaction/marketing Free plans, not qualified business pricing/permanent free service.

Filtered report `reports/resend-domain-proof.json` retains only public DKIM hash.
Public source stayed `c3798f59cb6cff4e1dcaddb524f43d59b1009822`: no new application
code/remote migration. `liveSending:true`, channels fax only, preserved authorized
fax; business email stayed closed. Secret entry changed neither channels nor Auth0
activation.

## Local validation

- npm installation/audit passed without reported vulnerability.
- `npm run build` passed TypeScript/web/Worker dry-run, no deployment.
- Four mobile Chromium/iPhone WebKit scenarios passed requested-recipient attestation, SES/Resend failures, unknown outcome preventing duplicate, 320 px overflow/no send request.
- Client/domain/callback/migration tests used fixtures/intercepted network. Migration preserved SES quotes/approvals/booked credit/suppressions, empty FK checks/quick_check OK.
- Initial consolidated run: **1,163 Vitest/57 files**, then **150 security tests** (`reports/resend-vitest.json`, `reports/resend-full-test.log`).
- Later key-profile/Auth0-field fixes: **14 focused tests** including Chromium form; final security **154/154** (`reports/resend-security-final.log`). Final recorded totals: **1,163 unit/integration, 154 security, four focused E2E**. Full Vitest was not claimed rerun after that fix.
- Final typecheck/lint/build passed. Four E2E report `reports/resend-e2e.json`; fixture credentials/intercepts establish no real delivery.

## Remaining at that stage

Create/qualify signed Resend webhook after authorized deployment; qualify account/
price/limits without copying SES tariffs and with Auth0 capacity headroom; complete
native Auth0 email templates/qualification and separately authorized activation;
apply remote migration/deploy only with authority; then test exact approved content/
recipient and verify receipt/callback. [AUTH0_BRANDING.md](AUTH0_BRANDING.md) tracks
visual identity separately. Local/domain evidence never implies delivery.

App marketing stays closed. Native Broadcasts remain a distinct operator path,
with no subscriber import/publication performed by this preparation.
