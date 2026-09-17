# Service privé de contrôle postal

État au 17 septembre 2026 : le Worker privé est déployé et sa qualification distante utilise uniquement des PDF synthétiques. Le raccordement API/MCP et la migration 0020 sont implémentés et testés localement ; leur migration et leur déploiement applicatifs restent à effectuer par la release. Le parcours serveur, ses preuves de session et le consentement séparé au dépôt sont décrits dans [POSTAL_REVIEW.md](POSTAL_REVIEW.md). Aucun transfert Pingen n'a été effectué pour qualifier le renderer. Les règles de mise en page restent celles de [PINGEN_PREFLIGHT.md](PINGEN_PREFLIGHT.md).

## Contrat interne

Le Worker `apps/documents` conserve `/validate` et `/render`. Il ajoute uniquement `POST /preflight/pingen`, accessible par service binding ; aucun domaine public, `workers.dev` ou URL de préversion n'est activé.

Le corps est le PDF original, sans modification, avec `Content-Type: application/pdf`. Les en-têtes internes sont :

- `X-Guteneo-Source-Sha256` : empreinte du document immuable lu dans le stockage privé ;
- `X-Guteneo-Scan-Sha256` : même empreinte, après vérification par l'appelant du scan qualifié ;
- `X-Guteneo-Pingen-Options` : JSON strict de `PingenPreflightOptions` (`defaultCountry`, `country`, `addressPosition`, `printMode`, `printSpectrum`, `deliveryProduct`). Le profil du compte provient de la qualification Pingen, pas du navigateur.

Ces en-têtes sont une assertion du service appelant. Le renderer n'a pas accès à D1/R2 et ne peut pas vérifier lui-même le scan ou l'appartenance à une organisation. Ils ne doivent jamais être recopiés depuis une requête publique. Il recalcule l'empreinte des octets reçus, puis celle des octets effectivement ouverts dans PDF.js.

La réponse reprend `PingenPreflightResult` et ajoute :

```ts
rendering: {
  dpi: 144;
  complete: boolean;
  pages: Array<{ page: number; width: number; height: number; rasterSha256: string }>;
};
address: null | {
  items: Array<{
    text: string;
    boundsMm: { x: number; y: number; width: number; height: number };
    baselineMm: number;
    fontSizePt: number;
    geometry: "approximate";
  }>;
  lines: string[];
  issues: string[];
  textVisibility: "not_verified";
  crop: {
    pngBase64: string;
    width: number;
    height: number;
    boundsMm: { x: number; y: number; width: number; height: number };
  };
};
```

L'extrait PNG englobe la fenêtre et la zone réservée d'affranchissement. Les coordonnées sont en millimètres depuis le haut gauche ; les positions de texte reposent sur les métriques de police, pas sur une certification des contours de glyphes. Les lignes sont reconstruites sans correction de casse, de pays ou de code postal. Le contrôle syntaxique existant s'applique à ces lignes.

Le texte et le PNG peuvent contenir une adresse : réponse privée `Cache-Control: no-store`, aucune journalisation. Ni les rasters complets ni les octets du PDF ne sont renvoyés. Leur empreinte est une preuve technique du rendu local, pas une preuve d'acceptation fournisseur.

Un échec peut ajouter `diagnostic: { stage }`, où `stage` provient exclusivement d'une liste fixe d'étapes : lecture, structure, budget, lancement, isolation, scripts, ouverture, rendu, raster ou adresse. Les sous-étapes d'ouverture identifient seulement les capacités de moteur absentes. Aucun message d'exception, trace, contenu, URL ou user-agent n'est renvoyé par ce diagnostic.

## Isolation et limites

