import { msg } from "./messages";
import { formatLocale } from "./locale";
import { useEffect, useRef } from "react";
import { Plus } from "@phosphor-icons/react";
import { POSTAL_CUTOFF_SCHEDULE, formatCutoffHour } from "./postal-cutoff";
import "./postal-cutoff-faq.css";

export function PostalCutoffFaq() {
  const countryNames = new Intl.DisplayNames([formatLocale()], {
    type: "region",
  });
  const handoverLabels = {
    sameDay: msg("Le même jour ouvré"),
    nextDay: msg("Le jour ouvré suivant"),
    twoDays: msg("Sous deux jours ouvrés"),
  } as const;

  const details = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function openLinkedAnswer() {
      if (window.location.hash === "#postal-cutoff-faq" && details.current) {
        details.current.open = true;
      }
    }
    openLinkedAnswer();
    window.addEventListener("hashchange", openLinkedAnswer);
    return () => window.removeEventListener("hashchange", openLinkedAnswer);
  }, []);

  return (
    <details
      ref={details}
      id="postal-cutoff-faq"
      className="postal-cutoff-faq"
      tabIndex={-1}
    >
      <summary>
        {msg(
          "À quelle heure faut-il confirmer un courrier pour qu’il soit traité ?",
        )}
        <Plus size={19} aria-hidden="true" />
      </summary>
      <div className="postal-cutoff-faq__content">
        <p>
          {msg(
            "L’heure limite dépend du pays du destinataire. Les horaires ci-dessous sont en heure de Paris : CET en hiver, CEST en été. Ils s’appliquent aux courriers transmis au service d’impression avant cette limite.",
          )}
        </p>
        <table className="postal-cutoff-faq__table">
          <caption>
            {msg("Impression et remise à la poste, selon la destination")}
          </caption>
          <colgroup>
            <col className="postal-cutoff-faq__destination" />
            <col className="postal-cutoff-faq__hour" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{msg("Pays destinataire")}</th>
              <th scope="col">{msg("Avant")}</th>
              <th scope="col">{msg("Remise à la poste")}</th>
            </tr>
          </thead>
          <tbody>
            {POSTAL_CUTOFF_SCHEDULE.map((cutoff) => (
              <tr key={cutoff.id}>
                <th scope="row">
                  {cutoff.countries.length
                    ? cutoff.countries
                        .map((country) => countryNames.of(country) ?? country)
                        .join(", ")
                    : msg("Autres pays")}
                </th>
                <td>
                  <span className="postal-cutoff-faq__time">
                    {formatCutoffHour(cutoff.hour)}
                  </span>
                  {cutoff.fridayHour !== undefined && (
                    <span className="postal-cutoff-faq__friday">
                      {msg("Vendredi :")}{" "}
                      <span className="postal-cutoff-faq__time">
                        {formatCutoffHour(cutoff.fridayHour)}
                      </span>
                    </span>
                  )}
                </td>
                <td>{handoverLabels[cutoff.handover]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          {msg(
            "Après l’heure limite, le courrier passe au prochain cycle de traitement. Il n’y a pas d’impression ni de remise à la poste les week-ends et jours fériés.",
          )}
        </p>
        <p>
          {msg(
            "Les envois Economy vers l’Allemagne et le courrier B en nombre vers la Suisse peuvent demander un délai de traitement supplémentaire. Les destinations et les modes d’envoi disponibles sont vérifiés lors de la préparation du courrier.",
          )}
        </p>
        <p>
          {msg(
            "Ces horaires concernent la remise à la poste, pas la réception par le destinataire. Le délai de distribution s’ajoute ensuite.",
          )}
        </p>
      </div>
    </details>
  );
}
