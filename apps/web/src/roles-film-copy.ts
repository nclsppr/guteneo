import type { SupportedLocale } from "./locale";

export const rolesFilmCopy = {
  fr: {
    title: "Quatre rôles.",
    italic: "Un atelier.",
    intro:
      "Qui prépare, qui valide, qui suit : découvrez les rôles de votre équipe.",
    duration: "{duration} secondes · Avec le son",
    videoLabel: "Film sur les rôles de Guteneo",
    transcript:
      "Découvrons les quatre rôles de guteneo et les droits de chacun. L’administrateur gère l’atelier. Il prépare les envois, les approuve et consulte les rapports. Le superviseur prépare les envois. L’approbation et l’accès aux rapports sont des droits distincts, désactivés par défaut. L’opérateur importe les documents et prépare les envois. Il ne peut pas les approuver. L’observateur consulte les documents, les destinataires et le suivi. Il ne modifie aucune donnée de l’atelier et n’approuve aucun envoi. Dans le parcours standard, une personne autorisée approuve l’envoi dans le navigateur.",
  },
  en: {
    title: "Four roles.",
    italic: "One workspace.",
    intro:
      "Who prepares, who approves, who follows progress: discover your team’s roles.",
    duration: "{duration} seconds · With sound",
    videoLabel: "Guteneo team roles film",
    transcript:
      "Let’s look at the four roles in guteneo and what each one can do. The administrator manages the workspace. They prepare and approve outgoing messages, and view reports. A supervisor prepares messages for sending. Approval and access to reports are separate permissions, both disabled by default. The operator imports documents and prepares messages for sending. They cannot approve them. An observer can view documents, recipients and delivery updates. They cannot change anything in the workspace or approve a message. In the standard workflow, an authorised person approves the delivery in the browser.",
  },
  de: {
    title: "Vier Rollen.",
    italic: "Ein Arbeitsbereich.",
    intro:
      "Wer bereitet vor, wer gibt frei, wer verfolgt den Fortschritt: entdecken Sie die Rollen Ihres Teams.",
    duration: "{duration} Sekunden · Mit Ton",
    videoLabel: "Film über die Rollen bei Guteneo",
    transcript:
      "Sehen wir uns die vier Rollen in guteneo und ihre Rechte an. Der Administrator verwaltet den Arbeitsbereich. Er bereitet Sendungen vor, genehmigt sie und liest die Berichte. Der Supervisor bereitet Sendungen vor. Die Rechte zur Genehmigung und zum Lesen der Berichte werden separat vergeben und sind standardmäßig deaktiviert. Der Sachbearbeiter importiert Dokumente und bereitet Sendungen vor. Er darf sie nicht genehmigen. Der Beobachter liest Dokumente, Empfänger und Versandstatus. Er ändert keine Daten im Arbeitsbereich und genehmigt keine Sendungen. Im normalen Ablauf genehmigt eine berechtigte Person den Versand im Browser.",
  },
  lb: {
    title: "Véier Rollen.",
    italic: "Een Atelier.",
    intro:
      "Wie bereet vir, wie gëtt fräi, wie verfollegt de Fortschrëtt: entdeckt d’Rolle vun Ärer Ekipp.",
    duration: "{duration} Sekonnen · Mat Toun",
    videoLabel: "Film iwwer d’Rolle bei Guteneo",
    transcript:
      "Loosst eis déi véier Rolle vu guteneo an hir Rechter entdecken. Den Administrateur geréiert den Atelier. Hie bereet Sendunge vir, geneemegt se a kuckt d'Rapporten. De Supervisor bereet Sendunge vir. D'Geneemegung an den Zougang zu de Rapporte sinn zwou getrennte Berechtegungen, déi standardméisseg ausgeschalt sinn. Den Operateur importéiert d'Dokumenter a bereet d'Sendunge vir. Hie däerf se net geneemegen. Den Observateur kuckt d'Dokumenter, d'Empfänger an de Suivi. Hien ännert keng Donnéeën am Atelier a geneemegt keng Sendung. Am normale Parcours geneemegt eng berechtegt Persoun d'Sendung am Browser.",
  },
} satisfies Record<SupportedLocale, Record<string, string>>;
