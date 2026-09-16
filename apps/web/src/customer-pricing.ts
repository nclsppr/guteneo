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

export const customerPricing: { rates: CustomerRate[]; note: string } = {
  rates: [
    {
      id: "email",
      channel: "E-mail",
      scope: "Un destinataire par e-mail",
      prices: [{ amount: "≈ 0,28 €", unit: "pour 1 000 e-mails" }],
      supplement:
        "Pièces jointes : environ 0,21 € par Go en supplément. Un destinataire par e-mail, offre Essentials. Montants hors taxes.",
    },
    {
      id: "fax",
      channel: "Fax",
      scope: "Selon les pages, la durée et la destination",
      prices: [
        {
          amount: "≈ 0,03–0,12 €",
          unit: "par fax, estimation du scénario ci-dessous",
        },
      ],
      supplement:
        "Exemple : une page vers un numéro fixe luxembourgeois, depuis un numéro de l’EEE, pour 1 à 3 minutes de transmission. Le total varie selon la route et les surcharges ; cette fourchette n’est pas un plafond garanti. Autres destinations et durées sur devis.",
    },
    {
      id: "postal",
      channel: "Courrier postal",
      scope: "Une page en noir et blanc, papier normal",
      prices: [
        { amount: "Dès 2,50 €", unit: "par lettre vers la France" },
        { amount: "Dès 3,02 €", unit: "par lettre vers le Luxembourg" },
      ],
      supplement:
        "Exemples pour une page en noir et blanc sur papier normal, port économique inclus, moins de 500 lettres par mois et grille locale du pays concerné. Autres routes, pages, couleur, papier et modes d’expédition sur devis.",
    },
  ],
  note: "Montants indicatifs hors taxes, vérifiés le 17 septembre 2026. Conversion des tarifs en dollars au cours BCE du 16 septembre : 1 € = 1,1537 $ US. Le devis final, les suppléments et les taxes vous seront présentés avant validation. Services en préparation ; aucun envoi réel dans l’aperçu.",
};
