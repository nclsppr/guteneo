# Resend setup for Guteneo and Auth0

17 September 2026. The application connector and migration remain a local
candidate. The Resend domain is verified; two explicitly authorized sending
keys were created, the Worker key was installed, and the native Auth0 Resend
provider was prepared and reread **disabled**. These configuration results do
not prove email delivery. No real email, application source deployment, remote
migration or provider activation was performed in this work. See
[RESEND_PROOF.md](RESEND_PROOF.md) for separate local and external evidence.

## Two separate paths

Guteneo dispatches use the Worker Resend adapter, existing tenant-scoped
approval/outbox and independently qualified pricing. Auth0 verification and
password-reset messages use its **native Resend email provider**. Current
official documentation supports this directly; no custom Action, SMTP bridge
or additional npm dependency is required. Auth0 still owns its templates and
authentication events. [Resend integration](https://resend.com/docs/send-with-auth0),
[Auth0 native provider](https://auth0.com/docs/customize/email/smtp-email-providers/resend)

The Auth0 provider is **tenant-wide**, not scoped to the Guteneo browser client.
The configured tenant is `pieper.eu.auth0.com`. Historical provisioning evidence
included another application, while [AUTH0_BRANDING.md](AUTH0_BRANDING.md)
records the later operator-confirmed move to Guteneo use. Review the current
tenant and all affected sender/template settings before changing its email
provider; historical client entries do not prove current product usage.
A dedicated database connection or scoped login Action does not scope the
tenant email provider.

Once separately activated, Auth0 can send authentication emails even while
`LIVE_SENDS_ENABLED=false` or `RESEND_SENDS_ENABLED=false` in Guteneo. Those flags
only govern the Worker business path. Preparing or activating one path does
not qualify the other.

## Dedicated credentials

Two distinct keys were created in the existing personal Resend space
`nclsppr`, each restricted to the verified `guteneo.com` domain. No separate
Guteneo team or account was created:

| Purpose                             | Installed key name                   | Permission     | Domain        | Secret destination              |
| ----------------------------------- | ------------------------------------ | -------------- | ------------- | ------------------------------- |
| Guteneo dispatches                  | `Guteneo Worker · envoi guteneo.com` | Sending access | `guteneo.com` | Worker `RESEND_API_KEY`         |
| Auth0 transactional identity emails | `Guteneo Auth0 · envoi guteneo.com`  | Sending access | `guteneo.com` | Auth0 email-provider credential |

Use the actual verified domain and verify each key's permission and restriction
in Resend. The form checks syntax; an API key's prefix cannot prove its scope.
Sending access avoids installing a resource-management credential in either
runtime. Separate keys allow independent rotation and attribution, while the
team's account limits and domain reputation can still be shared.
[API-key permissions](https://resend.com/docs/api-reference/api-keys/create-api-key),
[key management and domain restriction](https://resend.com/docs/dashboard/api-keys/introduction)

Never paste a key into chat, a shell argument, `.env`, a fixture or an evidence
document. The two preparation forms bind to `127.0.0.1`, use a random URL and
CSRF token, reject foreign origins and unknown/duplicated fields, expire after
30 minutes and close after success. All credential fields are masked. Values
travel through in-memory child stdin to Wrangler or the official Auth0 CLI;
provider output is withheld. Referenced buffers and credential fields are
cleared after use. JavaScript cannot guarantee erasure of immutable string
allocations.

## Worker preparation

After authorization to install Worker credentials:

```sh
npm run setup:email
```

The completed installation used the key-only handoff, without fabricated
account/webhook metadata. `wrangler secret list` confirmed the presence of
`RESEND_API_KEY`; it did not expose its value. The resulting Secret Change
version is `9698a3ae-6ec0-4f94-b464-403fefabe567`, created at
`2026-09-17T15:40:55.658Z`, serving 100% of traffic. Public source remains
`c3798f59cb6cff4e1dcaddb524f43d59b1009822`. The pre-existing fax authorization
remains `liveSending=true`, `liveSendChannels:["fax"]`; business email stays
closed.

The alias `npm run setup:email:resend` is identical. Its localhost form stores
`RESEND_API_KEY`, `RESEND_ACCOUNT_ID`, `RESEND_DOMAIN_ID`,
`RESEND_VERIFIED_DOMAIN=guteneo.com`, and optionally `RESEND_WEBHOOK_SECRET`
through the existing Cloudflare secret path. An empty optional webhook secret
keeps its existing value. Account and domain identifiers must match the
subsequently qualified account/pricing evidence; copying them into a form is
not proof of ownership or verification.

Installation does not change `EMAIL_PROVIDER`, `LIVE_SENDS_ENABLED` or
`RESEND_SENDS_ENABLED`. Their separate activation must be reviewed against the
runtime and quote prerequisites. `.env.example` retains `EMAIL_PROVIDER=ses`
and both live-send flags disabled. Existing SES configuration is preserved and
the original setup is still available as `npm run setup:email:ses`.

After an authorized runtime deployment, the private read-only inspection is:

```sh
node scripts/provider-readiness.mjs resend
```

It requires the deployed `inspectResend` RPC. A correctly restricted
sending-only key may not read domain details and can return
`RESEND_DOMAIN_READ_NOT_PERMITTED`. This does not justify granting full access
to a runtime key. Verify the domain in the Resend dashboard instead. A
successful read still does not prove sending, account billing qualification or
webhook delivery.

## Auth0 plan, inspection and disabled preparation

```sh
npm run setup:auth0:email
npm run setup:auth0:email -- --inspect
```

The first command prints an offline plan. Inspection performs only a provider
read through the official CLI and prints readiness booleans. No credential or
sender address is returned. Each management call checks that the CLI's active
tenant is exactly `pieper.eu.auth0.com`. Required management scopes are
`read:email_provider`, `create:email_provider`, and `update:email_provider`.
The tool does not renew or expand the user's CLI authorization itself.

Only after explicit review/authorization of the shared tenant, a new provider
can be prepared through this one-use form:

```sh
npm run setup:auth0:email -- --prepare --acknowledge-tenant-wide
```

Enter the dedicated **Auth0** Resend key and a plain sender address such as
`no-reply@guteneo.com`. The form makes one
`POST /api/v2/emails/provider` with `name=resend`, `enabled=false`, that sender,
and `credentials.api_key`. POST cannot replace an existing provider. A failed
read is never treated as proof of absence. An existing disabled Guteneo Resend
provider can instead be updated with the additional `--update-disabled` flag;
an active provider, a different provider or a sender outside Guteneo is refused.
[Create provider](https://auth0.com/docs/api/management/v2/emails/post-provider),
[read provider](https://auth0.com/docs/api/management/v2/emails/get-provider),
[update provider](https://auth0.com/docs/api/management/v2/emails/patch-provider)

The completed POST prepared `no-reply@guteneo.com` with `enabled=false`. The
initial verification falsely reported failure because Auth0's default GET
projection omits the sender. Inspection now requests exactly
`fields=name,enabled,default_from_address&include_fields=true`; it never asks
for `credentials` or `settings`. The corrected metadata-only read confirms
`nativeResend=true`, `enabled=false`, `guteneoSender=true`, without entering
the key again or rewriting the provider. The final inspection reports no
delivery qualification.

The tool rereads the provider and confirms the exact sender, native Resend
selection and disabled state before reporting success. It never enables the
provider, modifies templates or login Actions, calls a test/send endpoint, or
stores the Auth0 Resend key in Cloudflare. Work without concurrent Auth0
provider edits: the management API offers no transaction across the preflight,
write and reread. If a write or reread fails, inspect the remote state before
another action; no automatic retry is performed.

Disabled preparation is **not activation** and does not qualify delivery. The
provider may be absent or disabled while Auth0's built-in test service remains
the tenant's effective route; no change to that behavior is inferred here.

## Remaining real qualification

Before activating Auth0, review the tenant-wide impact, DNS/domain verification
and every affected template's From value. Native email template installation
and qualification remain outstanding at this checkpoint; visual branding is
tracked separately in [AUTH0_BRANDING.md](AUTH0_BRANDING.md).
The default provider address is only
the fallback; a template or passwordless connection can override it. Obtain
explicit authorization to activate and to send the chosen real test email.
Record separately the provider save, Resend acceptance, actual receipt, email
verification/password-reset journey and Guteneo callback/session evidence.

Guteneo campaign sends remain subject to the application's approval, quota,
pricing, recipient-consent and delivery gates. Marketing activation also needs
its own unsubscribe/suppression and reputation implementation/qualification;
installing a Resend key does not implement that flow.

Initial local proof: `node --test tests/security/resend-setup.test.mjs
tests/security/auth0-setup.test.mjs tests/security/secure-setup.test.mjs` passed
31 tests, including new Chromium Auth0 preparation and existing Chromium/WebKit
secret forms. These use fictional keys and intercepted writers/APIs. They
cover scope/endpoint pinning, refusal of active-provider overwrite, exact
disabled-state/sender reread, uncertainty without retries, masked one-use
forms, secret clearing, and blocked provider/activation-field injection.
The first consolidated application snapshot subsequently passed **1,163
Vitest tests across 57 files and 150 security tests**. After the key-only
profile and explicit-field inspection correction, the focused
`tests/security/resend-setup.test.mjs` run passed **14 tests**, including the
Chromium form. The final complete security run then passed **154/154 tests**
(`reports/resend-security-final.log`), and final lint passed. The final
verification summary is **1,163 unit/integration tests, 154 security tests and
four targeted E2E cases**; the earlier Vitest snapshot is not presented as
rerun after the setup correction.
