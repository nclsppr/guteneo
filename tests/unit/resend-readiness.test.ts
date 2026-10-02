import { describe, expect, it, vi } from "vitest";
import { inspectResendReadiness } from "../../apps/api/src/resend-readiness";
import { assertConfiguration, type Env } from "../../apps/api/src/env";
import { getCapabilities } from "../../apps/api/src/index";
import { createLiveDeliveryQuoteConfig } from "../../apps/api/src/live-providers";

const env = {
  ENVIRONMENT: "production",
  MODE: "production",
  APP_ORIGIN: "https://guteneo.com",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_fixture",
  RESEND_ACCOUNT_ID: "account-fixture",
  RESEND_DOMAIN_ID: "domain-fixture",
  RESEND_VERIFIED_DOMAIN: "guteneo.com",
  RESEND_WEBHOOK_SECRET: "whsec_fixture",
} as Env;
describe("Resend readiness", () => {
  it("reads only the configured domain and does not imply sending qualification", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        id: "domain-fixture",
        name: "guteneo.com",
        status: "verified",
        records: [{ private: "not returned" }],
      }),
    );
    expect(await inspectResendReadiness(env, fetcher)).toMatchObject({
      ok: true,
      domainVerified: true,
      accountBindingVerified: false,
      transportQualified: false,
      emailsSent: 0,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toMatchObject([
      "https://api.resend.com/domains/domain-fixture",
      { method: "GET", redirect: "manual" },
    ]);
  });
  it("does not upgrade a sending-only key or attempt a test send", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 403 }));
    expect(await inspectResendReadiness(env, fetcher)).toMatchObject({
      ok: false,
      code: "RESEND_DOMAIN_READ_NOT_PERMITTED",
      emailsSent: 0,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps callback verification reachable without browser identity configuration", () => {
    expect(() =>
      assertConfiguration(
        env,
        new Request("https://guteneo.com/webhooks/resend", { method: "POST" }),
      ),
    ).not.toThrow();
    expect(() =>
      assertConfiguration(
        env,
        new Request("https://guteneo.com/api/send", { method: "POST" }),
      ),
    ).toThrow("IDENTITY_NOT_CONFIGURED");
  });
  it("reports Resend and its independent disabled transport switch without AWS dependencies", () => {
    const capabilities = getCapabilities({
      ...env,
      LIVE_SENDS_ENABLED: "true",
      LIVE_SEND_CHANNELS: "email",
      RESEND_SENDS_ENABLED: "false",
    });
    expect(capabilities.liveSending).toBe(false);
    expect(capabilities.channels[1]).toMatchObject({
      provider: "Resend",
      status: "configured_not_live_validated",
      liveSending: false,
    });
    expect(
      createLiveDeliveryQuoteConfig(env).liveDeliveryIdentity.email,
    ).toEqual({
      provider: "resend",
      accountId: "account-fixture",
      routeId: "resend:domain-fixture:guteneo.com",
    });
  });
});
