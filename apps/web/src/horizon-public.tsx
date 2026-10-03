import { Plus } from "@phosphor-icons/react";
import { HorizonBenefits, HorizonCreditTerms } from "./horizon-plan";
import { msg } from "./messages";

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
            ? msg("Disponible dans votre atelier")
            : state === "closed"
              ? msg("Souscription indisponible")
              : msg("Consultez votre atelier")}
        </p>
        <h3 id="horizon-public-title">guteneo Horizon</h3>
        <p className="horizon-price">
          <strong>30 €</strong>
          <span>{msg("par mois")}</span>
        </p>
        <p>
          {msg("Repérez les obstacles dans vos PDF avant de les partager.")}
        </p>
        <p>
          {msg(
            "Un forfait mensuel pour contrôler l’accessibilité PDF/UA et l’archivage PDF/A, depuis votre atelier ou votre assistant.",
          )}
        </p>
      </div>
      <div>
        <HorizonBenefits />
        <p className="horizon-limit">
          {msg(
            "Limite incluse : 100 tentatives de contrôle par mois civil, PDF de 10 Mio et 100 pages maximum. Les contrôles interrompus comptent dans cette limite.",
          )}
        </p>
        <p className="horizon-limit">
          {state === "available"
            ? msg(
                "L’administrateur peut souscrire dans l’atelier avec au moins 30 € de crédits disponibles. Les contrôles sont ensuite accessibles aux membres autorisés.",
              )
            : state === "closed"
              ? msg(
                  "La souscription et les contrôles PDF sont actuellement indisponibles. Consultez l’offre dans votre atelier.",
                )
              : msg(
                  "La disponibilité du forfait est confirmée dans votre atelier avant toute souscription.",
                )}
        </p>
        <HorizonCreditTerms />
        <a className="text-link" href="/app/plan">
          {msg("Découvrir le forfait Horizon")}
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
          {msg("Que comprennent les contrôles PDF du forfait Horizon ?")}
          <Plus size={19} aria-hidden="true" />
        </summary>
        <p>
          {msg(
            "Horizon comprend les contrôles PDF/UA-1 et PDF/UA-2, PDF/A-1b, 2b, 3b et 4, les rapports liés au PDF original et une liste de points à revoir manuellement. Le même contrôle est accessible depuis le plugin de votre assistant lorsque le service et le forfait sont actifs.",
          )}
        </p>
        <p>
          {msg(
            "Le forfait de 30 € par mois est prélevé sur les crédits disponibles du compte. Seul l’administrateur peut souscrire, résilier ou gérer la facturation.",
          )}
        </p>
        {state !== "available" && (
          <p>
            {msg(
              "Consultez l’offre dans votre atelier pour vérifier la disponibilité du service avant de souscrire.",
            )}
          </p>
        )}
        <HorizonCreditTerms />
      </details>
      <details>
        <summary>
          {msg("La loi européenne impose-t-elle des PDF accessibles ?")}
          <Plus size={19} aria-hidden="true" />
        </summary>
        <p>
          {msg(
            "L’Acte européen sur l’accessibilité, directive (UE) 2019/882, s’applique depuis le 28 juin 2025 à certains produits et services destinés aux consommateurs, dont le commerce électronique. Son périmètre comporte des exceptions, notamment pour les microentreprises qui fournissent des services. Il n’impose pas une obligation universelle à tous les PDF.",
          )}
        </p>
        <p>
          {msg(
            "La directive (UE) 2016/2102 encadre aussi les sites et applications mobiles du secteur public. Les obligations précises dépendent du service, du document, des exceptions et de la transposition nationale.",
          )}
        </p>
        <p>
          <a href="https://eur-lex.europa.eu/EN/legal-content/summary/accessibility-of-products-and-services.html">
            {msg("Lire la synthèse européenne sur l’accessibilité")}
          </a>
          {" · "}
          <a href="https://eur-lex.europa.eu/legal-content/en/LSU/?uri=CELEX%3A32016L2102">
            {msg("Lire les règles applicables au secteur public")}
          </a>
        </p>
      </details>
      <details>
        <summary>
          {msg(
            "Un PDF/A ou un contrôle PDF/UA suffit-il à prouver l’accessibilité ?",
          )}
          <Plus size={19} aria-hidden="true" />
        </summary>
        <p>
          {msg(
            "PDF/A sert à la conservation à long terme ; PDF/UA porte sur l’accessibilité. Ces objectifs sont distincts. veraPDF vérifie les règles contrôlables automatiquement, mais l’ordre de lecture, la pertinence des alternatives et l’expérience réelle nécessitent une revue humaine. Un rapport favorable ne constitue pas une certification de conformité légale.",
          )}
        </p>
        <p>
          <a href="https://docs.verapdf.org/validation/">
            {msg("Consulter la documentation de veraPDF")}
          </a>
        </p>
      </details>
    </>
  );
}
