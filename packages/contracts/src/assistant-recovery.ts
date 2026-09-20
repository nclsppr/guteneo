import { z } from "zod";

export const assistantRecoverySchema = z
  .object({
    action: z.enum([
      "check_document",
      "check_dispatch",
      "check_mandate",
      "reconnect",
      "review_same_dispatch",
      "read_same_document",
      "replace_file",
      "contact_support",
    ]),
    message: z.string(),
    tool: z
      .enum([
        "get_document",
        "get_dispatch_status",
        "get_expert_status",
        "review_dispatch",
        "read_document_pages",
      ])
      .nullable(),
    retry: z.enum(["read_only", "after_change", "never_resend"]),
  })
  .strict();
export type AssistantRecovery = z.infer<typeof assistantRecoverySchema>;

export type AssistantRecoveryContext = "read_document_pages";

function readSameDocument(): AssistantRecovery {
  return {
    action: "read_same_document",
    tool: "read_document_pages",
    retry: "after_change",
    message:
      "Conservez le même PDF. Après résolution du problème de lecture, reprenez read_document_pages avec les mêmes documentId et page. Ne répétez pas une lecture qui échoue. Cette lecture ne nécessite ni envoi préparé ni mandat expert : ne créez pas d’envoi et ne demandez pas de mandat pour la reprendre.",
  };
}

const linkedFaxRenewal =
  "Si le devis est expiré ou invalide, seul un fax avec status=prepared et attemptCount=0 explicitement peut être renouvelé ; un champ absent ne vaut pas zéro. Utilisez prepare_fax avec renewalOf=ancien dispatchId et les mêmes documentId, phone E.164 et ceilingMinor exacts. Ne préparez jamais librement un autre envoi. Présentez le nouveau devis, puis obtenez une nouvelle approbation ou reprenez la revue expert complète sur le nouvel identifiant sous l’autorité actuelle ; aucun ancien accord ni jeton de revue ne se reporte.";

