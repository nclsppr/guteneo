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
  DateTimezone,
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
        msg("100 PDF checks per month, with no per-check surcharge"),
        msg("PDF/UA-1 and PDF/UA-2 accessibility checks"),
        msg("PDF/A-1b, 2b, 3b and 4 archival validation"),
        msg("Exportable reports linked to the original PDF fingerprint"),
        msg("Human review guidance and checks from your assistant"),
        msg("Billing management reserved for the administrator"),
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
          "If your account still has at least €30 in promotional credits, they can fund the first period. This amount is deducted from your balance.",
        )}
      </p>
      <p className="horizon-limit">
        {msg(
          "Without €30 in available credits when the period ends, renewal is suspended at the end of the paid period, without debt or a negative balance. Credit top-ups are not available yet.",
        )}
      </p>
    </>
  );
}

export function HorizonPage({ session }: { session: Session }) {
  return (
    <>
      <PageHeading
        title={msg("Horizon plan")}
        intro={msg("Better prepared documents, a better equipped workspace.")}
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
    ? msg("Cancellation scheduled")
    : plan.status === "past_due"
      ? msg("Insufficient credit at renewal")
      : plan.status === "active"
        ? available && plan.entitled
          ? msg("Plan active")
          : msg("Plan subscribed")
        : !available
          ? msg("Coming soon")
          : msg("No monthly plan");

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
          ? msg("Monthly renewal has been restored.")
          : msg(
              "Your plan has been subscribed. Refresh its status to view your period.",
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
          "Cancellation has been requested. Refresh your plan status.",
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
          <h2 id="horizon-offer-title">{msg("Horizon plan")}</h2>
        </div>
        <RefreshButton onClick={refresh} disabled={loading || action.pending} />
      </div>
      <p className="horizon-price">
        <strong>{amount}</strong>
        <span>{msg("per month")}</span>
      </p>
      <p className="status" role="status">
        {status}
      </p>
      <p>
        {msg(
          "The plan is deducted each month from the account’s available credits. Sending uses separate credit.",
        )}
      </p>
      {available && <HorizonCreditTerms />}
      <HorizonBenefits />
      <p className="horizon-limit">
        {msg(
          "Included allowance: 100 check attempts per calendar month, PDFs up to 10 MiB and 100 pages. Interrupted checks count towards this limit.",
        )}
      </p>
      {!available && (
        <p className="notice info">
          {plan.status === "inactive"
            ? msg(
                "This offer is being prepared. Subscriptions and PDF checks will open once the service is activated.",
              )
            : msg(
                "The Horizon service is unavailable. The administrator can still stop the plan’s renewal.",
              )}
        </p>
      )}
      {plan.evidence === "simulation" && (
        <p className="notice info">
          {msg(
            "Simulation workspace: the displayed amounts and entitlements are fictional.",
          )}
        </p>
      )}
      {plan.currentPeriodEnd && (
        <>
          <p>
            {msg("Current period ends on {0}.", date(plan.currentPeriodEnd))}
          </p>
          <DateTimezone />
        </>
      )}
      {!admin && (
        <p>
          {msg(
            "Only your workspace administrator can subscribe, cancel and manage billing.",
          )}
        </p>
      )}
      {admin && available && plan.creditAvailableMinor !== null && (
        <p>
          {msg("Available credit: {0}.", money(plan.creditAvailableMinor))}
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
                "I accept the Horizon plan at {0} per month, deducted from account credits, renewing monthly until cancelled.",
                amount,
              )}
            </span>
          </label>
          <p id="horizon-subscribe-help">
            {restoreRenewal
              ? msg(
                  "The paid period is retained without a new charge. Future renewals will be deducted monthly from account credits.",
                )
              : enoughCredit
                ? msg(
                    "The first period is charged when you subscribe. Cancellation stops the next renewal.",
                  )
                : msg(
                    "You need at least €30 in available credits to subscribe. Credit top-ups are not available yet.",
                  )}
          </p>
          <button
            className="button primary"
            disabled={!consent || !enoughCredit || action.pending || loading}
          >
            {action.pending
              ? msg("Subscribing…")
              : restoreRenewal
                ? msg("Restore renewal")
                : msg("Subscribe to Horizon")}
          </button>
        </form>
      )}
      {canCancel && (
        <details className="horizon-cancel">
          <summary>{msg("Cancel the plan")}</summary>
          <form onSubmit={(event) => void cancel(event)}>
            <p>
              {msg(
                "Cancellation stops the next monthly deduction, including when the service is unavailable.",
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
                {msg("I confirm stopping monthly renewal.")}
              </span>
            </label>
            <button
              className="button"
              disabled={!cancelConsent || action.pending}
            >
              {msg("Confirm cancellation")}
            </button>
          </form>
        </details>
      )}
      {!billing && horizonBillingAllowed(session, plan) && (
        <a className="button" href="#/app/billing">
          {msg("Manage billing")}
          <ArrowRight size={18} aria-hidden="true" />
        </a>
      )}
      <p className="horizon-limit">
        <ShieldCheck size={18} aria-hidden="true" />
        <span>
          {msg(
            "Automated checks provide technical guidance. They do not replace human review or certify legal compliance.",
          )}
        </span>
      </p>
    </section>
  );
}
