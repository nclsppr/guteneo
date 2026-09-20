# Page d’adresse postale — candidat du 20 septembre 2026

Le parcours propose « Utiliser l’adresse du document » et « Ajouter une page d’adresse ». Le second choix crée un document distinct et immuable. L’original reste conservé et ses pages sont copiées sans rasterisation ; leurs contrôles d’impression restent applicables. Le contenu du destinataire est modifiable, mais son placement et sa typographie sont contrôlés par Guteneo selon le profil Pingen courant.

## Pagination et validation

- Recto : une page d’adresse, puis toutes les pages originales.
- Recto verso : page d’adresse, verso blanc, puis toutes les pages originales. Cette feuille séparée conserve les paires recto/verso et le début au recto du document client.
- Exemple avec un original d’une page : deux pages/deux feuilles en recto ; trois pages/deux feuilles en recto verso. Un seul PDF et une seule lettre dans les deux cas.
- Le total final, y compris le verso blanc, doit rester dans les limites de 100 pages et 8 000 000 octets. Le prix vient du devis du PDF final, sans prix d’exemple ni multiplication locale.
- Une ligne trop longue ou un caractère impossible à rendre est refusé ; aucune information n’est tronquée pour la faire entrer dans la fenêtre.

La génération ne certifie ni l’existence de l’adresse ni la délivrabilité. Le schéma conserve ses trois lignes hors pays : nom, rue, code postal et ville ; il ne faut pas supprimer un complément nécessaire pour satisfaire cette limite.

## Parcours commun au navigateur et aux assistants

`POST /api/postal/address-pages`, scope `documents:write`, reçoit `{documentId, recipient, printMode}` et une clé `Idempotency-Key`. Le navigateur conserve la protection de session et CSRF. L’outil MCP `create_postal_address_page` appelle le même service avec une `idempotencyKey` stable.

Le service relit l’original prêt, son empreinte, sa preuve d’analyse et le profil fournisseur. Le moteur privé ajoute la page d’adresse. Le nouveau PDF repasse par le stockage privé immuable, l’antivirus et la validation de document. Un résultat en cours d’analyse reste inutilisable pour l’envoi ; la consultation/reprise porte sur ce document, sans régénération.

La réponse contient `document`, `provenance` et `canSend:false`. Après `ready`, le client lit le PDF final et demande son contrôle postal avec son nouvel identifiant. Les contrôles, le transfert consenti, le brouillon fournisseur, le devis et l’approbation existants portent tous sur ce même PDF. Le destinataire, le mode d’impression et le profil restent liés à la provenance ; leur modification impose une nouvelle génération depuis l’original. Une couverture ne peut pas être ajoutée récursivement à une autre couverture Guteneo.

La génération ne transmet aucun document à Pingen et ne crée aucun accord ni envoi. Les demandes concurrentes ou reprises avec la même clé partagent la même opération ; une clé réutilisée avec un autre contenu est refusée. Les autorisations sont vérifiées avant et après les traitements privés. Les originaux, destinataires et métadonnées ne sont pas journalisés.

## Publication et preuves

Cette note décrit une implémentation candidate, pas une publication. La migration 0033 et le moteur privé de documents doivent accompagner l’application au déploiement. Aucun courrier réel ni transfert Pingen ne sert aux tests de cette fonction. La qualification hébergée et l’essai d’une lettre réelle restent distincts des vérifications locales ci-dessous.

Sources : [gabarit Pingen](https://help.pingen.com/en/templates-and-postal-requirements/layout-requirements), [enveloppes à fenêtre](https://help.pingen.com/en/templates-and-postal-requirements/letter-standards). La génération est interne à Guteneo ; elle ne dépend pas des opérations de correction de PDF de l’API Pingen.

## Vérifications locales

- 17 tests du moteur de composition, dont 5 avec Chromium et PDF.js réels : profils LU, FR et FR vers DE, original image seul, polices incorporées, débordements et caractères manquants. Le rendu des pages originales est identique avant/après composition (empreintes raster à 144 dpi).
- 18 nouveaux tests serveur et 74 tests existants des documents, invariants et parcours postaux passent : reprise après interruption, concurrence, isolement, retrait d’accès, quotas et preuve d’analyse.
- 2 nouveaux tests MCP : droit d’écriture obligatoire, aucun consentement/profil fourni par le client, résultat distinct et absence de clé de stockage privée.
- 39 parcours navigateur : 18 nouveaux cas et 21 cas de revue postale existants, sur Chromium, Android Chromium et iPhone WebKit, avec inspection des captures et contrôle à 320 px.
- 148 contrôles de sécurité Node passent, dont le contrat OpenAPI autonome à 26 opérations et les limites d’authentification/exécution.
- Vérification locale des 33 migrations : 216 objets de schéma identiques après normalisation, `quick_check=ok`, aucune violation de clé étrangère.
- Typage, lint, compilation de l’application et compilation du moteur privé sans publication passent.

Les tests du serveur couvrent aussi la concurrence, la reprise des octets déjà produits, le retrait d’accès pendant la génération, le changement de destinataire/mode/profil, la preuve d’analyse manquante et l’absence de dépôt fournisseur. Les preuves locales sont sous `test-results/address-page-*`, les PDF/PNG fictifs sous `test-results/postal-address-page/pdf/` et les captures d’interface sous `reports/screenshots/postal-address-page/`. Les suites générales et la CI de la branche sont suivies séparément dans la proposition de modification.
