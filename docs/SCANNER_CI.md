# Maintenance automatique du scanner

État au 20 septembre 2026 : le scanner de production a été actualisé et vérifié.
La tâche GitHub Actions de remplacement est préparée dans cette livraison ; elle
ne constitue pas encore une maintenance active. Le secret GitHub dédié est absent
et aucun premier passage de publication depuis GitHub n'a été qualifié. La tâche
locale Codex `maintenir-l-antivirus-guteneo` a été suspendue : elle dépendait du
Mac et n'est pas le mécanisme retenu.

## Fonctionnement quotidien

`.github/workflows/scanner-refresh.yml` s'exécute sur un runner hébergé par GitHub,
à 08:17 UTC chaque jour, lorsque `SCANNER_REFRESH_ENABLED=true`. Un déclenchement
manuel est possible sur `main`. Aucun modèle de langage ni ordinateur personnel
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

La suite du scanner couvre 27 tests Node et 36 tests Python, avec vérification
des types et analyse statique. Un vrai conteneur Linux amd64 a également été
construit et exécuté sans réseau, avec 4 GiB et 0,5 CPU : ClamAV 1.5.4, signatures
28129 du 20 septembre à 06:26:26 UTC, PDF propre accepté, EICAR détecté, empreintes
exactes, limites respectées, aucun journal de document ni fichier temporaire
conservé. L'identité de construction synthétique est identique sur la santé et
les deux analyses. La disponibilité initiale mesurée est de 44,87 secondes sur
le Docker local ; elle ne mesure pas la performance Cloudflare.

Le bundle Worker et sa configuration dérivée à image immuable passent le dry-run
Wrangler. Ces résultats ne constituent pas un déploiement ni un succès du futur
jeton GitHub. La première exécution hébergée reste à qualifier.

## Activation initiale

1. Fusionner la livraison après sa CI et attendre la CI réussie du commit fusionné.
2. Créer dans Cloudflare un jeton dédié à ce scanner, puis l'enregistrer directement
   dans les [secrets Actions du dépôt](https://github.com/nclsppr/guteneo/settings/secrets/actions)
   sous le nom `CLOUDFLARE_SCANNER_API_TOKEN`. Ne jamais le coller dans une
   conversation, un fichier du dépôt ou une commande conservée dans l'historique.
3. Lancer manuellement **Refresh private scanner signatures** sur `main`. Vérifier
   que l'artefact final `result.json` indique `status: qualified` et rapproche les
   preuves de publication et de qualification distante.
4. Après ce premier succès, définir la variable de dépôt
   `SCANNER_REFRESH_ENABLED=true` dans les variables Actions. Vérifier ensuite
   le premier passage planifié. Une variable absente laisse la planification
   inactive, même si le fichier de workflow est présent.

L'identifiant de compte est fixé dans le workflow. Le jeton Cloudflare doit pouvoir
déployer le Worker existant, pousser son image au registre Containers, contrôler
le déploiement et utiliser les service bindings distants pour la qualification.
Partir des droits **Editor** limités au Worker `guteneo-scanner` et **Containers
Write** du compte hébergeant Guteneo ; qualifier le périmètre réel lors du premier passage.
Le code n'a pas besoin des bases D1, des documents R2, des fournisseurs d'envoi,
des routes publiques ou de la facturation. Si Cloudflare exige un droit
supplémentaire pour son mécanisme de prévisualisation distante, identifier le
refus exact avant d'élargir ce jeton. La connexion disponible pendant cette
livraison ne permettait pas de gérer les jetons de compte ; aucun jeton n'a été
créé ni copié automatiquement dans GitHub.

## Échecs et mises à jour du moteur

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
contrôle quotidien et sa marge ne remplacent pas une alerte indépendante de
fraîcheur, qui reste à établir si l'on exige une garantie d'exploitation continue.

FreshClam automatise les **signatures**, pas les changements de version du moteur.
L'image de base ClamAV reste fixée à une empreinte revue ; une mise à jour du moteur
nécessite une PR et ses tests. Une solution sans aucune mise à jour antivirus ne
fournirait pas la même protection contre les menaces nouvelles.

Références officielles : [Cloudflare et GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/),
[publication d'images Containers](https://developers.cloudflare.com/containers/guides/image-management/),
[autorisations Workers](https://developers.cloudflare.com/workers/authorization/),
[signatures ClamAV](https://docs.clamav.net/manual/Usage/SignatureManagement.html),
[limites des schedules GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
