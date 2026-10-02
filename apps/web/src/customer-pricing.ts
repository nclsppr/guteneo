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
        channel: msg("E-mail"),
        scope: msg("Un destinataire, avec ou sans PDF joint"),
        prices: [
          { amount: msg("≈ 1,56 €"), unit: msg("pour 1 000 e-mails") },
          { amount: msg("1 €"), unit: msg("par document hébergé avec mot de passe, en option") },
        ],
        supplement: msg("Le PDF joint n’ajoute pas de supplément de transport. L’option de lien protégé remplace la pièce jointe ; son hébergement s’ajoute au prix de l’e-mail. Montants hors taxes."),
      },
      {
        id: "fax",
        channel: msg("Fax"),
        scope: msg("Selon les pages, la durée et la destination"),
        prices: [
          {
            amount: msg("≈ 0,05–0,17 €"),
            unit: msg("par fax, estimation du scénario ci-dessous"),
          },
        ],
        supplement: msg(
          "Exemple : une page depuis notre numéro luxembourgeois vers un numéro fixe au Luxembourg, pour une estimation de 1 à 4 minutes facturées de transmission. Le coût varie selon la durée réelle et la route ; cette fourchette n’est pas un plafond garanti. Le devis indique le plafond avant confirmation. Autres destinations et durées sur devis.",
        ),
      },
      {
        id: "postal",
        channel: msg("Courrier postal"),
        scope: msg("Une page en noir et blanc, papier normal"),
        prices: [
          { amount: msg("Dès 2,50 €"), unit: msg("par lettre vers la France") },
          {
            amount: msg("Dès 3,02 €"),
            unit: msg("par lettre vers le Luxembourg"),
          },
        ],
        supplement: msg(
          "Exemples pour une page en noir et blanc sur papier normal, port économique inclus, moins de 500 lettres par mois et grille locale du pays concerné. Autres routes, pages, couleur, papier et modes d’expédition sur devis.",
        ),
      },
    ],
    note: msg(
      "Montants indicatifs hors taxes. Tarifs e-mail révisés le 21 septembre 2026 ; fax et courrier vérifiés le 17 septembre 2026. Conversion des tarifs en dollars au cours BCE du 16 septembre : 1 € = 1,1537 $ US. Le prix applicable et les options figurent dans le devis avant validation. Le courrier postal est disponible après configuration dans votre atelier connecté ; l’aperçu reste une démonstration sans envoi réel.",
    ),
  };
}
