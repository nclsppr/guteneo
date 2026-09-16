import { useRef, useState } from "react";
import { ArrowSquareOut, CreditCard, ShieldCheck } from "@phosphor-icons/react";
import {
  api,
  date,
  isPublicPreview,
  money,
  type Channel,
  type Page,
  type Session,
} from "./api";
import {
  Definition,
  EmptyState,
  ErrorNotice,
  Loading,
  LoadMore,
  PageHeading,
  RefreshButton,
  useAction,
  useResource,
} from "./components";
import { fr as t } from "./i18n";
import { CreditBalance, type WelcomeCredit } from "./credit-balance";

type Usage = {
  channel: Channel;
  reserved_count: number;
  confirmed_count: number;
  reserved_minor: number;
  confirmed_minor: number;
  limit_count: number;
  limit_minor: number;
  currency: string;
};
type Subscription = {
  id: string;
  status: string;
  cancel_at_period_end: number;
  synced_at: string;
};
type Overview = {
  status: "configuration_required" | "customer_required" | "connected";
  mode: "test" | "live" | "unconfigured";
  customerLinked: boolean;
  portalAvailable: boolean;
  welcomeCredit: WelcomeCredit;
  topUpAvailable: false;
  subscriptions: Subscription[];
  usageLedger: {
    kind: "simulation" | "production_reservations";
    period: string;
    channels: Usage[];
  };
};
type Invoice = {
  id: string;
  number: string | null;
  status: string;
  currency: string;
  total_minor: number;
  amount_paid_minor: number;
  amount_remaining_minor: number;
  created: number;
  synced_at: string;
};
type Payment = {
  id: string;
  status: string;
  currency: string;
  amount_minor: number;
  amount_received_minor: number;
  created: number;
  synced_at: string;
};
const labels: Record<string, string> = {
  draft: "Brouillon",
  open: "À régler",
  paid: "Réglée",
  uncollectible: "Irrécouvrable",
  void: "Annulée",
  succeeded: "Reçu",
  processing: "En cours",
  canceled: "Annulé",
  requires_payment_method: "Moyen de paiement requis",
  requires_confirmation: "À confirmer",
  requires_action: "Action requise",
  requires_capture: "À capturer",
  active: "Actif",
  trialing: "Période d’essai",
  past_due: "Paiement en retard",
  unpaid: "Impayé",
  incomplete: "À finaliser",
  incomplete_expired: "Expiré",
  paused: "En pause",
};
// Stripe's API uses two decimals except these zero-decimal charge currencies.
// ISK and UGX intentionally stay /100 for Stripe's backwards compatibility.
const zeroDecimal = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);
function billedMoney(value: number, currency: string) {
  const code = currency.toUpperCase();
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: code,
  }).format(value / (zeroDecimal.has(code) ? 1 : 100));
}
const stamp = (seconds: number) => date(new Date(seconds * 1000).toISOString());
const state = (value: string) => labels[value] ?? value;

export function Billing({ session }: { session: Session }) {
  if (isPublicPreview) return <PreviewBilling key={session.organization.id} />;
  if (session.user.role !== "admin")
    return (
      <>
        <PageHeading title="Facturation" />
        <EmptyState
          title="Un accès administrateur est nécessaire"
          text="Demandez à l’administrateur de votre espace de consulter les factures et les paiements."
        />
      </>
    );
  return <BillingWorkspace key={session.organization.id} session={session} />;
}

function PreviewBilling() {
  const overview = useResource<{ welcomeCredit: WelcomeCredit }>("/billing");
  return (
    <>
      <PageHeading
        title="Facturation"
        intro="Explorez le crédit de bienvenue et le suivi des envois dans cet atelier fictif."
      />
      <ErrorNotice error={overview.error} retry={overview.refresh} />
      {overview.loading && !overview.data && <Loading />}
      {overview.data && <CreditBalance credit={overview.data.welcomeCredit} />}
      <EmptyState
        title="Aucune facture dans la démonstration"
        text="Les factures et les paiements seront regroupés ici avec votre vrai compte. Aucun paiement ni abonnement n’est créé dans cet aperçu."
        action={
          <a className="button subtle" href="#/app/usage">
            Voir la consommation de démonstration
          </a>
        }
      />
    </>
  );
}

