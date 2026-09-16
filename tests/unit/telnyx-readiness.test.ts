import { describe, expect, it, vi } from "vitest";
import { inspectTelnyxReadiness } from "../../packages/providers/telnyx-readiness";
import type { Fetcher } from "../../packages/providers/types";

// Deterministic fictional provider fixtures; these are not live account evidence.
const config = {
  apiKey: "fixture-private-key",
  connectionId: "1000000000000000001",
};
const profileId = "1000000000000000002";
const app = {
  data: {
    id: config.connectionId,
    active: true,
    application_name: "must not escape",
    webhook_event_url: "https://private.invalid/callback?token=hidden",
    outbound: { outbound_voice_profile_id: profileId, channel_limit: 2 },
  },
};
function number(
  numberId = "1000000000000000003",
  connectionId = config.connectionId,
) {
  return {
    id: numberId,
    connection_id: connectionId,
    phone_number: "+352000000000",
    country_iso_alpha2: "LU",
    status: "active",
    t38_fax_gateway_enabled: true,
    hd_voice_enabled: false,
    external_pin: "never-return",
    customer_reference: "never-return",
  };
}
function page(data: unknown[] = [number()], pageNumber = 1, totalPages = 1) {
  return { data, meta: { page_number: pageNumber, total_pages: totalPages } };
}
const profile = {
  data: {
    id: profileId,
    enabled: true,
    whitelisted_destinations: ["LU", "FR"],
    concurrent_call_limit: 2,
    max_destination_rate: 0.1,
    daily_spend_limit: "5.00",
    daily_spend_limit_enabled: true,
    call_recording: { call_recording_caller_phone_numbers: ["private"] },
  },
};
function mocked(responses: unknown[]) {
  return vi.fn<Fetcher>(async () => {
    const value = responses.shift();
    if (value instanceof Error) throw value;
    if (value instanceof Response) return value;
    if (value === undefined) throw new Error("Unexpected extra request");
    return new Response(JSON.stringify(value));
  });
}

