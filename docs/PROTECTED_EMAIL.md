# Resend et documents protégés

Candidat du 21 septembre 2026. L’état de publication et les essais réels sont consignés dans `RESEND_PROOF.md` ; les tests locaux ne prouvent pas une livraison réelle.

## Parcours

Un e-mail peut être envoyé sans document, avec son PDF exact en pièce jointe, ou avec un lien protégé. L’import direct dans le formulaire attend l’analyse du PDF. L’expéditeur vérifie le destinataire, le message, le document, l’expiration et le coût avant d’approuver et d’envoyer. Le champ Message suffit ; HTML reste facultatif. Le domaine d’envoi est Guteneo, avec Reply-To vers l’adresse vérifiée de l’auteur. Une désactivation du canal par un administrateur n’est jamais annulée par la configuration automatique.

Le lien ouvre une page Guteneo sans compte destinataire. Le mot de passe est généré, révélé uniquement à un membre autorisé dans son navigateur et transmis séparément par l’expéditeur. Il ne figure jamais dans l’e-mail, les options, les réponses MCP ou les journaux. Le lien opaque fait partie du contenu exact approuvé. Les clients ChatGPT/Claude utilisent le même `prepare_dispatch` avec `options.emailDeliveryMode=protected_link` et `protectedDays` de 1, 7 ou 30 jours (7 par défaut). Les permissions de revue et de confirmation restent identiques. Un assistant ne peut ni activer une délégation, ni révéler le mot de passe.

## Coûts et durée

L’hébergement coûte 100 centimes d’euro par document et période d’hébergement. Un hébergement encore actif est réutilisé sans nouveau débit, y compris pour plusieurs destinataires et deux confirmations concurrentes. Sa durée et son expiration effectives sont affichées avant approbation. Après expiration ou révocation, un nouvel hébergement nécessite une nouvelle acceptation de son prix.

Le tarif de transport Resend est distinct : référence commerciale publique Pro, e-mails supplémentaires à 0,90 USD/1 000, multipliée par deux avec conversion commerciale BCE figée du 16 septembre 2026 (1 EUR = 1,1537 USD). Il s’agit d’une référence de prix public, pas d’une déclaration du coût réel marginal du compte Free. Les PDF n’ajoutent aucun prix par octet. Les fractions de centime des e-mails restent cumulées avant débit.

À la confirmation, la même transaction vérifie l’approbation, réserve le transport, débite au plus une fois les 100 centimes, active l’hébergement et insère l’outbox. La réservation du transport exclut la partie déjà débitée pour l’hébergement ; les plafonds mensuels comptent les deux. Annuler ou subir un rejet de l’e-mail ne supprime pas l’hébergement activé : son prix n’est pas remboursé automatiquement. Il reste accessible jusqu’à sa révocation ou expiration. Le crédit promotionnel existant finance ces montants ; le réapprovisionnement Stripe reste un chantier séparé.

## Protection

L’original privé reste lié à son organisation et à son SHA-256 approuvé. Le lien remplace la pièce jointe sans supprimer cette liaison. Un jeton aléatoire de 256 bits est stocké sous forme d’empreinte ; le mot de passe possède 144 bits aléatoires, avec vérificateur PBKDF2 salé. Le jeton récupérable et le mot de passe sont chiffrés AES-GCM avec `PROTECTED_DOCUMENTS_KEY`, associés à l’organisation, au document et à son empreinte. La clé de 32 octets est un secret Cloudflare, jamais un paramètre du navigateur.

Après vérification du mot de passe, une session HttpOnly de 15 minutes reste limitée à cet hébergement. La lecture passe par le Worker et vérifie encore son état et l’intégrité des octets ; aucun lien R2 ne contourne la protection. Une simple ouverture du lien, notamment par un scanner d’e-mail, ne consomme aucun accès. Les tentatives sont bornées, les pages et les fichiers ne sont pas mis en cache et n’envoient aucun référent. La révocation invalide aussi les sessions existantes et concerne tous les destinataires du lien partagé. La purge conserve un original tant qu’un hébergement actif le nécessite.

Ce service protège l’accès au document ; ce n’est pas un chiffrement de bout en bout. Guteneo analyse le PDF et le destinataire télécharge un PDF normal. Révoquer un lien ne récupère pas une copie déjà téléchargée. Le lien et le mot de passe ne prouvent pas l’identité du lecteur.

## Activation et limites

Migrations 0036 à 0038, secret d’envoi Resend, secret de signature des événements, identité qualifiée du compte/domaine, qualification de tarif datée, clé d’hébergement et activation explicite du canal sont nécessaires. Les limites de compte s’appliquent avant tout appel au fournisseur, avec réservations conservées pour un résultat inconnu ; aucun nouvel essai automatique n’est autorisé après une issue incertaine.

Compte observé le 21 septembre : offre Free, domaine guteneo.com vérifié, 100 e-mails/jour, 3 000/mois, 10 requêtes/seconde. Les plafonds Guteneo peuvent réserver une marge pour le trafic Auth0 indépendant. Un changement d’offre, de compte ou de domaine doit être qualifié à nouveau. Le fournisseur Auth0 installé séparément reste hors de cette activation métier.

L’import d’une liste de destinataires dans tout format et la distribution d’Excel ou d’autres fichiers sont annoncés comme à venir. Le contrat actif reste PDF pour les documents et CSV validé pour les listes. Les comptes destinataires personnels sont prévus plus tard.

Sources : [Resend envoi](https://resend.com/docs/api-reference/emails/send-email), [pièces jointes](https://resend.com/docs/dashboard/emails/attachments), [tarifs](https://resend.com/pricing), [signature des webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests), [chiffrement R2](https://developers.cloudflare.com/r2/reference/data-security/).
