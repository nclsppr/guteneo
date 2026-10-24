import { Plus } from "@phosphor-icons/react";
import { HorizonBenefits, HorizonCreditTerms } from "./horizon-plan";
import { msg } from "./messages";
import { workspaceEntryHref } from "./auth-navigation";

export type PublicCapabilities = {
  mode?: string;
  horizon?: { available?: boolean };
};

export type HorizonPublicAvailability = {
  state: "available" | "closed" | "unknown";
  loading: boolean;
};

export function horizonPublicAvailability(
  capabilities: PublicCapabilities | undefined,
  loading: boolean,
): HorizonPublicAvailability {
  // The shared public signal never grants an account entitlement or performs a
  // subscription. Preview capabilities cannot advertise production access.
  const state = loading
    ? "unknown"
    : capabilities?.mode === "production" &&
        capabilities.horizon?.available === true
      ? "available"
      : capabilities?.horizon?.available === false
        ? "closed"
        : "unknown";
  return { state, loading };
}

const unknownAvailability: HorizonPublicAvailability = {
  state: "unknown",
  loading: false,
};

export function HorizonPublicOffer({
  availability = unknownAvailability,
}: {
  availability?: HorizonPublicAvailability;
}) {
  const { state, loading } = availability;
  return (
    <section
      className="horizon-public"
      id="horizon"
      tabIndex={-1}
      aria-labelledby="horizon-public-title"
      aria-busy={loading}
    >
      <div>
        <p className="eyebrow" role="status">
          {state === "available"
            ? msg("Available in your workspace")
            : state === "closed"
              ? msg("Subscription unavailable")
              : msg("Check your workspace")}
        </p>
        <h3 id="horizon-public-title">guteneo Horizon</h3>
        <p className="horizon-price">
          <strong>30 €</strong>
          <span>{msg("per month")}</span>
        </p>
        <p>
          {msg("Find barriers in your PDFs before sharing them.")}
        </p>
        <p>
          {msg(
            "A monthly plan to check PDF/UA accessibility and PDF/A archiving from your workspace or assistant.",
          )}
        </p>
      </div>
      <div>
        <HorizonBenefits />
        <p className="horizon-limit">
          {msg(
            "Included allowance: 100 check attempts per calendar month, PDFs up to 10 MiB and 100 pages. Interrupted checks count towards this limit.",
          )}
        </p>
        <p className="horizon-limit">
          {state === "available"
            ? msg(
                "The administrator can subscribe in the workspace with at least €30 in available credits. Checks are then available to authorised members.",
              )
            : state === "closed"
              ? msg(
                  "Subscriptions and PDF checks are currently unavailable. View the offer in your workspace.",
                )
              : msg(
                  "Plan availability is confirmed in your workspace before you subscribe.",
                )}
        </p>
        <HorizonCreditTerms />
        <a className="text-link" href={workspaceEntryHref("/app/plan")}>
          {msg("Explore the Horizon plan")}
        </a>
      </div>
    </section>
  );
}

export function HorizonFaq({
  availability = unknownAvailability,
}: {
  availability?: HorizonPublicAvailability;
}) {
  const { state } = availability;
  return (
    <>
      <details>
        <summary>
          {msg("What do the Horizon plan’s PDF checks include?")}
          <Plus size={19} aria-hidden="true" />
        </summary>
        <p>
          {msg(
            "Horizon includes PDF/UA-1 and PDF/UA-2, PDF/A-1b, 2b, 3b and 4 checks, reports linked to the original PDF and a manual review checklist. The same check is available through your assistant’s plugin when the service and plan are active.",
          )}
        </p>
        <p>
          {msg(
            "The €30 monthly plan is deducted from the account’s available credits. Only the administrator can subscribe, cancel or manage billing.",
          )}
        </p>
        {state !== "available" && (
          <p>
            {msg(
              "View the offer in your workspace to check service availability before subscribing.",
            )}
          </p>
        )}
        <HorizonCreditTerms />
      </details>
      <details>
        <summary>
          {msg("Does European law require accessible PDFs?")}
          <Plus size={19} aria-hidden="true" />
        </summary>
        <p>
          {msg(
            "The European Accessibility Act, Directive (EU) 2019/882, has applied since 28 June 2025 to certain consumer products and services, including e-commerce. Its scope has exceptions, including microenterprises providing services. It does not impose a universal requirement on every PDF.",
          )}
        </p>
        <p>
          {msg(
            "Directive (EU) 2016/2102 also covers public-sector websites and mobile apps. Exact duties depend on the service, document, exceptions and national implementation.",
          )}
        </p>
        <p>
          <a href="https://eur-lex.europa.eu/EN/legal-content/summary/accessibility-of-products-and-services.html">
            {msg("Read the European accessibility summary")}
          </a>
          {" · "}
          <a href="https://eur-lex.europa.eu/legal-content/en/LSU/?uri=CELEX%3A32016L2102">
            {msg("Read the public-sector rules")}
          </a>
        </p>
      </details>
      <details>
        <summary>
          {msg(
            "Does PDF/A or a PDF/UA check prove accessibility?",
          )}
          <Plus size={19} aria-hidden="true" />
        </summary>
        <p>
          {msg(
            "PDF/A is for long-term preservation; PDF/UA concerns accessibility. These are distinct goals. veraPDF checks rules that can be automated, but reading order, meaningful alternatives and the real experience require human review. A passing report does not certify legal compliance.",
          )}
        </p>
        <p>
          <a href="https://docs.verapdf.org/validation/">
            {msg("Read the veraPDF documentation")}
          </a>
        </p>
      </details>
    </>
  );
}