- Corps lu en flux et plafonné à **8 000 000 octets**, même si `Content-Length` manque ou ment ; options limitées à512 caractères ; limite existante de100 pages.
- Contrôle structurel avant lancement de Chromium : A4, aucune rotation/coupe inattendue, polices incorporées, pas de fonction active/formulaire/annotation. La couche privée refuse aussi les calques optionnels et les images déclarées dépassant10 millions de pixels chacune ou20 millions au total. Ces limites sont une politique de ressources Guteneo.
- Une instance de navigateur par demande, aucune réutilisation de session. Shell HTTPS synthétique servi exclusivement par interception locale pour permettre WebCrypto ; tout autre accès réseau est avorté. Mode hors ligne, service workers contournés, CSP sans connexion ni worker externe ; aucune bibliothèque chargée depuis un CDN.
- PDF.js et son module de parsing proviennent des bundles officiels `pdfjs-dist/legacy/build` de la dépendance verrouillée et sont empaquetés dans le Worker. Cette variante fournit les adaptations de compatibilité du même éditeur : le navigateur Browser Run qualifié ne possède pas nativement `Map.prototype.getOrInsertComputed`, utilisé par le build moderne. Le PDF reste une donnée ; aucune action JavaScript du PDF n'est exécutée. La CSP n'autorise pas `unsafe-eval`. Le parsing PDF.js se déroule dans la page isolée ; aucun téléchargement de police, CMap ou module WASM n'est permis.
- Rendu **séquentiel de chaque page à144dpi**, fond blanc opaque, au maximum2,1 millions de pixels par canvas. Un seul raster transite à la fois ; son décodage côté Worker évite les tableaux intermédiaires de millions de valeurs JS. Le canvas est libéré après chaque page. Les grandes images, décodages incomplets et avertissements PDF.js bloquent le résultat.
- Budget de **25 secondes** pour la demande entière, plus au maximum2 secondes d'attente de fermeture. L'expiration ferme le navigateur ; un lancement terminé tardivement est également fermé. Une requête ou un rendu interrompu n'est jamais marqué complet. Les limites du processus Browser Run restent une protection supplémentaire ; ces bornes ne prétendent pas prouver une consommation maximale de mémoire pour tout PDF hostile.
- Texte page1 plafonné à20 000 éléments /128 000 caractères avant extraction, fenêtre limitée à200 éléments /1000 caractères par élément, extrait PNG limité à1 million de caractères base64.

Le rapport est toujours `canSend:false`. Un résultat sans anomalie est `review_required`, jamais `ready` ni une autorisation. La présence d'encre et le texte extrait ne prouvent pas que le destinataire visible correspond au destinataire approuvé : texte invisible, glyphes vectorisés, images et superpositions exigent encore la comparaison visuelle. Un PDF dont l'adresse n'est pas extractible est bloqué dans ce profil conservateur, même si Pingen pourrait l'accepter.

## Raccordement applicatif

Le service `apps/api/src/postal.ts`, les factories `postal-authority.ts`, les routes navigateur/MCP et la migration 0020 assurent avant l'appel : autorisation actuelle, organisation, document prêt non purgé, audit canonique de scan qualifié de la même empreinte, lecture R2 et vérification exacte des octets, budget de rendu atomique et profil Pingen qualifié. Le Worker n'implémente aucun de ces contrôles métier à la place de l'API.

Après l'appel, le serveur revérifie les droits et l'identité du document, exige l'intégralité des pages et la correspondance du destinataire extrait, puis conserve une preuve immuable. La comparaison visuelle avec l'original et la revue de l'expéditeur/des retours restent humaines. Une session navigateur peut ensuite consentir séparément au dépôt sans envoi ; le MCP ne peut pas fournir ce consentement. La preuve, le brouillon fournisseur, le devis exact et l'approbation finale restent séparés. Les détails et limites du raccordement testé localement figurent dans [POSTAL_REVIEW.md](POSTAL_REVIEW.md) ; le déploiement du seul renderer n'active pas ces routes ni ces capacités.

## Construction et preuve

Depuis la racine du dépôt, `npx wrangler deploy --config apps/documents/wrangler.live.jsonc --dry-run --outdir dist/worker` construit le candidat. La commande personnalisée copie les deux scripts PDF.js de compatibilité depuis `node_modules` vers `apps/documents/dist/pdfjs`, ignoré par Git. Aucun nouveau package ou secret n'est nécessaire. Seul le service **guteneo-documents** a été publié pour installer ce contrat ; cette publication ne raccorde pas les envois applicatifs.

Validation locale du correctif : `npx vitest run tests/unit/document-postal-preflight.test.ts tests/integration/document-postal-preflight.test.ts` : **27 tests passent**, dont 12 avec Chromium réel. Ils couvrent les octets exacts, toutes les pages, un coin interdit page 2, la fenêtre vide, une image trop grande, une panne page 2, les avertissements de décodage, le dépassement de temps, le faux `Content-Length`, une tentative réseau bloquée, les diagnostics sans contenu et le rendu après suppression des API Map absentes à distance. Typecheck et lint ciblé passent. Les **12 tests** de `tests/security/postal-preflight-qualification.test.mjs` vérifient en plus le filtrage des sorties, le scan exact obligatoire, les refus de redirection, les délais, le nettoyage et le démarrage à froid.

