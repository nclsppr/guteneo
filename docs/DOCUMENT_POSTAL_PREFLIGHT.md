# Service privé de contrôle postal

État au 17 septembre 2026 : implémentation locale testée avec Chromium et PDF.js, sans transfert Pingen, sans déploiement du nouveau service et sans raccordement aux routes applicatives. Les règles de mise en page restent celles de [PINGEN_PREFLIGHT.md](PINGEN_PREFLIGHT.md).

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

## Isolation et limites

- Corps lu en flux et plafonné à **8 000 000 octets**, même si `Content-Length` manque ou ment ; options limitées à512 caractères ; limite existante de100 pages.
- Contrôle structurel avant lancement de Chromium : A4, aucune rotation/coupe inattendue, polices incorporées, pas de fonction active/formulaire/annotation. La couche privée refuse aussi les calques optionnels et les images déclarées dépassant10 millions de pixels chacune ou20 millions au total. Ces limites sont une politique de ressources Guteneo.
- Une instance de navigateur par demande, aucune réutilisation de session. Shell HTTPS synthétique servi exclusivement par interception locale pour permettre WebCrypto ; tout autre accès réseau est avorté. Mode hors ligne, service workers contournés, CSP sans connexion ni worker externe ; aucune bibliothèque chargée depuis un CDN.
- PDF.js et son module de parsing proviennent de la dépendance verrouillée et sont empaquetés dans le Worker. Le PDF reste une donnée ; aucune action JavaScript du PDF n'est exécutée. La CSP n'autorise pas `unsafe-eval`. Le parsing PDF.js se déroule dans la page isolée ; aucun téléchargement de police, CMap ou module WASM n'est permis.
- Rendu **séquentiel de chaque page à144dpi**, fond blanc opaque, au maximum2,1 millions de pixels par canvas. Un seul raster transite à la fois ; son décodage côté Worker évite les tableaux intermédiaires de millions de valeurs JS. Le canvas est libéré après chaque page. Les grandes images, décodages incomplets et avertissements PDF.js bloquent le résultat.
- Budget de **25 secondes** pour la demande entière, plus au maximum2 secondes d'attente de fermeture. L'expiration ferme le navigateur ; un lancement terminé tardivement est également fermé. Une requête ou un rendu interrompu n'est jamais marqué complet. Les limites du processus Browser Run restent une protection supplémentaire ; ces bornes ne prétendent pas prouver une consommation maximale de mémoire pour tout PDF hostile.
- Texte page1 plafonné à20 000 éléments /128 000 caractères avant extraction, fenêtre limitée à200 éléments /1000 caractères par élément, extrait PNG limité à1 million de caractères base64.

Le rapport est toujours `canSend:false`. Un résultat sans anomalie est `review_required`, jamais `ready` ni une autorisation. La présence d'encre et le texte extrait ne prouvent pas que le destinataire visible correspond au destinataire approuvé : texte invisible, glyphes vectorisés, images et superpositions exigent encore la comparaison visuelle. Un PDF dont l'adresse n'est pas extractible est bloqué dans ce profil conservateur, même si Pingen pourrait l'accepter.

## Raccordement restant

Avant l'appel : autorisation actuelle, organisation, document prêt non purgé, audit canonique de scan qualifié de la même empreinte, lecture R2 et vérification exacte des octets, budget de rendu atomique et profil Pingen qualifié. Le nouveau Worker n'implémente aucun de ces contrôles métier à la place de l'API.

Après l'appel : revérifier les droits et l'identité du document, exiger l'intégralité des pages, comparer le destinataire normalisé au texte et à l'image, revoir l'expéditeur/les retours, puis lier la preuve au brouillon et au devis immuables. La preuve ne doit pas être fabriquée par le navigateur ou le LLM. La revue humaine, le brouillon fournisseur et le devis exact restent séparés ; aucun envoi ni dépôt Pingen n'est ajouté ici.

## Construction et preuve

Depuis la racine du dépôt, `npx wrangler deploy --config apps/documents/wrangler.live.jsonc --dry-run --outdir dist/worker` construit le candidat. La commande personnalisée copie les deux scripts PDF.js depuis `node_modules` vers `apps/documents/dist/pdfjs`, ignoré par Git. Aucun nouveau package ou secret n'est nécessaire. Seul le service **guteneo-documents** doit être publié pour installer ce contrat ; cette publication ne raccorde pas les envois applicatifs. Le déploiement et sa qualification distante restent à effectuer sous l'autorité de la release.

Validation locale : `npx vitest run tests/unit/document-postal-preflight.test.ts tests/integration/document-postal-preflight.test.ts tests/unit/pingen-preflight.test.ts --reporter=default` : **31 tests passent**, dont15 nouveaux. Chromium local prouve le rendu et le blocage réseau du candidat ; il ne constitue pas une qualification distante de Browser Run. Les tests couvrent les octets exacts, toutes les pages, un coin interdit page2, la fenêtre vide, une image trop grande, une panne page2, les avertissements de décodage, le dépassement de temps, le faux `Content-Length` et une tentative réseau bloquée. Typecheck, lint ciblé et construction Wrangler locale passent.

Références primaires consultées : [PDF.js — exemples de rendu](https://mozilla.github.io/pdf.js/examples/), [API PDFPageProxy](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html), [Cloudflare Browser Run et Puppeteer](https://developers.cloudflare.com/browser-run/puppeteer/), [constructions personnalisées Wrangler](https://developers.cloudflare.com/workers/wrangler/custom-builds/). Les options effectives ont été vérifiées dans les types et le code de la version PDF.js installée, plutôt que d'inventer des options retirées.
