# Distribution sensible et documents personnels

Contrat et parcours du candidat local du 24 octobre 2026. Ce document décrit
l’implémentation courante et ses limites. Il ne vaut ni publication, ni activation
du service, ni preuve de livraison réelle. Le compte est unique pour tout
Guteneo ; les ateliers sont des appartenances facultatives et les documents
personnels ne constituent pas un atelier artificiel.

## Autorités et conditions d’entrée

| Acteur                       | Autorité nécessaire                                                                        | Portée                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Préparateur                  | Membership courante, préparation, source accessible et vérifiée                            | Sa préparation, sa source exacte et le devis figé                                                                          |
| Approbateur                  | Administrateur ou superviseur avec option Approbation ; navigateur et preuve forte récente | Revue, approbation et association des destinataires dans cet atelier                                                       |
| Destinataire                 | Principal personnel, adresse vérifiée, preuve forte récente et association confirmée       | Ses accès partagés et ses copies personnelles                                                                              |
| Assistant / client API OAuth | Intersection du rôle, des scopes et de la connexion courante                               | Préparation et suivi de l’atelier ; confirmation après preuve navigateur, aucune identité destinataire ni coffre personnel |
| Opérateur plateforme         | Autorisation distincte de configuration et de publication                                  | Activation des services ; aucun droit tiré d’un rôle atelier                                                               |

Le compte, sa langue et sa connexion sont communs. Recevoir ne crée pas de
membership chez l’expéditeur ; installer un plugin ou posséder l’adresse d’un
document ne crée aucun droit. Un email vérifié ne prétend pas établir l’identité
physique. La preuve forte signée et fraîche est contrôlée par le serveur, pas
par un champ fourni par le navigateur.

## Préparer, revoir et activer un partage

1. Ouvrir **Distribution sécurisée → Nouveau partage**, ou utiliser la même
   opération REST/MCP depuis un client autorisé.
2. Choisir un PDF `ready`, limité à 100 pages et 10 Mio ; désigner une adresse
   individuelle et choisir 7, 30, 90 ou 365 jours d’accès partagé. Le téléchargement
   original est désactivé par défaut. L’option de copie personnelle permet une
   conservation autonome de 365 ou 1 095 jours.
3. Préparer le sujet et le message d’invitation sans contenu confidentiel.
   La langue de notification est figée dans l’entrée. Le lien individuel et les
   consignes de connexion sont ajoutés par le serveur.
4. Conserver l’identifiant et la clé d’idempotence. Le rendu se fait par travaux
   bornés et persistants. L’état `preparing` n’est ni une activation ni un envoi.
   Les lectures de suivi ne recréent pas la préparation. Les pages et le texte
   accessibles proviennent de la version immuable vérifiée ; aucun repli vers
   le PDF original n’est livré au destinataire.
5. L’approbateur examine les pages finales ou leur texte, le destinataire, les
   droits, le message et le prix complet hors taxes. La part de conservation
   et le transport de l’invitation apparaissent séparément. Deux choix explicites
   couvrent la revue et la demande préalable du destinataire.
6. Approuver dans le navigateur fortement authentifié, puis confirmer
   l’activation. Un assistant peut confirmer une préparation exactement approuvée
   sous ses scopes et les confirmations de l’hôte ; il ne fournit jamais
   l’approbation sensible lui-même, même avec un mandat expert.
7. L’activation enregistre atomiquement les engagements, la consommation et
   l’outbox selon les gardes du domaine. Les fournisseurs, le scanner, la
   facturation et les capacités courantes restent obligatoires en production.

Le prix est par PDF et par destinataire. Le terme activé est intégralement dû ;
désactiver ou révoquer le partage ne rembourse ni sa conservation ni l’option
personnelle déjà financée. Le tarif versionné du contrat partagé est la source
du devis, pas une valeur calculée par l’assistant. Un résultat fournisseur inconnu
reste à rapprocher : aucune relance aveugle ou nouvelle préparation automatique.

## Compatibilité de la source avec les anciens parcours

Une distribution sensible n’est pas une mise à niveau transparente d’un ancien
lien par mot de passe ou d’une préparation postale. Avant de la préparer :

- Un ancien hébergement `draft` ou `active` dont le terme n’est pas échu doit
  être révoqué. Le refus `SECURE_SOURCE_LEGACY_LINK` invite à cette action sous
  les droits courants de l’atelier.
- Toute ligne de préparation postale dérivée, réservée ou générée, bloque cette
  conversion avec `SECURE_SOURCE_LEGACY_DERIVATION`. Choisir un document dédié
  à la distribution sensible ; ne pas effacer un historique pour contourner
  cette limite.
- Tout ancien envoi, précontrôle postal ou brouillon fournisseur qui référence
  la source bloque aussi la préparation avec `SECURE_SOURCE_LEGACY_OUTBOUND`,
  y compris après annulation ou échec. Choisir une source dédiée ; cette garde
  empêche notamment une conversion pendant qu’un transfert fournisseur est en
  cours.

