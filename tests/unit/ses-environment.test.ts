import { describe, expect, it } from "vitest";
import { sesTransportSandbox } from "../../apps/api/src/ses-environment";
import type { Env } from "../../apps/api/src/env";

const fixture = (overrides: Partial<Env> = {}) =>
  ({
    ENVIRONMENT: "production",
    MODE: "production",
    AWS_REGION: "eu-west-3",
    SES_ACCOUNT_ID: "123456789012",
    SES_SANDBOX: "true",
    SES_SNS_TOPIC_ARN: "arn:aws:sns:eu-west-3:123456789012:fixture-events",
    SES_VERIFIED_RECIPIENTS: "Allowed@example.invalid",
    ...overrides,
  }) as Env;

describe("real SES sandbox recipient boundary", () => {
  it("permits an explicitly qualified recipient without changing application production mode", () => {
    const env = fixture();
    expect(sesTransportSandbox(env, "Allowed@example.invalid")).toBe(true);
    expect(env.MODE).toBe("production");
  });
  it("does not treat sandbox as permission to send to arbitrary or differently cased identities", () => {
    for (const recipient of [
      "stranger@example.invalid",
      "allowed@example.invalid",
      "Allowed@EXAMPLE.INVALID",
    ])
      expect(() => sesTransportSandbox(fixture(), recipient)).toThrow(
        /destinataire vérifié/,
      );
  });
  it("rejects missing, wildcard and malformed qualification lists", () => {
    for (const list of [
      undefined,
      "",
      "*@example.invalid",
      "Allowed@example.invalid,",
      "Allowed@example.invalid\nOther@example.invalid",
    ])
      expect(() =>
        sesTransportSandbox(
          fixture({ SES_VERIFIED_RECIPIENTS: list }),
          "Allowed@example.invalid",
        ),
      ).toThrow();
  });
  it("requires coherent region and account attribution for both real transport modes", () => {
    for (const mode of ["true", "false"])
      for (const invalid of [
        { SES_ACCOUNT_ID: undefined },
        { SES_ACCOUNT_ID: "222222222222" },
        { AWS_REGION: "eu-west-1" },
        { SES_SNS_TOPIC_ARN: undefined },
      ])
        expect(() =>
          sesTransportSandbox(
            fixture({ SES_SANDBOX: mode, ...invalid }),
            "Allowed@example.invalid",
          ),
        ).toThrow();
  });
  it("never interprets an absent or invalid mode as production permission", () => {
    for (const mode of [undefined, "", "TRUE", "live"])
      expect(() =>
        sesTransportSandbox(
          fixture({ SES_SANDBOX: mode }),
          "Allowed@example.invalid",
        ),
      ).toThrow();
  });
  it("uses the broader SES recipient scope only after explicit production configuration", () => {
    expect(
      sesTransportSandbox(
        fixture({ SES_SANDBOX: "false", SES_VERIFIED_RECIPIENTS: undefined }),
        "recipient@example.invalid",
      ),
    ).toBe(false);
    expect(() =>
      sesTransportSandbox(
        fixture({ SES_SANDBOX: "false" }),
        "recipient@example.invalid\r\nBcc: injected@example.invalid",
      ),
    ).toThrow();
  });
});
