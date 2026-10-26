import { SECURE_RETENTION_PRICES } from "../../../packages/contracts/src/secure-distribution";
import { Field } from "./components";
import { money } from "./api";
import { msg } from "./messages";

export type DocumentEmailMode = "my_documents" | "attachment";
export function DocumentDeliveryChoice({
  mode,
  days,
  allowDownload,
  onMode,
  onDays,
  onDownload,
  preview = false,
}: {
  mode: DocumentEmailMode;
  days: number;
  allowDownload: boolean;
  onMode: (mode: DocumentEmailMode) => void;
  onDays: (days: 7 | 30 | 90 | 365) => void;
  onDownload: (allowed: boolean) => void;
  preview?: boolean;
}) {
  return (
    <div className="protected-document-choice">
      <Field label={msg("Document access")}>
        <select
          value={mode}
          onChange={(event) => onMode(event.target.value as DocumentEmailMode)}
        >
          <option value="my_documents" disabled={preview}>
            {msg("In My documents")}
          </option>
          <option value="attachment">{msg("PDF attachment")}</option>
        </select>
      </Field>
      {mode === "my_documents" && (
        <>
          <p className="field-hint">
            {msg(
              "The recipient signs in or creates an account with their verified address. No separate document password is needed.",
            )}
          </p>
          <Field label={msg("Access period")}>
            <select
              value={days}
              onChange={(event) =>
                onDays(Number(event.target.value) as 7 | 30 | 90 | 365)
              }
            >
              {SECURE_RETENTION_PRICES.map((tier) => (
                <option key={tier.days} value={tier.days}>
                  {msg(
                    "{0} days — {1} excluding tax per recipient",
                    tier.days,
                    money(tier.priceMinor),
                  )}
                </option>
              ))}
            </select>
          </Field>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={allowDownload}
              onChange={(event) => onDownload(event.target.checked)}
            />
            {msg("Allow original PDF download")}
          </label>
          <p className="field-hint">
            {msg(
              "The activated term is payable in full. Revoking or disabling the share does not entitle you to a refund.",
            )}
          </p>
        </>
      )}
    </div>
  );
}
