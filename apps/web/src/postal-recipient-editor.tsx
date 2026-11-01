import { useEffect, useMemo } from "react";
import {
  isPingenPostalCountry,
  PINGEN_POSTAL_COUNTRY_CODES,
  postalCountryLineRequired,
  postalCountryName,
  type PostalCountry,
} from "../../../packages/contracts/src/postal-destinations";
import type { PostalRecipient } from "../../../packages/contracts/src/postal-recipient";
import { Field, useRefreshOnFocus, useResource } from "./components";
import { formatLocale, t } from "./locale";
import { msg } from "./messages";

export type PostalDestinationCatalogue = {
  countries: PostalCountry[];
  unavailableCountries: PostalCountry[];
  delayedCountries: PostalCountry[];
  observedAt: string;
  expiresAt: string;
  sourceUrl: string;
  sourceSha256: string;
};

/** Recheck public availability without discarding the person's address draft. */
export function usePostalDestinationCatalogue(enabled: boolean) {
  const resource = useResource<PostalDestinationCatalogue>(
    enabled ? "/postal/destinations" : null,
  );
  useRefreshOnFocus(resource.refresh, enabled);
  const expiresAt = resource.data?.expiresAt;
  useEffect(() => {
    if (!enabled || resource.loading || resource.error || !expiresAt) return;
    const expires = Date.parse(expiresAt);
    if (!Number.isFinite(expires)) return;
    const timer = window.setTimeout(
      resource.refresh,
      Math.max(1000, Math.min(300_000, expires - Date.now() + 50)),
    );
    return () => window.clearTimeout(timer);
  }, [enabled, expiresAt, resource.loading, resource.error, resource.refresh]);
  return resource;
}

export function postalDraftUsesAddressBlock(
  draft: Record<string, string>,
  explicitlySelected: boolean,
) {
  return (
    explicitlySelected || !["FR", "LU", "DE"].includes(draft.country ?? "FR")
  );
}

/** Keep the legacy wire object exact. Printed blocks remain ordered lines. */
export function postalRecipientFromDraft(
  draft: Record<string, string>,
  block: boolean,
): PostalRecipient {
  const country = draft.country ?? "FR";
  if (!isPingenPostalCountry(country))
    throw new Error(msg("Choose a supported postal destination."));
  if (block || !["FR", "LU", "DE"].includes(country))
    return {
      country,
      addressLines: (draft.addressLines ?? "")
        .replace(/\r\n?/g, "\n")
        .split("\n"),
    };
  return {
    name: draft.name ?? "",
    line1: draft.line1 ?? "",
    postalCode: draft.postalCode ?? "",
    city: draft.city ?? "",
    country: country as "FR" | "LU" | "DE",
  };
}

