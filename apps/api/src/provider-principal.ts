import { AwsClient } from "aws4fetch";
import { boundedText } from "../../../packages/providers/transport";
import type { Fetcher } from "../../../packages/providers/types";
import type { Env } from "./env";

/** Identifies only the already-installed SES sender. No SES send/admin request. */
export async function inspectSesPrincipal(env: Env, fetcher: Fetcher = fetch) {
  try {
    if (
      !env.AWS_ACCESS_KEY_ID ||
      !env.AWS_SECRET_ACCESS_KEY ||
      env.AWS_REGION !== "eu-west-3"
    )
      return { ok: false, code: "SES_INSPECTION_NOT_CONFIGURED" };
    const signer = new AwsClient({
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      sessionToken: env.AWS_SESSION_TOKEN || undefined,
      service: "sts",
      region: "eu-west-3",
      retries: 0,
    });
    const signed = await signer.sign("https://sts.eu-west-3.amazonaws.com/", {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "Action=GetCallerIdentity&Version=2011-06-15",
      signal: AbortSignal.timeout(15_000),
    });
    const response = await fetcher(signed);
    if (!response.ok) return { ok: false, code: "SES_PRINCIPAL_CHECK_FAILED" };
    const body = await boundedText(response, 16_384);
    const accounts = [...body.matchAll(/<Account>(\d{12})<\/Account>/g)];
    const arns = [...body.matchAll(/<Arn>([^<]+)<\/Arn>/g)];
    const account = "982055099242";
    const arn = `arn:aws:iam::${account}:user/guteneo-ses-sender`;
    if (
      accounts.length !== 1 ||
      arns.length !== 1 ||
      accounts[0][1] !== account ||
      arns[0][1] !== arn
    )
      return { ok: false, code: "SES_PRINCIPAL_MISMATCH" };
    return {
      ok: true,
      account,
      arn,
      region: "eu-west-3",
      emailsSent: 0,
      transportQualified: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      ok: false,
      code: /illegal invocation|incorrect.*this/i.test(message)
        ? "SES_INSPECTION_INVALID_INVOCATION"
        : error instanceof Error &&
            ["TimeoutError", "AbortError"].includes(error.name)
          ? "SES_INSPECTION_TIMEOUT"
          : "SES_PRINCIPAL_CHECK_FAILED",
    };
  }
}
