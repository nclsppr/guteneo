import { describe, expect, it, vi } from "vitest";
import { inspectPingenReadiness } from "../../packages/providers/pingen-readiness";
import type { Fetcher } from "../../packages/providers/types";

// Fictional intercepted responses only; no real credentials or provider requests.
const config = {
  clientId: "fixture-private-client",
  clientSecret: "fixture-private-secret",
  organisationId: "00000000-0000-4000-8000-000000000001",
  sandbox: false,
};
const token = {
  token_type: "Bearer",
  access_token: "fixture-private-token",
  expires_in: 43200,
  scope: "organisation_read",
};
const organisation = {
  data: {
    id: config.organisationId,
    type: "organisations",
    attributes: {
      name: "PRIVATE ORGANISATION NAME",
      billing_currency: "EUR",
      billing_balance: 123.45,
      default_country: "LU",
      default_address_position: "left",
      address: "PRIVATE ADDRESS",
    },
    links: { self: "https://private.invalid/?secret=never-return" },
  },
  included: [{ email: "private@example.invalid" }],
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

describe("private Pingen account inspection", () => {
  it("exchanges only a read scope and reads exactly the configured organisation", async () => {
    const fetcher = mocked([token, organisation]);
    const result = await inspectPingenReadiness(config, fetcher);
    expect(result).toEqual({
      provider: "pingen",
      mode: "read_only",
      environment: "production",
      status: "ok",
      authenticated: true,
      organisation: {
        configuredIdMatches: true,
        billingCurrency: "EUR",
        defaultCountry: "LU",
        defaultAddressPosition: "left",
      },
      errors: [],
      liveSendingVerified: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [[authUrl, authInit], [orgUrl, orgInit]] = fetcher.mock.calls;
    expect(authUrl).toBe("https://identity.pingen.com/auth/access-tokens");
    expect(authInit?.method).toBe("POST");
    expect(new Headers(authInit?.headers).get("Content-Type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(new Headers(authInit?.headers).has("Authorization")).toBe(false);
    expect(
      Object.fromEntries(new URLSearchParams(String(authInit?.body))),
    ).toEqual({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "organisation_read",
    });
    expect(orgUrl).toBe(
      `https://api.pingen.com/organisations/${config.organisationId}`,
    );
    expect(orgInit?.method).toBe("GET");
    expect(orgInit?.body).toBeUndefined();
    expect(new Headers(orgInit?.headers).get("Authorization")).toBe(
      `Bearer ${token.access_token}`,
    );
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.redirect).toBe("manual");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE|fixture-private|example|123\.45|00000000|https:/,
    );
  });

  it("uses separate canonical sandbox hosts without changing the operation set", async () => {
    const fetcher = mocked([token, organisation]);
    const result = await inspectPingenReadiness(
      { ...config, sandbox: true },
      fetcher,
    );
    expect(result.environment).toBe("sandbox");
    expect(result.liveSendingVerified).toBe(false);
    expect(
      fetcher.mock.calls.map(([url]) => new URL(String(url)).origin),
    ).toEqual([
      "https://identity-staging.pingen.com",
      "https://api-staging.pingen.com",
    ]);
  });

  it("rejects missing credentials and organisation path injection before network access", async () => {
    const fetcher = mocked([]);
    for (const invalid of [
      { clientId: "" },
      { clientSecret: "" },
      { clientSecret: "fixture\nsecret" },
      { clientSecret: "s".repeat(4097) },
      { organisationId: "../letters" },
      { organisationId: "organisation?include=letters" },
      { organisationId: "o".repeat(129) },
    ]) {
      const result = await inspectPingenReadiness(
        { ...config, ...invalid },
        fetcher,
      );
      expect(result.errors).toEqual([
        { stage: "configuration", code: "configuration_invalid" },
      ]);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects broadened token scopes and malformed tokens before any organisation request", async () => {
    for (const invalid of [
      { scope: "organisation_read letter" },
      { scope: "letter" },
      { access_token: "" },
      { access_token: "private\nheader" },
      { token_type: "Basic" },
      { expires_in: 0 },
      { expires_in: 86401 },
    ]) {
      const fetcher = mocked([{ ...token, ...invalid }]);
      const result = await inspectPingenReadiness(config, fetcher);
      expect(result.status).toBe("error");
      expect(result.authenticated).toBe(false);
      expect(result.errors[0].stage).toBe("authentication");
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toMatch(/fixture|private/);
    }
    const noScope = { ...token, scope: undefined };
    expect(
      (await inspectPingenReadiness(config, mocked([noScope, organisation])))
        .status,
    ).toBe("ok");
  });

  it("does not report another organisation or follow provider links", async () => {
    const fetcher = mocked([
      token,
      {
        ...organisation,
        data: {
          ...organisation.data,
          id: "00000000-0000-4000-8000-000000000002",
        },
      },
    ]);
    const result = await inspectPingenReadiness(config, fetcher);
    expect(result.organisation).toBeNull();
    expect(result.authenticated).toBe(true);
    expect(result.errors).toEqual([
      { stage: "organisation", code: "response_scope_mismatch" },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps HTTP failures, redirects and exceptions limited to safe diagnostic codes", async () => {
    for (const response of [
      new Response("fixture-private-secret", { status: 403 }),
      new Response("private@example.invalid", {
        status: 302,
        headers: { Location: "https://private.invalid" },
      }),
      new Error("fixture-private-token in request body"),
      Object.assign(new Error("fixture-private-secret"), {
        name: "TimeoutError",
      }),
    ]) {
      const fetcher = mocked([response]);
      const result = await inspectPingenReadiness(config, fetcher);
      expect(result.status).toBe("error");
      expect(result.errors[0].stage).toBe("authentication");
      expect(result.errors[0].code).toBe(
        response instanceof Response
          ? "http_error"
          : response.name === "TimeoutError"
            ? "request_timeout"
            : "request_failed",
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toMatch(/private|https:|Location/);
    }
    const deniedOrg = await inspectPingenReadiness(
      config,
      mocked([token, new Response("PRIVATE", { status: 403 })]),
    );
    expect(deniedOrg.errors).toEqual([
      { stage: "organisation", code: "http_error", httpStatus: 403 },
    ]);
  });

  it("bounds both response bodies and rejects malformed or wrong-type organisation data", async () => {
    for (const response of [
      new Response(" ".repeat(64 * 1024 + 1)),
      new Response("PRIVATE not JSON"),
      { data: { ...organisation.data, type: "letters" } },
      {
        data: {
          ...organisation.data,
          attributes: { default_country: "PRIVATE" },
        },
      },
    ]) {
      const result = await inspectPingenReadiness(
        config,
        mocked([token, response]),
      );
      expect(result.organisation).toBeNull();
      expect(result.errors).toEqual([
        { stage: "organisation", code: "invalid_response" },
      ]);
      expect(JSON.stringify(result)).not.toContain("PRIVATE");
    }
    const tooLargeToken = await inspectPingenReadiness(
      config,
      mocked([new Response(" ".repeat(64 * 1024 + 1))]),
    );
    expect(tooLargeToken.errors).toEqual([
      { stage: "authentication", code: "invalid_response" },
    ]);
  });

  it("preserves unknown optional values without inferring send readiness or funding", async () => {
    const result = await inspectPingenReadiness(
      config,
      mocked([
        token,
        {
          data: {
            id: config.organisationId,
            type: "organisations",
            attributes: {},
          },
        },
      ]),
    );
    expect(result.status).toBe("ok");
    expect(result.organisation).toEqual({
      configuredIdMatches: true,
      billingCurrency: null,
      defaultCountry: null,
      defaultAddressPosition: null,
    });
    expect(result.liveSendingVerified).toBe(false);
  });

  it("never reuses an access token across inspections or accounts", async () => {
    const fetcher = mocked([
      token,
      organisation,
      { ...token, access_token: "second-token" },
      organisation,
    ]);
    await inspectPingenReadiness(config, fetcher);
    await inspectPingenReadiness(
      { ...config, clientId: "second-client" },
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(
      new Headers(fetcher.mock.calls[3][1]?.headers).get("Authorization"),
    ).toBe("Bearer second-token");
  });
});