export function PostalRecipientFields({
  value,
  onChange,
  block,
  onBlockChange,
  defaultCountry,
  catalogue,
  catalogueLoading = false,
  catalogueError = false,
  onCatalogueRetry,
  simulated = false,
}: {
  value: Record<string, string>;
  onChange: (field: string, value: string) => void;
  block: boolean;
  onBlockChange: (block: boolean) => void;
  defaultCountry?: string;
  catalogue?: PostalDestinationCatalogue;
  catalogueLoading?: boolean;
  catalogueError?: boolean;
  onCatalogueRetry?: () => void;
  simulated?: boolean;
}) {
  const locale = formatLocale();
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    const collator = new Intl.Collator(locale);
    return PINGEN_POSTAL_COUNTRY_CODES.map((code) => ({
      code,
      name: names.of(code === "XZ" ? "XK" : code) ?? postalCountryName(code),
    })).sort((left, right) => collator.compare(left.name, right.name));
  }, [locale]);
  const country = value.country ?? "FR";
  const legacyCountry = ["FR", "LU", "DE"].includes(country);
  const unavailable = catalogue?.unavailableCountries.includes(
    country as PostalCountry,
  );
  const delayed = catalogue?.delayedCountries.includes(
    country as PostalCountry,
  );
  const countryLine =
    isPingenPostalCountry(country) && defaultCountry
      ? postalCountryLineRequired(country, defaultCountry)
      : undefined;
  return (
    <>
      <Field
        label={t.dispatch.country}
        hint={
          simulated
            ? msg("This example uses simulated prices and sends no letter.")
            : msg(
                "Availability and the exact price are checked for each letter before approval.",
              )
        }
      >
        <select
          value={country}
          onChange={(event) => onChange("country", event.target.value)}
          required
        >
          {countries.map(({ code, name }) => {
            const closed = catalogue?.unavailableCountries.includes(code);
            return (
              <option key={code} value={code} disabled={closed}>
                {name}
                {closed ? ` — ${msg("Temporarily unavailable")}` : ""}
              </option>
            );
          })}
        </select>
      </Field>
      {catalogueLoading && (
        <p className="field-hint" role="status">
          {msg("Checking postal destinations…")}
        </p>
      )}
      {catalogueError && (
        <div role="alert" className="field-hint">
          <p>
            {msg(
              "Postal destination availability could not be checked. Try again before preparing the letter.",
            )}
          </p>
          {onCatalogueRetry && (
            <button
              type="button"
              className="text-button"
              onClick={onCatalogueRetry}
            >
              {msg("Try again")}
            </button>
          )}
        </div>
      )}
      {unavailable && (
        <p className="field-hint" role="alert">
          {msg(
            "Mail to this destination is temporarily unavailable.",
          )}
        </p>
      )}
      {delayed && (
        <p className="field-hint" role="status">
          {msg(
            "Delivery delays are currently reported for this destination.",
          )}
        </p>
      )}
      <Field label={msg("Address format")}>
        <select
          value={block ? "address_block" : "legacy_fields"}
          onChange={(event) =>
            onBlockChange(event.target.value === "address_block")
          }
        >
          <option value="legacy_fields" disabled={!legacyCountry}>
            {msg("Separate fields (France, Luxembourg, Germany)")}
          </option>
          <option value="address_block">
            {msg("Complete printed address")}
          </option>
        </select>
      </Field>
      {block ? (
        <Field
          label={msg("Complete printed address")}
          hint={
            msg(
              "Enter 2 to 6 lines in their printed order, including the recipient name. Keep regions, postcodes and extra address lines where they belong; do not leave blank lines.",
            ) +
            (countryLine === true && isPingenPostalCountry(country)
              ? ` ${msg("Last country line: {0}.", postalCountryName(country))}`
              : countryLine === false
                ? ` ${msg("This domestic address must not contain a country line.")}`
                : ` ${msg("Include the country line required by the address instructions.")}`)
          }
        >
          <textarea
            value={value.addressLines ?? ""}
            onChange={(event) => onChange("addressLines", event.target.value)}
            rows={6}
            maxLength={965}
            autoComplete="off"
            spellCheck={false}
            required
          />
        </Field>
      ) : (
        <>
          <Field label={t.dispatch.postalName}>
            <input
              value={value.name ?? ""}
              onChange={(event) => onChange("name", event.target.value)}
              autoComplete="name"
              required
              maxLength={200}
            />
          </Field>
          <Field label={t.dispatch.line1}>
            <input
              value={value.line1 ?? ""}
              onChange={(event) => onChange("line1", event.target.value)}
              autoComplete="address-line1"
              required
              maxLength={200}
            />
          </Field>
          <div className="field-row">
            <Field label={t.dispatch.postalCode}>
              <input
                value={value.postalCode ?? ""}
                onChange={(event) => onChange("postalCode", event.target.value)}
                autoComplete="postal-code"
                required
                maxLength={30}
              />
            </Field>
            <Field label={t.dispatch.city}>
              <input
                value={value.city ?? ""}
                onChange={(event) => onChange("city", event.target.value)}
                autoComplete="address-level2"
                required
                maxLength={200}
              />
            </Field>
          </div>
        </>
      )}
    </>
  );
}
