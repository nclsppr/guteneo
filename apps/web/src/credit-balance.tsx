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
          {simulation ? msg("EXEMPLE FICTIF") : msg("CRÉDIT DE BIENVENUE")}
        </span>
        <h2 id={`${id}-title`}>
          {msg("Un solde pour toute votre correspondance.")}
        </h2>
        <p>
          {msg(
            "Fax, e-mail et courrier partagent le même crédit, offert une seule fois à votre atelier.",
          )}
        </p>
        <dl className="credit-balance-amount">
          <dt>
            {simulation
              ? msg("Disponible dans cet exemple")
              : msg("Disponible")}
          </dt>
          <dd>{amount(credit.availableMinor)}</dd>
        </dl>
        {credit.grantedMinor > 0 && (
          <progress
            max={credit.grantedMinor}
            value={credit.availableMinor}
            aria-label={msg("Crédit disponible")}
          />
        )}
        {credit.status === "exhausted" && (
          <p className="credit-balance-stop" role="status">
            {msg(
              "Votre crédit disponible est épuisé. Les nouveaux envois sont bloqués.",
            )}
          </p>
        )}
        {credit.status === "not_granted" && (
          <p className="credit-balance-stop">
            {msg(
              "Aucun crédit n’est attribué à cet atelier. Les envois nécessitant un crédit restent bloqués.",
            )}
          </p>
        )}
      </div>
      <div className="credit-balance-detail">
        <dl>
          <div>
            <dt>
              {simulation ? msg("Crédit illustratif") : msg("Crédit offert")}
            </dt>
            <dd>{amount(credit.grantedMinor)}</dd>
          </div>
          <div>
            <dt>{msg("Utilisé")}</dt>
            <dd>{amount(credit.spentMinor)}</dd>
          </div>
          <div>
            <dt>{msg("Réservé aux envois en cours")}</dt>
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
          {msg("Ajouter du crédit")}
        </button>
        <p id={`${id}-topup`} className="field-hint">
          {msg(
            "La recharge sera disponible avec Stripe. Aucun paiement n’est possible pour le moment.",
          )}
        </p>
        <p className="field-hint">
          {msg(
            "Le crédit ne se renouvelle pas chaque mois. Un envoi dont le résultat est incertain conserve sa réservation.",
          )}
        </p>
        {simulation && (
          <p className="field-hint">
            {msg(
              "Ces montants servent uniquement à explorer l’atelier. Ils ne constituent ni un crédit réel ni une facture.",
            )}
          </p>
        )}
      </div>
    </section>
  );
}
