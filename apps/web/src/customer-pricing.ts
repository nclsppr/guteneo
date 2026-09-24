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
      scope: "Un destinataire, avec ou sans PDF joint",
      prices: [
        { amount: "≈ 1,56 €", unit: "pour 1 000 e-mails" },
        {
          amount: "1 €",
          unit: "par document hébergé avec mot de passe, en option",
        },
      ],
      supplement:
        "Le PDF joint n’ajoute pas de supplément de transport. L’option de lien protégé remplace la pièce jointe ; son hébergement s’ajoute au prix de l’e-mail. Montants hors taxes.",
    },
    {
      id: "fax",
      channel: "Fax",
      scope: "Selon les pages, la durée et la destination",
      prices: [
        {
          amount: "≈ 0,05–0,17 €",
          unit: "par fax, estimation du scénario ci-dessous",
        },
      ],
      supplement:
        "Exemple : une page depuis notre numéro luxembourgeois vers un numéro fixe au Luxembourg, pour une estimation de 1 à 4 minutes facturées de transmission. Le coût varie selon la durée réelle et la route ; cette fourchette n’est pas un plafond garanti. Le devis indique le plafond avant confirmation. Autres destinations et durées sur devis.",
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
  note: "Montants indicatifs hors taxes. Tarifs e-mail révisés le 21 septembre 2026 ; fax et courrier vérifiés le 17 septembre 2026. Conversion des tarifs en dollars au cours BCE du 16 septembre : 1 € = 1,1537 $ US. Le prix applicable et les options figurent dans le devis avant validation. Le courrier postal est disponible après configuration dans votre atelier connecté ; l’aperçu reste une démonstration sans envoi réel.",
};
