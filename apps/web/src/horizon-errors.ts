import { msg } from "./messages";

export function horizonErrorMessage(code: string): string | undefined {
  const errors: Record<string, string> = {
    HORIZON_PLAN_REQUIRED: msg(
      "Un forfait Horizon actif est nécessaire pour ce contrôle. L’administrateur peut consulter l’offre dans l’atelier.",
    ),
    HORIZON_DISABLED: msg(
      "Le forfait Horizon est en préparation. La souscription n’est pas encore ouverte.",
    ),
    HORIZON_UNAVAILABLE: msg(
      "Le forfait Horizon est en préparation. La souscription n’est pas encore ouverte.",
    ),
    HORIZON_TERMS_CHANGED: msg(
      "Les conditions du forfait ont changé. Actualisez l’offre avant de confirmer.",
    ),
    HORIZON_CONSENT_REQUIRED: msg(
      "Les conditions du forfait ont changé. Actualisez l’offre avant de confirmer.",
    ),
    INSUFFICIENT_CREDIT: msg(
      "Le compte ne dispose pas des crédits nécessaires. Actualisez le solde avant de recommencer.",
    ),
    HORIZON_CREDIT_INSUFFICIENT: msg(
      "Le compte ne dispose pas des crédits nécessaires. Actualisez le solde avant de recommencer.",
    ),
    HORIZON_MODE_MISMATCH: msg("Le mode de cet espace est incompatible."),
    PDF_VALIDATOR_CONFIGURATION_REQUIRED: msg(
      "Le service de validation PDF n’est pas encore activé. Votre document est conservé et aucun résultat de conformité n’a été produit.",
    ),
    PDF_VALIDATION_BUSY: msg(
      "Un contrôle de ce PDF est déjà en cours. Actualisez ses rapports avant de recommencer.",
    ),
    PDF_VALIDATION_QUOTA_EXCEEDED: msg(
      "La limite de contrôles PDF est atteinte pour cette période. Réessayez plus tard.",
    ),
    PDF_VALIDATION_FAILED: msg(
      "Le contrôle n’a pas abouti. Aucun résultat de conformité n’a été produit ; vous pouvez demander un nouveau contrôle.",
    ),
    DOCUMENT_NOT_READY: msg(
      "Le PDF doit d’abord terminer sa vérification de sécurité avant un contrôle d’accessibilité ou d’archivage.",
    ),
  };
  return errors[code];
}
