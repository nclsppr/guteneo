import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, ShieldCheck } from "@phosphor-icons/react";
import {
  api,
  canAdminister,
  date,
  isPublicPreview,
  money,
  type Session,
} from "./api";
import {
  ErrorNotice,
  Loading,
  PageHeading,
  RefreshButton,
  useAction,
  useResource,
} from "./components";
import { msg } from "./messages";
import "./horizon.css";

export type HorizonPlan = {
  plan: {
    id: "horizon";
    name: "guteneo Horizon";
    priceMinor: 3000;
    currency: "EUR";
    interval: "month";
  };
  termsVersion: string;
  enabled: boolean;
  status: "inactive" | "active" | "past_due" | "cancelled";
  entitled: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingManagementAllowed: boolean;
  paymentSource: "account_credits";
  evidence: "simulation" | "production";
  creditAvailableMinor: number | null;
};

export function horizonBillingAllowed(
  session: Pick<Session, "user">,
  plan?: HorizonPlan,
) {
  return (
    canAdminister(session) &&
    plan?.enabled === true &&
    plan.entitled === true &&
    plan.billingManagementAllowed === true
  );
}

export function HorizonBenefits() {
  return (
    <ul className="horizon-benefits">
      {[
        msg("100 contrôles PDF par mois, sans supplément par contrôle"),
        msg("Contrôles PDF/UA-1 et PDF/UA-2 pour l’accessibilité"),
        msg("Validation PDF/A-1b, 2b, 3b et 4 pour l’archivage"),
        msg("Rapports exportables liés à l’empreinte du PDF original"),
        msg("Repères de revue humaine et contrôles depuis votre assistant"),
        msg("Gestion de la facturation réservée à l’administrateur"),
      ].map((text) => (
        <li key={text}>
          <Check size={18} aria-hidden="true" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

export function HorizonCreditTerms() {
  return (
    <>
      <p className="horizon-limit">
        {msg(
          "Si votre compte dispose encore d’au moins 30 € de crédits promotionnels, ils peuvent financer la première période. Ce montant est déduit de votre solde.",
        )}
      </p>
      <p className="horizon-limit">
        {msg(
          "Sans 30 € de crédits disponibles à l’échéance, le renouvellement est suspendu à la fin de la période payée, sans dette ni solde négatif. La recharge de crédits n’est pas encore disponible.",
        )}
      </p>
    </>
  );
}

export function HorizonPage({ session }: { session: Session }) {
  return (
    <>
      <PageHeading
        title={msg("Forfait Horizon")}
        intro={msg("Des documents mieux préparés, un atelier mieux équipé.")}
      />
      <HorizonAccount key={session.organization.id} session={session} />
    </>
  );
}

export function HorizonAccount({
  session,
  billing = false,
}: {
  session: Session;
  billing?: boolean;
}) {
  const resource = useResource<HorizonPlan>("/plan");
  return (
    <>
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !resource.data && <Loading />}
      {resource.data && (
        <HorizonOffer
          key={`${session.organization.id}:${resource.data.status}:${resource.data.cancelAtPeriodEnd}`}
          session={session}
          plan={resource.data}
          refresh={resource.refresh}
          loading={resource.loading}
          billing={billing}
        />
      )}
    </>
  );
}

export function HorizonOffer({
  session,
  plan,
  refresh,
  loading = false,
  billing = false,
}: {
  session: Session;
  plan: HorizonPlan;
  refresh: () => void;
  loading?: boolean;
  billing?: boolean;
}) {
  const action = useAction();
  const [consent, setConsent] = useState(false);
  const [cancelConsent, setCancelConsent] = useState(false);
  const [notice, setNotice] = useState("");
  const subscribeKey = useRef<string | null>(null);
  const cancelKey = useRef<string | null>(null);
  const admin = canAdminister(session);
  const available = plan.enabled && !isPublicPreview;
  const amount = money(plan.plan.priceMinor, plan.plan.currency);
  const restoreRenewal = plan.entitled && plan.cancelAtPeriodEnd;
  const canSubscribe = admin && available && (!plan.entitled || restoreRenewal);
  const canCancel =
    admin &&
    !isPublicPreview &&
    (plan.status === "active" || plan.status === "past_due") &&
    !plan.cancelAtPeriodEnd;
  const enoughCredit =
    restoreRenewal ||
    (plan.creditAvailableMinor !== null &&
      plan.creditAvailableMinor >= plan.plan.priceMinor);
  const status = plan.cancelAtPeriodEnd
    ? msg("Résiliation programmée")
    : plan.status === "past_due"
      ? msg("Crédit insuffisant au renouvellement")
      : plan.status === "active"
        ? available && plan.entitled
          ? msg("Forfait actif")
          : msg("Forfait souscrit")
        : !available
          ? msg("Bientôt disponible")
          : msg("Sans forfait mensuel");

  async function subscribe(event: FormEvent) {
    event.preventDefault();
    if (!canSubscribe || !consent || !enoughCredit || action.pending) return;
    await action.run(async () => {
      subscribeKey.current ??= crypto.randomUUID();
      await api<HorizonPlan>("/plan/subscribe", {
        method: "POST",
        key: subscribeKey.current,
        body: { consent: true, termsVersion: plan.termsVersion },
      });
      subscribeKey.current = null;
      setNotice(
        restoreRenewal
          ? msg("Le renouvellement mensuel a été rétabli.")
          : msg(
              "Le forfait a été souscrit. Actualisez son état pour consulter votre période.",
            ),
      );
      setConsent(false);
      refresh();
    });
  }
  async function cancel(event: FormEvent) {
    event.preventDefault();
    if (!canCancel || !cancelConsent || action.pending) return;
    await action.run(async () => {
      cancelKey.current ??= crypto.randomUUID();
      await api<HorizonPlan>("/plan/cancel", {
        method: "POST",
        key: cancelKey.current,
        body: {},
      });
      cancelKey.current = null;
      setNotice(
        msg(
          "La résiliation a été demandée. Actualisez l’état de votre forfait.",
        ),
      );
      setCancelConsent(false);
      refresh();
    });
  }

  return (
    <section
      className="horizon-offer"
      aria-labelledby="horizon-offer-title"
      aria-busy={loading || action.pending}
    >
      <div className="section-toolbar">
        <div>
          <p className="eyebrow">guteneo Horizon</p>
          <h2 id="horizon-offer-title">{msg("Forfait Horizon")}</h2>
        </div>
        <RefreshButton onClick={refresh} disabled={loading || action.pending} />
      </div>
      <p className="horizon-price">
        <strong>{amount}</strong>
        <span>{msg("par mois")}</span>
      </p>
      <p className="status" role="status">
        {status}
      </p>
      <p>
        {msg(
          "Le forfait est prélevé chaque mois sur les crédits disponibles du compte. Les envois consomment leur propre crédit.",
        )}
      </p>
      {available && <HorizonCreditTerms />}
      <HorizonBenefits />
      <p className="horizon-limit">
        {msg(
          "Limite incluse : 100 tentatives de contrôle par mois civil, PDF de 10 Mio et 100 pages maximum. Les contrôles interrompus comptent dans cette limite.",
        )}
      </p>
      {!available && (
        <p className="notice info">
          {plan.status === "inactive"
            ? msg(
                "Cette offre est en préparation. La souscription et les contrôles PDF seront ouverts après activation du service.",
              )
            : msg(
                "Le service Horizon est indisponible. L’administrateur peut toujours arrêter le renouvellement du forfait.",
              )}
        </p>
      )}
      {plan.evidence === "simulation" && (
        <p className="notice info">
          {msg(
            "Atelier de simulation : les montants et les droits affichés sont fictifs.",
          )}
        </p>
      )}
      {plan.currentPeriodEnd && (
        <p>
          {msg("Période en cours jusqu’au {0}.", date(plan.currentPeriodEnd))}
        </p>
      )}
      {!admin && (
        <p>
          {msg(
            "Seul l’administrateur de votre atelier peut souscrire, résilier et gérer la facturation.",
          )}
        </p>
      )}
      {admin && available && plan.creditAvailableMinor !== null && (
        <p>
          {msg("Crédit disponible : {0}.", money(plan.creditAvailableMinor))}
        </p>
      )}
      <ErrorNotice error={action.error} />
      {notice && (
        <p className="notice info" role="status">
          {notice}
        </p>
      )}
      {canSubscribe && (
        <form
          onSubmit={(event) => void subscribe(event)}
          className="horizon-consent"
        >
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              disabled={action.pending}
              aria-describedby="horizon-subscribe-help"
            />
            <span>
              {msg(
                "J’accepte le forfait Horizon à {0} par mois, prélevé sur les crédits du compte, avec renouvellement mensuel jusqu’à résiliation.",
                amount,
              )}
            </span>
          </label>
          <p id="horizon-subscribe-help">
            {restoreRenewal
              ? msg(
                  "La période déjà payée est conservée sans nouveau débit. Les prochains renouvellements seront prélevés chaque mois sur les crédits du compte.",
                )
              : enoughCredit
                ? msg(
                    "La première période est débitée à la souscription. La résiliation arrête le prochain renouvellement.",
                  )
                : msg(
                    "Il faut au moins 30 € de crédits disponibles pour souscrire. La recharge de crédits n’est pas encore disponible.",
                  )}
          </p>
          <button
            className="button primary"
            disabled={!consent || !enoughCredit || action.pending || loading}
          >
            {action.pending
              ? msg("Souscription en cours…")
              : restoreRenewal
                ? msg("Rétablir le renouvellement")
                : msg("Souscrire Horizon")}
          </button>
        </form>
      )}
      {canCancel && (
        <details className="horizon-cancel">
          <summary>{msg("Résilier le forfait")}</summary>
          <form onSubmit={(event) => void cancel(event)}>
            <p>
              {msg(
                "La résiliation arrête le prochain prélèvement mensuel, y compris si le service est indisponible.",
              )}
            </p>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={cancelConsent}
                onChange={(event) => setCancelConsent(event.target.checked)}
                disabled={action.pending}
              />
              <span>
                {msg("Je confirme l’arrêt du renouvellement mensuel.")}
              </span>
            </label>
            <button
              className="button"
              disabled={!cancelConsent || action.pending}
            >
              {msg("Confirmer la résiliation")}
            </button>
          </form>
        </details>
      )}
      {!billing && horizonBillingAllowed(session, plan) && (
        <a className="button" href="#/app/billing">
          {msg("Gérer la facturation")}
          <ArrowRight size={18} aria-hidden="true" />
        </a>
      )}
      <p className="horizon-limit">
        <ShieldCheck size={18} aria-hidden="true" />
        <span>
          {msg(
            "Les contrôles automatiques apportent des repères techniques. Ils ne remplacent pas une revue humaine et ne constituent pas une certification de conformité légale.",
          )}
        </span>
      </p>
    </section>
  );
}
