---
name: secure-distribution
description: Prepare, track or revoke an account-protected Guteneo PDF distribution with a defined retention term, optional original download and authorized personal copy. Use when the user requests secure document delivery with a recipient account, distinct from the legacy password-protected email link.
---

# Distribution sécurisée Guteneo

Utiliser le MCP Guteneo connecté et ses capacités actuelles. Ce parcours prépare
une distribution depuis un atelier ; il n’accède jamais au coffre personnel du
destinataire et n’affirme pas avoir vérifié son identité.

1. Consulter `get_capabilities`. Si les outils sécurisés ou le service ne sont
   pas disponibles, expliquer le blocage sans basculer silencieusement vers un
   lien public, un mot de passe ou une pièce jointe.
2. Respecter les exclusions documentaires du plugin : données de carte PCI DSS,
   santé protégée, identifiants gouvernementaux, secrets d’authentification et
   données personnelles sensibles. Un antivirus ne qualifie pas ces catégories.
   Utiliser un PDF prêt existant, ou l’original effectivement fourni par l’hôte.
   Ne pas inventer de transfert de fichier ni publier un document pour l’importer.
3. Recueillir l’adresse et le nom éventuel du destinataire, le PDF, la durée du
   partage, le droit éventuel de télécharger l’original, puis l’autorisation
   éventuelle de conserver une copie personnelle et sa durée. Expliquer qu’une
   copie personnelle remise est indépendante de la révocation future du partage.
4. Appeler `prepare_secure_distribution` avec une clé stable. La préparation
   n’envoie rien. Pour `preparing`, consulter ensuite `get_secure_distribution`
   sur le même identifiant ; ne pas créer une deuxième préparation. Présenter le
   devis exact en EUR hors taxes : conservation partagée, conservation personnelle
   éventuelle, notification et total. Ne pas annoncer un tarif inventé.
5. Avant activation, expliquer que la durée financée ne sera pas remboursée même
   si l’atelier désactive le partage avant l’échéance. Faire ouvrir `approvalUrl`
   pour relire le contenu, le destinataire, les droits et le prix dans le
   navigateur Guteneo, avec authentification forte. Aucun accord dans le chat ni
   mandat expert ne remplace cette approbation spécifique.
6. Après approbation navigateur enregistrée, appeler `confirm_secure_distribution`
   avec l’identifiant et une clé stable, sous les confirmations de l’hôte. Sur
   résultat incertain ou perdu, consulter le même identifiant sans nouvelle
   commande et sans nouvel envoi automatique. Un compte de revue limité à la
   préparation conserve ses restrictions.
7. Utiliser `list_secure_distributions` ou `get_secure_distribution` pour le
   suivi. Distinguer affichage déclaré par le navigateur, téléchargement demandé
   et transmission commencée. Ne pas affirmer une lecture intégrale, un fichier
   enregistré sur disque, une impression ou une capture d’écran détectée.
8. Si la personne demande une révocation, expliquer son effet puis appeler
   `revoke_secure_distribution` dans l’atelier courant. Elle bloque les prochains
   accès au partage ; elle ne récupère pas une copie exportée, ne supprime pas une
   copie personnelle déjà remise et ne rembourse pas la conservation financée.

L’association initiale du destinataire et la confirmation d’un canal indépendant
restent dans le navigateur de l’atelier. Ne jamais demander passkey, mot de passe,
code email ou récupération dans le chat. Ne pas lister, réclamer, exporter ou
associer les documents personnels avec les outils d’un atelier. L’installation
n’accorde aucun droit supplémentaire, achat, abonnement ou mandat.
