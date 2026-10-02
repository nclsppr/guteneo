# Modèles, données et distribution

Reprise locale du 2 octobre 2026 sur `a808307c5687588eb8c0aab45c9e559aa70a03dc`,
dans le worktree `templates-workflow`. Le travail du 21 septembre a été récupéré
du snapshot `20d7b8249b1aa8d942c45b59d56ec9e768503b8e` (base `c5319253`).
Ses anciens rapports ne prouvent pas la validation de cette réconciliation.
Le candidat reste local, sans merge, déploiement, activation IA ni envoi réel.

## Publication coordonnée autorisée le 2 octobre 2026

La demande ultérieure de déploiement autorise la fusion et la publication de ce
candidat après validation de la PR et du commit fusionné. Les preuves locales
ci-dessous restent distinctes de la publication, identifiable par le manifeste
public et la version Cloudflare.

La réconciliation avec `8b060bb` conserve les migrations déjà fusionnées
`0042_workspace_roles.sql` et `0043_workspace_invitations.sql`. Les six migrations
du studio, encore inédites en production, sont renumérotées 0044–0049 sans changer
leurs octets SQL. Les preuves locales antérieures employaient les numéros
0042–0047 ; leurs comptes et journaux restent historiques.

Le studio applique les rôles actuels : consultation seule pour l’observateur,
préparation pour l’opérateur, approbation séparée selon les droits effectifs.
Un PDF généré reste privé avant préparation. La préparation rend son accès de
revue disponible aux approbateurs actuels, dans le seul contexte de la demande
liée ; l’interface l’indique avant cette action. La bibliothèque conserve son
filtre privé. REST et MCP exigent la demande exacte, le même atelier et les
droits actuels ; les métadonnées, octets et pages sont revérifiés après lecture.
La révocation du droit d’approbation ou de la connexion coupe cet accès.

La publication requiert les migrations du studio 0044–0049 et les deux services privés :
le renderer pour `/render/template` et le scanner, conteneur compris, pour
`/scan-source`. Publier et qualifier les services privés avant de coordonner
les migrations et l’application. Utiliser les lots atomiques produits par
`scripts/migrate-remote.mjs`, conserver un bookmark D1 et vérifier schéma,
ledger et intégrité. Appliquer uniquement les migrations absentes.

La migration 0045 remplace l’index de déduplication pour distinguer les PDF privés.
Le prédicat SQL de l’ancienne application devient incompatible : la fenêtre
entre cette migration et la publication applicative doit être courte et
coordonnée, les imports/rendus pouvant alors échouer. Après création de PDF
privés, ne pas revenir à une application antérieure aux contrôles
`access_owner_id` : elle ne protège pas ces documents. Toute version de repli
doit conserver les nouveaux contrôles d’accès et la compatibilité du schéma.

Les signatures du scanner ont été rafraîchies et qualifiées localement le
2 octobre : ClamAV 1.5.4, base 28141 du 2 octobre à 06:26:12 UTC, PDF propre et
EICAR inoffensif reconnus avec empreintes exactes. Cette preuve Docker ne
remplace pas les contrôles distants du renderer et de `/scan-source`.
La qualification de déploiement est conservée séparément dans
`/Users/nclsppr/Developer/.artifacts/guteneo-templates-deploy-20261002`.
Les canaux déjà configurés restent inchangés ; aucun envoi réel, activation IA
ou mandat de délégation ne fait partie de cette publication.

## Complément : démonstrations, suppression et création par les LLM

La galerie contient cinq bases fictives : courrier professionnel, facture de
démonstration, relevé tabulaire, devis et bon de livraison. « Créer ma copie
privée » enregistre un modèle indépendant, modifiable et partageable ; lire la
galerie ne remplit pas automatiquement l’atelier. Les cinq modèles ont un schéma
métier, des liaisons et des données d’exemple permettant de produire un vrai PDF.

Le propriétaire peut supprimer sa création depuis la bibliothèque ou le studio,
avec une confirmation nommant le modèle. Les copies de démonstration suivent le
même parcours. Une suppression retire aussi un modèle partagé de la bibliothèque
des autres membres. Les PDF déjà générés et leur historique sont conservés ;
la base de démonstration reste disponible pour créer une nouvelle copie.
Les modifications non enregistrées sont signalées dans la confirmation ; annuler
conserve le brouillon. Un droit d’édition ou de publication n’accorde pas celui
de supprimer la création d’un autre membre.

