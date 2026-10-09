# Private SES subscription confirmation

This operator procedure confirms only the Guteneo SES event subscription. It does not send an email, enable customer dispatches, or grant AWS credentials to the local machine. The fixed topic is `arn:aws:sns:eu-west-3:982055099242:guteneo-ses-events`; the intended HTTPS endpoint is **`https://guteneo.com/webhooks/ses`**. The workers.dev endpoint belongs to the historical September handshake below.

## Current status — 2026-10-09

Canonical migration is **pending, not performed**. No fresh AWS inventory or confirmation has been obtained: local AWS authentication is unavailable and the browser requires sign-in. The operator restored the old Cloudflare workers.dev route at **2026-10-09T20:57:49Z**, with `enabled=true` and `previews_enabled=false`, to preserve the documented callback until the authenticated AWS handoff. That route check does not prove current SNS configuration or SES delivery. Keep the old route available until the canonical confirmation, exact read-back and removal of the old subscription have been proved; do not deploy its disablement before those checks.

Replace the subscription on the existing topic. `Endpoint` is not among the supported `SetSubscriptionAttributes` parameters; use `Subscribe` and `ConfirmSubscription`, then remove the verified old ARN only after the replacement is qualified. Do not run the broader `setup-ses-resources.py --apply` script for this change. Keep the SNS topic/signature, SES identity/configuration set, credentials and all sending gates unchanged. [Subscription attributes](https://docs.aws.amazon.com/cli/latest/reference/sns/set-subscription-attributes.html).

The deployed webhook validates the exact topic and SNS SignatureVersion 2 before storing a minimal receipt. The receipt contains no original signature or `SubscribeURL`; the helper checks that receipt's type, topic and timestamps, and cannot independently reverify the original signature. Only `SubscriptionConfirmation` receipts with `unrecognized` status and a token younger than 48 hours are eligible. [AWS confirmation token lifetime](https://docs.aws.amazon.com/cli/latest/reference/sns/subscribe.html).

## Prepare CloudShell

Use an authenticated AWS CloudShell session for the owning Guteneo account; restore that session before proceeding. These commands are for that checked CloudShell session only, never a local default AWS profile. First inspect account identity, SNS signature configuration and subscriptions without requesting any token:

```sh
aws sts get-caller-identity --region eu-west-3 --query Account --output text
aws sns get-topic-attributes --region eu-west-3 --topic-arn arn:aws:sns:eu-west-3:982055099242:guteneo-ses-events --query 'Attributes.{TopicArn:TopicArn,Owner:Owner,SignatureVersion:SignatureVersion}' --output json
aws sns list-subscriptions-by-topic --region eu-west-3 --topic-arn arn:aws:sns:eu-west-3:982055099242:guteneo-ses-events --query 'Subscriptions[].{Arn:SubscriptionArn,Owner:Owner,Protocol:Protocol,Canonical:Endpoint==`"https://guteneo.com/webhooks/ses"`,Historical:Endpoint==`"https://guteneo-app.nclsppr.workers.dev/webhooks/ses"`}' --output json
python3 -c 'import boto3; from botocore.config import Config; print("CloudShell SNS client available")'
```

Require account `982055099242`, the exact topic, region `eu-west-3` and `SignatureVersion="2"`. AWS CLI pagination must remain enabled so the complete topic inventory is inspected. The closed endpoint comparisons deliberately omit raw endpoint values. An entry with both endpoint matches false is unknown and blocks closure until privately qualified. Read `get-subscription-attributes` for the historical ARN `arn:aws:sns:eu-west-3:982055099242:guteneo-ses-events:54d3e8f5-538e-4c83-b32b-806634db1430` before selecting it for eventual removal. Verify its exact historical HTTPS endpoint and owner in memory; record only matches and nonsecret status. Also inspect any canonical subscription. If an existing canonical subscription is already confirmed and equivalent, reuse it rather than creating a duplicate. Stop on ambiguous or unexpected state. [Paginated topic inventory](https://docs.aws.amazon.com/cli/latest/reference/sns/list-subscriptions-by-topic.html).

Check any existing `FilterPolicy`, `FilterPolicyScope`, `DeliveryPolicy` and `RedrivePolicy` privately. Preserve deliberately configured behavior on the replacement; do not add a filter, dead-letter queue or custom policy by default. The following minimal creation command applies only when the read-back shows no custom subscription attributes to preserve. Record its UTC start time and returned ARN:

```sh
AWS_MAX_ATTEMPTS=1 AWS_RETRY_MODE=standard aws sns subscribe --region eu-west-3 --topic-arn arn:aws:sns:eu-west-3:982055099242:guteneo-ses-events --protocol https --notification-endpoint https://guteneo.com/webhooks/ses --attributes RawMessageDelivery=false --return-subscription-arn --query SubscriptionArn --output text
```

This sends the SNS subscription-control callback to the canonical backend, not a business email. `AWS_MAX_ATTEMPTS=1` counts the initial request and disables automatic AWS CLI mutation retries; read back any uncertain outcome before an explicit repeat. An ARN from `Subscribe` alone does not prove confirmation. Keep the old confirmed subscription during the handshake. Do not call `Publish`, `SendEmail`, change a sending gate, provision a new topic or expand the installed sender's permissions. The private `ProviderInspection.inspectSes()` method proves only the dedicated STS sender identity and cannot inventory or manage SNS subscriptions. [HTTPS subscription and token lifetime](https://docs.aws.amazon.com/cli/latest/reference/sns/subscribe.html), [AWS CLI retry configuration](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-retries.html).

Before confirmation, require a new signed-handler receipt whose occurrence and receipt times follow this canonical subscription request. The helper selects the latest eligible token for the **topic**, without retaining the target endpoint or independently reverifying the original envelope. Its age check alone does not establish that it belongs to this migration. Inspect only the receipt ID, type, topic and timestamps before transfer; never dump its payload. Stop if a fresh receipt cannot be tied to this request or another simultaneous subscription attempt makes the selection ambiguous. The final AWS endpoint read-back remains mandatory.

The following fixed command prompts for a token without echo, keeps it in process memory, signs the request with CloudShell credentials and prints only a validated subscription ARN. It refuses noninteractive input and suppresses provider errors that could contain sensitive fields. It never places the token in process arguments, environment variables, shell history or a credentials file. It rechecks the owning account before accepting the token:

```sh
python3 -c '
import getpass, re, sys
import boto3
from botocore.config import Config
topic = "arn:aws:sns:eu-west-3:982055099242:guteneo-ses-events"
token = None
try:
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        raise RuntimeError("Interactive terminal required")
    session = boto3.Session(region_name="eu-west-3")
    config = Config(retries={"max_attempts": 0}, connect_timeout=10, read_timeout=20)
    if session.client("sts", config=config).get_caller_identity().get("Account") != "982055099242":
        raise RuntimeError("Unexpected AWS account")
    token = getpass.getpass("Jeton SNS Guteneo (saisie masquée) : ")
    if not re.fullmatch(r"[A-Za-z0-9+/=_-]{16,4096}", token):
        raise RuntimeError("Invalid token")
    client = session.client("sns", config=config)
    result = client.confirm_subscription(TopicArn=topic, Token=token, AuthenticateOnUnsubscribe="true")
    arn = result.get("SubscriptionArn", "")
    if not re.fullmatch(re.escape(topic) + r":[0-9a-f-]{36}", arn):
        raise RuntimeError("Unexpected result")
    print(arn)
except BaseException:
    print("Confirmation indisponible. Vérifiez la souscription AWS avant toute nouvelle tentative.", file=sys.stderr)
    sys.exit(1)
finally:
    token = None
'
```

Leave CloudShell waiting at its masked prompt before transferring the token. `AuthenticateOnUnsubscribe="true"` requires this signed request and prevents anonymous unsubscribe. [AWS ConfirmSubscription](https://docs.aws.amazon.com/cli/latest/reference/sns/confirm-subscription.html).

## Transfer without displaying the token

Run locally:

```sh
node scripts/confirm-ses-subscription.mjs
```

The helper performs one fixed read-only query against `guteneo-production`. Wrangler output is captured only in memory; diagnostic output and Wrangler logs are disabled. The terminal prints a loopback capability URL, receipt ID, topic and age, never the token. No AWS API is called by the helper.

Open that URL once in Safari. It contains a readonly password field and **Copier le jeton**. The copy button uses only a fixed script authorized by a unique CSP nonce; it performs no network request and cannot read the clipboard. This button is necessary because browsers disable native copying from password fields. Click it, return to CloudShell's already waiting masked prompt, paste and press Return. Do not inspect page source, raw accessibility values, browser storage or the clipboard. Never paste the value into a conversation or an ordinary shell prompt.

The helper enforces exact Host/Origin, a 256-bit path capability, `no-store`, no frames, no external resources and no form submission. It serves the token only once and closes after ten minutes at most, or sooner if the confirmation token expires. The field and its value attribute are cleared after copying or expiry. Close the tab and overwrite the clipboard with public text after the transfer. JavaScript strings and browser/OS clipboard memory cannot be guaranteed to be physically erased; use a trusted local machine.

## Verify before purging the receipt token

Use the returned public subscription ARN to inspect `get-subscription-attributes`. Require the exact topic and account `982055099242`, protocol `https`, endpoint **`https://guteneo.com/webhooks/ses`**, `PendingConfirmation="false"`, `ConfirmationWasAuthenticated="true"` and `RawMessageDelivery="false"`, plus the subscription behavior qualified above. Compare raw values privately and retain only closed matches, statuses, UTC time and public ARN as evidence. The helper does not infer AWS success and does not purge anything automatically. If any provider request times out, inspect the actual subscriptions before trying again; do not infer failure or confirmation. [AWS read-back attributes](https://docs.aws.amazon.com/cli/latest/reference/sns/get-subscription-attributes.html).

After that proof, remove only the consumed token from its exact receipt. Replace `VERIFIED_EVENT_ID` with the public receipt ID printed by the helper; do not put the token into SQL:

```sql
UPDATE provider_receipts
SET payload_json=json_remove(payload_json,'$.metadata.confirmationToken')
WHERE provider='ses'
  AND event_id='VERIFIED_EVENT_ID'
  AND status='unrecognized'
  AND json_extract(payload_json,'$.metadata.type')='SubscriptionConfirmation'
  AND json_extract(payload_json,'$.metadata.topicArn')='arn:aws:sns:eu-west-3:982055099242:guteneo-ses-events';
```

Require exactly one changed row. Read back only the receipt ID and `json_type(payload_json,'$.metadata.confirmationToken')` to prove removal; never select the raw payload for routine evidence. Preserve the original nonsecret receipt metadata and record the AWS subscription ARN separately as deployment evidence. No application subscription-ARN setting needs updating; the runtime trusts the unchanged `SES_SNS_TOPIC_ARN`.

## Retire the historical dependency

Only after the canonical subscription and token cleanup above are proved, use authenticated `Unsubscribe` for the exact old ARN freshly verified during preparation. Prefix the AWS CLI mutation with `AWS_MAX_ATTEMPTS=1 AWS_RETRY_MODE=standard` as above to disable automatic retries. Do not remove the topic or canonical subscription. Run the complete paginated topic inventory again; prove the canonical subscription remains confirmed and no subscription endpoint depends on `guteneo-app.nclsppr.workers.dev`. Record public ARNs and endpoint-match booleans, not unrelated endpoint values or tokens. An uncertain unsubscribe result requires read-back before any repeat. [Authenticated unsubscribe](https://docs.aws.amazon.com/cli/latest/reference/sns/unsubscribe.html).

The operator can then close workers.dev and verify that guteneo.com still serves the application. This handshake and read-back qualify notification configuration only; they do not prove business email delivery, AWS production access or customer consent. Update the dated evidence only after the actual provider checks.

## Local evidence

`node --test tests/security/confirm-ses-subscription.test.mjs` validates exact topic/type/status, expiry, bounded JSON, a fixed read-only query, generic failure messages, Host/Origin/capability checks, single-use serving and the masked copy flow in Chromium and WebKit. Browser tests substitute an in-memory fixture clipboard and never touch the user's actual clipboard. They do not prove a real AWS confirmation.

## Completed handshake — 2026-09-17

The September procedure completed for subscription `arn:aws:sns:eu-west-3:982055099242:guteneo-ses-events:54d3e8f5-538e-4c83-b32b-806634db1430`, at the historical endpoint **`https://guteneo-app.nclsppr.workers.dev/webhooks/ses`**. Exact topic, owner and HTTPS endpoint matched; pending confirmation was false, authenticated confirmation true, and raw delivery false. Only the consumed token in receipt `e2c768ce-a778-444d-bfdd-8b3102494ee0` was removed, with one changed row and a null token-type read-back. The helper was stopped and no email was sent. This preserved record is not proof that the canonical migration has occurred.
