# Private SES subscription confirmation

This operator procedure confirms only the Guteneo SES event subscription. It does not send an email, enable customer dispatches, or grant AWS credentials to the local machine. The fixed topic is `arn:aws:sns:eu-west-3:982055099242:guteneo-ses-events`; the intended HTTPS endpoint is `https://guteneo-app.nclsppr.workers.dev/webhooks/ses`.

The deployed webhook validates the exact topic and SNS SignatureVersion 2 before storing a minimal receipt. The receipt contains no original signature or `SubscribeURL`; the helper checks that receipt's type, topic and timestamps, and cannot independently reverify the original signature. Only `SubscriptionConfirmation` receipts with `unrecognized` status and a token younger than 48 hours are eligible. [AWS confirmation token lifetime](https://docs.aws.amazon.com/cli/latest/reference/sns/subscribe.html).

## Prepare CloudShell

Use the already authenticated AWS CloudShell for the owning account. First inspect account identity and the pending subscription without requesting its token:

```sh
aws sts get-caller-identity --query Account --output text
aws sns list-subscriptions-by-topic --region eu-west-3 --topic-arn arn:aws:sns:eu-west-3:982055099242:guteneo-ses-events --query 'Subscriptions[].{Arn:SubscriptionArn,Owner:Owner,Protocol:Protocol,Endpoint:Endpoint}' --output json
python3 -c 'import boto3; from botocore.config import Config; print("CloudShell SNS client available")'
```

The account must be `982055099242`, the protocol `https`, and the endpoint the deployed Guteneo backend above. Stop if another account or endpoint is selected. The following fixed command prompts for a token without echo, keeps it in process memory, signs the request with CloudShell credentials and prints only a validated subscription ARN. It refuses noninteractive input and suppresses provider errors that could contain sensitive fields. It never places the token in process arguments, environment variables, shell history or a credentials file.

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
    token = getpass.getpass("Jeton SNS Guteneo (saisie masquée) : ")
    if not re.fullmatch(r"[A-Za-z0-9+/=_-]{16,4096}", token):
        raise RuntimeError("Invalid token")
    client = boto3.client("sns", region_name="eu-west-3", config=Config(retries={"max_attempts": 0}, connect_timeout=10, read_timeout=20))
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

Use the returned public subscription ARN to inspect `get-subscription-attributes`. Verify the topic, owning account, exact HTTPS endpoint, `PendingConfirmation=false`, `ConfirmationWasAuthenticated=true` and `RawMessageDelivery=false`. The helper does not infer AWS success and does not purge anything automatically. If a request times out, inspect the subscription before trying again.

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

Read back only the receipt ID and `json_type(payload_json,'$.metadata.confirmationToken')` to prove removal; never select the raw payload for routine evidence. Preserve the original nonsecret receipt metadata and record the AWS subscription ARN separately as deployment evidence.

## Local evidence

`node --test tests/security/confirm-ses-subscription.test.mjs` validates exact topic/type/status, expiry, bounded JSON, a fixed read-only query, generic failure messages, Host/Origin/capability checks, single-use serving and the masked copy flow in Chromium and WebKit. Browser tests substitute an in-memory fixture clipboard and never touch the user's actual clipboard. They do not prove a real AWS confirmation.
