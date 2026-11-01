import { describe, it, expect, vi } from "vitest";
import {
  PINGEN_DESTINATION_RESTRICTIONS_URL,
  PingenDestinationAvailabilityReader,
  parsePingenDestinationRestrictions,
} from "../../packages/providers/pingen-destination-availability";
import {
  PINGEN_POSTAL_COUNTRY_CODES,
  postalCountryName,
} from "../../packages/contracts/src/postal-destinations";
import {
  destinationRestrictionsHtml,
  destinationRestrictionsResponse,
} from "../helpers/pingen-destinations";
import type { Fetcher } from "../../packages/providers";

describe("official Pingen destination reference", () => {
  it("resolves every accepted destination and restrictions-specific aliases", () => {
    for (const country of PINGEN_POSTAL_COUNTRY_CODES) {
      expect(
        parsePingenDestinationRestrictions(
          destinationRestrictionsHtml([postalCountryName(country)]),
        ),
      ).toEqual({ unavailable: [country], delayed: [] });
    }
    expect(
      parsePingenDestinationRestrictions(
        destinationRestrictionsHtml([
          "Belarus",
          "Russia",
          "Ukraine",
          "Cuba",
          "North Korea (DRPK)",
          "Burma",
          "Iran",
          "Sudan",
          "Syria",
          "Yemen",
          "Chad / Republic of Chad",
        ]),
      ),
    ).toEqual({
      unavailable: [
        "BY",
        "CU",
        "IR",
        "KP",
        "MM",
        "RU",
        "SD",
        "SY",
        "TD",
        "UA",
        "YE",
      ],
      delayed: [],
    });
  });

  it.each([
    destinationRestrictionsHtml().replace(
      "Countries with restricted mail delivery",
      "Unavailable countries",
    ),
    destinationRestrictionsHtml().replace(
      "Countries with delayed mail delivery",
      "",
    ),
    destinationRestrictionsHtml(["Unrecognized country"]),
    destinationRestrictionsHtml(["France"], ["France"]),
    destinationRestrictionsHtml().replaceAll("none", ""),
    destinationRestrictionsHtml().replace(
      "<thead><tr>",
      "<thead><tr><td>ignored</td>",
    ),
    destinationRestrictionsHtml() + destinationRestrictionsHtml(),
  ])("fails closed for incomplete or changed reference structure", (html) => {
    expect(() => parsePingenDestinationRestrictions(html)).toThrow(
      "postal_destination_availability_unavailable",
    );
  });

  it("separates delayed from unavailable and shares only a current bounded observation", async () => {
    let time = Date.UTC(2026, 10, 1);
    const fetcher = vi.fn<Fetcher>().mockImplementation(async (url, init) => {
      expect(String(url)).toBe(PINGEN_DESTINATION_RESTRICTIONS_URL);
      expect(init?.redirect).toBe("manual");
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      time += 1000;
      return destinationRestrictionsResponse(["Russia"], ["Canada"]);
    });
    const reader = new PingenDestinationAvailabilityReader(fetcher, () => time);
    const [first, concurrent] = await Promise.all([
      reader.read(),
      reader.read(),
    ]);
    expect(first).toBe(concurrent);
    expect(first.observedAt).toBe(new Date(time).toISOString());
    expect(first.expiresAt).toBe(new Date(time + 300_000).toISOString());
    expect(first.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(reader.assertAvailable("RU")).rejects.toThrow(
      "postal_destination_unavailable",
    );
    await expect(reader.assertAvailable("CA")).resolves.toBe(first);
    await expect(reader.assertAvailable("XK")).rejects.toThrow(
      "postal_country_not_supported",
    );
    time += 300_000;
    fetcher.mockRejectedValueOnce(new Error("reference unavailable"));
    await expect(reader.read()).rejects.toThrow(
      "postal_destination_availability_unavailable",
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(reader.read()).resolves.not.toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([
    () =>
      new Response("redirect", {
        status: 302,
        headers: { Location: "https://elsewhere.example" },
      }),
    () => Response.json({ countries: [] }),
    () =>
      new Response("x".repeat(256 * 1024 + 1), {
        headers: { "Content-Type": "text/html" },
      }),
    () =>
      new Response(new Uint8Array([0xff]), {
        headers: { "Content-Type": "text/html" },
      }),
  ])(
    "does not treat transport or encoding failures as an empty closure list",
    async (response) => {
      const reader = new PingenDestinationAvailabilityReader(async () =>
        response(),
      );
      await expect(reader.assertAvailable("US")).rejects.toThrow(
        "postal_destination_availability_unavailable",
      );
    },
  );
});
