# guteneo — Vos mots. Dans le monde réel.

Les films V5 existent en français, anglais, allemand et luxembourgeois, en
horizontal et au format iPhone. Une présentation commune des quatre rôles dure
36 secondes dans chaque langue et réutilise leur conclusion officielle.
Depuis la racine : `npm run videos:render` régénère masters, MP4 web, posters et
manifeste. FFmpeg, ffprobe et cwebp sont requis. Les sources React, les polices,
les médias locaux et le verrouillage npm sont conservés ; aucun service distant
n’est nécessaire. Voir `docs/HOMEPAGE_FILM.md` et `docs/ROLES_FILM.md` à la racine.

La narration **Eleven v4** est en cours pour les douze vidéos actuelles en
FR/EN/DE/LB, avec une voix masculine calme et chaleureuse : **George**,
`JBFqnCBsd6RMkjVDRZzb`, identifiant copié depuis l’interface ElevenLabs.
Le compte Creator a été confirmé actif dans Safari ; les réglages utilisés sont
Stability 50 %, Similarity 75 %, override de langue explicite et export MP3
128 kbit/s. Le plugin ElevenLabs est installé et activé, mais aucun de ses outils
MCP n’est invocable dans cette session : les générations réelles passent par
Safari, puis `scripts/import-narration.mjs` importe chaque export dans le cache
commun au plan hors ligne et au mixeur.
La génération API v4 est désactivée avant réseau ou écriture : l’ancien endpoint
TTS doit être remplacé par un adaptateur Text to Dialogue qualifié. Les imports
web et leurs empreintes restent inchangés ; une clé ou un budget ne débloquent
pas `narration:generate`.
L’utilisateur a retenu **Génération 2**. Les secondes prises françaises déjà
disponibles ont été récupérées dans l’historique, sans refaire ces générations.
Chaque export
retenu s’importe avec `--web-generation 2` ; le reçu note la variante sans
modifier l’empreinte du cache. Les mixages provisoires des premières prises
sont obsolètes et exclus du lot retenu.
Avec `webGeneration: 2` dans la configuration, le mixeur bloque les exports web
de prise 1 ou sans numéro avant d’écrire les candidats ; les reçus API gardent
leur provenance séparée.
Le mixeur lit par défaut `narration/source-videos.json`, snapshot des MP4
musicaux d’origine conservés après publication des versions narrées. Une nouvelle
version visuelle exige la mise à jour de ce snapshot et du calage ; `--catalog`
permet de choisir explicitement un autre catalogue de sources musicales.

Depuis la racine, `npm run videos:narration` et `npm run videos:narration:mix`
présentent le lot courant hors ligne ; le nombre de séquences et de caractères
se calcule depuis `narration/scripts.json`. `npm run test:videos:narration`
vérifie le verrou API, le plan hors ligne, l’import, le calage et le mixage
avec des fixtures locales.
Les 34 prises FR/EN sont importées, calées et mixées en six candidats locaux
contrôlés techniquement. Les exports DE sont disponibles ; LB reste à générer.
Trois versions françaises du film des rôles comparent phrases séparées, prise
complète et trois blocs ; la méthode pour la suite reste au choix de l’utilisateur.
Aucune nouvelle diffusion du lot narré n’est attestée par cette note.
L’entrée audio est indisponible au modèle pour
l’écoute critique, donc `criticalListening: pending` reste requis.
Voir [la procédure de narration](../../docs/VIDEO_NARRATION.md) pour la
configuration locale, l’import sans API et le mixage des candidats.

Les alias racine `videos:narration:import` et `videos:narration:fit` correspondent
à `narration:import` et `narration:fit` dans ce dossier. Le fitter réel est
`../../scripts/fit-web-narration.mjs` : analyse seule par défaut, copie séparée
avec `--execute`, preuve `.fit.json`, retrait des bords et tempo plafonné à 1,10×.
Il ne remplace ni l’original ni le cache ; importer ensuite explicitement la
copie retenue avec `--web-generation 2 --replace`. La détection d’amplitude ne
garantit pas les limites des mots ; l’écoute reste `pending`.

Film de marque français de **46 secondes**, **1920 × 1080**, **30 images/s**, H.264 avec son AAC stéréo. Projet Remotion indépendant de l'application métier.

Le fichier de diffusion est `out/guteneo-film-1080p.mp4`. Le dossier `out/` et `node_modules/` ne sont pas suivis par Git. Les sources, médias, polices locales et fichiers de verrouillage permettent de refaire le rendu.

