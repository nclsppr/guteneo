# Distribution sécurisée et compte unique

Candidat du 24 octobre 2026. Cette fiche décrit le code local en cours de qualification ; elle ne constate aucune activation Auth0, migration distante, publication de plugin ou mise en production. Les décisions produit antérieures sont dans [le plan du compte unique](UNIFIED_ACCOUNT_AND_VAULT_PLAN.md).

## Compte et droits

Une identité Guteneo sert à recevoir des documents, gérer son espace personnel, utiliser les services et participer à des ateliers. Une inscription personnelle ne crée ni atelier, ni crédit, ni quota. L'entrée dans les services permet de créer explicitement son atelier, de manière idempotente. Une invitation documentaire ne crée aucune membership chez l'expéditeur.

Le rattachement d'identité conserve `(issuer, subject)`. Une égalité d'adresse email ne fusionne pas deux comptes. Un destinataire doit posséder l'adresse attendue, s'authentifier fortement, demander l'association puis être confirmé par un approbateur de l'atelier sur la base d'une relation connue, d'un canal indépendant ou d'une identité qualifiée. Aucun titre sensible ni page n'est livré pendant l'attente.

Le contrôle de contenu exige une preuve signée de méthode réellement utilisée : claim `https://guteneo.com/document_authentication`, politique `guteneo-sensitive-v1`, méthode `webauthn_uv` ou `qualified_federation`, date de la cérémonie réellement réussie comprise entre le `auth_time` primaire et le `iat` signés. La fraîcheur de session est calculée depuis le `auth_time` primaire, ce qui garde une borne conservatrice. La fraîcheur maximale est de quinze minutes, ramenée à cinq minutes pour export original, remise personnelle et suppression personnelle. Un ancien booléen MFA ou une passkey simplement enregistrée ne suffisent pas. L'émetteur et la récupération de cette preuve doivent encore être qualifiés sur le tenant réel ; son absence refuse l'accès.

La revue et l'approbation de distribution sont exclusivement humaines dans le navigateur. La migration 0057 lie l'approbation au document, à son empreinte, à l'approbateur et à sa session forte effective. Les anciennes routes REST/MCP, mandats experts et mises en file passent les mêmes gardes. Un assistant peut préparer et confirmer une préparation déjà approuvée ; il ne peut ni approuver celle-ci ni confirmer l'association d'un destinataire.

Les documents sources employés par cette nouvelle distribution sont réservés à leur créateur et aux approbateurs actuels de l'atelier, avec les restrictions privées existantes. Leur contenu et leur revue passent aussi par la garde de session forte. Cela ne qualifie pas rétroactivement tous les anciens documents du produit. Une source doit être dédiée à ce parcours : les anciens liens protégés encore valides doivent être révoqués ; une source déjà référencée par un envoi ordinaire, une préparation fournisseur, une analyse postale ou une dérivation postale ne peut être classée sensible. Inversement, une source sensible ne retourne plus dans ces anciens parcours. Les gardes applicatives et SQL dans les deux directions ferment aussi les courses de préparation asynchrone. La migration ne retire aucune copie déjà transmise ou téléchargée auparavant.

## Objets et conservation

Chaque distribution lie un PDF immuable, un destinataire, un rendu, une politique, une version de prix et un envoi d'invitation. Le PDF analysé reste privé ; le simple affichage ne retourne pas le PDF source. Le renderer privé prépare au plus trois pages par travail, avec filigrane opaque intégré aux pixels et texte accessible séparé. Il refuse les contenus et budgets qu'il ne sait pas rendre fidèlement ; aucune ouverture de l'original ne contourne un échec de rendu.

Limites actuelles : PDF de 10 Mio, cent pages, images JPEG de 1 600 pixels maximum par dimension, texte accessible de 8 000 caractères par page, trois pages par lot et préparation expirant après vingt-quatre heures. Le texte tronqué est refusé. Le filigrane porte la référence de distribution, jamais l'adresse email du client. Il ne prouve pas l'origine d'une photographie et ne bloque pas les captures d'écran.

Les objets partagés et personnels sont chiffrés par clés de données aléatoires distinctes, enveloppées avec AES-GCM et contexte d'autorisation lié à l'objet. L'intégrité SHA-256 est contrôlée à chaque lecture. Les clés de chiffrement de service restent accessibles au runtime de confiance : aucune promesse de chiffrement de bout en bout, de HSM ou de stockage inaccessible à l'opérateur.

`SECURE_DOCUMENTS_KEY_ID` désigne la clé d'enveloppe active ; `SECURE_DOCUMENTS_KEYS` contient le trousseau secret versionné. Conserver les anciennes clés pour lire les enveloppes existantes. `SECURE_DOCUMENTS_KEY` reste compatible avec une configuration à une seule clé. Ne jamais remplacer une ancienne clé sans réenvelopper les objets et invitations, vérifier les sauvegardes et tester la restauration. Le développement local simulé possède une clé déterministe réservée à ce périmètre ; elle n'est jamais une configuration de production.

