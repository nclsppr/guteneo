# Amazon SES connection evidence — 2026-09-17

Resources were prepared through the user's authorized Safari AWS session and the Cloudflare API. No email, verification email, mailbox-simulator message, charge, account upgrade or production-access request was sent by the agent.

## Observed AWS state

- Account `982055099242`, SES/SNS region **Paris (`eu-west-3`)**.
- SES `ProductionAccessEnabled=false`, `SendingEnabled=true`, plan `ESSENTIALS`, quota **200 messages/24 hours**, maximum **1/second**, sent in the preceding day **0** at inspection.
- Domain identity `guteneo.com`: `VerifiedForSendingStatus=true`, DKIM `SUCCESS`, MAIL FROM `SUCCESS`. Easy DKIM uses RSA 2048. `bounce.guteneo.com` rejects messages when its MX configuration fails.
- Cloudflare DNS was initially just the site's proxied AAAA record. Three exact SES DKIM CNAMEs, one `bounce.guteneo.com` MX, its SPF TXT and `_dmarc.guteneo.com` with `v=DMARC1; p=none;` were added. Public DNS resolution confirmed all six records. No existing mail record was overwritten.
- Configuration set **`guteneo-production`** was created with sending disabled, TLS `REQUIRE`, bounce/complaint suppression and the default assignment to `guteneo.com`.
- Standard SNS topic **`arn:aws:sns:eu-west-3:982055099242:guteneo-ses-events`** was created with signature version 2. Its policy retains owner management and grants SES publication only for this account's exact configuration set. The enabled SES destination covers SEND, DELIVERY, BOUNCE, COMPLAINT, REJECT and RENDERING_FAILURE.
- IAM user **`guteneo-ses-sender`** has no console access and one inline `ses:SendEmail` policy, restricted to the exact domain/configuration set and `notifications@guteneo.com`. This address is an approved sender constraint, not a receiving mailbox.

IAM simulation allowed the exact domain identity, but returned `implicitDeny` for the configuration-set resource, including an isolated unconditional exact-resource policy supplied only to the simulator. That result is **inconclusive for the configuration set**, not a passed end-to-end permission check. The policy matches AWS's documented SES v2 resource pattern; it has not been broadened. The revised provisioning script reports partial qualification explicitly. Its final read-back pass still needs execution in the AWS session. See [SES_SETUP.md](SES_SETUP.md).

## Cloudflare credentials

One IAM access key was created through the AWS console and copied directly from its copy controls to the localhost password form. The secret value was neither displayed in the conversation nor saved to a credentials file, shell arguments or source. The form confirmed successful Cloudflare storage; the clipboard was then replaced with public text.

Secret-name inspection confirmed `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_REGION`, `SES_CONFIGURATION_SET`, `SES_SNS_TOPIC_ARN` and `SES_SANDBOX`. The permanent key clears any temporary session token. `SES_SANDBOX=true` accurately reflects the observed AWS account; `LIVE_SENDS_ENABLED=false` remains set.

## Notification handshake confirmed

The subscription endpoint is **`https://guteneo-app.nclsppr.workers.dev/webhooks/ses`**. The brand root serves the design preview and cannot receive provider callbacks.

On 2026-09-17 the authenticated AWS CloudShell confirmation succeeded for subscription **`arn:aws:sns:eu-west-3:982055099242:guteneo-ses-events:54d3e8f5-538e-4c83-b32b-806634db1430`**. Read-back verified the exact topic, account, HTTPS endpoint, `PendingConfirmation=false`, `ConfirmationWasAuthenticated=true` and `RawMessageDelivery=false`. The consumed token was removed only from verified receipt `e2c768ce-a778-444d-bfdd-8b3102494ee0`; the targeted update affected one row and read-back returned a null token type. The local transfer helper was stopped and the clipboard replaced with public text.

Earlier callback 503 responses were caused by `redirect: "error"`, which the deployed workerd runtime rejects. Provider requests now use `manual` and reject non-success responses without following redirects; a real workerd regression check proves that credentials do not reach a redirect destination. The backend permits configured SES POST callbacks past the unrelated Auth0 prerequisite while retaining SNS topic/signature checks and environment protections.

A private Cloudflare service-binding inspection authenticated the installed IAM credentials through STS and verified the exact account and dedicated `guteneo-ses-sender` principal. No email was sent. This proves the installed credential identity and notification handshake, not end-to-end SES delivery permission. The repeatable private procedure is documented in [SES_SUBSCRIPTION_CONFIRMATION.md](SES_SUBSCRIPTION_CONFIRMATION.md).

## Remaining activation gates

AWS production access and actual narrowly authorized send qualification remain open. Business email preparation also needs a trusted email tariff/quote implementation, tenant-approved sender, funded budget and human approval. Auth0 account verification/reset emails require separate Auth0 email-provider configuration. Creating SES resources or installing its key does not complete those steps.
