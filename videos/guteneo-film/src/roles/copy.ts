export type RoleFilmLocale = "fr" | "en" | "de" | "lb";
type RoleScene = { title: string; body: string; note: string };
type RoleCopy = {
  intro: [string, string];
  actions: [string, string, string, string];
  option: string;
  scenes: [RoleScene, RoleScene, RoleScene, RoleScene];
  review: string;
  reviewItems: string;
};

export const rolesCopy: Record<RoleFilmLocale, RoleCopy> = {
  fr: {
    intro: ["Quatre rôles.", "Des droits clairs."],
    actions: ["Consulter", "Préparer", "Approuver", "Rapports"],
    option: "Option",
    scenes: [
      { title: "Administrateur", body: "Gère l’atelier, les accès et la facturation.", note: "Prépare · Approuve · Consulte les rapports" },
      { title: "Superviseur", body: "Prépare. Approbation et rapports sont attribués séparément.", note: "Deux options, désactivées par défaut." },
      { title: "Opérateur", body: "Importe les documents et prépare les envois.", note: "Validation par un administrateur ou superviseur habilité." },
      { title: "Observateur", body: "Consulte les documents, les destinataires et le suivi.", note: "Lecture seule, sans modification." },
    ],
    review: "Parcours standard : validation dans le navigateur.",
    reviewItems: "Contenu · Destinataire · Options · Coût",
  },
  en: {
    intro: ["Four roles.", "Clear permissions."],
    actions: ["Read", "Prepare", "Approve", "Reports"],
    option: "Optional",
    scenes: [
      { title: "Administrator", body: "Manages the workspace, access and billing.", note: "Prepares · Approves · Reads reports" },
      { title: "Supervisor", body: "Prepares. Approval and reports are granted separately.", note: "Two options, both off by default." },
      { title: "Operator", body: "Imports documents and prepares dispatches.", note: "An administrator or authorized supervisor approves." },
      { title: "Observer", body: "Reads documents, recipients and dispatch status.", note: "Read-only access, without changes." },
    ],
    review: "Standard workflow: review and approve in the browser.",
    reviewItems: "Content · Recipient · Options · Cost",
  },
  de: {
    intro: ["Vier Rollen.", "Klare Rechte."],
    actions: ["Lesen", "Vorbereiten", "Genehmigen", "Berichte"],
    option: "Optional",
    scenes: [
      { title: "Administrator", body: "Verwaltet Arbeitsbereich, Zugänge und Abrechnung.", note: "Vorbereiten · Genehmigen · Berichte lesen" },
      { title: "Supervisor", body: "Bereitet vor. Genehmigung und Berichte werden getrennt vergeben.", note: "Zwei Optionen, standardmäßig deaktiviert." },
      { title: "Sachbearbeiter", body: "Importiert Dokumente und bereitet Sendungen vor.", note: "Ein Administrator oder berechtigter Supervisor genehmigt." },
      { title: "Beobachter", body: "Liest Dokumente, Empfänger und Versandstatus.", note: "Lesezugriff, ohne Änderungen." },
    ],
    review: "Standardablauf: im Browser prüfen und genehmigen.",
    reviewItems: "Inhalt · Empfänger · Optionen · Kosten",
  },
  lb: {
    intro: ["Véier Rollen.", "Kloer Rechter."],
    actions: ["Liesen", "Virbereeden", "Geneemegen", "Rapporten"],
    option: "Optional",
    scenes: [
      { title: "Administrateur", body: "Verwalt den Atelier, d’Zougäng an d’Facturatioun.", note: "Virbereeden · Geneemegen · Rapporte liesen" },
      { title: "Supervisor", body: "Bereet vir. Geneemegung a Rapporte gi getrennt verginn.", note: "Zwou Optiounen, standardméisseg ausgeschalt." },
      { title: "Operateur", body: "Importéiert Dokumenter a bereet Sendunge vir.", note: "En Administrateur oder berechtegte Supervisor geneemegt." },
      { title: "Observateur", body: "Liest Dokumenter, Empfänger a Versandstatus.", note: "Lieszougang, ouni Ännerungen." },
    ],
    review: "Standardparcours: am Browser kontrolléieren a geneemegen.",
    reviewItems: "Inhalt · Empfänger · Optiounen · Käschten",
  },
};