describe("read-only Telnyx inspection", () => {
  it("retains validated restrictions while an invalid monetary setting stays unknown", async () => {
    const result = await inspectTelnyxReadiness(
      config,
      mocked([
        app,
        page(),
        {
          data: {
            ...profile.data,
            daily_spend_limit: "provider-invalid-private-value",
          },
        },
      ]),
    );
    expect(result.status).toBe("partial");
    expect(result.outboundProfile?.whitelistedDestinations).toEqual([
      "LU",
      "FR",
    ]);
    expect(result.outboundProfile?.maxDestinationRate).toBe(0.1);
    expect(result.outboundProfile?.dailySpendLimitUsd).toBeNull();
    expect(result.errors).toContainEqual({
      stage: "outbound_profile",
      code: "invalid_response",
      invalidFields: ["daily_spend_limit"],
    });
    expect(JSON.stringify(result)).not.toContain(
      "provider-invalid-private-value",
    );
  });

  it.each([
    { rate: null, spend: null, expectedRate: null, expectedSpend: null },
    { rate: "0.0125", spend: 5, expectedRate: 0.0125, expectedSpend: "5" },
  ])(
    "accepts unset and decimal-string provider limits",
    async ({ rate, spend, expectedRate, expectedSpend }) => {
      const result = await inspectTelnyxReadiness(
        config,
        mocked([
          app,
          page(),
          {
            data: {
              ...profile.data,
              max_destination_rate: rate,
              daily_spend_limit: spend,
            },
          },
        ]),
      );
      expect(result.status).toBe("ok");
      expect(result.outboundProfile?.maxDestinationRate).toBe(expectedRate);
      expect(result.outboundProfile?.dailySpendLimitUsd).toBe(expectedSpend);
    },
  );

  it("reads only fixed GET routes and projects the configured application, assigned numbers and its profile", async () => {
    const fetcher = mocked([
      app,
      page([number()], 1, 2),
      page([number("1000000000000000004")], 2, 2),
      profile,
    ]);
    const result = await inspectTelnyxReadiness(config, fetcher);
    expect(result.status).toBe("ok");
    expect(result.application).toEqual({
      id: config.connectionId,
      active: true,
      outboundVoiceProfileId: profileId,
      outboundChannelLimit: 2,
    });
    expect(result.numbers).toHaveLength(2);
    expect(result.numbers[0]).toEqual({
      id: "1000000000000000003",
      phoneNumber: "+352000000000",
      status: "active",
      country: "LU",
      features: { t38FaxGatewayEnabled: true, hdVoiceEnabled: false },
    });
    expect(result.numberPagination).toEqual({ pagesRead: 2, complete: true });
    expect(result.outboundProfile).toEqual({
      id: profileId,
      enabled: true,
      whitelistedDestinations: ["LU", "FR"],
      concurrentCallLimit: 2,
      maxDestinationRate: 0.1,
      dailySpendLimitUsd: "5.00",
      dailySpendLimitEnabled: true,
    });
    expect(result.liveSendingVerified).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(4);
    const paths = fetcher.mock.calls.map(([input, init]) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://api.telnyx.com");
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("manual");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.body).toBeUndefined();
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        `Bearer ${config.apiKey}`,
      );
      if (url.pathname === "/v2/phone_numbers") {
        expect(url.searchParams.get("filter[connection_id]")).toBe(
          config.connectionId,
        );
        expect(url.searchParams.get("page[size]")).toBe("100");
      } else expect(url.search).toBe("");
      return url.pathname;
    });
    expect(paths).toEqual([
      `/v2/fax_applications/${config.connectionId}`,
      "/v2/phone_numbers",
      "/v2/phone_numbers",
      `/v2/outbound_voice_profiles/${profileId}`,
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /private|never-return|callback|token|call_recording/,
    );
  });

  it("filters out other connections even if the provider ignores its filter", async () => {
    const result = await inspectTelnyxReadiness(
      config,
      mocked([
        app,
        page([
          number(),
          {
            ...number("1000000000000000005", "1000000000000000006"),
            phone_number: "+33111111111",
          },
        ]),
        profile,
      ]),
    );
    expect(result.status).toBe("partial");
    expect(result.numbers).toHaveLength(1);
    expect(result.numberPagination.complete).toBe(false);
    expect(result.errors).toContainEqual({
      stage: "numbers",
      code: "response_scope_mismatch",
    });
    expect(JSON.stringify(result)).not.toContain("+33111111111");
  });

  it("caps pagination and never follows provider next-page URLs", async () => {
    const responses = Array.from({ length: 4 }, (_, index) => ({
      ...page([number(`100000000000000000${index + 3}`)], index + 1, 100),
      links: { next: "https://unrelated.invalid/steal" },
    }));
    const fetcher = mocked([app, ...responses, profile]);
    const result = await inspectTelnyxReadiness(config, fetcher);
    expect(result.numberPagination).toEqual({ pagesRead: 4, complete: false });
    expect(result.numbers).toHaveLength(4);
    expect(result.errors).toContainEqual({
      stage: "numbers",
      code: "pagination_limit",
    });
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(
      fetcher.mock.calls.every(([url]) =>
        String(url).startsWith("https://api.telnyx.com/v2/"),
      ),
    ).toBe(true);
  });

  it("rejects invalid configuration without any network request", async () => {
    const fetcher = mocked([]);
    for (const invalid of [
      { ...config, connectionId: "../faxes" },
      { ...config, connectionId: "100?other=account" },
      { ...config, apiKey: "secret\nheader" },
      { ...config, apiKey: "" },
    ]) {
      const result = await inspectTelnyxReadiness(invalid, fetcher);
      expect(result.errors).toEqual([
        { stage: "configuration", code: "configuration_invalid" },
      ]);
      expect(result.status).toBe("error");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not traverse an application or outbound profile with the wrong returned ID", async () => {
    const fetcher = mocked([{ data: { ...app.data, id: profileId } }]);
    const result = await inspectTelnyxReadiness(config, fetcher);
    expect(result.application).toBeNull();
    expect(result.errors).toEqual([
      { stage: "application", code: "response_scope_mismatch" },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const wrongProfile = await inspectTelnyxReadiness(
      config,
      mocked([
        app,
        page(),
        { data: { ...profile.data, id: config.connectionId } },
      ]),
    );
    expect(wrongProfile.outboundProfile).toBeNull();
    expect(wrongProfile.errors).toContainEqual({
      stage: "outbound_profile",
      code: "response_scope_mismatch",
    });
  });

  it("keeps provider failures bounded and does not return response bodies or raw exceptions", async () => {
    const denied = await inspectTelnyxReadiness(
      config,
      mocked([
        new Response(
          `secret:${config.apiKey};https://private.invalid/?recipient=hidden`,
          { status: 403 },
        ),
      ]),
    );
    expect(denied.errors).toEqual([
      { stage: "application", code: "http_error", httpStatus: 403 },
    ]);
    const failure = await inspectTelnyxReadiness(
      config,
      mocked([
        new Error(
          `secret:${config.apiKey};https://private.invalid/?recipient=hidden`,
        ),
      ]),
    );
    expect(failure.errors).toEqual([
      { stage: "application", code: "request_failed" },
    ]);
    expect(JSON.stringify([denied, failure])).not.toMatch(
      /fixture-private-key|recipient|https:/,
    );
  });

  it("preserves unknown values separately from reported false, zero and unlimited settings", async () => {
    const result = await inspectTelnyxReadiness(
      config,
      mocked([
        app,
        page(),
        {
          data: {
            id: profileId,
            enabled: false,
            concurrent_call_limit: null,
            max_destination_rate: 0,
            daily_spend_limit_enabled: false,
            whitelisted_destinations: [],
          },
        },
      ]),
    );
    expect(result.outboundProfile).toMatchObject({
      enabled: false,
      concurrentCallLimit: null,
      maxDestinationRate: 0,
      dailySpendLimitUsd: null,
      dailySpendLimitEnabled: false,
      whitelistedDestinations: [],
    });
    const unknown = await inspectTelnyxReadiness(
      config,
      mocked([app, page(), { data: { id: profileId } }]),
    );
    expect(unknown.outboundProfile).toMatchObject({
      enabled: null,
      concurrentCallLimit: "unknown",
      whitelistedDestinations: null,
      maxDestinationRate: null,
      dailySpendLimitUsd: null,
    });
    const absent = await inspectTelnyxReadiness(
      config,
      mocked([
        { data: { id: config.connectionId, active: false } },
        page([], 1, 0),
      ]),
    );
    expect(absent.application?.active).toBe(false);
    expect(absent.outboundProfile).toBeNull();
    expect(absent.numberPagination.complete).toBe(true);
    expect(absent.liveSendingVerified).toBe(false);
  });

  it("rejects malformed pagination, repeated records and oversized JSON without claiming complete results", async () => {
    for (const response of [
      { data: [number()] },
      page([number()], 2, 2),
      page([number(), number()]),
      new Response(" ".repeat(512 * 1024 + 1)),
      page([{ ...number(), phone_number: "secret text" }]),
    ]) {
      const result = await inspectTelnyxReadiness(
        config,
        mocked([app, response, profile]),
      );
      expect(result.status).toBe("partial");
      expect(result.errors).toContainEqual({
        stage: "numbers",
        code: "invalid_response",
      });
      expect(result.numberPagination.complete).toBe(false);
      expect(result.outboundProfile?.id).toBe(profileId);
      expect(JSON.stringify(result)).not.toContain("secret text");
    }
  });
});