Le partage démarre à l'acceptation atomique de la commande. La révocation refuse les nouveaux accès, conserve le débit du service et n'efface pas les copies déjà remises. Elle ne retire pas les pixels ou téléchargements déjà reçus par le navigateur.

L'option de copie personnelle crée une conservation indépendante, exportable, d'un ou trois ans à compter de sa remise effective. Elle peut être autorisée sans autoriser le téléchargement de l'original depuis le partage. Le destinataire choisit explicitement la remise. Un travail durable copie trois pages par lot dans son propre namespace chiffré ; la copie reste invisible jusqu'à l'activation transactionnelle finale. À cet instant, le serveur recontrôle le partage, sa politique, la personne, le financement et la session fraîche. Une révocation qui gagne cette transaction empêche la remise. Une révocation postérieure ne touche pas la copie acquise. Les reprises utilisent le même identifiant et ne débitent rien à nouveau.

La fermeture d'un onglet n'annule pas un travail accepté. Queue et réconciliation bornée relancent les travaux expirant leur bail. Une session expirée ou révoquée exige une nouvelle authentification avant de terminer la remise. Les suppressions d'objets expirés sont bornées, reprises après interruption et séparées entre partage et copie personnelle. Aucun balayage des orphelins ne doit effacer un objet actif ou une copie en préparation encore autorisée.

## Journal et confidentialité

L'autorisation finale de page, texte ou transfert original insère un événement durable avant de retourner le contenu, après les attentes R2. Une révocation ou perte de session pendant la lecture refuse la réponse. L'échec d'insertion du journal refuse la livraison.

| Événement | Signification |
| --- | --- |
| `page_access_authorized` | Le serveur a autorisé la réponse d'image |
| `page_displayed` | Le navigateur signale une page chargée et visible ; signal déclaratif |
| `accessible_text_access_authorized` | Le serveur a autorisé le texte accessible |
| `original_download_requested` | Une exportation a été demandée et autorisée |
| `original_transfer_started` | Le serveur commence la réponse contenant l'original |
| `personal_copy_delivered` | Une copie personnelle indépendante a été activée |
| `access_revoked` | L'atelier a retiré le partage |

Le journal ne prétend pas observer une lecture humaine, un enregistrement disque achevé, une impression physique ou une capture d'écran. L'atelier voit les événements de son partage et la remise personnelle ; les lectures privées ultérieures appartiennent exclusivement à l'espace personnel. Les listes et journaux sont paginés. Les logs techniques excluent contenu, destinataires, secrets et URL d'invitation. Les exports de rapports de test suivent la même règle.

## API, assistants et déploiement

Le catalogue de prix et les opérations de préparation, liste, lecture, confirmation et révocation sont servis par `/api/secure-distributions`. Les contrôles d'accès utilisent l'atelier authentifié, les droits courants et, pour OAuth, une autorité de connexion vérifiée jusqu'à la transaction. La préparation asynchrone recontrôle le snapshot d'autorisation qui l'a créée. Les endpoints personnels acceptent uniquement les sessions navigateur avec protection CSRF ; aucun jeton OAuth atelier ne liste un coffre personnel.

Les cinq outils MCP correspondants, leur schéma, leurs annotations et le prompt sont partagés par les paquets ChatGPT, Claude, Cursor et les configurations clientes utilisant le serveur commun. Les paquets ne donnent aucun droit supplémentaire. Leur build ne prouve pas une installation dans un hôte ni une publication marketplace. Les applications natives peuvent ouvrir le parcours web ; leur interface de coffre native n'est pas implémentée par ce candidat.

`SECURE_DISTRIBUTION_ENABLED=true`, une clé valide, le renderer privé et la qualification d'authentification forte sont nécessaires avant activation réelle. Les gardes d'envoi, devis fournisseur, crédit et approbation existantes restent nécessaires. Le flag n'est pas activé par ce travail. Les prix et tests sont détaillés dans [la fiche tarifaire](SECURE_DISTRIBUTION_PRICING.md) et [le guide e2e](../tests/distribution-e2e/README.md).

Avant production : qualifier les appareils et la récupération Auth0, le corpus PDF et l'accessibilité, la rotation/restauration des clés et données, les métriques CPU/R2/D1/renderer, la localisation contractuelle et les durées d'audit. Définir et éprouver les budgets d'usage et la réponse aux abus pour les longues conservations ; le plafond de requêtes par minute ne suffit pas à prouver la rentabilité d'une sollicitation continue. Les sauvegardes, notifications d'expiration et le renouvellement de conservation requièrent une qualification opérationnelle distincte. Ne pas annoncer un coffre certifié, un archivage légal ou un service DRM.