La migration additive `0049_template_soft_deletion.sql` ajoute `deleted_at`.
La mutation vérifie propriétaire, adhésion actuelle, autorité OAuth et révision.
Les lectures et nouvelles générations excluent les modèles supprimés ; les
courses avec édition, publication ou partage ne peuvent les réactiver. Les
versions immuables et relations de provenance restent conservées.

Les LLM découvrent les règles avec `get_template_authoring_guide` : schémas JSON
générés depuis le contrat Zod courant, propriétés graphiques autorisées, règles
sémantiques, limites et enveloppe minimale complète. `list_template_examples`
et `get_template_example` fournissent les mêmes cinq modèles que la galerie web.
Les lectures ne créent rien. L’assistant adapte l’enveloppe et l’enregistre avec
`create_template`, puis vérifie l’aperçu avant publication. Cette création
directe n’utilise pas les adaptateurs OpenAI internes et fonctionne sans leur
configuration. Le guide embarqué dans le plugin complète la référence du serveur.

Le propriétaire peut également demander `delete_template` avec l’identifiant et
la révision courante. Les lectures utilisent `templates:read`, la création et la
suppression `templates:write` ; les autres droits restent distincts. Le contrat
REST correspondant est décrit dans [API_CONTRACT.md](API_CONTRACT.md).

Les nouvelles preuves sont archivées dans
`/Users/nclsppr/Developer/.artifacts/guteneo-template-demos-20261002` et ne
remplacent pas les résultats du candidat de base ci-dessous.
La recette couvre 52 tests de contrats/plugin, 39 cas de workflow hors IA
(dont un recontrôle ciblé après correction d’un attendu), 216 contrôles de
sécurité, six parcours navigateur et une régression de l’éditeur graphique.
Les cinq exemples ont produit leurs PDF réels, inspectés visuellement.
L’[exemple MCP exécutable](../examples/template-workflow/README.md) a découvert
les règles, créé un devis privé, rendu son aperçu, supprimé le modèle et relu
le PDF conservé. Le [rapport de recette](TEST_RESULTS.md) distingue les passages
réussis, les premiers échecs corrigés et les limites de cette preuve locale.

## Cartographie initiale

Le dépôt conserve un seul service métier Guteneo, une API Hono, le MCP et
l’atelier React. D1 fait autorité pour les adhésions, approbations, quotas,
envois et outbox. R2 conserve les octets privés. `DocumentService` importe,
vérifie et stocke les PDF ; le Worker documentaire sépare le rendu du service
exposé. Les campagnes CSV existantes préparent des envois individuels mais ne
modélisent ni les lignes d’articles ni un document personnalisé par client.

Les ajouts portent sur une enveloppe de modèle indépendante du moteur, ses
versions et droits, les sources et mappings distincts, les jobs de génération
et les associations explicites entre résultat et destination. La distribution
continue d’appeler la préparation existante. Publier un modèle, valider un
mapping ou générer un PDF ne vaut jamais approbation d’envoi.

Premier parcours vertical : création d’un modèle dans la galerie ou par API,
édition visuelle, sauvegarde avec contrôle de révision, publication immuable,
génération à partir d’un objet métier, consultation du PDF contrôlé. L’import
de données et le lot prolongent ce parcours sans le remplacer.

## Décisions et risques

- pdfme est évalué dans une version publiée et épinglée. Un `basePdf` en
  dimensions et marges permet les tableaux dynamiques ; un PDF de fond ne
  fournit pas cette pagination. Le PDF rendu, pas le canvas, est la preuve.
- Les contenus métier restent des objets et tableaux. Un adaptateur borné
  produit les valeurs du moteur, sans expression JavaScript utilisateur.
- Le studio utilise le Designer intégré dans React, chargé à la demande.
  Les PDF clients n’acquièrent pas de marque Guteneo imposée.
- L’original d’un dataset reste privé. Le mapping est un plan distinct ;
  l’IA peut le proposer, mais la validation et l’application sont déterministes.
- Le traitement Word vise des blocs rééditables avec avertissements de
  conversion. Il ne promet pas un aller-retour fidèle avec Microsoft Word.
