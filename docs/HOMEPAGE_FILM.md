# Films de présentation sur l’accueil

La page d’accueil propose le même spot de 56 secondes en deux compositions : paysage 1920 × 1080 pour ordinateur et portrait 1320 × 2868 pour téléphone. Le premier plan utilise le logo officiel simplifié sans cachet ; le grand timbre de conclusion conserve tramage et oblitération. Le Luxembourg bleu apparaît une seule fois par film. Les sources Remotion, polices, médias et provenance sont dans `videos/guteneo-film`.

## Présentation et lecture

Le format est choisi lors du clic pour une fenêtre étroite ou un téléphone tactile tenu en paysage et reste inchangé pendant la session, y compris en cas de rotation. Aucun MP4 n’est attaché au lecteur avant ce clic. Les posters sont responsives et chargés paresseusement. Lecture et demande de plein écran partent du geste utilisateur ; Safari dispose du chemin natif `webkitEnterFullscreen`. Si le navigateur refuse le plein écran, la lecture et les commandes restent utilisables dans la page. Une nouvelle tentative, la fermeture, le replay et une présentation textuelle sont disponibles au clavier.

Aucune vidéo ne démarre automatiquement. Le film est en français avec musique instrumentale, sans parole. Les écrans d’assistants et de l’application iOS représentent la promesse finale choisie explicitement par l’utilisateur, pas une qualification des fonctions actuellement publiées. Les photographies générées et captures conservent leur provenance ; les opérations montrées ne déclenchent aucun envoi réel.

## Médias publics

- `/videos/guteneo-horizontal-v5.mp4` et `/videos/guteneo-horizontal-v5.webp`
- `/videos/guteneo-vertical-v5.mp4` et `/videos/guteneo-vertical-v5.webp`

Les MP4 utilisent H.264/AAC, 30 images/s, 1 680 images, avec `moov` avant `mdat` pour démarrer avant téléchargement complet. Chaque fichier doit rester sous 25 MiB, limite des assets statiques Cloudflare. Les copies web utilisent cet encodage à partir des masters :

```sh
ffmpeg -i MASTER.mp4 -c:v libx264 -preset slow -threads 4 -crf 21 \
  -maxrate 3200k -bufsize 6400k -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart OUTPUT.mp4
```

Les masters de qualité restent dans le dossier `out/` ignoré du projet vidéo. Les posters sont extraits à 2 secondes, puis convertis en WebP à qualité 90. Après un remplacement de MP4, mettre à jour `apps/api/src/public-video-manifest.json` avec la taille et SHA-256 ; les tests de médias vérifient la correspondance exacte.

## Diffusion et validation

L’adaptateur de plages est limité aux deux fichiers publics ci-dessus. Il permet à Safari et aux commandes de recherche de lire une plage `bytes` avec réponse `206`, sans charger tout le fichier en mémoire. Il préserve les règles de sécurité, d’indexation et le bucket privé de documents.

Les tests du lecteur couvrent le chargement au clic, les deux formats, la rotation, les interactions de plein écran et leur refus, les erreurs et la reprise. Les simulations d’API sont distinctes des tests de lecture et de recherche sur les vrais MP4. Les tests du serveur couvrent les plages, suffixes, limites, `If-Range` et la diffusion avec workerd. Aucune vérification sur iPhone physique n’est revendiquée.

La publication suit `docs/MAIN_RELEASE.md` : PR validée, contrôles du commit fusionné, `npm run deploy:live` sur un checkout propre de `main`, puis vérification de tous les assets avec `scripts/verify-release.mjs` sur les deux origines. Qualifier également les octets `206`, MIME, longueur et recherche dans les médias publiés.
