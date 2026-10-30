import { msg } from "./messages";
import { useId } from "react";
import { Plus } from "@phosphor-icons/react";
import { money } from "./api";
import "./credit-balance.css";

export type WelcomeCredit = {
  kind: "promotional" | "simulation";
  currency: "EUR";
  grantedMinor: number;
  reservedMinor: number;
  spentMinor: number;
  availableMinor: number;
  grantedAt: string | null;
  status: "available" | "exhausted" | "not_granted" | "simulation";
  renewal: "none";
  topUpAvailable: false;
};

export function CreditBalance({ credit }: { credit: WelcomeCredit }) {
  const id = useId();
  const simulation = credit.kind === "simulation";
  const amount = (value: number) => money(value, credit.currency);
  return (
    <section className="credit-balance" aria-labelledby={`${id}-title`}>
      <div className="credit-balance-main">
        <span className="mono">
          {simulation ? msg("FICTIONAL EXAMPLE") : msg("WELCOME CREDIT")}
        </span>
        <h2 id={`${id}-title`}>
          {msg("One balance for all your correspondence.")}
        </h2>
        <p>
          {msg(
            "Fax, email and post share the same credit, granted to your workspace once only.",
          )}
        </p>
        <dl className="credit-balance-amount">
          <dt>
            {simulation
              ? msg("Available in this example")
              : msg("Available")}
          </dt>
          <dd>{amount(credit.availableMinor)}</dd>
        </dl>
        {credit.grantedMinor > 0 && (
          <progress
            max={credit.grantedMinor}
            value={credit.availableMinor}
            aria-label={msg("Available credit")}
          />
        )}
        {credit.status === "exhausted" && (
          <p className="credit-balance-stop" role="status">
            {msg(
              "Your available credit is exhausted. New deliveries are blocked.",
            )}
          </p>
        )}
        {credit.status === "not_granted" && (
          <p className="credit-balance-stop">
            {msg(
              "No credit has been assigned to this workspace. Deliveries requiring credit remain blocked.",
            )}
          </p>
        )}
      </div>
      <div className="credit-balance-detail">
        <dl>
          <div>
            <dt>
              {simulation ? msg("Example credit") : msg("Complimentary credit")}
            </dt>
            <dd>{amount(credit.grantedMinor)}</dd>
          </div>
          <div>
            <dt>{msg("Used")}</dt>
            <dd>{amount(credit.spentMinor)}</dd>
          </div>
          <div>
            <dt>{msg("Reserved for ongoing deliveries")}</dt>
            <dd>{amount(credit.reservedMinor)}</dd>
          </div>
        </dl>
        <button
          type="button"
          className="button"
          disabled
          aria-describedby={`${id}-topup`}
        >
          <Plus size={18} aria-hidden="true" />
          {msg("Add credit")}
        </button>
        <p id={`${id}-topup`} className="field-hint">
          {msg(
            "Top-ups will be available through Stripe. No payment is possible at present.",
          )}
        </p>
        <p className="field-hint">
          {msg(
            "Credit does not renew monthly. A delivery with an uncertain outcome keeps its reservation.",
          )}
        </p>
        {simulation && (
          <p className="field-hint">
            {msg(
              "These amounts are only for exploring the workspace. They represent neither actual credit nor an invoice.",
            )}
          </p>
        )}
      </div>
    </section>
  );
}
