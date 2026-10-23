# Maintenance automatique du scanner

État vérifié au 23 octobre 2026 : la santé privée du scanner de production répond
`SIGNATURES_STALE`. Le déploiement en place date du 2 octobre. Le secret GitHub
dédié et la variable d'activation sont absents ; les passages planifiés récents
étaient ignorés. Aucun premier passage de publication depuis GitHub n'a été
qualifié. La présente livraison rend cette situation visible et ajoute un contrôle
distinct ; sa présence dans Git ne prouve pas son activation. La tâche
locale Codex `maintenir-l-antivirus-guteneo` a été suspendue : elle dépendait du
Mac et n'est pas le mécanisme retenu.

## Fonctionnement quotidien

`.github/workflows/scanner-refresh.yml` s'exécute sur un runner hébergé par GitHub,
à 08:17 UTC chaque jour. Elle exige `SCANNER_REFRESH_ENABLED=true` ; une variable
absente ou fausse produit désormais un échec visible, ainsi qu'un secret absent
ou une date d'expiration invalide. Un déclenchement manuel est possible sur `main`
avant d'activer les passages quotidiens. Aucun modèle de langage ni ordinateur personnel
n'intervient dans le traitement.

Le job vérifie le commit exact de `main` et sa CI réussie, notamment les contrôles
`verify` et `scanner`. Il construit une image Linux amd64 avec FreshClam, puis
teste cette image sans réseau : PDF propre, EICAR inoffensif, empreintes exactes,
limites et absence de conservation des documents de test. Il publie cette même
image, référencée par son empreinte immuable, puis met à jour uniquement le Worker
privé `guteneo-scanner`. Il recontrôle `main` avant les publications.

Une passerelle de qualification locale au runner appelle le scanner distant par
son service binding privé. Elle n'est jamais déployée et ne donne aucun accès aux
documents clients ni au moteur de rendu. Les preuves doivent rapprocher la version
du Worker réellement interrogé, le trafic à 100 %, l'image du conteneur et la base
antivirus réellement chargée. Une identité de construction inscrite dans l'image
et renvoyée par le conteneur distingue deux images ayant les mêmes signatures ;
la configuration souhaitée du déploiement ne suffit pas à prouver son exécution.
Les signatures doivent dater de moins de 48 heures
à la qualification. Une sortie réussie de la commande de déploiement seule ne
suffit pas.

Chaque passage conserve pendant 30 jours un artefact GitHub avec les preuves
locales et distantes, le commit, les versions et les empreintes. Aucun commit ou PR
quotidien n'est créé ; la date de construction et la configuration dérivée restent
dans les artefacts ignorés par Git. Le workflow n'envoie aucune lettre, ne modifie
pas les comptes et ne déploie pas l'application publique.

## Preuves locales de cette livraison

La suite du scanner couvre 41 tests Node et 38 tests Python, avec vérification
des types. Un vrai conteneur Linux amd64 issu du commit `5b5041ab` a également été
construit et exécuté sans réseau, avec 4 GiB et 0,5 CPU : ClamAV 1.5.4, signatures
28162 du 23 octobre à 06:24:08 UTC, PDF propre accepté, EICAR détecté, empreintes
exactes, limites respectées, aucun journal de document ni fichier temporaire
conservé. Cette construction locale ne prétend pas porter l'identité d'un passage
hébergé. La disponibilité initiale mesurée est de 52,85 secondes sur
le Docker local ; elle ne mesure pas la performance Cloudflare.

Ces résultats ne constituent pas un déploiement ni un succès du futur
jeton GitHub. La première exécution hébergée reste à qualifier.

## Activation initiale

