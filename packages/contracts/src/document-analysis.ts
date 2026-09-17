/** Safe, shared recovery contract. No raw engine findings or document content. */
export type DocumentAnalysis = {
  state: "processing" | "ready" | "retryable" | "blocked";
  code: string;
  title: string;
  message: string;
  nextAction:
    "wait" | "rescan" | "replace_document" | "contact_support" | "continue";
  retryAfterSeconds: number | null;
};

export function documentAnalysis(
  status: string,
  state: DocumentAnalysis["state"] = "retryable",
  code = "not_started",
): DocumentAnalysis {
  if (status === "ready")
    return {
      state: "ready",
      code: "verified",
      title: "PDF prêt",
      message: "Votre PDF a été vérifié. Vous pouvez préparer votre envoi.",
      nextAction: "continue",
      retryAfterSeconds: null,
    };
  if (status === "purged" || status === "rejected")
    return {
      state: "blocked",
      code: status,
      title: "PDF indisponible",
      message: "Ce document ne peut pas être utilisé. Choisissez un autre PDF.",
      nextAction: "replace_document",
      retryAfterSeconds: null,
    };
  if (state === "processing")
    return {
      state,
      code,
      title: "Vérification du PDF en cours",
      message:
        "Votre PDF est bien enregistré. Guteneo poursuit sa vérification automatiquement ; cela peut prendre quelques minutes. Vous n’avez pas besoin de le déposer à nouveau.",
      nextAction: "wait",
      retryAfterSeconds: 15,
    };
  if (code === "security_rejected")
    return {
      state: "blocked",
      code,
      title: "PDF bloqué par le contrôle de sécurité",
      message:
        "Le contrôle de sécurité a refusé ce PDF. Vérifiez le fichier d’origine ou choisissez un autre PDF pour continuer.",
      nextAction: "replace_document",
      retryAfterSeconds: null,
    };
  if (code === "pdf_rejected")
    return {
      state: "blocked",
      code,
      title: "Ce PDF ne peut pas être utilisé",
      message:
        "Le PDF n’a pas passé le contrôle de format. Vérifiez qu’il s’ouvre correctement et qu’il n’est pas protégé par un mot de passe, puis déposez une version compatible.",
      nextAction: "replace_document",
      retryAfterSeconds: null,
    };
  if (code === "service_not_configured" || code === "signatures_stale")
    return {
      state: "blocked",
      code,
      title: "Service de vérification indisponible",
      message:
        "Votre PDF est conservé. Une intervention de Guteneo est nécessaire pour rétablir sa vérification. Contactez l’assistance pour reprendre votre envoi.",
      nextAction: "contact_support",
      retryAfterSeconds: null,
    };
  if (code === "access_revoked")
    return {
      state: "blocked",
      code,
      title: "Vérification suspendue après un changement d’accès",
      message:
        "Les droits du compte qui a lancé la vérification ont changé. Demandez à un administrateur de votre organisation de reprendre l’analyse depuis son compte.",
      nextAction: "contact_support",
      retryAfterSeconds: null,
    };
  if (state === "blocked")
    return {
      state,
      code,
      title: "Vérification du PDF interrompue",
      message:
        "Guteneo ne peut pas terminer la vérification de ce document. Contactez l’assistance depuis votre espace Guteneo pour reprendre votre envoi.",
      nextAction: "contact_support",
      retryAfterSeconds: null,
    };
  return {
    state: "retryable",
    code,
    title:
      code === "not_started"
        ? "PDF à vérifier"
        : "La vérification prend plus de temps que prévu",
    message:
      code === "not_started"
        ? "Votre PDF est bien enregistré. Lancez sa vérification pour pouvoir préparer votre envoi ; aucun nouveau dépôt n’est nécessaire."
        : "Guteneo n’a pas pu terminer la vérification. Votre PDF est conservé : relancez l’analyse ici, sans le déposer à nouveau. Si le problème persiste, contactez l’assistance.",
    nextAction: "rescan",
    retryAfterSeconds: null,
  };
}
