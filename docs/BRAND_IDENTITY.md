# Identité visuelle Guteneo

Règles précisées par l’utilisateur le 17 septembre 2026, puis publication
autorisée explicitement. Cette note décrit la validation locale du candidat ;
la preuve de publication est enregistrée séparément après la livraison.

## Trois usages distincts

| Visuel                                     | Usage                                                                                                                     | Ressources                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Timbre avec « guteneo.com »**            | Footer public et communications externes. Le timbre, son fond papier et l’oblitération décorative restent ceux d’origine. | `apps/web/public/brand/gutenberg-guteneo-stamp.webp` (640 px), `guteneo-stamp.png` (512 px)                     |
| **Portrait tramé sans texte, transparent** | Headers du site, du journal, des articles, de la documentation, de la connexion et de l’atelier.                          | `apps/web/public/brand/guteneo-portrait-128.webp`, `guteneo-portrait-192.webp`, `guteneo-portrait.png` (512 px) |
| **Emblème simple en aplats**               | Favicon, raccourcis, icône MCP et petits emplacements. C’est la première image de la demande initiale.                    | `apps/web/public/brand/guteneo-mark[-128].webp`, `guteneo-mark.png` et famille favicon                          |

Le mot-symbole HTML associé au portrait reste **guteneo**, avec un g minuscule,
dans la typographie EB Garamond existante. Ne pas ajouter « guteneo.com » dans le
dessin du header. Le timbre de communication contient déjà ce texte. Les titres
et le texte courant peuvent conserver « Guteneo ».

Le composant `apps/web/src/brand.tsx` utilise explicitement les variantes
`portrait` et `simple`. Le footer public garde son composant de timbre distinct.
Les portraits mesurent 48 px dans le header desktop, 44 px sur mobile et 40 px
dans l’atelier ; les petits emblèmes mesurent 28 px. Toutes les proportions restent
carrées et les dimensions sont réservées dans le HTML.

## Sources et optimisation

Les JPEG originaux des deux timbres restent dans `assets/brand/source/`. Le
WebP du footer est conservé **octet pour octet** ; SHA-256 :
`6e04f5f1d744942be176843ef0a0cb41ce7e4c710b1d36c22257a33f3679225f`.

Les pièces jointes JPEG et le portrait WebP historique n’avaient pas de canal
alpha. La transparence a donc été extraite avec l’outil **image_gen**, en demandant
de préserver le portrait bleu, sa trame et son contour dentelé et de convertir
le blanc en transparence, sans texte ajouté. Le résultat RGBA brut 1254 × 1254 est
conservé dans `assets/brand/source/guteneo-portrait-transparent.png`, avec sa
provenance et son prompt dans le fichier `.png.json` voisin.

Les exports sont redimensionnés et encodés avec Sharp 0.35.4, **sans aplatir le
fond**. Le header sert des WebP 128 ou 192 px selon la densité de l’écran :
15 068 et 33 534 octets. Le PNG transparent 512 px destiné aux intégrations pèse
179 923 octets. Les images 512 px ne sont pas chargées par les headers.

`docs/brand/assets.json` conserve les empreintes des sources et des exports.
Le favicon SVG autonome embarque le PNG de l’emblème simple ; il ne s’agit pas
d’une vectorisation. Les exports ICO 16/32/48 px, PNG 16/32 px, Apple Touch 180 px
et raccourcis 192/512 px gardent cet emblème.

Les PDF **fictifs de démonstration** emploient désormais le timbre avec texte,
via `apps/web/src/assets/guteneo-stamp-preview.jpg`, embarqué sans appel réseau.
Les PDF importés par les utilisateurs ne sont pas modifiés. Le logo
d’organisation dans les métadonnées publiques utilise aussi le timbre avec
« guteneo.com ». Les illustrations historiques restent des illustrations.

## Preuves de la correction

- Transparence réelle vérifiée dans le PNG maître et les trois exports : les
  WebP 128/192 px contiennent respectivement 1 931 et 7 692 pixels totalement
  transparents ; le PNG 512 px en contient 64 315. Les quatre coins de chaque
  export final ont un alpha nul. Le fond CSS des images est transparent.
- Contrôle sur fond papier et foncé, puis aux tailles réelles dans le site et
  l’atelier ; captures examinées dans `reports/screenshots/brand-correction/`.
- 21 vues contrôlées : les six pages publiques et l’atelier sur desktop, iPhone
  et à 320 px. Bon portrait chargé, transparence vérifiée dans le navigateur,
  mot-symbole en minuscules, bon timbre de footer, aucune déformation ni aucun
  débordement horizontal.
- `npm run typecheck`, `npm run lint`, `git diff --check`,
  `npm run build:preview` et `npm run build:live` réussis.
- 9 tests unitaires de démonstration et 21 tests Node Auth0/pages publiques
  réussis ; 30 tests navigateur réussis, avec 4 cas mobiles volontairement
  ignorés par le projet desktop.
- Rapports de cette correction : `reports/brand-correction-alpha.json`,
  `reports/brand-correction-browser.json`, `reports/brand-correction-unit.json`
  et `reports/brand-correction-playwright.json`. Les preuves du dossier
  `test-results/brand/first-pass/` précèdent cette correction et ne décrivent plus
  l’identité courante.

## Services externes

Les scripts Auth0 préparent le **portrait transparent** pour la connexion et
l’icône d’application, avec le favicon simple distinct. Le serveur MCP annonce
l’emblème simple via le champ `icons` reconnu par le SDK installé ; son affichage
dépend de l’hôte. Aucun champ de manifeste non documenté n’a été ajouté.

Le candidat de soumission du 21 septembre ajoute un dérivé spécifique au
**composer ChatGPT**, `apps/web/public/brand/guteneo-composer.png` : portrait et
denture conservés, cadre intérieur simplifié, extérieur transparent. Le logo
d’annuaire et les icônes du site restent l’emblème original. Le master généré et
son prompt sont conservés dans `assets/brand/source/guteneo-composer-transparent.png`
et son fichier `.json`. Le [contrôle des icônes](../integrations/chatgpt/icon-audit.md)
distingue les contraintes documentées, l’alpha réel, la lecture sur fonds clair
et sombre et l’aperçu final du portail encore à vérifier.

Aucune communication réelle n’est nécessaire à cette livraison. Après fusion et
CI du commit exact, publier depuis `main`, vérifier les URLs des nouveaux assets
sur le domaine canonique, puis appliquer la présentation Auth0 autorisée et la
relire. Les rapports `reports/brand-publication-*.json` conservent les preuves
de cette phase ; la réussite des tests locaux ne les remplace pas.
