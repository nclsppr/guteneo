# Distribution sécurisée et compte unique

Candidat du 24 octobre 2026. Cette fiche décrit le code local et la configuration de publication demandée ; elle ne constate aucune migration distante, publication de plugin ou mise en production. L'utilisateur autorise la publication avec la politique documentaire `verified_account`. Les décisions et études antérieures sont datées dans [le plan du compte unique](UNIFIED_ACCOUNT_AND_VAULT_PLAN.md) ; leur hypothèse d'authentification forte obligatoire ne remplace pas la décision explicite ci-dessous.

## Compte et droits

Une identité Guteneo sert à recevoir des documents, gérer son espace personnel, utiliser les services et participer à des ateliers. Une inscription personnelle ne crée ni atelier, ni crédit, ni quota. L'entrée dans les services permet de créer explicitement son atelier, de manière idempotente. Une invitation documentaire ne crée aucune membership chez l'expéditeur.

Le rattachement d'identité conserve `(issuer, subject)`. Une égalité d'adresse email ne fusionne pas deux comptes. Un destinataire doit posséder l'adresse attendue, satisfaire la politique documentaire courante, demander l'association puis être confirmé par un approbateur de l'atelier sur la base d'une relation connue, d'un canal indépendant ou d'une identité qualifiée. Aucun titre sensible ni page n'est livré pendant l'attente.

`SENSITIVE_DOCUMENT_AUTHENTICATION` sélectionne la politique : `strong` par défaut si la variable est absente, ou `verified_account` explicitement. Une valeur inconnue ferme l'accès. La configuration live demandée choisit `verified_account` : compte vérifié, email vérifié et session Auth0 rattachée à `auth_identities`, avec un `auth_time` primaire réellement signé et récent. Le serveur conserve les contrôles d'expiration, de révocation, d'identité et de droits ; un champ du navigateur ne fournit jamais cette preuve. Le contrôle d'un compte et de son adresse ne prouve ni un deuxième facteur ni l'identité physique de la personne.

La fraîcheur maximale reste de quinze minutes pour les lectures, l'association et l'approbation, ramenée à cinq minutes pour export original, remise personnelle et suppression personnelle ; la tolérance future est de cinq secondes. En mode `strong`, une preuve signée de méthode réellement utilisée reste obligatoire : claim `https://guteneo.com/document_authentication`, famille `guteneo-sensitive-v1`, méthode `webauthn_uv` ou `qualified_federation`, date de cérémonie comprise entre les `auth_time` et `iat` signés. Un ancien booléen MFA ou une passkey simplement enregistrée ne suffisent pas. La qualification de cette méthode reste distincte et n'est pas un prérequis d'abonnement du profil `verified_account` choisi.

La session personnelle expose `documentAccessMode` et `documentAccessAllowed`, calculés pour la fenêtre de quinze minutes, afin que l'interface explique la politique courante. Les actions sensibles conservent leur contrôle serveur de cinq minutes. `strongAuthentication` et `mfa` restent des preuves factuelles : une session ordinaire autorisée sous `verified_account` ne les transforme pas en `true`, et son `authentication_policy_version` peut rester nul.

Reprise du 24 octobre : le choix et l'intégration des passkeys restent explicitement différés. La politique documentaire sélectionnée ne modifie ni Auth0 ni les rôles et ne fabrique aucune preuve forte. Les gardes de contenu et d'approbation restent obligatoires ; les parcours locaux utilisent seulement leurs identités fictives dans la simulation isolée.

La revue et l'approbation de distribution sont exclusivement humaines dans le navigateur. Les migrations 0057 et 0059 lient l'approbation au document, à son empreinte, à l'approbateur, à sa session et au mode effectif `secure_approval_evidence.authentication_mode`. La famille `policy_version=guteneo-sensitive-v1` ne prétend pas, seule, prouver une MFA. La confirmation et les gardes SQL recontrôlent la politique et la session actuelles, y compris pour un reçu historique ; un reçu ordinaire ne suffit pas après retour à `strong`. Les routes REST/MCP, mandats experts et mises en file passent les mêmes gardes. Un assistant peut préparer et confirmer une préparation déjà approuvée ; il ne peut ni approuver celle-ci ni confirmer l'association d'un destinataire.

