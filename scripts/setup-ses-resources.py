#!/usr/bin/env python3
"""Prepare Guteneo SES resources from an authorized AWS CloudShell session.

Default: offline plan. --apply: reconcile only the fixed Guteneo resources below.
No access-key creation, subscription, email send, account upgrade or DNS mutation.
Never prints AWS responses, credentials, recipients or subscription tokens.
"""

import argparse
import json
import logging
import sys
import time

ACCOUNT = "982055099242"
REGION = "eu-west-3"
DOMAIN = "guteneo.com"
FROM_ADDRESS = "notifications@guteneo.com"
CONFIG_SET = "guteneo-production"
TOPIC = "guteneo-ses-events"
USER = "guteneo-ses-sender"
POLICY = "GuteneoSesSendEmail"
EVENT_DESTINATION = "guteneo-sns-events"
IDENTITY_ARN = f"arn:aws:ses:{REGION}:{ACCOUNT}:identity/{DOMAIN}"
CONFIG_ARN = f"arn:aws:ses:{REGION}:{ACCOUNT}:configuration-set/{CONFIG_SET}"
TOPIC_ARN = f"arn:aws:sns:{REGION}:{ACCOUNT}:{TOPIC}"
USER_ARN = f"arn:aws:iam::{ACCOUNT}:user/{USER}"
TAGS = [{"Key": "Project", "Value": "guteneo"},
        {"Key": "ManagedBy", "Value": "guteneo-ses-setup"}]
EVENTS = ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "REJECT", "RENDERING_FAILURE"]
SEND_POLICY = {
    "Version": "2012-10-17",
    "Statement": [{
        "Sid": "SendGuteneoMail", "Effect": "Allow", "Action": "ses:SendEmail",
        "Resource": [IDENTITY_ARN, CONFIG_ARN],
        "Condition": {"StringEquals": {"ses:FromAddress": FROM_ADDRESS}},
    }],
}
SES_PUBLISH = {
    "Sid": "GuteneoSesEvents", "Effect": "Allow",
    "Principal": {"Service": "ses.amazonaws.com"}, "Action": "sns:Publish",
    "Resource": TOPIC_ARN,
    "Condition": {"StringEquals": {"AWS:SourceAccount": ACCOUNT,
                                  "AWS:SourceArn": CONFIG_ARN}},
}
DESTINATION = {"Enabled": True, "MatchingEventTypes": EVENTS,
               "SnsDestination": {"TopicArn": TOPIC_ARN}}


class SetupError(Exception):
    """Only fixed, non-sensitive diagnostic codes enter this exception."""


def require(condition, code):
    if not condition:
        raise SetupError(code)


def emit(event, **details):
    print(json.dumps({"event": event, **details}, sort_keys=True), flush=True)


def missing(operation, codes, **arguments):
    from botocore.exceptions import ClientError
    try:
        return operation(**arguments)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") in codes:
            return None
        raise


def owned(tags, kind):
    values = {tag["Key"]: tag["Value"] for tag in tags}
    require(all(values.get(tag["Key"]) == tag["Value"] for tag in TAGS),
            f"foreign_{kind}_name_collision")


def pages(client, operation, result, **arguments):
    return [entry for page in client.get_paginator(operation).paginate(**arguments)
            for entry in page.get(result, [])]


def preserve_owner_policy(raw):
    """Preserve owner statements; refuse unexpected cross-account grants."""
    policy = json.loads(raw)
    statements = policy.get("Statement", [])
    require(isinstance(statements, list), "sns_policy_shape")
    preserved = []
    for statement in statements:
        if statement.get("Sid") == SES_PUBLISH["Sid"]:
            continue
        principal = statement.get("Principal", {})
        principal_aws = principal.get("AWS") if isinstance(principal, dict) else None
        owner = statement.get("Condition", {}).get("StringEquals", {})
        source_owner = owner.get("AWS:SourceOwner", owner.get("aws:SourceOwner"))
        explicit_owner = principal_aws in (ACCOUNT, f"arn:aws:iam::{ACCOUNT}:root")
        source_owner_grant = principal_aws == "*" and source_owner == ACCOUNT
        require(statement.get("Effect") == "Allow" and
                statement.get("Resource") == TOPIC_ARN and
                (explicit_owner or source_owner_grant), "unexpected_sns_policy_grant")
        preserved.append(statement)
    require(bool(preserved), "sns_owner_policy_missing")
    return {**policy, "Statement": preserved + [SES_PUBLISH]}