- Les devis, contrôles postaux, consentements et mandats experts existants
  restent l’autorité pour la distribution. Une destination répétée n’autorise
  ni fusion, ni déduplication, ni changement de canal.

Les risques à éprouver sont la pagination et les polices, le coût des bundles,
les archives XLSX/DOCX adversariales, les ambiguïtés des données, les droits
révoqués pendant un job, les doublons concurrents et les erreurs partielles.

Sources officielles vérifiées : [tables pdfme](https://pdfme.com/docs/tables),
[code pdfme](https://github.com/pdfme/pdfme),
[bonnes pratiques Workers](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).

## Frontières de preuve

Le développement est isolé dans un worktree. Aucun déploiement, merge,
provisionnement payant, activation fournisseur ou envoi réel n’est autorisé
par cette mission. Un rendu local dans le même adaptateur ne qualifie pas
Cloudflare Browser Run distant ; des outils MCP testés localement ne qualifient
pas leur exécution dans ChatGPT, Claude ou Cursor. Les adaptateurs IA récupérés
restent inchangés et inactifs. Tous les tests IA sont exclus de la recette du
2 octobre ; leurs anciens doubles synthétiques ne qualifient ni cette reprise
ni un modèle réel.

## Architecture livrée

- `packages/contracts/src/templates.ts`, `datasets.ts` et `template-workflow.ts` : enveloppe, données métier, plans déclaratifs et contrats communs.
- `packages/templates/` : galerie, adaptateur, changements sémantiques, import Word et ressources embarquées. Décision, licences, mesures et limites : [TEMPLATE_ENGINE.md](TEMPLATE_ENGINE.md).
- `packages/data/` : profilage CSV/XLSX/XML/JSON, validation complète, jointures, normalisation et adaptateurs OpenAI. Formats et limites : [DATA_IMPORT.md](DATA_IMPORT.md).
- `apps/api/src/template-workflow.ts` : autorité métier unique ; `template-workflow-routes.ts` et `mcp.ts` sont les transports. La logique React ne décide ni des droits ni de l’approbation.
- `apps/documents/` : nouveau rendu pdfme privé, aux côtés du rendu HTML et de l’import PDF. `apps/scanner/` ajoute une analyse des octets de sources bureautiques, séparée de l’ancienne route PDF.
- `apps/web/src/*-pages.tsx` et `template-*.tsx` : bibliothèque, Designer chargé à la demande, formulaires métier, partage, mapping, suivi et distribution. Ces capacités ne sont pas exposées dans la prévisualisation publique à fixtures.

Les migrations sont additives. `0044_template_workflow.sql` crée les modèles,
versions, droits, sources privées, mappings, jobs, résultats et manifestes.
`0045_private_generated_documents.sql` ajoute une propriété privée aux documents
générés et sépare leur déduplication de celle des documents historiques ; les
anciens documents conservent leurs règles. `0046_generation_provenance.sql`
conserve coordonnées des cellules, empreintes et paramètres de rendu. `0047_distribution_postal_reviews.sql` relie les contrôles postaux aux entrées
figées ; `0048_dataset_analysis_recovery.sql` ajoute les leases, compteurs et
options d’analyse pour réessayer le même original. Aucun reset de base ou
migration distante n’a été réalisé.

Les sources sont conservées 30 jours ; les entrées normalisées et copies
intermédiaires de génération sont purgées après 90 jours hors job actif. Les PDF
finaux et envois suivent la maintenance documentaire existante. La provenance ne
contient pas les valeurs des cellules. Les modèles et versions publiées restent
conservés pour la traçabilité ; archiver ne les détruit pas. Les originaux Word
sont privés, mais leur contenu extrait appartient au modèle et doit être vérifié
avant partage.

## Parité des interfaces

Les noms MCP ci-dessous sont ceux annoncés par le serveur, sans préfixe ajouté
par un hôte. Chaque opération vérifie les droits sur la ressource dans le même
service. `get_capabilities` décrit les limites, l’absence d’envoi à la génération
et le statut de qualification local.

| Opération | API | MCP | Web |
| --- | --- | --- | --- |
| Bibliothèque et schéma | `GET /templates`, `/:id`, `/:id/schema` | `list_templates`, `get_template`, `get_template_schema` | Modèles, palette et formulaire métier |
| Créer/modifier | `POST /templates`, `PATCH /templates/:id` | `create_template`, `update_template` | Galerie, page vierge, Designer, variables, colonnes, logo, formats, conditions et totaux |
| Import Word | `POST /templates/import-docx` multipart | `import_docx_template` avec transport fichier supporté | Fichier .docx, avertissements puis studio |
| Suggestion de modèle | `POST /templates/:id/suggest` | `suggest_template` | Instruction, revue puis application locale explicite |
| Publier/dupliquer/archiver | `POST /templates/:id/{publish,duplicate,archive}` | `publish_template`, `duplicate_template`, `archive_template` | Actions dédiées, révision attendue |
| Partage | `GET /templates/:id/sharing`, `POST /templates/:id/share` | `get_template_sharing`, `share_template` | Privé, organisation ou membres ; quatre droits séparés |
| Aperçu exact | `POST /templates/:id/preview` | `preview_template` | PDF serveur avec navigation de pages |
| Import original | `POST /datasets` multipart ou JSON | `import_dataset`, `import_json_dataset` | CSV, XLSX, XML, JSON |
| Profilage et lecture | `GET /datasets`, `/:id`, `/:id/profile` | `list_datasets`, `get_dataset`, `profile_dataset` | Feuilles, lignes, en-têtes, anomalies, aperçu paginé |
| Reprise d’analyse | `POST /datasets/:id/retry-analysis` | `retry_dataset_analysis` | Réessayer le même original après un échec temporaire |
| Proposition IA | `POST /datasets/:id/analyze` | `analyze_dataset` | Mapping ou nouveau schéma/modèle proposé, revue puis adoption explicite |
| Mappings | `GET/POST /mappings`, `/:id`, `/:id/validate` | `list_mappings`, `get_mapping`, `create_mapping`, `validate_mapping` | Version indépendante, regroupement/jointure, réemploi, validation |
| Génération | `POST /generation-jobs` | `generate_documents` | Saisie unitaire ou lot depuis mapping validé |
| Suivi et provenance | `GET /generation-jobs`, `/:id`, `/:id/results`, `/:id/provenance` | `list_generation_jobs`, `get_generation_job`, `get_generation_results`, `get_generation_provenance` | Progression, PDF, erreurs et cellules d’origine |
| Annulation/reprise | `POST /generation-jobs/:id/{cancel,retry}` | `cancel_generation_job`, `retry_generation_records` | Annuler ou reprendre les records échoués désignés |
| Distribution | `POST /distribution-plans`, `GET /distribution-plans/:id` | `prepare_distribution`, `get_distribution_plan` | Sélection, destination commune ou champs figés, multicanal explicite |
| Reprise de préparation | `POST /distribution-plans/:id/resume` | `resume_distribution` | Préparer les entrées restantes ou reprendre les erreurs désignées |
| Contrôle postal | `POST /distribution-plans/:id/entries/:entryId/postal-preflight` | `create_distribution_postal_preflight` | Revue postale existante liée à l’entrée figée |
| Politique IA | `GET/PUT /dataset-ai-policy` | Lecture `get_dataset_ai_policy` uniquement | Administrateur navigateur ; activation et transfert réservés à l’humain |

Les routes sont préfixées `/api`. La spécification publiée dans le code est
`apps/web/public/openapi.json`, générée pour ce module par
`scripts/update-template-openapi.ts`. Les nouveaux scopes OAuth sont distincts :
`templates:read/write/publish/share`, `datasets:read/write`,
`generations:read/write`. Les scopes documents et envois gardent leur rôle.
Aucune session navigateur copiée, clé API inventée ou autorité de délégation
implicite n’est ajoutée. Les exemples OAuth statiques des intégrations listent les
scopes demandables ; modifier ces fichiers n’accorde aucune autorisation existante.

## Garanties métier

Une version publiée est un instantané immuable ; une modification ouvre un
brouillon, et une nouvelle publication crée une autre version. Le lancement
résout la version puis fige modèle, données, mapping et empreintes. Les statuts
et listes ne lancent pas de travail. Les mutations lancent un traitement borné
avec `waitUntil` ; le cron reprend les records persistés, avec lease, trois
tentatives maximum, vérification des autorités et annulation. Les queues
existantes restent celles des envois. Un PDF déjà enregistré est réutilisé lors de la reprise.

Une génération accepte au plus 500 records, avec trois jobs actifs par
organisation, 64 Kio par record et 1 900 000 octets de payload. La création
atomique utilise une insertion JSON ensembliste, pas 500 requêtes dans une batch.
L’idempotence est liée à l’organisation et au contenu. Le résultat garde son
`recordId` même si les rendus terminent dans un autre ordre.

Partager un modèle n’accorde pas l’accès aux datasets, mappings, jobs ou PDF
privés d’un autre membre, même administrateur. Les accès aux documents, aperçus,
envois dérivés et campagnes appliquent cette propriété. Deux utilisateurs qui
génèrent les mêmes octets ne récupèrent pas le document privé de l’autre.
Révoquer l’adhésion, le client OAuth ou le droit d’utilisation est recontrôlé
pendant le travail asynchrone. « Privé » signifie propriétaire uniquement.

La distribution fige le lien record → document/version/hash → canal/destinataire.
`recipientFields` est résolu dans les données déjà figées du record, pas depuis un
fichier réinterprété après génération. Plusieurs destinations restent plusieurs
envois ; plusieurs canaux pour un record exigent `explicitMultichannel:true`.
Le web permet d’affecter chaque destination à tous les records sélectionnés ou
à un sous-ensemble nommé. Le choix multicanal tient compte du document exact :
deux records qui réutilisent les mêmes octets restent soumis au contrôle commun
si leurs canaux diffèrent. Le plan ne crée aucune approbation, tentative d’envoi
ou réservation de crédit.
Une préparation postale qui référence un brouillon fournisseur déjà qualifié peut
consulter le fournisseur pour obtenir son devis ; elle ne soumet aucun envoi.
Les erreurs par entrée restent visibles. Reprendre un rendu après
création d’un plan est refusé afin de ne pas y réintroduire silencieusement un PDF.

Les canaux réellement activés, profils expéditeurs, devis, facturation, mode
Review, contrôles postaux et mandats experts restent ceux de Guteneo. Le fait
qu’un formulaire propose e-mail ou postal ne vaut pas activation de ces canaux.
Un fournisseur incertain reste soumis à la réconciliation existante, sans retry
aveugle. Les e-mails ont sujet et corps distincts du PDF, un seul record/PDF par
préparation et aucun regroupement en CC/BCC ; le blocage existant des pièces
jointes e-mail non qualifiées reste explicite.

## Configuration locale et IA

```sh
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Ouvrir `http://localhost:8787/#/app`. Le bandeau **Simulation** est obligatoire
pour cette recette : le navigateur documentaire fonctionne réellement en local,
mais le contrôle antivirus est simulé dans ce mode. La production continue à
exiger le scanner, l’identité, les bindings et les fournisseurs configurés.

L’aide IA reste désactivée sans `DATASET_OPENAI_API_KEY` et un modèle explicite
`DATASET_OPENAI_MODEL`. Configurer ces secrets ne donne pas le consentement de
transfert : l’administrateur navigateur doit activer la politique de
l’organisation, autoriser le transfert et fixer un budget d’appels quotidien.
Aucune clé n’a été créée ou configurée et aucune inférence n’a été exécutée
pendant cette reprise. Le contrôle de présence n’a exposé aucune valeur ; le
choix de configuration par l’utilisateur reste attendu. Les adaptateurs
récupérés, non modifiés, utilisent les sorties structurées de Responses, `store:false`, un
échantillon borné, aucun outil et aucun pouvoir d’envoi. Ils retournent toujours
une proposition à revoir ; les modèles et mappings validés fonctionnent ensuite
sans IA. Avec `proposeSchema:true`, l’analyse existante peut aussi proposer les
champs métier et un modèle éditable à partir du mapping : un seul appel, schéma
construit et validé par le serveur, exemples synthétiques, au plus 24 champs simples
et quatre tableaux de dix colonnes. Le web présente les sources et types puis crée
le brouillon privé et sa correspondance seulement après adoption explicite.
Les tests de réponses IA historiques utilisent des doubles identifiés ; ils
n’ont pas été relancés le 2 octobre et ne mesurent pas la qualité d’un modèle
réel. Aucun AI Gateway ni engagement de résidence UE n’est présenté comme
configuré.

## Démonstration exacte

### Web

1. Dans **Modèles**, choisir **Courrier professionnel**, ou importer la fixture
   `template-engine/word-source.docx` du dossier de preuves externe indiqué
   ci-dessous. Lire les avertissements Word.
2. Déplacer un bloc dans le Designer, ajouter une variable métier et enregistrer
   le brouillon. Publier la version. Dans **Données et génération**, remplir les
   champs puis vérifier l’aperçu PDF serveur ou générer sans envoi.
3. Dans **Mes données**, importer `tests/fixtures/datasets/clients-reordered.csv`.
   Choisir le modèle cible, la clé client et les colonnes métier ; valider toutes
   les lignes. Lire le nombre de documents et corriger les anomalies avant de
   générer.
4. Pour le cas clients/articles, utiliser `clients-articles.xlsx`, les titres
   avant en-tête et ses deux feuilles. La fixture de mapping exacte est
   `examples/template-workflow/clients-articles.mapping.json` : elle illustre la
   clé validée entre feuilles et les conventions explicites de dates/montants.
5. Dans **Générations**, ouvrir les PDF, consulter la provenance, sélectionner les
   résultats prêts puis **Préparer la distribution**. Choisir une destination
   commune ou ses chemins dans les données. Le manifeste et les blocages restent
   consultables ; les validations humaines se font dans le parcours d’envoi
   existant. La recette automatisée s’arrête avant toute approbation/envoi.

### API et assistant

Les scripts exécutables et leurs preuves sont dans
[examples/template-workflow/README.md](../examples/template-workflow/README.md).
`api.mjs` et `mcp.mjs` créent et publient le modèle, génèrent deux records et
consultent les résultats. Ils utilisent un bearer OAuth autorisé fourni par
l’environnement ; leur vérification locale utilise exclusivement le jeton de
simulation du dépôt, pas une qualification OAuth machine distante.

Un assistant connecté au serveur candidat peut suivre cette demande :

> Lis les capacités. Crée un modèle depuis l’exemple `create-template.json`,
> ajoute une colonne métier via `update_template` et son patch
> `add_table_column`, puis publie la version attendue. Importe le fichier XLSX
> via le transport fichier annoncé par ton hôte, lis son profil paginé, crée le
> mapping fourni et valide-le. Génère les documents sans envoi, suis le job et
> vérifie les PDF et leur provenance. Prépare uniquement la distribution avec
> les associations explicites fournies ; ne confirme aucun envoi.

Si l’hôte ne sait pas transférer un fichier privé, il doit le signaler et utiliser
le web ; il ne reconstitue pas l’original depuis un extrait et ne le rend pas
public. Le module `integrations/guteneo/skills/document-studio/SKILL.md` décrit ce
parcours sans attribuer de consentement humain à l’assistant. Le paquet local
reconstruit n’est pas une publication marketplace.

## Vérifications du candidat du 2 octobre

Les preuves actuelles sont conservées hors du dépôt dans
`/Users/nclsppr/Developer/.artifacts/guteneo-templates-20261002`.
Le résumé machine est `verification.json` dans ce dossier.
Les anciennes mesures du 21 septembre restent historiques. Les sous-ensembles
et relances ci-dessous ne sont pas additionnés aux résultats de la suite large.

| Périmètre local | Résultat et preuve |
| --- | --- |
| Suite unitaire/intégration hors IA | **1 540 tests réussis dans 82 fichiers** ; deux fichiers échouent pendant leur initialisation, laissant 31 cas non exécutés (`non-ai-tests.log`). Les fixtures historiques n’avaient pas la colonne `documents.access_owner_id`. Après correction, Luxembourg **3/3** (`historical-fax-regressions.log`), puis préparation fax **28/28** (`fax-review-final.log`) réussissent. Ce sont des reprises ciblées, pas une nouvelle exécution intégrale verte. |
| Données et runtime | **29 tests de données + un test workerd réussis**, inclus dans la suite large : CSV/XLSX/JSON/XML, valeurs lexicales, adresses imbriquées, tables d’articles liées, chemins explicites et refus XML bornés. |
| Intégration du workflow | **27 cas hors IA réussis** dans la vérification ciblée du workflow, dont les régressions de confidentialité, révocation et annulation. Les reprises de sous-ensembles ne sont pas additionnées à ce nombre. |
| Modèles et rendu | **20 tests réussis**, inclus dans la suite large. Cinq PDF produits par le vrai handler dans Chromium isolé : factures de 1, 30 et 200 lignes, courrier long et import Word ; marqueurs, limites de page, pagination et absence de requêtes externes vérifiés. |
| Sécurité et contrat | **215 contrôles de sécurité réussis** (`security-tests.log`), dont **7 contrôles OpenAPI** vérifiant notamment l’inventaire exact de 60 opérations, les scopes, l’approbation navigateur et l’idempotence. |
| Scanner | **29 tests JavaScript + 38 tests Python réussis** lors de la reprise du 2 octobre ; résultat observé dans le terminal, sans journal exporté dans ce dossier. Ces tests ne qualifient pas l’antivirus hébergé. |
| Studio navigateur | **22 cas réussis, huit sauts intentionnels** (`studio-browser.log`) ; les sauts concernent l’édition graphique sur les deux projets mobiles. Le mapping et la distribution sont éprouvés sur Chromium desktop, Chromium mobile et WebKit iPhone. |
| XML, langues et clavier | **6/6 cas réussis** sur les trois projets navigateur (`studio-table-a11y-final-browser.log`) : canal/destinataire issus de chaque record XML sans envoi, changement de langue conservant titre client et modifications non enregistrées, Tab et focus visible sur les tables source/résultats, défilement réel par flèches et sélection au clavier. Cette reprise enrichit les mêmes six cas de `xml-language-browser-final.log` ; elle ne s’y additionne pas. |
| Navigation de l’atelier | **21/21 cas réussis** (`studio-navigation-regression.log`) : routes privées, focus, session, navigation traduite et affichage mobile. |
| Prévisualisation publique | **76 cas réussis, six sauts intentionnels** (`preview-tests.log`). Ce modèle à fixtures reste séparé ; les capacités métier du studio n’y ont pas été ajoutées. |
| Migrations | **46 migrations, 296 objets de schéma**, schémas source/transport équivalents, `quick_check=ok`, aucune violation de clé étrangère (`migration-transport.json`). |
| Exemples exécutables | Les trois scripts REST, MCP et dataset terminent avec **exit 0** (`example-api.log`, `example-mcp.log`, `example-dataset-api.log`). Chacun génère deux PDF prêts. Le dernier réemploie le mapping et vérifie quatre associations dans deux plans préparés : zéro approbation, zéro tentative fournisseur, crédits et quotas inchangés. Détails dans le [README des exemples](../examples/template-workflow/README.md). |
| Construction et dépendances | Typecheck et lint global réussis après la dernière correction clavier ; builds application/web et preview, dry-runs API et Worker documentaire réussis (`build.log`, `final-web-build.log`, `preview-build.log`, `documents-build.log`). Le web et le lint ciblé repassent après cette correction (`studio-table-a11y-final-build.log`, `studio-table-a11y-final-lint.log`). L’audit npm `--omit=dev` signale **zéro vulnérabilité de production** (`npm-audit.json`) ; trois alertes connues de développement restent hors de ce résultat. `lint.log` conserve une tentative antérieure échouée ; il ne représente pas la reprise réussie. |

La reprise ciblée Resend réussit aussi **8/8 cas** (`resend-regression.log`), avec
transport intercepté ; elle n’ajoute aucune preuve de livraison réelle. Les
logs conservent les tentatives initiales et les reprises, sans les confondre.
Aucune CI sur un commit final, recette navigateur complète de l’application ou
qualification distante n’est revendiquée ici.

L’IA demeure hors de ce bilan : aucune clé créée/configurée, aucun appel,
adaptateurs récupérés inchangés et tests IA exclus dans l’attente du choix de
l’utilisateur.

## Limites et qualification restante

- Les rendus sont éprouvés dans le handler documentaire réel avec Chromium isolé
  local, et les parseurs dans workerd local. Aucun runtime Cloudflare hébergé,
  limite CPU/mémoire distante ou charge soutenue à 500 rendus n’est qualifié.
- L’import Word conserve du contenu éditable, pas les styles/pages/images Word ;
  `.doc` et `.docm` sont exclus. Le spike Word est un vrai fichier synthétique.
- L’édition graphique est qualifiée sur desktop ; mobile permet consultation,
  formulaires, mapping et suivi. Le Designer charge environ 6,52 Mo de JavaScript
  minifié (2,16 Mo gzip) à la demande. Le Worker documentaire pèse 2 828,43 Kio gzip (environ 2,76 Mio).
  Ces poids mesurés restent un coût initial à surveiller sur réseau lent.
- La police embarquée couvre le corpus FR/DE/anglais/euro éprouvé ; les glyphes
  absents sont refusés. Mise en page arbitraire, fontes externes et recouvrement
  volontaire de blocs ne sont pas pris en charge.
- L’IA réelle, ses coûts/latences/qualité, l’antivirus hébergé sur CSV/XLSX/DOCX,
  le transport natif des fichiers ChatGPT/Claude/Cursor, les canaux fournisseurs
  et l’OAuth machine distant demandent une qualification séparée autorisée.
- Aucun merge, déploiement en production, envoi réel, paiement, activation de
  fournisseur ou provisionnement payant n’a été effectué.


## Récupération et contrôle postal

`POST /api/datasets/:id/retry-analysis` et MCP `retry_dataset_analysis` réanalysent
le même original, avec son hash et ses options d’encodage/séparateur conservés.
La tentative initiale compte dans la limite de trois ; une lease de 90 secondes
évite les analyses concurrentes. Un rejet de sécurité ne devient pas prêt par
retry. Le web affiche l’état, le délai et une action explicite ; les lectures ne
relancent rien. Un échec Word avant création du modèle exige un nouvel import.

Une distribution traite au plus trois préparations par mutation. Le manifeste
complet de 500 entrées est inséré atomiquement avec deux instructions ;
`pendingCount` et `errorCount` restent visibles. La reprise explicite
`POST /api/distribution-plans/:id/resume` / MCP `resume_distribution` traite les
suivantes, ou les erreurs de préparation avec `retryFailed:true`. Cela ne reprend
jamais une tentative fournisseur inconnue.

Pour chaque entrée postale, expéditeur, plafond et trois options d’impression
sont figés. `POST /api/distribution-plans/:id/entries/:entryId/postal-preflight`
(MCP `create_distribution_postal_preflight`) ouvre le contrôle postal existant,
avec les droits `documents:write` **et** `dispatches:prepare`. Il peut lire le
profil fournisseur configuré ; il ne transfère pas le document, ne crée pas de
brouillon chez le fournisseur et n’accorde aucun consentement. Les étapes de revue, transfert autorisé et devis restent celles de Guteneo.
Aucune adaptation postale automatique du PDF n’est ajoutée : une correction
demande de modifier le modèle, de générer un nouveau PDF puis de préparer un
nouveau plan explicite ; l’original et son manifeste restent conservés. Le plan expose la revue et son éventuel envoi final séparément du PDF
original figé, sans modifier ce dernier. Le web relie chaque ligne à ce parcours.
Les options absentes exigent un nouveau manifeste explicite.

Une publication valide le contrat et les données d’exemple ; elle n’atteste pas
qu’un aperçu a déjà été rendu. Les débordements sont bloqués par le rendu serveur
au preview ou à la génération. Vérifier le PDF final fait donc partie du parcours
de recette avant distribution.

## XML et canal défini dans les données

Les imports XML utilisent UTF-8, conservent les valeurs lexicales et refusent
DTD, entités externes, contenu mixte et structures ambiguës. `xmlRecordPath`
peut sélectionner explicitement une collection (ex. `/export/clients/client`).
Les lignes répétées deviennent des feuilles liées par `__xml_record_id` et
`__xml_parent_id`, à associer explicitement dans le mapping. Voir DATA_IMPORT.md.

Une entrée de distribution choisit `channel` **ou** `channelField`. Ce dernier
résout uniquement `fax`, `email` ou `postal` dans le record figé. Les champs de
destination peuvent être communs (`recipientFields`) ou distincts par canal
(`recipientFieldsByChannel`). `senderIdsByChannel` et `optionsByChannel` évitent
qu’un expéditeur ou des options postales soient appliqués à un e-mail ou un fax.
Le manifeste conserve le canal, destinataire, expéditeur et options effectivement
résolus ; aucun choix de canal ni aucune adresse ne sont devinés par le serveur.
Une correction exige une nouvelle préparation explicite et garde les contrôles
d’approbation, de prix et de transfert postal du parcours existant.
