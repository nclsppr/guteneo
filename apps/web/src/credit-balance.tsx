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
          {simulation ? "EXEMPLE FICTIF" : "CRÉDIT DE BIENVENUE"}
        </span>
        <h2 id={`${id}-title`}>Un solde pour toute votre correspondance.</h2>
        <p>
          Fax, e-mail et courrier partagent le même crédit, offert une seule
          fois à votre atelier.
        </p>
        <dl className="credit-balance-amount">
          <dt>{simulation ? "Disponible dans cet exemple" : "Disponible"}</dt>
          <dd>{amount(credit.availableMinor)}</dd>
        </dl>
        {credit.grantedMinor > 0 && (
          <progress
            max={credit.grantedMinor}
            value={credit.availableMinor}
            aria-label="Crédit disponible"
          />
        )}
        {credit.status === "exhausted" && (
          <p className="credit-balance-stop" role="status">
            Votre crédit disponible est épuisé. Les nouveaux envois sont
            bloqués.
          </p>
        )}
        {credit.status === "not_granted" && (
          <p className="credit-balance-stop">
            Aucun crédit n’est attribué à cet atelier. Les envois nécessitant un
            crédit restent bloqués.
          </p>
        )}
      </div>
      <div className="credit-balance-detail">
        <dl>
          <div>
            <dt>{simulation ? "Crédit illustratif" : "Crédit offert"}</dt>
            <dd>{amount(credit.grantedMinor)}</dd>
          </div>
          <div>
            <dt>Utilisé</dt>
            <dd>{amount(credit.spentMinor)}</dd>
          </div>
          <div>
            <dt>Réservé aux envois en cours</dt>
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
          Ajouter du crédit
        </button>
        <p id={`${id}-topup`} className="field-hint">
          La recharge sera disponible avec Stripe. Aucun paiement n’est possible
          pour le moment.
        </p>
        <p className="field-hint">
          Le crédit ne se renouvelle pas chaque mois. Un envoi dont le résultat
          est incertain conserve sa réservation.
        </p>
        {simulation && (
          <p className="field-hint">
            Ces montants servent uniquement à explorer l’atelier. Ils ne
            constituent ni un crédit réel ni une facture.
          </p>
        )}
      </div>
    </section>
  );
}
