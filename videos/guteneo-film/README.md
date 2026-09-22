# guteneo — Vos mots. Dans le monde réel.

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