Un **second spot vertical de 56 secondes**, pensé pour iPhone/TikTok et la promesse du produit abouti, est également livré : `out/guteneo-vertical-vision-1080x1920.mp4`. Voir [son découpage et ses sources](docs/VERTICAL_FILM.md). Le premier film reste intact. Les exports natifs de la révision 4 sont `out/guteneo-v4-iphone-18-pro.mp4` (1206 × 2622) et `out/guteneo-v4-iphone-18-pro-max.mp4` (1320 × 2868), avec un seul plan Luxembourg. La révision 4 utilise le logo officiel simplifié pour les très petites icônes ; le grand timbre final reste tramé et oblitéré. Les versions précédentes sont conservées.

## Spots de présentation actuels — V5

La campagne de 56 secondes existe désormais en **1920 × 1080 horizontal** (`Guteneo-Horizontal-Vision`) et au **ratio iPhone** (`Guteneo-iPhone-18-Pro-Max`, 1320 × 2868). Le paysage est recomposé scène par scène, avec la même partition. La première scène utilise le logo simplifié sans oblitération, dans les deux formats. Le grand timbre final reste tramé et oblitéré.

Masters : `out/guteneo-v5-horizontal-1080p.mp4` et `out/guteneo-v5-vertical-iphone.mp4`. Les exports web H.264/AAC optimisés et leurs posters sont livrés dans `apps/web/public/videos/`, à la racine du dépôt. Voir `docs/HOMEPAGE_FILM.md` à la racine pour la diffusion et les validations. Les films précédents sont conservés.

```sh
npm run render:horizontal
npm run render:iphone:pro-max
```

## Revoir et modifier

```sh
cd videos/guteneo-film
npm ci
npm run dev
```

Ouvrir la composition **Guteneo-Film** dans Remotion Studio. Les scènes sont séparées dans `src/scenes/`. Les textes, mouvements, cadrages et durées sont éditables en React. Toutes les animations sont pilotées par les frames ; aucune animation CSS dépendant du temps réel.

```sh
npm run lint
npm run render
```

`npm run render:review` produit une version de contrôle en 960 × 540. La composition complète dure exactement 1 380 frames, transitions comprises.

## Découpage

| Temps | Scène |
| --- | --- |
| 0–5 s | « Vos mots. Dans le monde réel. » — document, timbre et identité Guteneo |
| 5–13 s | Conversation ChatGPT reconstituée, PDF, préparation et icône Guteneo |
| 13–20 s | Vraies captures de l'atelier puis de la relecture d'un courrier fictif |
| 20–25 s | Papier imprimé — photographie générée animée par un mouvement de caméra |
| 25–31 s | Remise d'une enveloppe — photographie générée animée |
| 31–36 s | Fax — photographie générée animée |
| 36–40 s | « Vous avez les mots. Donnez-leur une portée. » |
| 40–41 s | Clap visuel, fermeture et impact à 40,500 s |
| 41–46 s | Uniquement le timbre officiel et **guteneo.com** en dessous |

## Marque et médias

- Timbre et icône : copies des assets officiels `apps/web/public/brand/guteneo-mark.png` et `guteneo-portrait.png`. L'URL est composée séparément en fin de film.
- Palette : papier `#f6f5ef`, encre `#181b22`, bleu `#2450db`.
- Polices : EB Garamond, IBM Plex Sans et IBM Plex Mono, livrées localement avec leurs licences.
- Images : trois créations via l'outil de génération d'images intégré. Prompts et provenance dans `public/images/PROVENANCE.md`.
- Frontend : captures sans données client, sans retouche de DOM. Le mode de démonstration natif est conservé. Sources, version et script de recapture : `public/frontend/provenance.md`.
- ChatGPT : **reconstitution publicitaire**, étiquetée « Démonstration ». Ce n'est pas l'enregistrement d'une conversation réelle ou la preuve d'un widget publié. Elle représente la préparation et le passage à la revue dans Guteneo.
- Son : composition instrumentale et bruitages synthétisés localement, sans extraits musicaux tiers. Le clap fait déjà partie du master. Partition, script, niveaux et provenance : `public/audio/README.md`.

## Périmètre des affirmations

Les scènes physiques sont étiquetées « Mise en scène » et illustrent les usages. Elles ne documentent pas une livraison réelle. Les données, prix et adresses de l'atelier sont fictifs. Le film n'annonce ni disponibilité dans le Store ChatGPT, ni réception postale garantie, ni parcours intégralement dans ChatGPT.

La création de ce film ne déclenche aucun envoi, approbation métier, déploiement ou publication externe. Le projet n'a aucun binding métier et ne charge ni secret ni compte client pour le rendu. Aucun asset distant n'est nécessaire après installation des dépendances et du navigateur de rendu.

## Vérification

Lint/TypeScript du projet vidéo, lint du dépôt, rendu de contrôle complet, inspection des neuf plans et du cadrage de validation, contrôle de la durée/pistes/codec du master et décodage intégral du MP4. Les mesures audio sont automatiques ; aucune écoute humaine n'est revendiquée.