Les documents sources employés par cette nouvelle distribution sont réservés à leur créateur et aux approbateurs actuels de l'atelier, avec les restrictions privées existantes. Leur contenu et leur revue passent aussi par la politique documentaire courante. Cela ne qualifie pas rétroactivement tous les anciens documents du produit. Une source doit être dédiée à ce parcours : les anciens liens protégés encore valides doivent être révoqués ; une source déjà référencée par un envoi ordinaire, une préparation fournisseur, une analyse postale ou une dérivation postale ne peut être classée sensible. Inversement, une source sensible ne retourne plus dans ces anciens parcours. Les gardes applicatives et SQL dans les deux directions ferment aussi les courses de préparation asynchrone. La migration ne retire aucune copie déjà transmise ou téléchargée auparavant.

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

`SECURE_DISTRIBUTION_ENABLED=true`, une clé valide, le renderer privé et une politique documentaire cohérente sont nécessaires avant activation réelle. Les gardes d'envoi, devis fournisseur, crédit et approbation existantes restent nécessaires. La configuration cible est `SENSITIVE_DOCUMENT_AUTHENTICATION=verified_account` ; le défaut `strong` reste disponible. Les prix et tests sont détaillés dans [la fiche tarifaire](SECURE_DISTRIBUTION_PRICING.md) et [le guide e2e](../tests/distribution-e2e/README.md).

La relecture Resend opérateur du 24 octobre vers 17 h 39 UTC confirme `nclsppr` Free, 0/3 000 au mois, 0/100 au jour, 10 requêtes/seconde, dépassements payants désactivés et domaine `guteneo.com` vérifié en `eu-west-1`. Le candidat active les variables email en plus du fax/postal et requalifie la référence tarifaire jusqu’au 23 novembre 2026 à 00 h 00 UTC. Le change de 1,1537 USD/EUR reste une référence commerciale fixe historique, pas un cours actuel. La politique globale préparée limite Guteneo à 80 destinataires/24 h glissantes, 2 400/mois UTC et un intervalle de 500 ms, avec preuve source expurgée. Son installation D1, le webhook et son secret restent à effectuer puis qualifier ; aucun drapeau local ne prouve ces étapes ni une livraison. Voir [la preuve Resend datée](RESEND_PROOF.md).

La migration `0059_document_authentication_policy.sql` crée le singleton `secure_document_authentication_policy(id=1, mode)` avec `strong` par défaut. Le Worker ne modifie jamais cette ligne. L'opérateur applique la migration puis, pour le choix autorisé, exécute explicitement `UPDATE secure_document_authentication_policy SET mode='verified_account' WHERE id=1` sur la base métier prévue et publie la variable d'environnement correspondante. Il vérifie ensuite l'accord D1/environnement. Tout désaccord ferme les accès et les confirmations, y compris après une attente R2 ; il ne fait pas revenir implicitement au mode le moins exigeant.

Pour revenir à `strong`, coordonner la ligne D1 et la configuration du code compatible avec 0059 ; la période intermédiaire de désaccord refuse l'accès. Ne pas effacer les reçus pour faciliter ce retour. Une ancienne approbation `verified_account` doit être réexaminée sous la nouvelle exigence ; aucun reçu ordinaire ne devient une preuve forte. Sous `verified_account`, un ancien reçu fort reste soumis aux vérifications actuelles de compte, d'adresse et d'identité. Garder le service fermé si la preuve du mode redevenu strict n'est pas qualifiée.

Avant qualification connectée : vérifier le parcours réel et la récupération du compte selon la politique choisie, le corpus PDF et l'accessibilité, la rotation/restauration des clés et données, les métriques CPU/R2/D1/renderer, la localisation contractuelle et les durées d'audit. Définir et éprouver les budgets d'usage et la réponse aux abus pour les longues conservations ; le plafond de requêtes par minute ne suffit pas à prouver la rentabilité d'une sollicitation continue. Les sauvegardes, notifications d'expiration et le renouvellement de conservation requièrent une qualification opérationnelle distincte. Ne pas annoncer un coffre certifié, un archivage légal ou un service DRM.

## Preuves locales du 24 octobre

Le nouveau run local `verified_account` `01a16ef7-4017-783f-80e7-80426686b572` passe 2/2, ordinateur et téléphone : préparation, approbation humaine navigateur, association indépendante, copie personnelle exportable malgré l’original partagé désactivé, isolation d’un autre compte et maintien de la copie après révocation. Les sessions ordinaires et les identités associées sont synthétiques, dans la base locale isolée ; `strongAuthentication=false`, `mfa=false` et famille d’authentification nulle restent vérifiés. Ce run ne qualifie ni une connexion Auth0 réelle ni une remise fournisseur. Le rapport backend ciblé passe 73/73 (22 authentification personnelle, 17 frontière d’approbation, 34 service documentaire), la qualification tarifaire 31/31 et le rendu d’interface 13/13.