Une source déjà référencée par une distribution sensible ne peut plus servir
aux anciens traitements postaux, recadrages ou analyses, ni à la récupération
d’un mot de passe ou du contenu d’un ancien lien. Les nouvelles pièces jointes
ordinaires email, fax et courrier sont également interdites pour cette source.
Seule l’invitation dédiée du nouveau parcours sensible, sans pièce jointe source
(`document_id` nul), poursuit sa préparation sous les droits habituels. Le refus
`SENSITIVE_SOURCE_LEGACY_FORBIDDEN` s’applique aussi si la distribution sensible
a échoué ou a été révoquée. Aucun rôle atelier, scope OAuth ou mandat expert ne
permet de revenir à ces parcours.

La première lecture de compatibilité ne suffit pas : des gardes SQL symétriques
refusent l’insertion sensible si un ancien hébergement, une préparation postale,
un envoi, un précontrôle ou un brouillon fournisseur interdit existe, puis
refusent dans l’autre direction les écritures concurrentes de ces anciens
parcours dès que la source est référencée. Elles sont
bornées à l’atelier authentifié et à la source exacte. Cette exclusion ne rappelle
pas les fichiers déjà exportés et ne constitue pas une protection rétroactive
de leurs copies.

Cette incompatibilité est volontaire dans la première version. Elle ne transforme
pas une opération déjà exposée aux anciens parcours en source sensible isolée.

## Recevoir avec son compte unique

1. Le lien reçu ouvre **Mes documents**. Son invitation est retirée du fragment
   avant toute URL HTTP de connexion et reste au plus dix minutes dans le
   `sessionStorage` de cet onglet. Auth0 reçoit un retour personnel sans token,
   et la demande reprend après callback. Si le stockage est bloqué, une reprise
   explicite demande de rouvrir le lien après connexion. Ni achat ni activation
   d’un atelier ne sont imposés.
2. La personne se connecte ou crée son unique compte Guteneo. Le contrôle de
   l’adresse attendue et la preuve forte précèdent la demande d’association.
3. La demande reste en attente tant que l’atelier n’a pas confirmé le lien entre
   ce compte stable et le destinataire prévu. Le titre sensible, les pages et le
   fichier restent indisponibles durant cette attente.
4. L’approbateur retrouve seulement la demande de son propre partage. Il
   vérifie une relation connue, un canal indépendant ou une identité qualifiée,
   puis confirme explicitement l’association ; le nom saisi par la personne
   n’est pas, à lui seul, une preuve indépendante.
5. La personne consulte les pages préparées, leur texte accessible et la date
   d’échéance. Chaque remise de page recontrôle le droit et la session. Une
   révocation empêche les nouvelles remises et n’efface pas les pixels déjà reçus.

Un mauvais compte ou une invitation indisponible ne révèle pas l’existence
d’autres comptes. La reprise est explicite. Une erreur documentaire 401 ne
déclenche pas une boucle de connexion automatique. Les routes personnelles
restent distinctes de l’API atelier et n’acceptent pas l’autorité d’un Bearer
d’atelier pour lire les documents personnels.

## Deux catégories et opérations distinctes

| Catégorie         | Promesse et opérations                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Partagés avec moi | Accès individuel, révocable par l’atelier et limité à son terme ; original seulement si autorisé ; association requise                                                |
| Copies conservées | Copie indépendante remise avec autorisation, durée propre, export personnel et suppression par la personne ; le départ ou la révocation de l’atelier ne la retire pas |

**Télécharger le PDF original** est une action séparée, confirmée et soumise à
une preuve forte de cinq minutes au plus. Le journal distingue demande et
transmission lancée. Le succès réseau ne démontre jamais une sauvegarde disque.
Les ouvertures, copies, captures et impressions après export quittent le champ
d’observation de Guteneo.

**Conserver une copie** explique la durée autonome et l’impossibilité pour
l’atelier de rappeler une copie acquise. Le dépôt est une opération persistante
unique par source et propriétaire. Les petits dépôts peuvent se terminer dans
la demande ; les autres progressent par travaux bornés. L’interface affiche
la préparation et suit le même partage jusqu’à l’identifiant de copie activée.
Fermer l’onglet n’annule pas une opération déjà acceptée ; revenir et reprendre
ne crée ni seconde copie ni seconde facturation. Aucun succès n’est annoncé
avant l’activation durable. Une révocation avant le point de remise empêche
l’acquisition ; après, la copie reste personnelle.

L’utilisateur peut exporter puis supprimer sa copie. La suppression retire
l’accès personnel ; elle ne supprime pas la source atelier ni les exports déjà
reçus. Les lectures privées ultérieures ne remontent pas à l’atelier d’origine.
L’engagement de durée est borné : aucune conservation éternelle ni certification
de coffre-fort numérique n’est annoncée.

## Retrouver ses documents et découvrir les services

**Mes documents** sépare les deux catégories. Filtre, recherche bornée et
pagination sont évalués côté serveur sous l’identité propriétaire ; les
résultats ne sont pas limités aux premières lignes d’un filtre navigateur.
La langue de compte reste commune au reste de Guteneo.

