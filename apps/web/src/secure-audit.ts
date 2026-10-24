import { msg } from "./messages";

export function secureAuditLabel(type: string) {
  const labels: Record<string, string> = {
    prepared: msg("Partage préparé"),
    approved: msg("Partage approuvé"),
    activated: msg("Partage activé et période facturée"),
    invitation_sent: msg("Invitation soumise au prestataire"),
    claim_pending: msg("Association du destinataire en attente"),
    recipient_bound: msg("Association du destinataire confirmée"),
    access_authorized: msg("Accès autorisé par le serveur"),
    page_served: msg("Page transmise par le serveur"),
    page_displayed: msg("Affichage de page déclaré par le navigateur"),
    download_requested: msg("Téléchargement du PDF demandé"),
    download_started: msg("Transmission du PDF lancée"),
    personal_copy_deposited: msg("Copie personnelle remise"),
    revoked: msg("Accès partagé révoqué"),
    preparation_started: msg("Préparation en cours"),
    preparation_completed: msg("Partage préparé"),
    preparation_failed: msg("Préparation échouée"),
    recipient_association_requested: msg(
      "Association du destinataire en attente",
    ),
    recipient_binding_confirmed: msg("Association du destinataire confirmée"),
    distribution_activated: msg("Partage activé et période facturée"),
    page_access_authorized: msg("Accès à la page autorisé"),
    accessible_text_access_authorized: msg(
      "Accès au texte accessible autorisé",
    ),
    original_download_requested: msg("Téléchargement du PDF demandé"),
    original_transfer_started: msg("Transmission du PDF lancée"),
    personal_copy_delivered: msg("Copie personnelle remise"),
    access_revoked: msg("Accès partagé révoqué"),
    personal_copy_received: msg("Copie personnelle reçue"),
    personal_copy_deleted: msg("Copie personnelle supprimée"),
    workshop_page_access_authorized: msg(
      "Accès à l’aperçu de page autorisé dans l’atelier",
    ),
    workshop_accessible_text_access_authorized: msg(
      "Accès au texte accessible autorisé dans l’atelier",
    ),
  };
  return labels[type] ?? msg("Événement du partage");
}
