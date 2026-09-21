import { fr as t } from "./i18n";
import { formatCutoffHour, postalCutoffForCountry } from "./postal-cutoff";
import "./postal-cutoff-notice.css";

export function PostalCutoffNotice({
  country,
  deliveryProduct,
}: {
  country?: string;
  deliveryProduct?: unknown;
}) {
  const rule = postalCutoffForCountry(country);
  if (!rule) return null;
  const code = country?.trim().toUpperCase();
  const copy = t.postalCutoff;
  const exception =
    deliveryProduct !== "fast"
      ? code === "DE"
        ? copy.germanEconomy
        : code === "CH"
          ? copy.swissBulk
          : undefined
      : undefined;
  return (
    <aside className="postal-cutoff-notice" aria-label={copy.title}>
      <div aria-live="polite" aria-atomic="true">
        <p className="postal-cutoff-time">
          <strong>
            {copy.title} : {formatCutoffHour(rule.hour)}
          </strong>
          {rule.fridayHour != null && (
            <>
              {" "}
              ({formatCutoffHour(rule.fridayHour)} {copy.friday})
            </>
          )}
          {" · "}
          {copy.timeZone}
        </p>
        <p>
          {copy.handover[rule.handover]} {copy.nonWorkingDays}
        </p>
        {exception && <p>{exception}</p>}
      </div>
      <a href="/#postal-cutoff-faq" target="_blank" rel="noopener noreferrer">
        {copy.details} <span className="sr-only">{copy.newTab}</span>
      </a>
    </aside>
  );
}