Le profil `strong` repasse 14/14 dans le run `01a16efd-d3c7-7c1e-b6db-7d1c647da7f1`, en 105,63 secondes, sans omission, flaky ni appel de modèle ; l’archive est expurgée. Le build final après le lien **Vérifier mon accès**, TypeScript, le dry run et les treize tests d’interface passent. Ce lien demande explicitement une connexion fraîche et un retour sans secret à la liste des distributions ; il ne recycle pas automatiquement le SSO. Les 355 contrôles Node et ESLint avaient passé avant ce petit ajout ; la CI du commit exact reste attendue. Aucune publication n’est déduite de ces contrôles locaux.

Les résultats antérieurs ci-dessous qualifient leur source et leurs identités simulées enregistrées avant la migration 0059. Ils ne qualifient pas automatiquement la nouvelle politique `verified_account`, son accord D1/environnement ou un compte connecté en production.

La reprise d’interface passe 23 tests du service documentaire et huit tests de
rendu, dont l’explication des droits dans les quatre langues. Le run TesterArmy
`01a16ebe-ca29-7ebc-a2f1-7d13fc31deea` passe 14/14 en 108,73 secondes, sans
omission, flaky, appel de modèle ou nouvelle construction concurrente. Les deux
cibles exercent annulation puis suppression personnelle, refus de page/texte/export,
confidentialité du journal atelier, engagement inchangé et retrait des métadonnées
après refus de pagination 401 et 403. Code applicatif et 190 fichiers construits
restent inchangés ; les contrôles de secrets dans stdout et les artefacts passent.
Six régressions de navigation passent dans Chromium ordinateur/mobile et WebKit
iPhone ; douze tests d’entrée de connexion passent sur Chromium ordinateur.
Le build/dry run, TypeScript, ESLint et l’atlas de 252 fonctionnalités passent.

Le premier run enrichi (13/14) échouait sur un sélecteur de test ambigu entre menu
et lien de retour ; son rapport et son contrôle de confidentialité sont conservés.
La première suite de connexion (11/12), puis sa reproduction isolée, échouaient
pendant le démontage de la fixture avec des proxies statiques encore en vol.
Le drainage borné corrige ce défaut sans ignorer les erreurs ni retirer les
assertions ; les runs corrigés restent distincts. Les tests de rendu ne prouvent
pas l’interaction de remplacement d’un candidat d’association : ce cas n’a pas
été substitué à la vraie association du cycle complet.

Le candidat `d942fa9` passe la régression complète : 119 fichiers Vitest, 2 305 cas et 355 contrôles Node, sans échec ni omission. Les 24 nouvelles régressions sur les anciens parcours font partie de ce total. Les 58 migrations passent aussi la comparaison locale de schéma transporté, avec contrôle d'intégrité positif et aucune violation de clé étrangère. Le catalogue MCP vérifie ses 72 outils ; build, typecheck et lint passent.

La reprise sur `ac795d0` conserve la correction de déconnexion et les erreurs HTTP publiques : 148 cas unitaires concernés et douze cas navigateur desktop passent. Le journal de [la PR 74](https://github.com/nclsppr/guteneo/pull/74) porte la dernière preuve e2e isolée et les contrôles GitHub du commit exact. Deux relances e2e locales interrompues pendant une reconstruction concurrente des assets restent conservées comme échecs, sans être transformées en succès. La CI utilise un job de distribution isolé.

Une observation anonyme réelle a passé 28 contrôles publics ; elle n'a publié aucun rapport GitHub. Les [comptes de recette](PRODUCTION_TEST_ACCOUNTS.md) et leurs deux Actions Auth0 proposées décrivent une étude antérieure du mode fort et restent non activés. Aucune preuve forte documentaire n'était émise par les Actions inspectées. Le choix des passkeys reste différé ; le profil `verified_account` explicitement retenu ne dépend pas de ces Actions, mais ses comptes de test et son parcours connecté de production restent à qualifier. Les résultats historiques antérieurs à 0059 ne sont pas une preuve de cette nouvelle politique ; son run local 2/2 est identifié séparément ci-dessus. La CI prépare deux profils séparés, quatorze résultats `strong` et deux `verified_account`, sans construction concurrente ; leur configuration n'affirme pas la réussite GitHub. Observation publique, simulation et parcours connecté sous la politique active restent des preuves distinctes.