def simulate(iam):
    cases = [
        ("exact", [IDENTITY_ARN, CONFIG_ARN], FROM_ADDRESS, "allowed"),
        ("other_from", [IDENTITY_ARN, CONFIG_ARN], "other@guteneo.com", "implicitDeny"),
        ("other_region", [IDENTITY_ARN.replace(REGION, "eu-west-1"),
                          CONFIG_ARN.replace(REGION, "eu-west-1")], FROM_ADDRESS, "implicitDeny"),
        ("other_set", [CONFIG_ARN + "-other"], FROM_ADDRESS, "implicitDeny"),
        ("other_identity", [IDENTITY_ARN.replace(DOMAIN, "example.com")],
         FROM_ADDRESS, "implicitDeny"),
    ]
    for name, resources, sender, expected in cases:
        verified = False
        for attempt in range(6):
            response = iam.simulate_principal_policy(
                PolicySourceArn=USER_ARN, ActionNames=["ses:SendEmail"],
                ResourceArns=resources, ContextEntries=[{
                    "ContextKeyName": "ses:FromAddress", "ContextKeyValues": [sender],
                    "ContextKeyType": "string",
                }],
            )
            decisions = {}
            for evaluation in response.get("EvaluationResults", []):
                require(not evaluation.get("MissingContextValues"), "iam_missing_context")
                if evaluation.get("EvalResourceName") in resources:
                    decisions[evaluation["EvalResourceName"]] = evaluation["EvalDecision"]
                for item in evaluation.get("ResourceSpecificResults", []):
                    require(not item.get("MissingContextValues"), "iam_missing_context")
                    decisions[item["EvalResourceName"]] = item["EvalResourceDecision"]
            verified = set(decisions) == set(resources) and all(
                value == expected for value in decisions.values())
            if verified:
                break
            # IAM changes are eventually consistent. This never retries an email.
            if attempt < 5:
                time.sleep(2)
        require(verified, f"iam_simulation_{name}_failed")
        emit("iam_simulation_passed", case=name, decision=expected)


