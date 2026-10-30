import { msg, msgIn } from "./messages";
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
    sameDay: msg("The same working day"),
    nextDay: msg("The next working day"),
    twoDays: msg("Within two working days"),
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
        <h3>
          {msg(
            "By what time should a letter be confirmed for processing?",
          )}
        </h3>
        <Plus size={19} aria-hidden="true" />
      </summary>
      <div className="postal-cutoff-faq__content">
        <p>
          {msg(
            "The cut-off time depends on the recipient’s country. The times below are in Paris time: CET in winter, CEST in summer. They apply to letters sent to the printing service before this cut-off.",
          )}
        </p>
        <table className="postal-cutoff-faq__table">
          <caption>
            {msg("Printing and handover to the postal service, by destination")}
          </caption>
          <colgroup>
            <col className="postal-cutoff-faq__destination" />
            <col className="postal-cutoff-faq__hour" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{msg("Recipient country")}</th>
              <th scope="col">{msg("Before")}</th>
              <th scope="col">{msgIn("postal-timeline", "Handed to postal service")}</th>
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
                    : msg("Other countries")}
                </th>
                <td>
                  <span className="postal-cutoff-faq__time">
                    {formatCutoffHour(cutoff.hour)}
                  </span>
                  {cutoff.fridayHour !== undefined && (
                    <span className="postal-cutoff-faq__friday">
                      {msg("Friday:")}{" "}
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
            "After the cut-off, the letter moves to the next processing cycle. No printing or handover to the postal service takes place on weekends or public holidays.",
          )}
        </p>
        <p>
          {msg(
            "Economy dispatches to Germany and bulk B Mail to Switzerland may require additional processing time. Available destinations and delivery methods are checked when preparing the letter.",
          )}
        </p>
        <p>
          {msg(
            "These times concern handover to the postal service, not receipt by the recipient. Delivery time is additional.",
          )}
        </p>
      </div>
    </details>
  );
}