function BillingWorkspace({ session }: { session: Session }) {
  const overview = useResource<Overview>("/billing");
  const invoices = useResource<Page<Invoice>>("/billing/invoices");
  const payments = useResource<Page<Payment>>("/billing/payments");
  const action = useAction();
  const portalKey = useRef<string | null>(null);
  const [notice, setNotice] = useState("");
  const refresh = () => {
    overview.refresh();
    invoices.refresh();
    payments.refresh();
  };
  const data = overview.data;
  async function createCustomer() {
    await action.run(async () => {
      await api("/billing/customer", { method: "POST", body: {} });
      setNotice(
        "Votre dossier de facturation est prêt. Aucun paiement n’a été déclenché.",
      );
      refresh();
    });
  }
  async function openPortal() {
    await action.run(async () => {
      portalKey.current ??= crypto.randomUUID();
      const { url } = await api<{ url: string }>("/billing/portal", {
        method: "POST",
        body: {},
        key: portalKey.current,
      });
      portalKey.current = null;
      window.location.assign(url);
    });
  }
  return (
    <>
      <PageHeading
        title="Facturation"
        intro={`Les factures et paiements de ${session.organization.name}.`}
        action={
          <RefreshButton
            onClick={refresh}
            disabled={overview.loading || action.pending}
          />
        }
      />
      <ErrorNotice
        error={
          overview.error ?? invoices.error ?? payments.error ?? action.error
        }
        retry={refresh}
      />
      {notice && (
        <p className="notice info" role="status">
          {notice}
        </p>
      )}
      {overview.loading && !data && <Loading />}
      {data && (
        <>
          {data.welcomeCredit && <CreditBalance credit={data.welcomeCredit} />}
          <section
            className="form-panel"
            aria-labelledby="billing-account-title"
          >
            <div className="section-toolbar">
              <h2 id="billing-account-title">Votre dossier de facturation</h2>
              <span className="mono">
                {data.mode === "live"
                  ? "COMPTE RÉEL"
                  : data.mode === "test"
                    ? "ENVIRONNEMENT DE TEST"
                    : "À RACCORDER"}
              </span>
            </div>
            <p>
              {data.status === "configuration_required"
                ? "Le suivi sera disponible dès le raccordement du compte de paiement Guteneo. Vous pouvez déjà consulter votre consommation ci-dessous."
                : data.status === "customer_required"
                  ? "Créez votre dossier pour retrouver ici vos futures factures. Cette étape ne souscrit aucun abonnement et ne déclenche aucun paiement."
                  : "Consultez vos documents de facturation et gérez vos informations dans le portail sécurisé Stripe."}
            </p>
            {data.mode === "test" && (
              <p className="field-hint">
                Les opérations Stripe affichées ici sont des essais, sans
                paiement réel.
              </p>
            )}
            {data.status === "customer_required" && (
              <button
                type="button"
                className="button primary"
                disabled={action.pending}
                onClick={() => void createCustomer()}
              >
                <CreditCard size={18} aria-hidden="true" />
                {action.pending
                  ? "Création en cours…"
                  : "Créer mon dossier de facturation"}
              </button>
            )}
            {data.portalAvailable && (
              <button
                type="button"
                className="button primary"
                disabled={action.pending}
                onClick={() => void openPortal()}
              >
                {action.pending
                  ? "Ouverture en cours…"
                  : "Ouvrir le portail de facturation"}
                <ArrowSquareOut size={18} aria-hidden="true" />
              </button>
            )}
          </section>

          <section
            className="form-panel"
            aria-labelledby="billing-invoices-title"
          >
            <div className="section-toolbar">
              <h2 id="billing-invoices-title">Factures</h2>
            </div>
            {invoices.loading && !invoices.data ? (
              <Loading />
            ) : invoices.error ? (
              <p>Les factures n’ont pas pu être actualisées.</p>
            ) : !invoices.data?.items.length ? (
              <p>Aucune facture enregistrée pour cet espace.</p>
            ) : (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Facture</th>
                        <th scope="col">État</th>
                        <th scope="col">Total</th>
                        <th scope="col">Réglé</th>
                        <th scope="col">Reste dû</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.data.items.map((item) => (
                        <tr key={item.id}>
                          <th scope="row">
                            {item.number ?? item.id}
                            <span className="reference">
                              {stamp(item.created)}
                            </span>
                            <span className="reference">
                              Actualisée le {date(item.synced_at)}
                            </span>
                          </th>
                          <td>{state(item.status)}</td>
                          <td>
                            {billedMoney(item.total_minor, item.currency)}
                          </td>
                          <td>
                            {billedMoney(item.amount_paid_minor, item.currency)}
                          </td>
                          <td>
                            {billedMoney(
                              item.amount_remaining_minor,
                              item.currency,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <LoadMore
                  path="/billing/invoices"
                  data={invoices.data}
                  onLoaded={invoices.setData}
                />
              </>
            )}
          </section>

          <section
            className="form-panel"
            aria-labelledby="billing-payments-title"
          >
            <div className="section-toolbar">
              <h2 id="billing-payments-title">Paiements</h2>
            </div>
            {payments.loading && !payments.data ? (
              <Loading />
            ) : payments.error ? (
              <p>Les paiements n’ont pas pu être actualisés.</p>
            ) : !payments.data?.items.length ? (
              <p>Aucun paiement enregistré pour cet espace.</p>
            ) : (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Référence</th>
                        <th scope="col">État</th>
                        <th scope="col">Montant reçu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.data.items.map((item) => (
                        <tr key={item.id}>
                          <th scope="row">
                            <span className="mono">{item.id}</span>
                            <span className="reference">
                              {stamp(item.created)}
                            </span>
                            <span className="reference">
                              Actualisé le {date(item.synced_at)}
                            </span>
                          </th>
                          <td>{state(item.status)}</td>
                          <td>
                            {billedMoney(
                              item.amount_received_minor,
                              item.currency,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <LoadMore
                  path="/billing/payments"
                  data={payments.data}
                  onLoaded={payments.setData}
                />
                <p className="field-hint">
                  Montants reçus avant d’éventuels remboursements. Le portail de
                  facturation présente les documents à jour.
                </p>
              </>
            )}
          </section>

          <section
            className="form-panel"
            aria-labelledby="billing-subscriptions-title"
          >
            <div className="section-toolbar">
              <h2 id="billing-subscriptions-title">Abonnements</h2>
            </div>
            {!data.subscriptions.length ? (
              <p>Aucun abonnement enregistré pour cet espace.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Référence</th>
                      <th scope="col">État</th>
                      <th scope="col">Dernière actualisation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subscriptions.map((item) => (
                      <tr key={item.id}>
                        <th scope="row" className="mono">
                          {item.id}
                        </th>
                        <td>
                          {state(item.status)}
                          {Boolean(item.cancel_at_period_end) && (
                            <span className="reference">
                              Résiliation à la fin de la période
                            </span>
                          )}
                        </td>
                        <td>{date(item.synced_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="billing-usage-title">
            <div className="section-toolbar">
              <h2 id="billing-usage-title">
                {data.usageLedger.kind === "simulation"
                  ? "Consommation de simulation"
                  : "Budget des envois"}
              </h2>
              <span className="mono">{data.usageLedger.period}</span>
            </div>
            <aside className="notice info">
              <ShieldCheck size={22} aria-hidden="true" />
              <p>
                {data.usageLedger.kind === "simulation"
                  ? "Ces compteurs servent aux essais. Les montants sont fictifs et ne seront pas facturés."
                  : "Ces montants sont les plafonds réservés pour vos envois. Vos factures et paiements réels figurent dans les sections ci-dessus."}
              </p>
            </aside>
            {!data.usageLedger.channels.length ? (
              <p>Aucune consommation enregistrée sur cette période.</p>
            ) : (
              <div className="usage-ledger">
                {data.usageLedger.channels.map((item) => (
                  <section key={item.channel}>
                    <h3>{t.channels[item.channel]}</h3>
                    <dl>
                      <Definition label="En attente">
                        <strong>{item.reserved_count}</strong>
                        <span>
                          {money(item.reserved_minor, item.currency)} de plafond
                          réservé
                        </span>
                      </Definition>
                      <Definition label="Envois acceptés">
                        <strong>{item.confirmed_count}</strong>
                        <span>
                          {money(item.confirmed_minor, item.currency)} de
                          plafond engagé
                        </span>
                      </Definition>
                      <Definition label="Limite autorisée">
                        <strong>{item.limit_count}</strong>
                        <span>{money(item.limit_minor, item.currency)}</span>
                      </Definition>
                    </dl>
                  </section>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
