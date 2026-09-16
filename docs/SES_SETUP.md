# Amazon SES setup for Guteneo

Reviewed against the existing adapter and official AWS documentation on 2026-09-16. This is a provisioning procedure, not evidence of resources created, account production access, or an email sent. Record the observed account results in LIVE_RELEASE.md.

## Reviewed CloudShell provisioning script

[`scripts/setup-ses-resources.py`](../scripts/setup-ses-resources.py) targets the observed Guteneo account **982055099242**, Paris, `guteneo-production`, `guteneo-ses-events` and `guteneo-ses-sender`; its allowed sender is `notifications@guteneo.com`. It requires the already-created domain identity. Download the script from the repository at the exact reviewed commit, then run `python3 setup-ses-resources.py --apply` in the existing official AWS CloudShell session. Without `--apply` it only prints an offline plan.

The script creates no key or subscription, sends no email, and does not modify account production access, pricing, DNS or root credentials. It keeps the configuration set disabled, requires TLS, preserves the SNS owner policy, refuses foreign resource-name collisions, and verifies IAM allow/deny cases plus resource readbacks. It is rerunnable after an interrupted setup; individual AWS resource changes are not one transaction. Local checks validate syntax, SNS policy preservation/idempotence, unexpected-grant rejection and simulation parsing against doubles. Actual AWS calls and IAM evaluation must be recorded separately after CloudShell execution. [Configuration-set API](https://docs.aws.amazon.com/boto3/latest/reference/services/sesv2/client/create_configuration_set.html), [IAM simulation](https://docs.aws.amazon.com/boto3/latest/reference/services/iam/client/simulate_principal_policy.html).

### Observed IAM simulator limitation, 2026-09-17

The official CloudShell execution passed preflight, prepared the disabled SES configuration set and SNS v2 event destination, and created the dedicated IAM user with its exact inline policy. The first script version stopped at `iam_simulation_exact_failed`; that run did not report completed qualification.

Subsequent read-only AWS diagnostics returned `allowed` for the domain identity and `implicitDeny` for the configuration-set resource, with no missing context. The grouped response's top-level decision was `allowed`, despite that per-resource difference. Custom-policy simulation reproduced the result: identity alone allowed; configuration set alone denied; even an isolated, unconditional allow for only that exact configuration-set ARN was denied. The diagnostic policy was never attached. These observations make the configuration-set simulation inconclusive; they do not prove a successful real SES request or an AWS implementation cause.

The ARN and narrow policy shape match the official [SES v2 action/resource reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_sesv2.html) and AWS's explicit [identity plus configuration-set policy example](https://docs.aws.amazon.com/ses/latest/dg/eb-policies.html). AWS also documents that [simulator results can differ from live evaluation](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html). No IAM permission was expanded to work around the result.

The revised script separately verifies the exact identity and denial of another sender, identity, region, raw-email action, SES provisioning action and IAM key-creation action. It prefers `ResourceSpecificResults` over aggregate fields. If the isolated configuration-set diagnostic remains denied, it completes resource readbacks with **`iamPolicyQualification: partial_config_set_simulator_inconclusive`**, **`liveTransportQualified: false`**, and a verified disabled configuration set. A different result or missing context still fails explicitly. Configuration-set authorization and actual SES transport remain unqualified until separately authorized account testing; the script never enables sending.

## Region and account readiness

Use **Europe (Paris), `eu-west-3`** for the SES identity, configuration set and SNS topic. The existing SigV4 adapter uses the supported HTTPS endpoint `email.eu-west-3.amazonaws.com`; it does not need SMTP credentials. [AWS endpoints](https://docs.aws.amazon.com/general/latest/gr/ses.html).

Inspect the currently authenticated AWS account before creating anything. These commands read metadata and do not send email:

```sh
aws sts get-caller-identity --query Account --output text
aws sesv2 get-account --region eu-west-3 --query '{ProductionAccessEnabled:ProductionAccessEnabled,SendingEnabled:SendingEnabled,SendQuota:SendQuota,PricingAttributes:PricingAttributes}'
aws sesv2 list-email-identities --region eu-west-3
aws sesv2 list-configuration-sets --region eu-west-3
```

Do not reuse unrelated AWS infrastructure or overwrite an existing identity without inspecting it. [GetAccount](https://docs.aws.amazon.com/cli/latest/reference/sesv2/get-account.html) exposes account sending status, quotas and pricing details.

New SES accounts start in the regional sandbox: verified recipient addresses/domains or mailbox simulator only, at most 200 messages per 24 hours and one per second. Production access is an AWS approval, not implied by creating an AWS account. A request must accurately describe the transactional use, recipient consent and bounce/complaint handling; do not invent traffic or acceptance of account terms. [AWS production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).

New accounts/account-region combinations begin on **Essentials**, currently $0.16 per 1,000 messages for the first monthly tier, without the Pro/Enterprise fixed monthly fee. Data, SNS and optional features can incur additional charges. Read the actual account plan; no Guteneo customer tariff is inferred from it. Do not enable dedicated IPs, global deliverability or a higher plan as part of basic setup. [AWS pricing](https://aws.amazon.com/ses/pricing/).

## Domain and event resources

1. Create a dedicated configuration set, proposed name `guteneo-production`. Use shared IPs. Keep sending disabled until account and application readiness are qualified. Enable bounce/complaint suppression. No open/click event tracking is needed for this transactional integration.
2. Verify the **domain identity `guteneo.com`** with Easy DKIM RSA 2048, using the exact three CNAME names/values returned by SES. Publish them as DNS-only records in Cloudflare. Domain verification does not require sending a verification email.
3. Assign that configuration set as the domain identity's default. The adapter also explicitly passes `ConfigurationSetName` on every submission. [Default configuration sets](https://docs.aws.amazon.com/ses/latest/dg/managing-configuration-sets-default-adding.html).
4. Use a dedicated custom MAIL FROM subdomain, proposed `bounce.guteneo.com`. Publish its sole MX as `10 feedback-smtp.eu-west-3.amazonses.com` and TXT `v=spf1 include:amazonses.com ~all`. Set MX failure behavior to reject. Preserve the root domain's existing MX/SPF and inspect existing DMARC before changing it. DKIM alignment can satisfy DMARC without replacing unrelated mail configuration. SES requires exactly one MX at the MAIL FROM subdomain. [Custom MAIL FROM](https://docs.aws.amazon.com/ses/latest/dg/mail-from.html).
5. Create a **Standard** SNS topic, proposed `guteneo-ses-events`, in Paris. SES does not support FIFO topics. Permit publication only from this account and exact configuration set using the policy below. [SES SNS destination](https://docs.aws.amazon.com/ses/latest/dg/event-publishing-add-event-destination-sns.html).

Replace `ACCOUNT_ID` below with the observed 12-digit account ID. This is an additional topic policy statement; retain the owning account's management permissions.

```json
{
  "Sid": "GuteneoSesEvents",
  "Effect": "Allow",
  "Principal": { "Service": "ses.amazonaws.com" },
  "Action": "sns:Publish",
  "Resource": "arn:aws:sns:eu-west-3:ACCOUNT_ID:guteneo-ses-events",
  "Condition": {
    "StringEquals": {
      "AWS:SourceAccount": "ACCOUNT_ID",
      "AWS:SourceArn": "arn:aws:ses:eu-west-3:ACCOUNT_ID:configuration-set/guteneo-production"
    }
  }
}
```

Set the topic attribute **`SignatureVersion=2` before subscribing**. SNS defaults to version 1, which Guteneo rejects. [AWS signature configuration](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message-configure-message-signature.html).

```sh
aws sns set-topic-attributes --region eu-west-3 --topic-arn 'arn:aws:sns:eu-west-3:ACCOUNT_ID:guteneo-ses-events' --attribute-name SignatureVersion --attribute-value 2
```

Create the enabled SES configuration-set event destination with types `SEND`, `DELIVERY`, `BOUNCE`, `COMPLAINT`, `REJECT`, `RENDERING_FAILURE`, pointing at that topic. Do not select opens/clicks. Keep SNS raw message delivery disabled: the application requires the signed SNS envelope. [Event destination parameters](https://docs.aws.amazon.com/cli/latest/reference/sesv2/create-configuration-set-event-destination.html).

The HTTPS subscription must reach the **deployed backend** `/webhooks/ses`, not a static preview at the same brand domain. Set `SES_SNS_TOPIC_ARN` before subscribing. The application verifies the topic and signature, then retains the subscription token in a restricted receipt without following `SubscribeURL`. Confirm the exact topic using that verified token through an operator-only path, and remove the token afterward. Do not print it in logs, expose it in normal administration, or paste it in conversation. A subscription is ready only after SNS returns its actual subscription ARN instead of `PendingConfirmation`.

## Sending principal

Create a dedicated principal, proposed `guteneo-ses-sender`, without console access or administrative policies. It needs only the following identity policy for the current `SendEmail` adapter. Replace `FROM_ADDRESS` with the actual server-approved address on the verified domain, and `ACCOUNT_ID` with the observed account ID. This does not create a receiving mailbox.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SendGuteneoMail",
      "Effect": "Allow",
      "Action": "ses:SendEmail",
      "Resource": [
        "arn:aws:ses:eu-west-3:ACCOUNT_ID:identity/guteneo.com",
        "arn:aws:ses:eu-west-3:ACCOUNT_ID:configuration-set/guteneo-production"
      ],
      "Condition": {
        "StringEquals": { "ses:FromAddress": "FROM_ADDRESS" }
      }
    }
  ]
}
```

SES v2 supports identity and configuration-set resources on `ses:SendEmail`. A configuration set is an optional API resource; merely listing its ARN in an IAM allow does not itself require every request to name it. The verified domain's default configuration set and the adapter's explicit field provide event coverage. The sending principal cannot alter either resource. [SES IAM resource/action reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_sesv2.html).

Before activation, run IAM policy simulation with the exact identity and configuration-set ARNs and `ses:FromAddress` context. Verify a different sender, identity, region and configuration set are denied. The operator performs simulation; do not grant IAM simulation or provisioning permissions to the runtime sender. This proves policy evaluation, not remote email delivery.

Transfer `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` directly into Cloudflare secret storage without a credentials file or secret-bearing process arguments. Never use root access keys. `AWS_SESSION_TOKEN` is supported for temporary credentials, but requires renewal before expiration. Configure `AWS_REGION=eu-west-3`, `SES_CONFIGURATION_SET` and exact `SES_SNS_TOPIC_ARN` server-side.

## Application activation still required

- `SES_SANDBOX` must reflect the observed AWS account state. The production runtime rejects sandbox transport. Keep `LIVE_SENDS_ENABLED=false` until the entire live-send path is qualified; changing the flag alone is insufficient.
- The deployed signed webhook endpoint must be reachable. Configured SES POST callbacks now reach signature verification independently of Auth0; all SNS signature/topic and base-environment checks remain mandatory. Qualify durable receipt storage and the real subscription handshake before activation; merely receiving the callback is insufficient.
- Verified tenant-scoped senders, enabled channel policy, funded budget, signed human approval and a trusted email quote remain necessary. The current trusted production quote implementation is fax-specific; business email preparation remains closed pending a corresponding qualified email tariff/quote path.
- The SES adapter handles approved customer dispatches. Auth0 signup verification and password-reset email use Auth0's separately configured email provider; AWS setup does not automatically reconnect those messages.
- A live or mailbox-simulator send requires an explicitly authorized destination and test content. No such send is part of this checklist. Preserve the distinction between SES acceptance, delivery, bounce and complaint evidence.