1. Fusionner la livraison après sa CI et attendre la CI réussie du commit fusionné.
2. Créer dans Cloudflare un jeton dédié à ce scanner, puis l'enregistrer directement
   dans les [secrets Actions du dépôt](https://github.com/nclsppr/guteneo/settings/secrets/actions)
   sous le nom `CLOUDFLARE_SCANNER_API_TOKEN`. Ne jamais le coller dans une
   conversation, un fichier du dépôt ou une commande conservée dans l'historique.
3. Enregistrer sa date d'expiration réelle dans la variable Actions
   `SCANNER_TOKEN_EXPIRES_AT`, au format UTC `YYYY-MM-DDTHH:mm:ssZ`. Le contrôle
   distinct signale l'échéance quatorze jours avant ; le renouvellement reste
   une opération explicite. Ne pas repousser cette variable sans renouveler le jeton.
4. Lancer manuellement **Refresh private scanner signatures** sur `main`. Vérifier
   que l'artefact final `result.json` indique `status: qualified` et rapproche les
   preuves de publication et de qualification distante.
5. Après ce premier succès, définir la variable de dépôt
   `SCANNER_REFRESH_ENABLED=true` dans les variables Actions. Vérifier ensuite
   le premier passage planifié. Lancer **Check private scanner maintenance** pour
   vérifier immédiatement l'activation, les preuves du passage et la santé réelle.
   Vérifier aussi les notifications d'échec GitHub Actions du mainteneur.

L'identifiant de compte est fixé dans le workflow. Le jeton Cloudflare doit pouvoir
déployer le Worker existant, pousser son image au registre Containers, contrôler
le déploiement et utiliser les service bindings distants pour la qualification.
Partir des droits **Individual Workers Editor**, avec la portée **Specified Workers**
limitée au Worker `guteneo-scanner`, et **Containers
Write** du compte hébergeant Guteneo ; qualifier le périmètre réel lors du premier passage.
Le code n'a pas besoin des bases D1, des documents R2, des fournisseurs d'envoi,
des routes publiques ou de la facturation. Si Cloudflare exige un droit
supplémentaire pour son mécanisme de prévisualisation distante, identifier le
refus exact avant d'élargir ce jeton. La connexion disponible pendant cette
livraison ne permettait pas de gérer les jetons de compte ; aucun jeton n'a été
créé ni copié automatiquement dans GitHub.

## Échecs et mises à jour du moteur

`.github/workflows/scanner-watchdog.yml` vérifie la maintenance toutes les six
heures, à la minute 43, et peut être lancé manuellement. Il échoue si le workflow
de mise à jour est désactivé, si son dernier passage terminé a échoué ou été ignoré,
si aucune qualification réussie avec artefact n'a moins de trente heures, ou si
le jeton manque, expire ou approche de son échéance. Il exige aussi une santé
privée actuelle avec signatures de moins de quarante-huit heures, l'identité de
construction du passage qualifié, la version du Worker à 100 %, l'image immuable
et le périmètre privé du conteneur. Le résultat de qualification est lu dans
l'archive GitHub, après vérification de son empreinte et avec des limites de taille,
sans extraire de fichier. Version, déploiement, image et signatures doivent
correspondre à cette preuve précise ; un redéploiement ultérieur ne peut pas
emprunter la réussite d'un ancien passage. Il tolère un démarrage à froid pendant cinq
minutes, mais jamais une réponse de signatures périmées. Les deux workflows sont
sérialisés pour éviter une mesure pendant une publication ; leur file conserve
jusqu'à cent passages en attente au lieu de remplacer le précédent.

Ce contrôle ne fait que des lectures et des `GET /health` par service binding :
il ne scanne aucun document, ne publie aucune image et ne déploie aucun service.
Les rapports filtrent les erreurs et n'incluent ni jeton ni réponse brute distante.

Les notifications d'échec relèvent des préférences GitHub Actions du mainteneur ;
le workflow ne configure pas d'adresse ni de messagerie. Un échec avant le
déploiement conserve la version en place. Un échec de qualification après
déploiement indique une publication non qualifiée à examiner : il ne constitue
pas un retour arrière automatique. Le rapport permet d'identifier l'étape atteinte.
Ne pas relancer aveuglément si un autre déploiement est en cours.

Le scanner continue à refuser les bases de plus de 72 heures. Cette limite n'est
pas prolongée par le workflow, par une date inscrite dans Git ou par un statut
GitHub vert. L'absence de job planifié n'est pas une preuve de maintenance : GitHub
peut retarder des schedules et les désactiver sur un dépôt public inactif. Le
contrôle toutes les six heures détecte l'arrêt du workflow quotidien, mais dépend
lui-même de GitHub. Il ne peut signaler sa propre désactivation, une panne globale
du planificateur ou des notifications désactivées. Une supervision hors GitHub
reste nécessaire pour couvrir ces défaillances ; aucun message externe ni service
de supervision payant n'est créé par ces workflows.

FreshClam automatise les **signatures**, pas les changements de version du moteur.
L'image de base ClamAV reste fixée à une empreinte revue ; une mise à jour du moteur
nécessite une PR et ses tests. Une solution sans aucune mise à jour antivirus ne
fournirait pas la même protection contre les menaces nouvelles.

Références officielles : [Cloudflare et GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/),
[publication d'images Containers](https://developers.cloudflare.com/containers/guides/image-management/),
[autorisations Workers](https://developers.cloudflare.com/workers/authorization/),
[signatures ClamAV](https://docs.clamav.net/manual/Usage/SignatureManagement.html),
[limites des schedules GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
