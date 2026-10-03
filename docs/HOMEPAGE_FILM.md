# Films de présentation sur l’accueil

L’accueil propose une introduction en paysage **1920 × 1080** pour ordinateur
et portrait **1320 × 2868** pour téléphone. Les quatre langues ont une narration
naturelle **Manon Eleven v4** selon la méthode C : trois blocs de phrases
complètes, amélioration native ElevenLabs, seconde variation du plugin. Les
scènes suivent le débit réel de la langue, sans accélération. Le premier plan
utilise le logo officiel simplifié ; le grand timbre de conclusion conserve
tramage et oblitération pendant cinq secondes. Le plan Signature reste sans voix
pendant deux secondes. La musique garde un gain constant **0,22**, pauses et logo
compris, avec la cadence et le fondu final de la partition.

## Présentation et lecture

Le format est choisi au clic pour une fenêtre étroite ou un téléphone tactile
tenu en paysage, puis reste inchangé pendant la session, y compris après
rotation. Aucun MP4 n’est attaché avant ce clic. Les posters sont responsives et
chargés paresseusement. Lecture et plein écran partent du geste utilisateur ;
Safari dispose de `webkitEnterFullscreen`. En cas de refus du plein écran, la
lecture reste utilisable dans la page. Reprise, fermeture et replay sont
accessibles au clavier. Aucune vidéo ne démarre automatiquement.

Le film, son poster et ses sous-titres suivent la langue résolue, y compris la
préférence personnelle du compte. Un changement de langue arrête et décharge le
film précédent ; le nouveau attend un clic. Cette règle figure dans `AGENTS.md`.
Le catalogue commun `packages/contracts/src/public-videos.json` sert au lecteur,
aux tests et à la liste exacte des vidéos publiques du serveur. La durée affichée
est arrondie depuis `durationSeconds`, dérivée de la timeline réelle.

Les écrans d’assistants et iOS illustrent la promesse finale choisie par
l’utilisateur ; ils ne qualifient pas les fonctions actuellement publiées. Les
photographies et captures conservent leur provenance. Aucune opération montrée
ne déclenche un envoi métier.

## Langue et régénération

Les compositions naturelles utilisent les mêmes scènes, polices, médias et
animations que V5, avec une timeline propre à chaque narration. Le texte français
de l’oblitération appartient au logo et reste identique. Les introductions sont
en **V8** ; les rôles en **V4 EN/DE/LB** et **V3 FR** approuvée. Les huit snapshots
locaux qualifiés permettent le rendu hors ligne, sans clé ni appel ElevenLabs.
Les bases instrumentales historiques V5/V1 restent conservées.

```sh
npm --prefix videos/guteneo-film ci
npm run videos:render
```

Une sélection est possible avec `--locales de,lb --kind introduction` ou
`--kind roles`. FFmpeg, ffprobe et cwebp sont nécessaires. `--skip-existing`
exige un MP4 conforme au hash du manifeste, son poster et les sous-titres exacts.
Le renderer qualifie bibliothèques, sources et calages avant toute écriture.
Les masters et preuves restent dans `videos/guteneo-film/out/`, ignoré par Git.
Les exports publics H.264/AAC stéréo sont à 30 images/s, avec démarrage rapide et
moins de 25 MiB par fichier. Les posters proviennent des nouvelles scènes.

Voir [la procédure de narration](VIDEO_NARRATION.md) et
[les durées et empreintes des douze actifs](VIDEO_NARRATION_PUBLISHED.md).

## Médias publics

| Langue | Présentation horizontale | Présentation iPhone | Les quatre rôles |
| --- | --- | --- | --- |
| Français | [MP4](../apps/web/public/videos/guteneo-horizontal-v8-fr.mp4) | [MP4](../apps/web/public/videos/guteneo-vertical-v8-fr.mp4) | [MP4](../apps/web/public/videos/guteneo-roles-v3-fr.mp4) |
| English | [MP4](../apps/web/public/videos/guteneo-horizontal-v8-en.mp4) | [MP4](../apps/web/public/videos/guteneo-vertical-v8-en.mp4) | [MP4](../apps/web/public/videos/guteneo-roles-v4-en.mp4) |
| Deutsch | [MP4](../apps/web/public/videos/guteneo-horizontal-v8-de.mp4) | [MP4](../apps/web/public/videos/guteneo-vertical-v8-de.mp4) | [MP4](../apps/web/public/videos/guteneo-roles-v4-de.mp4) |
| Lëtzebuergesch | [MP4](../apps/web/public/videos/guteneo-horizontal-v8-lb.mp4) | [MP4](../apps/web/public/videos/guteneo-vertical-v8-lb.mp4) | [MP4](../apps/web/public/videos/guteneo-roles-v4-lb.mp4) |

## Diffusion et validation

L’adaptateur de plages est limité aux douze MP4 du catalogue commun. Il permet à Safari et aux commandes de recherche de lire une plage `bytes` avec réponse `206`, sans charger tout le fichier en mémoire. Il préserve les règles de sécurité, d’indexation et le bucket privé de documents.

Les tests du lecteur couvrent le chargement au clic, les deux formats, la rotation, les interactions de plein écran et leur refus, les erreurs et la reprise. Les simulations d’API sont distinctes des tests de lecture et de recherche sur les vrais MP4. Les tests du serveur couvrent les plages, suffixes, limites, `If-Range` et la diffusion avec workerd. Aucune vérification sur iPhone physique n’est revendiquée.

Le candidat instrumental historique du 2 octobre 2026 a passé :

- TypeScript, lint applicatif et Remotion, build applicatif avec Worker en
  `--dry-run`, et build du modèle de preview.
- 93 tests ciblés de langue, plages et permissions/migration des rôles, ainsi que
  les 215 tests de sécurité.
- 57 tests du lecteur sur Chromium ordinateur et WebKit au format iPhone ; un
  cas propre au téléphone est ignoré sur ordinateur. Les huit combinaisons
  langue/film sont réellement décodées et cherchent leur carte finale dans
  chaque navigateur, sans simulation des API vidéo.
- Trois tests de préférence personnelle sur Chromium ordinateur, Chromium
  mobile et WebKit iPhone. La session y est simulée : ils vérifient le choix du
  média, pas une connexion Auth0 réelle.
- Décodage FFmpeg complet des douze MP4, tailles/SHA-256, démarrage rapide,
  30 images/s et H.264/AAC stéréo. Le plus gros fichier fait 11,77 MiB.
- Conservation exacte des deux MP4 français V5. Les sources françaises ont aussi
  été comparées au V5 sur 24 images échantillonnées : toutes identiques ; les six
  cartes finales traduites échantillonnées sont identiques au français.

Les masters, captures, rapports navigateur et preuves de rendu/décodage sont
conservés dans `videos/guteneo-film/out/localized/`. Ces contrôles de préparation
sont locaux et précèdent la publication ; ils n’ont déclenché aucun déploiement,
migration distante ou activation de fournisseur. L’écoute critique complète et la qualification sur téléphone physique
ne sont pas revendiquées.

La publication suit `docs/MAIN_RELEASE.md` : PR validée, contrôles du commit fusionné, `npm run deploy:live` sur un checkout propre de `main`, puis vérification de tous les assets avec `scripts/verify-release.mjs` sur les deux origines. Qualifier également les octets `206`, MIME, longueur et recherche dans les médias publiés.
