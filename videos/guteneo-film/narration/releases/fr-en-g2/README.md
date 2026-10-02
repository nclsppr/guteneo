# Cache de narration FR/EN — Génération 2

Ce snapshot contient **34 MP3 qualifiés**, répartis entre quatre narrations :
11 séquences d’introduction et 6 séquences de rôles pour chaque langue. Les
introductions servent les formats horizontal et vertical : le cache permet de
refaire les six mixages FR/EN à partir des vidéos musicales d’origine.

Les voix ont été générées dans l’interface ElevenLabs avec **George**
(`JBFqnCBsd6RMkjVDRZzb`), **Eleven v4**, Stability 50 %, Similarity 75 %, override
de langue FR/EN et export MP3 128 kbit/s. Les prises retenues portent la
provenance explicite `source: elevenlabs-web`, `webGeneration: 2`.
Ces métadonnées viennent du parcours web ; le MP3 seul ne permet pas de déduire
le modèle, la voix ou le numéro de prise.

`generation.json` conserve les empreintes, chemins relatifs, hashes, durées,
statuts et provenance nécessaires au mixeur. Les noms de téléchargements,
chemins personnels et heures d’import ont été retirés. `scripts.json` fige les
textes et fenêtres des quatre narrations ; `voices.json` fige leur configuration
publique. Aucune clé ni donnée d’abonnement n’est incluse.

`qualification.json` consigne la vérification des 34 empreintes et hashes, le
décodage intégral et la durée retenue — maximum du conteneur et du signal
décodé — face à chaque fenêtre. Il distingue les exports sans calage local
répertorié et les copies ajustées par retrait des silences aux bords et,
lorsque nécessaire, un tempo plafonné à 1,10×. Les hashes des sources de ces
copies et les paramètres appliqués sont conservés sans chemin personnel.
Le mixage utilise directement les MP3 figés ; les téléchargements bruts ne
sont pas requis pour cette étape.

## Refaire les mixages localement

Depuis `videos/guteneo-film`, avec Node.js, FFmpeg et ffprobe disponibles,
copier le snapshot dans un **nouveau dossier ignoré**, puis utiliser ce cache
explicitement. Cette commande ne remplace aucun MP4 public :

```sh
mkdir -p out/narration
NARRATION_REPLAY_DIR=$(mktemp -d "$PWD/out/narration/fr-en-g2-replay-XXXXXX")
cp -R narration/releases/fr-en-g2/. "$NARRATION_REPLAY_DIR/"
cd "$NARRATION_REPLAY_DIR"
node ../../../scripts/mix-narration.mjs --execute \
  --voices ./voices.json --manifest ./scripts.json \
  --catalog ../../../narration/source-videos.json \
  --locales fr,en --out .
```

Le dossier de sortie contient les six candidats dans `videos/` et leur
`mix-proof.json`. Le catalogue source versionné référence les MP4 musicaux V5
des introductions et V1 des rôles, qui doivent rester présents dans
`apps/web/public/videos/`. Le catalogue public des vidéos narrées ne sert pas
de base à ce remix. Une nouvelle version visuelle demande un nouveau snapshot
de sources et un calage correspondant.

Le mixeur contrôle les hashes, empreintes, durées et prises web 2 avant
d’écrire les candidats. Il copie la piste H.264 et restaure la musique seule
pendant les cinq secondes finales. Le réencodage AAC dépend de la version de
FFmpeg ; ce snapshot garantit l’identité des clips conservés, sans promettre
des octets MP4 identiques dans tous les environnements.

## Portée de ce snapshot

Le cache contient les phrases séparées FR/EN. Le pilote français A/B/C,
ses prises longues et son équilibrage de la première phrase à −20 LUFS ne
sont pas inclus. Ce dossier n’atteste ni un choix entre ces trois méthodes,
ni une nouvelle diffusion du lot français.

L’écoute critique et les limites des mots restent à qualifier :
`criticalListening: pending`, `wordBoundariesVerifiedByHuman: false`.
Les contrôles de fichiers et de durée ne prouvent pas l’accent ou la diction.

La reconstruction locale réutilise les voix reçues. Elle n’appelle pas
ElevenLabs et ne consomme aucun crédit. **La régénération API v4 est désactivée**
jusqu’à qualification d’un adaptateur Text to Dialogue distinct ; ce snapshot
ne promet pas une régénération fournisseur gratuite ou identique.