**Utiliser Guteneo** est disponible dans la même session. La personne peut
préparer un envoi ou partager à son tour, choisir un atelier auquel elle
appartient ou demander son premier atelier. Le serveur crée alors les
structures métier nécessaires, en ferme les canaux réels et attribue le rôle
d’administrateur au créateur. Une tentative de choisir l’atelier expéditeur
sans membership est refusée. Aucun nouvel identifiant de connexion, abonnement
imposé ou consentement marketing n’est déduit de la réception.

Le cross-selling est générique et volontaire. Les titres, contenus, expéditeurs
et actions de lecture ne servent pas à personnaliser les offres. L’accès aux
documents promis ne dépend pas d’une conversion commerciale.

## Journal et information des personnes

Le journal de l’atelier porte sur son partage : préparation, activation,
association, accès autorisés, déclarations du navigateur, demande de téléchargement,
début de transmission, remise personnelle et révocation. Les événements portent
leur provenance. Un affichage déclaré ne vaut ni lecture intégrale ni présence
certaine d’une personne. Aucune détection fiable de capture d’écran ou preuve
d’impression physique n’est annoncée.

Lorsqu’il existe, le compte acteur est indiqué par son nom actuel ou son
identifiant stable. Cela attribue la requête à un compte Guteneo authentifié,
sans certifier l’identité physique de la personne. Les événements d’accès
détaillés (pages, texte, téléchargement et début de transmission) sont conservés
90 jours, puis purgés par lots bornés. Les reçus d’approbation, de facturation,
d’association et de remise restent distincts et suivent leurs propres règles de
conservation ; la purge d’activité ne retire pas ces preuves immuables.

Le journal se rafraîchit lorsque sa fiche active est visible. La préparation et
le dépôt en cours utilisent un suivi borné ; aucun rafraîchissement périodique
n’est maintenu dans un onglet masqué. La pagination donne accès aux événements
plus anciens. Le propriétaire retrouve aussi son historique personnel, qui
reste indépendant du journal atelier après remise d’une copie.

Les invitations opaques, les tokens, les URL privées et le contenu ne sont pas
ajoutés aux journaux. Les réponses sensibles sont privées, non mises en cache et
non indexables. La révocation et la récupération de compte n’autorisent jamais
un atelier à récupérer le coffre provenant d’autres expéditeurs.

## Surfaces, erreurs et activation

| Surface                   | Contrat courant                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web atelier               | `/app/secure-distributions`, préparation, revue finale, approbation, activation, association et révocation sous droits                                                          |
| Web personnel             | `/app/my-documents`, `/app/services`, `/app/personal-account`, lecteur image/texte, export et copie autorisés                                                                   |
| REST atelier              | `/api/secure-distributions` et opérations bornées ; tenant authentifié, scopes OAuth et permissions courantes                                                                   |
| REST personnel            | `/api/personal/*`, principal propriétaire et navigateur ; aucun accès personnel implicite via OAuth atelier                                                                     |
| MCP et paquets assistants | Catalogue, préparation, liste, détail, confirmation après approbation navigateur et révocation ; aucun outil d’association, approbation sensible ou lecture du coffre personnel |
| Natif                     | Contrat natif existant et ouverture du navigateur conservés ; une intégration locale ou un paquet ne qualifie pas les clients réels ou les appareils physiques                  |

Les erreurs de scan, intégrité, rendu, texte trop volumineux, financement,
autorisation, fraîcheur et configuration ferment le parcours. Un état `failed`
n’est pas transformé en succès ; l’utilisateur consulte le même identifiant
avant de décider d’une nouvelle préparation. Les anciennes URL par mot de passe
restent un contrat historique distinct et n’acquièrent pas rétroactivement
la sécurité du nouveau parcours.

Migrations : `0055_personal_accounts.sql`, `0056_secure_distributions.sql`,
`0057_secure_approval_evidence.sql`, `0058_secure_copy_jobs.sql`. Production :
activation dédiée, clé privée valide, renderer privé, politique Auth0 forte
qualifiée, scanner et fournisseur réels configurés. Le mode déterministe et les
identités fortes locales sont des instruments de test seulement.

Sources : `apps/api/src/auth.ts`, `personal-auth.ts`, `secure-distributions.ts`,
`personal-documents.ts`, `secure-distribution-routes.ts`, `secure-storage.ts` ;
contrat partagé `packages/contracts/src/secure-distribution.ts` ; interfaces
`apps/web/src/personal-*` et `secure-*`. Tests ciblés :
`tests/unit/personal-auth.test.ts`, `tests/unit/mcp-secure-distribution.test.ts`,
`tests/integration/secure-approval-boundary.test.ts` et
`tests/distribution-e2e/*.e2e.ts`. Les commandes, rapports et limites du framework
demandé sont décrits dans [le guide e2e](../tests/distribution-e2e/README.md).
La présence des tests n’affirme pas leur réussite, la CI du commit exact,
l’activation des services ou la qualification d’un hôte assistant réel.
