import { msg } from "./messages";
/** Customer-facing indications; approved operational quotes remain separate.
 * Sources and calculation provenance are maintained in internal pricing evidence.
 * Do not publish provider acquisition costs or margin arithmetic here.
 */
export type CustomerRate = {
  id: "email" | "fax" | "postal";
  channel: string;
  scope: string;
  prices: { amount: string; unit: string }[];
  supplement: string;
};

export function getCustomerPricing(): { rates: CustomerRate[]; note: string } {
  return {
    rates: [
      {
        id: "email",
        channel: msg("Email"),
        scope: msg("One recipient, with or without a PDF attachment"),
        prices: [
          { amount: msg("≈ €1.56"), unit: msg("per 1,000 emails") },
          {
            amount: msg("€1"),
            unit: msg("per optional password-protected hosted document"),
          },
        ],
        supplement: msg(
          "A PDF attachment adds no transport surcharge. The protected-link option replaces the attachment; its hosting adds to the email price. Amounts exclude tax.",
        ),
      },
      {
        id: "fax",
        channel: msg("Fax"),
        scope: msg("Depends on pages, duration and destination"),
        prices: [
          {
            amount: msg("≈ €0.05–0.17"),
            unit: msg("per fax, estimate for the scenario below"),
          },
        ],
        supplement: msg(
          "Example: one page from our Luxembourg number to a landline in Luxembourg, with an estimated 1 to 4 billed transmission minutes. Cost varies with actual duration and route; this range is not a guaranteed cap. The quote shows the cap before confirmation. Other destinations and durations require a quote.",
        ),
      },
      {
        id: "postal",
        channel: msg("Post"),
        scope: msg("One black-and-white page, standard paper"),
        prices: [
          { amount: msg("From €2.50"), unit: msg("per letter to France") },
          {
            amount: msg("From €3.02"),
            unit: msg("per letter to Luxembourg"),
          },
        ],
        supplement: msg(
          "Examples for one black-and-white page on standard paper, including economy postage, fewer than 500 letters per month and the local rate schedule of the country concerned. Other routes, pages, colour, paper and delivery options require a quote.",
        ),
      },
    ],
    note: msg(
      "Indicative amounts excluding tax. Email rates revised on 21 September 2026; fax and post checked on 17 September 2026. Dollar rates converted at the ECB rate of 16 September: €1 = US$1.1537. The applicable price and options appear in the quote before approval. Postal mail is available after setup in your connected workspace; the preview remains a demonstration with no real dispatches.",
    ),
  };
}
