import type { SupportedLocale } from "./locale";

export const rolesFilmCopy = {
  fr: {
    title: "Quatre rôles.",
    italic: "Un atelier.",
    intro:
      "Qui prépare, qui valide, qui suit : les rôles de votre équipe en 36 secondes.",
    duration: "36 secondes · Avec le son",
    videoLabel: "Film sur les rôles de Guteneo",
    transcript:
      "L’administrateur gère l’atelier, ses membres, la facturation et les délégations. Le superviseur prépare ; ses droits d’approbation et de rapports sont accordés séparément et désactivés par défaut. L’opérateur importe les documents et prépare les demandes ; il confie leur validation à une personne habilitée. L’observateur consulte les documents, les destinataires et le suivi, sans modifier. Les contrôles du document, du destinataire, du coût et du canal restent applicables.",
  },
  en: {
    title: "Four roles.",
    italic: "One workspace.",
    intro:
      "Who prepares, who approves, who follows progress: your team’s roles in 36 seconds.",
    duration: "36 seconds · With sound",
    videoLabel: "Guteneo team roles film",
    transcript:
      "The administrator manages the workspace, its members, billing and delegations. The supervisor prepares work; approval and reporting permissions are granted separately and disabled by default. The operator imports documents and prepares requests, then asks an authorised person to approve them. The observer reads documents, recipients and progress without making changes. Document, recipient, cost and channel checks continue to apply.",
  },
  de: {
    title: "Vier Rollen.",
    italic: "Ein Arbeitsbereich.",
    intro:
      "Wer bereitet vor, wer gibt frei, wer verfolgt den Fortschritt: die Rollen Ihres Teams in 36 Sekunden.",
    duration: "36 Sekunden · Mit Ton",
    videoLabel: "Film über die Rollen bei Guteneo",
    transcript:
      "Der Administrator verwaltet den Arbeitsbereich, seine Mitglieder, die Abrechnung und die Delegationen. Der Supervisor bereitet Vorgänge vor; Freigabe- und Berichtsrechte werden getrennt vergeben und sind standardmäßig deaktiviert. Der Sachbearbeiter importiert Dokumente und bereitet Anfragen vor. Eine berechtigte Person muss sie freigeben. Der Beobachter liest Dokumente, Empfänger und Status, ohne Änderungen vorzunehmen. Die Prüfungen von Dokument, Empfänger, Kosten und Versandkanal gelten weiterhin.",
  },
  lb: {
    title: "Véier Rollen.",
    italic: "Een Atelier.",
    intro:
      "Wie bereet vir, wie gëtt fräi, wie verfollegt de Fortschrëtt: d’Rolle vun Ärer Ekipp a 36 Sekonnen.",
    duration: "36 Sekonnen · Mat Toun",
    videoLabel: "Film iwwer d’Rolle bei Guteneo",
    transcript:
      "Den Administrateur geréiert den Atelier, seng Memberen, d’Rechnungen an d’Delegatiounen. De Supervisor bereet d’Aarbecht vir; d’Rechter fir Fräigaben a Rapporte gi separat verginn a si standardméisseg ausgeschalt. Den Operateur importéiert Dokumenter a bereet Ufroe vir. Eng autoriséiert Persoun muss se fräiginn. Den Observateur liest Dokumenter, Empfänger a Status, ouni eppes ze änneren. D’Kontrolle vum Dokument, vum Empfänger, vun de Käschten a vum Versandkanal gëlle weider.",
  },
} satisfies Record<SupportedLocale, Record<string, string>>;