def apply():
    import boto3
    from botocore.config import Config
    logging.getLogger("boto3").setLevel(logging.CRITICAL)
    logging.getLogger("botocore").setLevel(logging.CRITICAL)
    config = Config(connect_timeout=10, read_timeout=30,
                    retries={"mode": "standard", "max_attempts": 2})
    session = boto3.Session(region_name=REGION)
    sts = session.client("sts", config=config)
    require(sts.get_caller_identity()["Account"] == ACCOUNT, "wrong_aws_account")
    ses = session.client("sesv2", config=config)
    sns = session.client("sns", config=config)
    iam = session.client("iam", config=config)

    # Preflight every existing target before performing mutations.
    identity = ses.get_email_identity(EmailIdentity=DOMAIN)
    require(identity.get("IdentityType") == "DOMAIN", "identity_is_not_domain")
    require(identity.get("ConfigurationSetName") in (None, "", CONFIG_SET),
            "identity_has_other_default_configuration_set")
    state = missing(ses.get_configuration_set, {"NotFoundException"},
                    ConfigurationSetName=CONFIG_SET)
    if state:
        owned(ses.list_tags_for_resource(ResourceArn=CONFIG_ARN).get("Tags", []), "ses")
        require(not state.get("TrackingOptions") and not state.get("ArchivingOptions") and
                not state.get("DeliveryOptions", {}).get("SendingPoolName"),
                "unexpected_ses_optional_services")
        destinations = ses.get_configuration_set_event_destinations(
            ConfigurationSetName=CONFIG_SET).get("EventDestinations", [])
        require(all(item.get("Name") == EVENT_DESTINATION for item in destinations),
                "unexpected_ses_event_destination")
    else:
        destinations = []
    topic = missing(sns.get_topic_attributes, {"NotFound", "NotFoundException"},
                    TopicArn=TOPIC_ARN)
    topic_policy = None
    if topic:
        owned(sns.list_tags_for_resource(ResourceArn=TOPIC_ARN).get("Tags", []), "sns")
        require(topic["Attributes"].get("FifoTopic", "false") == "false", "sns_not_standard")
        topic_policy = preserve_owner_policy(topic["Attributes"]["Policy"])
    user = missing(iam.get_user, {"NoSuchEntity"}, UserName=USER)
    if user:
        require(user["User"]["Arn"] == USER_ARN, "unexpected_iam_user_path")
        owned(pages(iam, "list_user_tags", "Tags", UserName=USER), "iam")
        require(not pages(iam, "list_attached_user_policies", "AttachedPolicies", UserName=USER),
                "iam_managed_policies_present")
        require(not pages(iam, "list_groups_for_user", "Groups", UserName=USER),
                "iam_groups_present")
        require(set(pages(iam, "list_user_policies", "PolicyNames", UserName=USER)) <= {POLICY},
                "iam_other_inline_policies_present")
        require(missing(iam.get_login_profile, {"NoSuchEntity"}, UserName=USER) is None,
                "iam_console_login_present")
        require(not user["User"].get("PermissionsBoundary"), "iam_boundary_requires_review")
    emit("preflight_passed", account=ACCOUNT, region=REGION)

    if not state:
        ses.create_configuration_set(
            ConfigurationSetName=CONFIG_SET, Tags=TAGS,
            SendingOptions={"SendingEnabled": False}, DeliveryOptions={"TlsPolicy": "REQUIRE"},
            SuppressionOptions={"SuppressedReasons": ["BOUNCE", "COMPLAINT"]},
        )
    ses.put_configuration_set_sending_options(ConfigurationSetName=CONFIG_SET, SendingEnabled=False)
    ses.put_configuration_set_delivery_options(ConfigurationSetName=CONFIG_SET, TlsPolicy="REQUIRE")
    ses.put_configuration_set_suppression_options(
        ConfigurationSetName=CONFIG_SET, SuppressedReasons=["BOUNCE", "COMPLAINT"])
    ses.put_email_identity_configuration_set_attributes(
        EmailIdentity=DOMAIN, ConfigurationSetName=CONFIG_SET)
    emit("ses_configuration_prepared", sendingEnabled=False, tlsPolicy="REQUIRE")

    if not topic:
        created = sns.create_topic(Name=TOPIC, Tags=TAGS, Attributes={"SignatureVersion": "2"})
        require(created["TopicArn"] == TOPIC_ARN, "unexpected_created_topic_arn")
        attributes = sns.get_topic_attributes(TopicArn=TOPIC_ARN)["Attributes"]
        topic_policy = preserve_owner_policy(attributes["Policy"])
    sns.set_topic_attributes(TopicArn=TOPIC_ARN, AttributeName="SignatureVersion", AttributeValue="2")
    sns.set_topic_attributes(TopicArn=TOPIC_ARN, AttributeName="Policy",
                             AttributeValue=json.dumps(topic_policy, separators=(",", ":")))
    destination_method = ses.update_configuration_set_event_destination if destinations else (
        ses.create_configuration_set_event_destination)
    destination_method(ConfigurationSetName=CONFIG_SET, EventDestinationName=EVENT_DESTINATION,
                       EventDestination=DESTINATION)
    emit("sns_events_prepared", topicArn=TOPIC_ARN, signatureVersion="2")

    if not user:
        created_user = iam.create_user(UserName=USER, Tags=TAGS)
        require(created_user["User"]["Arn"] == USER_ARN, "unexpected_created_user_arn")
    iam.put_user_policy(UserName=USER, PolicyName=POLICY, PolicyDocument=json.dumps(SEND_POLICY))
    simulate(iam)

    # Read back each application-relevant setting instead of assuming write success.
    result = ses.get_configuration_set(ConfigurationSetName=CONFIG_SET)
    require(result.get("SendingOptions", {}).get("SendingEnabled") is False, "ses_send_gate_readback")
    require(result.get("DeliveryOptions", {}).get("TlsPolicy") == "REQUIRE", "ses_tls_readback")
    require(set(result.get("SuppressionOptions", {}).get("SuppressedReasons", [])) ==
            {"BOUNCE", "COMPLAINT"}, "ses_suppression_readback")
    result = ses.get_email_identity(EmailIdentity=DOMAIN)
    require(result.get("ConfigurationSetName") == CONFIG_SET, "ses_default_readback")
    result = sns.get_topic_attributes(TopicArn=TOPIC_ARN)["Attributes"]
    require(result.get("SignatureVersion") == "2", "sns_signature_readback")
    require(json.loads(result["Policy"]) == topic_policy, "sns_policy_readback")
    result = ses.get_configuration_set_event_destinations(
        ConfigurationSetName=CONFIG_SET).get("EventDestinations", [])
    require(len(result) == 1 and result[0].get("Name") == EVENT_DESTINATION and
            result[0].get("Enabled") is True and
            set(result[0].get("MatchingEventTypes", [])) == set(EVENTS) and
            result[0].get("SnsDestination") == DESTINATION["SnsDestination"], "ses_events_readback")
    result = iam.get_user_policy(UserName=USER, PolicyName=POLICY)["PolicyDocument"]
    require(result == SEND_POLICY, "iam_policy_readback")
    require(missing(iam.get_login_profile, {"NoSuchEntity"}, UserName=USER) is None,
            "iam_console_readback")
    emit("setup_complete", account=ACCOUNT, region=REGION, configurationSet=CONFIG_SET,
         topicArn=TOPIC_ARN, senderPrincipal=USER_ARN, sendingEnabled=False,
         accessKeysCreated=0, subscriptionsCreated=0, emailsSent=0)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Reconcile the fixed resources in AWS")
    arguments = parser.parse_args()
    if not arguments.apply:
        emit("offline_plan", account=ACCOUNT, region=REGION, configurationSet=CONFIG_SET,
             topicArn=TOPIC_ARN, senderPrincipal=USER_ARN, sendingPolicy=SEND_POLICY,
             sendingEnabled=False, accessKeysCreated=0, subscriptionsCreated=0, emailsSent=0)
        return 0
    try:
        apply()
        return 0
    except SetupError as error:
        emit("setup_failed", code=str(error))
    except ImportError:
        emit("setup_failed", code="boto3_required_in_official_cloudshell")
    except Exception as error:
        # Deliberately omit arbitrary provider error messages and request/response data.
        code = getattr(error, "response", {}).get("Error", {}).get("Code", "unexpected_error")
        emit("setup_failed", code=code if isinstance(code, str) and code.isalnum() else "aws_error")
    return 1


if __name__ == "__main__":
    sys.exit(main())
