import { msg, msgIn } from "./messages";
import { formatLocale } from "./locale";
import { useRef, useState } from "react";
import { ArrowSquareOut, CreditCard, ShieldCheck } from "@phosphor-icons/react";
import {
  canAdminister,
  api,
  date,
  isPublicPreview,
  money,
  type Channel,
  type Page,
  type Session,
} from "./api";
import {
  DateTimezone,
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
import { t } from "./locale";
import { CreditBalance, type WelcomeCredit } from "./credit-balance";
import {
  HorizonOffer,
  horizonBillingAllowed,
  type HorizonPlan,
} from "./horizon-plan";

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
const getLabels = (): Record<string, string> => ({
  draft: msg("Draft"),
  open: msg("Due"),
  paid: msg("Paid"),
  uncollectible: msg("Uncollectible"),
  void: msgIn("invoice", "Cancelled"),
  succeeded: msg("Received"),
  processing: msg("In progress"),
  canceled: msg("Cancelled"),
  requires_payment_method: msg("Payment method required"),
  requires_confirmation: msg("Awaiting confirmation"),
  requires_action: msg("Action required"),
  requires_capture: msg("Awaiting capture"),
  active: msg("Active"),
  trialing: msg("Trial period"),
  past_due: msg("Payment overdue"),
  unpaid: msg("Unpaid"),
  incomplete: msg("Incomplete"),
  incomplete_expired: msg("Expired"),
  paused: msg("Paused"),
});
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
  return new Intl.NumberFormat(formatLocale(), {
    style: "currency",
    currency: code,
  }).format(value / (zeroDecimal.has(code) ? 1 : 100));
}
const stamp = (seconds: number) => date(new Date(seconds * 1000).toISOString());
const state = (value: string) => getLabels()[value] ?? value;

export function Billing({ session }: { session: Session }) {
  if (isPublicPreview) return <PreviewBilling key={session.organization.id} />;
  if (!canAdminister(session))
    return (
      <>
        <PageHeading title={msg("Billing")} />
        <EmptyState
          title={msg("Administrator access is required")}
          text={msg(
            "Ask your workspace administrator to view invoices and payments.",
          )}
        />
      </>
    );
  return <HorizonBilling key={session.organization.id} session={session} />;
}

function HorizonBilling({ session }: { session: Session }) {
  const plan = useResource<HorizonPlan>("/plan");
  return (
    <>
      <PageHeading
        title={msg("Billing")}
        intro={msg(
          "Billing is available to administrators of accounts with an active monthly plan.",
        )}
      />
      <ErrorNotice error={plan.error} retry={plan.refresh} />
      {plan.loading && !plan.data && <Loading />}
      {plan.data && (
        <HorizonOffer
          key={`${session.organization.id}:${plan.data.status}:${plan.data.cancelAtPeriodEnd}`}
          session={session}
          plan={plan.data}
          refresh={plan.refresh}
          loading={plan.loading}
          billing
        />
      )}
      {horizonBillingAllowed(session, plan.data) && (
        <BillingWorkspace session={session} showHeading={false} />
      )}
    </>
  );
}

function PreviewBilling() {
  const overview = useResource<{ welcomeCredit: WelcomeCredit }>("/billing");
  return (
    <>
      <PageHeading
        title={msg("Billing")}
        intro={msg(
          "Explore welcome credit and delivery tracking in this fictional workspace.",
        )}
      />
      <ErrorNotice error={overview.error} retry={overview.refresh} />
      {overview.loading && !overview.data && <Loading />}
      {overview.data && <CreditBalance credit={overview.data.welcomeCredit} />}
      <EmptyState
        title={msg("No invoices in the demo")}
        text={msg(
          "Invoices and payments will appear here with your real account. No payment or subscription is created in this preview.",
        )}
        action={
          <a className="button subtle" href="#/app/usage">
            {msg("View demo usage")}
          </a>
        }
      />
    </>
  );
}