Le helper local `node scripts/qualify-postal-preflight.mjs` ne prend aucun argument ni fichier utilisateur. Sa configuration expose seulement les bindings privés SCANNER et DOCUMENT_RENDERER ; aucune capacité Pingen, D1 ou R2. Il fabrique deux PDF synthétiques fixes, exige un scan qualifié de leurs octets avant rendu, puis vérifie aussi une assertion d'empreinte fausse et un PDF tronqué. Au plus trois contrôles de disponibilité sont espacés de 30 secondes après un 503 de démarrage ; aucun PDF n'est téléversé avant `ready`. Chaque requête a sa limite de 30 secondes ; le processus CLI a une échéance de 600 secondes. La sortie n'inclut ni adresse, ni extrait, ni empreinte, ni diagnostic libre.

Les diagnostics distants ont établi un démarrage ClamAV prêt après 31 secondes et une incompatibilité `open_map_insert` du build PDF.js moderne. Le SDK Containers réarme son délai d'inactivité à chaque requête, même 503 ; aucun réglage de mise en veille ou du scanner de production n'a été modifié.

Le correctif de compatibilité est déployé sur **guteneo-documents**, version **b551ef12-dba0-4845-b664-b2715fe10d3d**, depuis la base **b349c19b23eda30518ae36a9f9e372fb89c0da68** avec les changements renderer non encore commités au moment de cette publication. La qualification synthétique finale du 17 septembre 2026 a renvoyé **`passed:true`, 4 cas sur 4**, avec 2 contrôles de disponibilité, 3 scans propres et 4 appels renderer. Elle a effectué **0 appel Pingen et 0 écriture D1/R2** ; chaque résultat conserve **`canSend:false`**.

| Cas distant | Résultat constaté |
| --- | --- |
| PDF synthétique valide, 2 pages | HTTP 200, `review_required`, rendu complet de deux pages 1190 × 1684 à 144 dpi, empreintes de raster présentes, adresse identique à la fixture, extrait PNG présent, revue humaine encore exigée |
| Contenu dans un coin réservé en page 2 | HTTP 200, `blocked`, rendu complet des deux pages, `POSTAL_CORNER_CONTENT` sur la page 2 |
| Assertion d'empreinte source incorrecte | HTTP 200, `blocked`, `POSTAL_RENDER_HASH_MISMATCH`, aucune page rendue |
| PDF tronqué | HTTP 200, `blocked`, `POSTAL_PDF_INVALID`, empreinte absente et aucune page rendue |

Empreintes SHA-256 des sources et assets exacts utilisés pour cette publication (PDF.js **6.3.289**, même version verrouillée avant/après le correctif) :

| Fichier | SHA-256 |
| --- | --- |
| `apps/documents/prepare-assets.mjs` | `ccb9929a1159002bf3fb793df5321f5e8b07de3a1351ad81eca933e4d55f12c4` |
| `apps/documents/src/pingen-preflight.ts` | `6efa6634bbc37dccf0952245cd39ffe2995a38753846c1a9428b8606f59e6fe6` |
| `apps/documents/src/pingen-browser.ts` | `eed5b93d39f23cebc22ba9e98c11b0c49d94034ec2ed8d30e93bca3f62b56afa` |
| `apps/documents/src/index.ts` | `c63a38f0dc559bc5b77d2ea103f9205a7f61aec565fd9a2c052d9740c7e12c7c` |
| `apps/documents/wrangler.live.jsonc` | `ad5927ab776b13e24adaaa353615f3a81db36d9aeed528d1e85f0ee7bec7a18c` |
| `apps/documents/dist/pdfjs/pdf.txt` | `f401927e692efc7735e0cd528c490d0dd31b7f0972c122b7040df805be45cce4` |
| `apps/documents/dist/pdfjs/pdf.worker.txt` | `a33cfe728c584fdba4fcc1fd54bcdc2f9f2f13889ddbb5b2bd1d0f8cbe49b84e` |

Cette preuve qualifie le service de rendu privé pour ces cas synthétiques. Elle ne prouve ni un dépôt Pingen, ni un tarif, ni un envoi, ni la migration ou le déploiement du raccordement applicatif.

Références primaires consultées : [PDF.js — exemples de rendu](https://mozilla.github.io/pdf.js/examples/), [API PDFPageProxy](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html), [Cloudflare Browser Run et Puppeteer](https://developers.cloudflare.com/browser-run/puppeteer/), [constructions personnalisées Wrangler](https://developers.cloudflare.com/workers/wrangler/custom-builds/). Les options effectives ont été vérifiées dans les types et le code de la version PDF.js installée, plutôt que d'inventer des options retirées.
