# Films de présentation sur l’accueil

La page d’accueil propose le même spot de 56 secondes en deux compositions : paysage 1920 × 1080 pour ordinateur et portrait 1320 × 2868 pour téléphone. Le premier plan utilise le logo officiel simplifié sans cachet ; le grand timbre de conclusion conserve tramage et oblitération. Le Luxembourg bleu apparaît une seule fois par film. Les sources Remotion, polices, médias et provenance sont dans `videos/guteneo-film`.

## Présentation et lecture

Le format est choisi lors du clic pour une fenêtre étroite ou un téléphone tactile tenu en paysage et reste inchangé pendant la session, y compris en cas de rotation. Aucun MP4 n’est attaché au lecteur avant ce clic. Les posters sont responsives et chargés paresseusement. Lecture et demande de plein écran partent du geste utilisateur ; Safari dispose du chemin natif `webkitEnterFullscreen`. Si le navigateur refuse le plein écran, la lecture et les commandes restent utilisables dans la page. Une nouvelle tentative, la fermeture, le replay et une présentation textuelle sont disponibles au clavier.

Aucune vidéo ne démarre automatiquement. Les textes du film existent en français, anglais, allemand et luxembourgeois. Les versions française et anglaise ajoutent une narration masculine ElevenLabs à la musique instrumentale ; l’allemand et le luxembourgeois conservent leur musique seule. Voir [VIDEO_NARRATION_PUBLISHED.md](VIDEO_NARRATION_PUBLISHED.md). Les écrans d’assistants et de l’application iOS représentent la promesse finale choisie explicitement par l’utilisateur, pas une qualification des fonctions actuellement publiées. Les photographies générées et captures conservent leur provenance ; les opérations montrées ne déclenchent aucun envoi réel.

## Langue et régénération

Le film et son poster suivent la langue résolue de l’interface, y compris la
préférence personnelle enregistrée dans le compte. Les quatre langues ont un
fichier distinct pour chaque format. Changer de langue arrête et décharge la
vidéo précédente ; la nouvelle version attend un nouveau clic. Une rotation
ne remplace toujours pas le format déjà choisi.

Cette règle est inscrite dans `AGENTS.md`. Le catalogue commun
`packages/contracts/src/public-videos.json` sert au lecteur, aux tests et à la
liste exacte des vidéos publiques autorisées par le serveur. Une langue ajoutée
au produit doit recevoir ses films et posters avant publication.

Les compositions Remotion localisées conservent les durées, cadrages, animations,
médias et partition V5. Les scènes de l’interface sont traduites ; le texte
français de l’oblitération appartient au logo et reste identique. Les fichiers
français V5 déjà validés sont conservés octet pour octet dans ce candidat.

```sh
npm --prefix videos/guteneo-film ci
npm run videos:render
```

Une sélection peut être régénérée avec
`npm run videos:render -- --locales de,lb --kind introduction`, ou avec
`--kind roles`. FFmpeg, ffprobe et cwebp doivent être disponibles. L’option
`--skip-existing` ne réutilise un MP4 que si son hash correspond au manifeste
précédent et que son poster existe. Les masters et la preuve source/export
restent dans `videos/guteneo-film/out/localized/`, ignoré par Git. Les MP4
optimisés et les posters sont écrits dans `apps/web/public/videos/` ; les tailles
et SHA-256 du manifeste serveur sont mis à jour après chaque export vérifié.
Aucun service distant ni génération d’image n’intervient dans ce rendu.

## Médias publics

| Langue | Présentation horizontale | Présentation iPhone | Les quatre rôles |
| --- | --- | --- | --- |
| Français | [MP4](../apps/web/public/videos/guteneo-horizontal-v6-fr.mp4) | [MP4](../apps/web/public/videos/guteneo-vertical-v6-fr.mp4) | [MP4](../apps/web/public/videos/guteneo-roles-v2-fr.mp4) |
| English | [MP4](../apps/web/public/videos/guteneo-horizontal-v6-en.mp4) | [MP4](../apps/web/public/videos/guteneo-vertical-v6-en.mp4) | [MP4](../apps/web/public/videos/guteneo-roles-v2-en.mp4) |
| Deutsch | [MP4](../apps/web/public/videos/guteneo-horizontal-v5-de.mp4) | [MP4](../apps/web/public/videos/guteneo-vertical-v5-de.mp4) | [MP4](../apps/web/public/videos/guteneo-roles-v1-de.mp4) |
| Lëtzebuergesch | [MP4](../apps/web/public/videos/guteneo-horizontal-v5-lb.mp4) | [MP4](../apps/web/public/videos/guteneo-vertical-v5-lb.mp4) | [MP4](../apps/web/public/videos/guteneo-roles-v1-lb.mp4) |

- Les films narrés FR/EN sont `/videos/guteneo-horizontal-v6-{fr,en}.mp4`
  et `/videos/guteneo-vertical-v6-{fr,en}.mp4` ; leurs posters restent en V5.
- Les films DE/LB conservent les MP4 V5 et leurs posters.
- `/videos/guteneo-roles-v1-{de,lb}.mp4`, `/videos/guteneo-roles-v2-{fr,en}.mp4`
  et les posters V1 `.webp`, présentés
  dans le guide `/roles/` ; voir `docs/ROLES_FILM.md`.

Les MP4 utilisent H.264/AAC, 30 images/s, avec `moov` avant `mdat` pour démarrer avant téléchargement complet. Les présentations comptent 1 680 images (56 secondes), les films de rôles 1 080 images (36 secondes). Chaque fichier doit rester sous 25 MiB, limite des assets statiques Cloudflare. Les copies web utilisent cet encodage à partir des masters :

```sh
ffmpeg -i MASTER.mp4 -c:v libx264 -preset slow -threads 4 -crf 21 \
  -maxrate 3200k -bufsize 6400k -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart OUTPUT.mp4
```

Les masters de qualité restent dans le dossier `out/` ignoré du projet vidéo. Les posters sont extraits à 2 secondes pour les présentations et à 5 secondes pour les rôles, puis convertis en WebP à qualité 90. Après un remplacement de MP4, mettre à jour `apps/api/src/public-video-manifest.json` avec la taille et SHA-256 ; les tests de médias vérifient la correspondance exacte.

## Diffusion et validation

L’adaptateur de plages est limité aux douze MP4 du catalogue commun. Il permet à Safari et aux commandes de recherche de lire une plage `bytes` avec réponse `206`, sans charger tout le fichier en mémoire. Il préserve les règles de sécurité, d’indexation et le bucket privé de documents.

Les tests du lecteur couvrent le chargement au clic, les deux formats, la rotation, les interactions de plein écran et leur refus, les erreurs et la reprise. Les simulations d’API sont distinctes des tests de lecture et de recherche sur les vrais MP4. Les tests du serveur couvrent les plages, suffixes, limites, `If-Range` et la diffusion avec workerd. Aucune vérification sur iPhone physique n’est revendiquée.

Le candidat multilingue du 2 octobre 2026 a passé :

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