function BillingWorkspace({
  session,
  showHeading = true,
}: {
  session: Session;
  showHeading?: boolean;
}) {
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
        "Your billing profile is ready. No payment has been initiated.",
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
      {showHeading && (
        <PageHeading
          title={msg("Billing")}
          intro={msg(
            "Invoices and payments for {0}.",
            session.organization.name,
          )}
          action={
            <RefreshButton
              onClick={refresh}
              disabled={overview.loading || action.pending}
            />
          }
        />
      )}
      {!showHeading && (
        <div className="section-toolbar">
          <RefreshButton
            onClick={refresh}
            disabled={overview.loading || action.pending}
          />
        </div>
      )}
      <ErrorNotice
        error={
          overview.error ?? invoices.error ?? payments.error ?? action.error
        }
        retry={refresh}
      />
      {notice && (
        <p className="notice info" role="status">
          {msg(notice)}
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
              <h2 id="billing-account-title">{msg("Your billing profile")}</h2>
              <span className="mono">
                {data.mode === "live"
                  ? msg("LIVE ACCOUNT")
                  : data.mode === "test"
                    ? "ENVIRONNEMENT DE TEST"
                    : msg("CONNECTION REQUIRED")}
              </span>
            </div>
            <p>
              {data.status === "configuration_required"
                ? msg(
                    "Tracking will be available once Guteneo’s payment account is connected. You can already view your usage below.",
                  )
                : data.status === "customer_required"
                  ? msg(
                      "Create your billing profile to find future invoices here. This step does not start a subscription or initiate a payment.",
                    )
                  : msg(
                      "View your billing documents and manage your details in the secure Stripe portal.",
                    )}
            </p>
            {data.mode === "test" && (
              <p className="field-hint">
                {msg(
                  "The Stripe transactions shown here are tests, with no real payment.",
                )}
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
                  ? msg("Creating…")
                  : msg("Create my billing profile")}
              </button>
            )}
            {data.portalAvailable && (
              <button
                type="button"
                className="button primary"
                disabled={action.pending}
                onClick={() => void openPortal()}
              >
                {action.pending ? msg("Opening…") : msg("Open billing portal")}
                <ArrowSquareOut size={18} aria-hidden="true" />
              </button>
            )}
          </section>

          <section
            className="form-panel"
            aria-labelledby="billing-invoices-title"
          >
            <div className="section-toolbar">
              <h2 id="billing-invoices-title">{msg("Invoices")}</h2>
            </div>
            {!!invoices.data?.items.length && <DateTimezone />}
            {invoices.loading && !invoices.data ? (
              <Loading />
            ) : invoices.error ? (
              <p>{msg("Invoices could not be refreshed.")}</p>
            ) : !invoices.data?.items.length ? (
              <p>{msg("No invoices recorded for this workspace.")}</p>
            ) : (
              <>
                <div className="table-scroll">
                  <table className="responsive-table" role="table">
                    <thead role="rowgroup">
                      <tr role="row">
                        <th role="columnheader" scope="col">
                          {msg("Invoice")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msg("Status")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msg("Total")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msgIn("payment", "Paid")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msg("Amount due")}
                        </th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {invoices.data.items.map((item) => (
                        <tr role="row" key={item.id}>
                          <th role="rowheader" scope="row">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              {msg("Invoice")}
                            </span>
                            {item.number ?? item.id}
                            <span className="reference">
                              {stamp(item.created)}
                            </span>
                            <span className="reference">
                              {msg("Updated on ")}
                              {date(item.synced_at)}
                            </span>
                          </th>
                          <td role="cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              {msg("Status")}
                            </span>
                            {state(item.status)}
                          </td>
                          <td role="cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              {msg("Total")}
                            </span>
                            {billedMoney(item.total_minor, item.currency)}
                          </td>
                          <td role="cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              {msgIn("payment", "Paid")}
                            </span>
                            {billedMoney(item.amount_paid_minor, item.currency)}
                          </td>
                          <td role="cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              {msg("Amount due")}
                            </span>
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
              <h2 id="billing-payments-title">{msg("Payments")}</h2>
            </div>
            {!!payments.data?.items.length && <DateTimezone />}
            {payments.loading && !payments.data ? (
              <Loading />
            ) : payments.error ? (
              <p>{msg("Payments could not be refreshed.")}</p>
            ) : !payments.data?.items.length ? (
              <p>{msg("No payments recorded for this workspace.")}</p>
            ) : (
              <>
                <div className="table-scroll">
                  <table className="responsive-table" role="table">
                    <thead role="rowgroup">
                      <tr role="row">
                        <th role="columnheader" scope="col">
                          {msg("Reference")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msg("Status")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msg("Amount received")}
                        </th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {payments.data.items.map((item) => (
                        <tr role="row" key={item.id}>
                          <th role="rowheader" scope="row">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              {msg("Reference")}
                            </span>
                            <span className="mono">{item.id}</span>
                            <span className="reference">
                              {stamp(item.created)}
                            </span>
                            <span className="reference">
                              {msgIn("payment", "Updated on ")}
                              {date(item.synced_at)}
                            </span>
                          </th>
                          <td role="cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              {msg("Status")}
                            </span>
                            {state(item.status)}
                          </td>
                          <td role="cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              {msg("Amount received")}
                            </span>
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
                  {msg(
                    "Amounts received before any refunds. The billing portal provides the latest documents.",
                  )}
                </p>
              </>
            )}
          </section>

          <section
            className="form-panel"
            aria-labelledby="billing-subscriptions-title"
          >
            <div className="section-toolbar">
              <h2 id="billing-subscriptions-title">{msg("Subscriptions")}</h2>
            </div>
            {!!data.subscriptions.length && <DateTimezone />}
            {!data.subscriptions.length ? (
              <p>{msg("No subscriptions recorded for this workspace.")}</p>
            ) : (
              <div className="table-scroll">
                <table className="responsive-table" role="table">
                  <thead role="rowgroup">
                    <tr role="row">
                      <th role="columnheader" scope="col">
                        {msg("Reference")}
                      </th>
                      <th role="columnheader" scope="col">
                        {msg("Status")}
                      </th>
                      <th role="columnheader" scope="col">
                        {msg("Last updated")}
                      </th>
                    </tr>
                  </thead>
                  <tbody role="rowgroup">
                    {data.subscriptions.map((item) => (
                      <tr role="row" key={item.id}>
                        <th role="rowheader" scope="row" className="mono">
                          <span
                            className="mobile-cell-label"
                            aria-hidden="true"
                          >
                            {msg("Reference")}
                          </span>
                          {item.id}
                        </th>
                        <td role="cell">
                          <span
                            className="mobile-cell-label"
                            aria-hidden="true"
                          >
                            {msg("Status")}
                          </span>
                          {state(item.status)}
                          {Boolean(item.cancel_at_period_end) && (
                            <span className="reference">
                              {msg("Cancellation at period end")}
                            </span>
                          )}
                        </td>
                        <td role="cell">
                          <span
                            className="mobile-cell-label"
                            aria-hidden="true"
                          >
                            {msg("Last updated")}
                          </span>
                          {date(item.synced_at)}
                        </td>
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
                  ? msg("Simulation usage")
                  : msg("Delivery budget")}
              </h2>
              <span className="mono">{data.usageLedger.period}</span>
            </div>
            <aside className="notice info">
              <ShieldCheck size={22} aria-hidden="true" />
              <p>
                {data.usageLedger.kind === "simulation"
                  ? msg(
                      "These counters are for testing. Amounts are fictional and will not be billed.",
                    )
                  : msg(
                      "These amounts are the caps reserved for your deliveries. Your actual invoices and payments appear in the sections above.",
                    )}
              </p>
            </aside>
            {!data.usageLedger.channels.length ? (
              <p>{msg("No usage recorded for this period.")}</p>
            ) : (
              <div className="usage-ledger">
                {data.usageLedger.channels.map((item) => (
                  <section key={item.channel}>
                    <h3>{t.channels[item.channel]}</h3>
                    <dl>
                      <Definition label={msg("Pending")}>
                        <strong>{item.reserved_count}</strong>
                        <span>
                          {money(item.reserved_minor, item.currency)}{" "}
                          {msg(" in reserved caps")}
                        </span>
                      </Definition>
                      <Definition label={msg("Accepted deliveries")}>
                        <strong>{item.confirmed_count}</strong>
                        <span>
                          {money(item.confirmed_minor, item.currency)}{" "}
                          {msg(" in committed caps")}
                        </span>
                      </Definition>
                      <Definition label={msg("Allowed limit")}>
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
