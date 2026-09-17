import { describe, expect, it, vi } from "vitest";
import { inspectSesPrincipal } from "../../apps/api/src/provider-principal";
import type { Env } from "../../apps/api/src/env";
import type { Fetcher } from "../../packages/providers/types";

const env = {
  AWS_ACCESS_KEY_ID: "AKIAFIXTUREONLY",
  AWS_SECRET_ACCESS_KEY: "fixture-not-an-aws-key",
  AWS_REGION: "eu-west-3",
} as Env;
const body =
  "<GetCallerIdentityResponse><GetCallerIdentityResult><Arn>arn:aws:iam::982055099242:user/guteneo-ses-sender</Arn><Account>982055099242</Account></GetCallerIdentityResult></GetCallerIdentityResponse>";

describe("private SES principal inspection", () => {
  it("signs only one fixed read-only STS operation and returns only the intended identity", async () => {
    const network = vi.fn<Fetcher>(async () => new Response(body));
    expect(await inspectSesPrincipal(env, network)).toEqual({
      ok: true,
      account: "982055099242",
      arn: "arn:aws:iam::982055099242:user/guteneo-ses-sender",
      region: "eu-west-3",
      emailsSent: 0,
      transportQualified: false,
    });
    expect(network).toHaveBeenCalledTimes(1);
    const request = network.mock.calls[0][0] as unknown as Request;
    expect(request.url).toBe("https://sts.eu-west-3.amazonaws.com/");
    expect(request.method).toBe("POST");
    expect(request.redirect).toBe("manual");
    expect(await request.text()).toBe(
      "Action=GetCallerIdentity&Version=2011-06-15",
    );
    expect(request.headers.get("Authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
  });
  it("refuses missing setup, a different or ambiguous principal and oversized or private failures", async () => {
    const network = vi.fn(async () => new Response(body));
    expect(
      await inspectSesPrincipal({ ...env, AWS_REGION: "us-east-1" }, network),
    ).toMatchObject({ ok: false });
    expect(network).not.toHaveBeenCalled();
    for (const text of [
      body.replace("user/guteneo-ses-sender", "root"),
      body + "<Account>982055099242</Account>",
    ])
      expect(
        await inspectSesPrincipal(env, async () => new Response(text)),
      ).toEqual({ ok: false, code: "SES_PRINCIPAL_MISMATCH" });
    for (const network of [
      async () => new Response("Private AWS message", { status: 403 }),
      async () => new Response("x".repeat(16_385)),
      async () => {
        throw new Error("private-credential-fixture");
      },
    ])
      expect(await inspectSesPrincipal(env, network)).toEqual({
        ok: false,
        code: "SES_PRINCIPAL_CHECK_FAILED",
      });
  });
});