/** Closed, content-free actions. Error categories never authorize a send. */
export function assistantRecovery(
  code: string,
  context?: AssistantRecoveryContext,
): AssistantRecovery {
  if (code === "CONNECTION_REVOKED")
    return {
      action: "reconnect",
      tool: null,
      retry: "after_change",
      message:
        "Cette connexion doit être réautorisée par un administrateur avant de reprendre ici. Cela n’active ni ne renouvelle le mandat expert.",
    };
  if (
    [
      "INSUFFICIENT_SCOPE",
      "TOKEN_EXPIRED",
      "TOKEN_INVALID",
      "POSTAL_AUTHORITY_CHANGED",
      "EXPERT_STATUS_AUTHORITY_CHANGED",
    ].includes(code)
  )
    return {
      action: "reconnect",
      tool: null,
      retry: "after_change",
      message:
        "Reconnectez Guteneo dans l’assistant avec les droits nécessaires, puis reprenez ici. Une reconnexion ne renouvelle pas le mandat expert.",
    };
  if (
    [
      "EXPERT_OPT_IN_REQUIRED",
      "EXPERT_CHANNEL_DISABLED",
      "EXPERT_LIMIT_EXCEEDED",
      "EXPERT_BUDGET_EXCEEDED",
      "EXPERT_AUTHORITY_CHANGED",
    ].includes(code)
  )
    return {
      action: "check_mandate",
      tool: "get_expert_status",
      retry: "read_only",
      message:
        "Consultez le mandat de cette connexion et ses limites avant de continuer. L’assistant ne peut ni l’activer ni augmenter les plafonds.",
    };
  if (
    [
      "LIVE_QUOTE_INVALID",
      "EXPERT_REVIEW_INVALID",
      "EXPERT_REVIEW_EXPIRED",
    ].includes(code)
  )
    return context === "read_document_pages"
      ? readSameDocument()
      : {
          action: "check_dispatch",
          tool: "get_dispatch_status",
          retry: "never_resend",
          message:
            "Relisez le statut du même envoi. S’il est toujours préparé et son devis valide, reprenez sa revue. " +
            linkedFaxRenewal,
        };
  if (["FAX_QUOTE_RENEWAL_UNSAFE", "RENEWAL_CONTENT_MISMATCH"].includes(code))
    return context === "read_document_pages"
      ? readSameDocument()
      : {
          action: "check_dispatch",
          tool: "get_dispatch_status",
          retry: "never_resend",
          message:
            "Arrêtez le renouvellement et consultez le statut du même envoi pour expliquer le refus. Ne contournez pas ce blocage par une préparation libre, un autre PDF, numéro, plafond ou une nouvelle clé. Un résultat de transmission incertain ne doit jamais être renvoyé.",
        };
  if (code === "QUOTE_STILL_VALID")
    return context === "read_document_pages"
      ? readSameDocument()
      : {
          action: "check_dispatch",
          tool: "get_dispatch_status",
          retry: "never_resend",
          message:
            "Consultez le statut du même envoi. Si son devis est toujours valide et son statut préparé, reprenez la revue et l’approbation de ce devis existant ; aucun renouvellement ni nouvel envoi n’est nécessaire.",
        };
  if (code === "EXPERT_REVIEW_SEQUENCE_REQUIRED")
    return {
      action: "review_same_dispatch",
      tool: "review_dispatch",
      retry: "after_change",
      message:
        "Reprenez la lecture du même envoi à la page 1, puis suivez nextPage sans sauter de pages.",
    };
  if (
    [
      "DOCUMENT_QUARANTINED",
      "SCAN_IN_PROGRESS",
      "SCAN_QUOTA_EXCEEDED",
    ].includes(code)
  )
    return {
      action: "check_document",
      tool: "get_document",
      retry: "read_only",
      message:
        "Consultez la vérification du même PDF et suivez son action proposée ; aucun nouvel import n’est nécessaire.",
    };
  if (
    [
      "REVIEW_RENDER_FAILED",
      "REVIEW_RENDER_TIMEOUT",
      "RENDERER_NOT_CONFIGURED",
      "EXPERT_DOCUMENT_UNAVAILABLE",
      "EXPERT_DOCUMENT_TOO_LARGE",
      "REVIEW_IMAGE_BUDGET",
      "REVIEW_RESULT_SIZE",
    ].includes(code)
  )
    return context === "read_document_pages"
      ? readSameDocument()
      : {
          action: "review_same_dispatch",
          tool: "review_dispatch",
          retry: "after_change",
          message:
            "Conservez le même envoi. La revue par images accepte les PDF jusqu’à 10 Mio ; le PDF intégré jusqu’à 1 Mio est une alternative seulement si l’hôte sait le lire. Ne répétez pas une lecture qui échoue et n’approuvez aucune page illisible.",
        };
  if (
    ["DOWNLOAD_FAILED", "DOWNLOAD_TIMEOUT", "DOWNLOAD_EXPIRED"].includes(code)
  )
    return {
      action: "replace_file",
      tool: null,
      retry: "after_change",
      message:
        "Joignez à nouveau le PDF original dans cette conversation pour renouveler son accès. Ne le reconstruisez pas à partir de son texte.",
    };
  if (code === "REVIEW_UNSUPPORTED_CONTENT")
    return {
      action: "contact_support",
      tool: null,
      retry: "after_change",
      message:
        "Le document ne peut pas être relu fidèlement pour cet envoi. Expliquez cette limite ici ; une revue humaine reste une alternative choisie par l’utilisateur, sans ouverture automatique du site.",
    };
  if (code === "DOCUMENT_INTEGRITY_ERROR")
    return {
      action: "contact_support",
      tool: null,
      retry: "after_change",
      message:
        "Arrêtez cette revue et contactez l’assistance : l’intégrité du PDF ou sa preuve de vérification doit être rétablie avant toute approbation. Changer de format ou ouvrir le site ne résout pas ce blocage.",
    };
  if (code.startsWith("POSTAL_ADDRESS_PAGE_"))
    return {
      action: "check_document",
      tool: "get_document",
      retry: "after_change",
      message:
        "Conservez le PDF source et la clé de génération. Si un nouveau document a été retourné, consultez sa vérification sans régénérer. Après une interruption temporaire, reprenez create_postal_address_page avec exactement la même clé et les mêmes paramètres. Une adresse, un format ou une limite refusés doivent être corrigés explicitement avec la personne avant une nouvelle demande ; ne tronquez pas l’adresse et ne créez aucun envoi pour contourner ce refus.",
    };
  if (
    [
      "INVALID_PDF",
      "REVIEW_PDF_INVALID",
      "FILE_TOO_LARGE",
      "PDF_SIZE",
      "NOT_PDF",
      "CORRUPT_PDF",
      "UNSUPPORTED_PDF",
      "ENCRYPTED_PDF",
      "PAGE_LIMIT",
      "COMPLEX_PDF",
      "ACTIVE_PDF",
    ].includes(code)
  )
    return {
      action: "replace_file",
      tool: null,
      retry: "after_change",
      message:
        "Un PDF valide et compatible est nécessaire, dans la limite de 10 Mio et 100 pages. Demandez une version corrigée à l’utilisateur ; ne modifiez pas l’original sans sa demande et ne répétez pas l’import du même fichier invalide.",
    };
  if (code === "SOURCE_NOT_ALLOWED")
    return {
      action: "contact_support",
      tool: null,
      retry: "after_change",
      message:
        "La source du fichier doit être autorisée par Guteneo. Conservez le diagnostic de domaine pour l’assistance, sans partager son URL temporaire ; ne multipliez pas les imports et n’inventez pas une autre URL.",
    };
  if (["CREDIT_EXHAUSTED", "QUOTA_EXCEEDED"].includes(code))
    return {
      action: "check_dispatch",
      tool: "get_dispatch_status",
      retry: "after_change",
      message:
        "Le budget du mandat ne remplace pas les crédits et quotas du compte. Conservez le même envoi et attendez que cette limite soit résolue ; ne créez pas un doublon et ne promettez pas de recharge disponible.",
    };
  if (context === "read_document_pages") return readSameDocument();
  return {
    action: "check_dispatch",
    tool: "get_dispatch_status",
    retry: "never_resend",
    message:
      "Si un envoi existe déjà, consultez son statut avant toute nouvelle action. Ne créez pas de doublon et ne renvoyez jamais un envoi au résultat incertain.",
  };
}
