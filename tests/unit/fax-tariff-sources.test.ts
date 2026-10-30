import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  parseFaxFx,
  parseFaxPagePrice,
  parseFaxRateDeck,
  parseFaxTariffCatalog,
  readCurrentFaxTariffCatalog,
  inspectTelnyxFaxTariffCatalog,
} from "../../apps/api/src/fax-tariff-refresh";
import type { Env } from "../../apps/api/src/env";

const header =
  "ISO,Country,Origination Prefixes,Destination Prefixes,Description,Interval 1,Interval N,Rate,Price Per Call,Exact Match";
const route =
  'LU,"Luxembourg, test",Local,3524,Trunking Outbound Minute - Luxembourg - Fixed - Local,60,60,0.005600001,,';
async function* chunks(text: string, size = 7) {
  const bytes = new TextEncoder().encode(text);
  for (let i = 0; i < bytes.length; i += size) yield bytes.slice(i, i + size);
}
describe("automatic fax commercial source parsing", () => {
  it("qualifies the hosted catalog with exactly one authenticated GET and no database or secret disclosure", async () => {
    const apiKey = "isolated_catalog_credential";
    const link =
      "https://portal.telnyx.com/downloads/global_conversational/current_fixture.csv";
    const payload = JSON.stringify({
      data: {
        global_conversational: { tariff_link: link },
        ignored_provider_field: "isolated_nonpublic_value",
      },
    });
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe("https://api.telnyx.com/v2/tariffs");
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("manual");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        `Bearer ${apiKey}`,
      );
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(payload);
    });
    const databaseRead = vi.fn(() => {
      throw new Error("Database must not be accessed");
    });
    const env = Object.defineProperty(
      { MODE: "production", ENVIRONMENT: "production", TELNYX_API_KEY: apiKey },
      "DB",
      { get: databaseRead },
    ) as Env;
    const result = await inspectTelnyxFaxTariffCatalog(env, {
      fetcher,
      now: () => Date.parse("2026-10-30T10:00:00.000Z"),
    });
    expect(result).toMatchObject({
      status: "ok",
      provider: "telnyx",
      mode: "read_only",
      catalog: "global_conversational",
      rateDeckUrl: link,
      observedAt: "2026-10-30T10:00:00.000Z",
      sha256: createHash("sha256").update(payload).digest("hex"),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(databaseRead).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(apiKey);
    expect(JSON.stringify(result)).not.toContain("isolated_nonpublic_value");
  });
  it("does no request or database work when private catalog inspection is unconfigured", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const databaseRead = vi.fn(() => {
      throw new Error("Database must not be accessed");
    });
    for (const config of [
      {
        MODE: "simulation",
        ENVIRONMENT: "production",
        TELNYX_API_KEY: "fixture",
      },
      { MODE: "production", ENVIRONMENT: "staging", TELNYX_API_KEY: "fixture" },
      { MODE: "production", ENVIRONMENT: "production" },
    ]) {
      const env = Object.defineProperty(config, "DB", {
        get: databaseRead,
      }) as Env;
      expect(
        await inspectTelnyxFaxTariffCatalog(env, { fetcher }),
      ).toMatchObject({
        status: "unavailable",
        code: "CONFIGURATION_REQUIRED",
      });
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(databaseRead).not.toHaveBeenCalled();
  });
  it("returns only a closed failure code when the private catalog credential is refused", async () => {
    const result = await inspectTelnyxFaxTariffCatalog(
      {
        MODE: "production",
        ENVIRONMENT: "production",
        TELNYX_API_KEY: "fixture",
      } as Env,
      {
        fetcher: async () =>
          new Response("untrusted private provider response", { status: 401 }),
      },
    );
    expect(result).toMatchObject({
      status: "unavailable",
      code: "SOURCE_HTTP",
    });
    expect(JSON.stringify(result)).not.toContain("untrusted");
    expect(result).not.toHaveProperty("rateDeckUrl");
  });
  it("bounds private catalog reads even when an injected transport ignores cancellation", async () => {
    vi.useFakeTimers();
    try {
      const pending = readCurrentFaxTariffCatalog(
        "isolated_fixture",
        async () => new Promise<Response>(() => {}),
      );
      const rejected = expect(pending).rejects.toThrow("SOURCE_TIMEOUT");
      await vi.advanceTimersByTimeAsync(10_000);
      await rejected;
    } finally {
      vi.useRealTimers();
    }
  });
  it("selects only the currently returned global conversational catalog link", () => {
    const link =
      "https://portal.telnyx.com/downloads/global_conversational/version_2.csv";
    expect(
      parseFaxTariffCatalog(
        JSON.stringify({
          data: { global_conversational: { tariff_link: link } },
        }),
      ),
    ).toBe(link);
    for (const value of [
      "{",
      "null",
      "[]",
      JSON.stringify({ data: {} }),
      JSON.stringify({
        data: {
          global_conversational: {
            tariff_link: "https://foreign.invalid/deck.csv",
          },
        },
      }),
      JSON.stringify({
        data: {
          global_conversational: { tariff_link: `${link}?token=unexpected` },
        },
      }),
    ])
      expect(() => parseFaxTariffCatalog(value)).toThrow("SOURCE_INVALID");
  });
  it("streams quoted CSV across arbitrary chunks and preserves exact fractional nanoUSD", async () => {
    const csv = `${header}\r\n${route}\r\n`;
    expect(await parseFaxRateDeck(chunks(csv), "+3524")).toEqual({
      minuteNanoUsd: 5_600_001,
      initialSeconds: 60,
      incrementSeconds: 60,
      sha256: createHash("sha256").update(csv).digest("hex"),
      bytes: new TextEncoder().encode(csv).length,
    });
  });
  it.each([
    `${header}\n${route}\n${route}`,
    `${header}\n${route}\n${route.replace(",3524,", ",35242,")}`,
    `${header}\n${route.replace(",60,60,", ",30,60,")}`,
    `${header}\n${route.replace(",0.005600001,,", ",0.005600001,0,")}`,
    `${header}\n${route.replace("0.005600001", "0.0056000001")}`,
    `${header}\n${route.replace("0.005600001", "-0.1")}`,
    `${header}\n${route.replace("Fixed", "Mobile")}`,
    `${header}\n${route.replace('"Luxembourg, test"', '"unterminated')}`,
    `${header}\n${route.replace('"Luxembourg, test"', '"closed"suffix')}`,
    `${header.replace("Rate", "Changed Rate")}\n${route}`,
  ])(
    "rejects ambiguous routes and changed or malformed CSV semantics",
    async (csv) => {
      await expect(parseFaxRateDeck(chunks(csv), "+3524")).rejects.toThrow(
        "SOURCE_INVALID",
      );
    },
  );
  it("bounds a quoted row before allocating the entire commercial deck", async () => {
    await expect(
      parseFaxRateDeck(
        chunks(`${header}\nLU,"${"x".repeat(65_537)}`, 4096),
        "+3524",
      ),
    ).rejects.toThrow("SOURCE_TOO_LARGE");
  });
  it("rejects an oversized stream chunk before decoding or retaining its body", async () => {
    async function* oversized() {
      yield new Uint8Array(40 * 1024 * 1024 + 1);
    }
    await expect(parseFaxRateDeck(oversized(), "+3524")).rejects.toThrow(
      "SOURCE_TOO_LARGE",
    );
  });
  it("rejects unsupported registrations and sub-cent rounding", async () => {
    await expect(
      parseFaxRateDeck(chunks(`${header}\n${route}`), "+33"),
    ).rejects.toThrow("SOURCE_INVALID");
    expect(
      parseFaxPagePrice(
        "<p>Send a fax via API $0.007000001 per page + SIP Trunking usage for transmission</p>",
      ),
    ).toBe(7_000_001);
    expect(() =>
      parseFaxPagePrice(
        "<script>Send a fax via API $0.007 per page + SIP Trunking usage for transmission</script>",
      ),
    ).toThrow("SOURCE_INVALID");
  });
  it("uses the actual dated ECB rate exactly and refuses stale, future or entity data", () => {
    const xml =
      "<Cube time='2026-10-30'><Cube currency='USD' rate='1.250000'/></Cube>";
    expect(parseFaxFx(xml, "2026-10-30T12:00:00.000Z")).toMatchObject({
      date: "2026-10-30",
      numerator: 4,
      denominator: 5,
    });
    for (const invalid of [
      xml.replace("2026-10-30", "2026-10-22"),
      xml.replace("2026-10-30", "2026-10-31"),
      `<!DOCTYPE x [<!ENTITY y '2'>]>${xml}`,
      xml + xml,
      xml.replace("1.250000", "0.000000"),
    ])
      expect(() => parseFaxFx(invalid, "2026-10-30T12:00:00.000Z")).toThrow(
        "SOURCE_INVALID",
      );
  });
});
