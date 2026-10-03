# Reprise technique — Gutenberg / Guteneo

État de référence au 3 octobre 2026. Cette note accompagne la copie de travail placée dans `videos/guteneo-gutenberg/archive/`. Dans les chemins ci-dessous, `archive/` désigne cette copie de l'ancien `/workspace/guteneo/`.

**La production payante est suspendue pour revue du budget. L'autorisation actuelle porte sur l'archivage dans Git, y compris la branche `main` ; elle ne relance aucune génération.** Les fichiers locaux permettent de poursuivre l'examen, la préparation des nouveaux prompts et le montage sans crédits. Aucun film complet de 74 secondes n'est actuellement terminé.

## Ce qui fait foi

1. Les dernières demandes utilisateur et le scénario révisé à sept environnements différents, documentés dans ce dossier, remplacent l'ancienne direction des décors.
2. Le personnage reste celui de `archive/production/images/Pixar-proposition-2.png`, approuvé par l'utilisateur. Sa référence ne doit plus imposer son décor de bureau aux autres scènes.
3. Les huit fichiers `archive/production/audio/01-voix.mp3` à `08-voix.mp3` sont les vocaux validés et doivent être conservés, mots et rythme compris.
4. L'aperçu courant est `archive/production/deliverables/Guteneo-apercu-court-sans-plan-ordinateur-34s.mp4`. Il exclut le plan d'ordinateur rejeté.
5. Les JSON historiques documentent la provenance et les tentatives. Des champs comme `next_action`, `remaining_credit_estimate` ou `status` peuvent refléter un état antérieur. Ils ne constituent pas une autorisation de dépense ni un scénario à exécuter automatiquement.

En particulier, `archive/production/deliverables/production-status.json` décrit encore les extraits de 43 et 17 secondes antérieurs au dernier aperçu et à la révision des scènes. Les documents de reprise et `final-production.json` contiennent les corrections ultérieures.

## Arborescence et sources

| Chemin sous `archive/` | Utilité |
| --- | --- |
| `production/images/Pixar-proposition-2.png` | Référence approuvée du personnage, 2048 × 1152 |
| `production/images/` | Références, variantes, planches de sélection et générations historiques |
| `production/images/final/` | Images sélectionnées pour l'ancienne direction des plans |
| `production/audio/` | Voix approuvées, pistes de référence allongées au silence, manifestes et contrôles |
| `production/video/final/` | Six sorties Seedance et six versions Sync, dont deux sorties rejetées |
| `production/sfx/` | Bruitages ElevenLabs sélectionnés et manifeste |
| `production/product/` | Vraies captures du site et leur provenance |
| `production/finishing/` | Conformations vidéo, mixages WAV, fins officielles et contrôles ; caches omis |
| `production/deliverables/` | Aperçus exportés, rapports QA, audit des crédits, ancien kit ZIP |
| `brand-reference/` | Vidéos et images officielles de Guteneo utilisées comme sources |
| `production/final-production.json` | Script final, références de voix, nœuds et générations, rejets, pause et aperçu courant |
| `production/state.json` | Historique plus large des opérations et changements de direction |
| `production/assembly-manifest.json` | Chemins relatifs des 14 clips attendus, voix et insert produit |
| `project.json`, `creative-direction-v2.json` | Anciens états utiles à l'audit, pas l'état créatif courant |

Les chemins absolus `/workspace/guteneo/...` figurant dans les anciens rapports désignent désormais leurs équivalents sous `archive/`. Les scripts de montage calculent leur base avec `Path(__file__).resolve().parent` ; ils fonctionnent après déplacement si l'arborescence est conservée. Les fichiers de concaténation et caches historiques ne sont pas des références portables à réutiliser à la main : les scripts les réécrivent.

## État des plans vidéo

Les durées prévues sont `[10, 11, 10, 8, 9, 9, 10]` secondes, puis une fin officielle de 7 secondes : **74 secondes** au total. `H` = paysage 1920 × 1080, `V` = portrait 1080 × 1920.

| Plan | Sujet | Durée | Paysage | Portrait |
| --- | --- | ---: | --- | --- |
| 1 | Pierre | 10 s | Manquant | Manquant |
| 2 | Papyrus / Égypte | 11 s | Manquant | Manquant |
| 3 | Imprimerie | 10 s | Manquant | Manquant |
| 4 | Fax | 8 s | Manquant | Existant, ancienne direction |
| 5 | Emails | 9 s | **Rejeté** | **Rejeté** |
| 6 | Sites internet | 9 s | Manquant | Existant, ancienne direction |
| 7 | Guteneo | 10 s | Existant, ancienne direction | Existant, ancienne direction |

Six générations vidéo ont abouti et ont reçu une passe Sync. H05 et V05 affichent l'interface sur la face arrière du moniteur : défaut physique confirmé, à ne pas recycler. H07, V04, V06 et V07 existent et servent de matière d'examen ; leur présence ne valide pas les décors pour la nouvelle proposition. Le reproche ultérieur de l'utilisateur porte notamment sur la ressemblance excessive des plans 4, 5 et 6.

Les huit plans absents ont été bloqués par le quota. Les nœuds existent dans ElevenLabs, mais contiennent les anciens prompts. **Ne pas les lancer en lot pour « finir ce qui manque »** : les décors viennent d'être repensés et le budget doit être recalculé.

### Sorties à identifier sans ambiguïté

| Fichier dans `production/deliverables/` | Contenu et statut |
| --- | --- |
| `Guteneo-apercu-court-sans-plan-ordinateur-34s.mp4` | Aperçu courant : V04 + V06 + V07 + fin officielle, 34 s, aucune nouvelle génération |
| `Extrait-Pixar2-Instagram-43s.mp4` | Ancien aperçu V04 + V05 + V06 + V07 + fin : **contient V05 rejeté** |
| `Extrait-Pixar2-Horizontal-17s.mp4` | Ancien aperçu H07 + fin ; un seul plan narratif |
| `Test-Egypte-voix-originale-v4-1080p.mp4` | Ancien pilote réaliste, style abandonné et synchronisation labiale imparfaite |
| `Guteneo-Pixar2-kit-production.zip` | Ancien kit ; direction antérieure aux sept nouveaux environnements, ce n'est pas la reprise complète actuelle |

`archive/Guteneo-film-final.mp4` et `archive/Guteneo-La-suite-de-vos-mots.mp4` sont des productions plus anciennes. Le nom « final » n'indique pas une validation actuelle. Ne pas les livrer comme les deux films demandés aujourd'hui.

## Vocaux verrouillés et minutage

Modèle utilisé : `eleven_v4`, langue `fr`. Gutenberg : **François-Louis**, `UBXZKOKbt62aLQHhc1Jm`. Signature : **Manon**, `m5U7XCsc8v988k2RJAqN`. Les instructions de diction utilisées incluaient `[warmly] [slowly]`. Elles ne justifient aucune nouvelle synthèse : les fichiers approuvés sont déjà présents.

Les durées nominales ElevenLabs et celles des conteneurs MP3 mesurées par `ffprobe` ne sont pas identiques au dernier centième. Conserver les fichiers et leurs silences ; ne pas chercher à corriger cet écart par accélération ou découpe.

| Plan | Position dans le film complet | Durée plan | Audio nominal | MP3 mesuré | Fichier |
| --- | --- | ---: | ---: | ---: | --- |
| 1 | 0–10 s | 10 s | 9,20 s | 9,247347 s | `audio/01-voix.mp3` |
| 2 | 10–21 s | 11 s | 9,68 s | 9,717551 s | `audio/02-voix.mp3` |
| 3 | 21–31 s | 10 s | 9,04 s | 9,090612 s | `audio/03-voix.mp3` |
| 4 | 31–39 s | 8 s | 7,12 s | 7,157551 s | `audio/04-voix.mp3` |
| 5 | 39–48 s | 9 s | 7,28 s | 7,314286 s | `audio/05-voix.mp3` |
| 6 | 48–57 s | 9 s | 7,28 s | 7,314286 s | `audio/06-voix.mp3` |
| 7 | 57–67 s | 10 s | 9,68 s | 9,717551 s | `audio/07-voix.mp3` |
| 8 | Fin de 67–74 s | 7 s | 2,72 s | 2,768980 s | `audio/08-voix.mp3` |

Les voix de scène sont montées à `t=0` dans chaque plan, sans time-stretch. La voix 07 commence très près du début de son fichier : ne pas lui ajouter arbitrairement une entrée de 0,5 s, ni rogner le mot initial. Manon commence à `+0,55 s` dans la séquence de fin, soit `67,55 s` dans le film complet.

Références audio Seedance : `audio/01-reference.wav` à `06-reference.wav`, puis **`audio/07-reference-finale.wav`**. Le fichier `07-reference.wav` correspond à l'ancienne conclusion et ne doit pas être choisi par simple tri de nom.

Le texte actuel du plan 7 commence par « Guteneo réunit fax, email et courrier dans votre conversation. » L'ancien texte « Les supports évoluent… » et sa génération `LP60aaESeKJwdQ3tcqSi` sont obsolètes.

### Identifiants audio stables

| Plan | Nœud voix | Génération approuvée | Nœud référence avec silence |
| --- | --- | --- | --- |
| 1 | `k0bIzECl5ALquFQHFnyf` | `OO3FrGhRp4JJkFVzrmAa` | `qibYSByZkeMPNH0y5VJI` |
| 2 | `5QayXiUpK1vcxXgE4OQ2` | `JsXOtL6rftVhomFcHx6g` | `cRdosUjeA2gJlMRabHBX` |
| 3 | `RwVjpSHSuad5DcRPy31i` | `pMMdV6wLERtq4bXSbQPy` | `uhM3xETC3vb56WcsLnZo` |
| 4 | `NxPZtSeNG2Fte86sChWy` | `Qipw59eo7k62wrlarUFg` | `sA6PI73Y7IVQfzFZGWLv` |
| 5 | `RVGYvnAMaeSUzNYjE4Xh` | `qMKGxkCdGzAJmTRkV8e2` | `xQM23C9EoqFYyW9di5P2` |
| 6 | `lH4H7WSwZ0gcvV3obBr9` | `62LmK4q54phBSNxztT9C` | `OHQnbER3lkN2p6iUFDoY` |
| 7 | `pF0Gt3JJpne3FoDLJTHW` | `Wb6zds0MOanekdorzifd` | `eUKekiaYlYsfXbAMvN8N` |
| 8 | `Fof3aLiDbW60XJnERJme` | `TuYGqHhMPveKKvD4RRVo` | Sans objet |

## Projet ElevenLabs et chaîne de génération

Projet actuel : [Guteneo — Gutenberg à travers les âges](https://elevenlabs.io/app/flows/jFltGQ8YMa9Oub80hm8u), identifiant `jFltGQ8YMa9Oub80hm8u`.

Ancien projet : `9BEM3dvSECdljMmr8aoN`, qui correspond aux premières tentatives, notamment au film de 50 secondes avec voix non retenue. Ne pas confondre ses coûts avec ceux de la production actuelle.

Référence personnage approuvée : génération **`Tb7l3CjKACyi6nj7drb2`**, nœud d'asset **`ycL4lQUbL7qGNNGMZFWv`**. Les identifiants sont conservés ici sans URL signée ni paramètre de connexion. Pour retrouver un média distant, utiliser son identifiant dans le compte ElevenLabs autorisé ; ne pas compter sur une ancienne URL temporaire.

| Étape | Modèle et paramètres utilisés | Point de reprise |
| --- | --- | --- |
| Voix | `eleven_v4`, `language_code: fr`, voix ci-dessus | Déjà validées ; réutiliser les fichiers |
| Images | `gpt-image-2`, haute qualité, 2K, ratios 16:9 / 9:16 | Anciennes images archivées ; nouvelle série de décors encore à valider |
| Vidéo | `bytedance-seedance-v2.5`, 1080p, ratio du plan, durée entière de 4 à 30 s, `generate_audio: true` | Référence image + référence audio ; pas de lancement avant nouveau budget |
| Synchronisation | `sync-lipsync-v3`, entrées vidéo + audio, `sync_mode: silence` | Conserver la durée et vérifier le résultat perceptuellement |
| Bruitages | `eleven_text_to_sound_v2`, durée dédiée, `prompt_influence: 0.7`, `loop: false` | Fichiers sélectionnés déjà présents |
| Montage final | Python + FFmpeg local | Aucun appel IA ni crédit de génération |

La configuration Seedance disponible pendant cette production acceptait les ports `reference_images` et `reference_audios`, sans les combiner avec des images `start_frame` / `end_frame`. À la prochaine reprise effective, relire le schéma du modèle : les capacités et tarifs peuvent avoir changé. Les paramètres consignés sont ceux des tentatives archivées, pas une garantie de capacités futures.

Le tweet partagé par l'utilisateur proposait d'envoyer la voix dans une vidéo noire de durée identique. Ici, l'entrée de référence audio directe était disponible. Le pilote a montré qu'un simple remplacement de la voix Seedance par l'original pouvait créer un décalage variable : environ +140 ms au début, +180 ms au milieu et +350 ms en fin selon la comparaison d'enveloppes. Une passe Sync a donc été ajoutée. La corrélation sonore ou une transcription correcte ne prouvent pas une synchronisation labiale parfaite : revoir bouche et syllabes sur la vidéo terminée.

### Nœuds historiques de vidéo — repérage, pas liste à relancer

| Plan | Nœud Seedance H | Nœud Seedance V |
| --- | --- | --- |
| 1 | `Fjp8Y7u3cous5w9V9jje` | `GvP3Kuc8abnpW4XDbXss` |
| 2 | `Bl6REpYG0zc8t9eKT7eg` | `xkRkOZ0MEggbrM7m7mUT` |
| 3 | `P7z51QEwoOkoacJFcFER` | `MqaBKBhqWUVrfcGgqigh` |
| 4 | `BqshIsgBKlbfgK7bmo9Z` | `m6jvRmAvMkpEo7pKM7kz` |
| 5 | `rcOCUchitVH4DWKgYMh4` | `0jZ7ByxchYZr69zAJY0v` |
| 6 | `DToyfQFVE9bVlmZS6w2j` | `E3U7XEr71MLS00dA2U18` |
| 7 | `s6yB4T5sTQNwyS45FNm4` | `vMrvvs7afA3K5oJ9vvPl` |

### Générations terminées disponibles localement

Les suffixes correspondent à `production/video/final/{suffixe}-seedance.mp4` et `{suffixe}-sync.mp4`.

| Suffixe | Génération Seedance | Génération Sync | Statut |
| --- | --- | --- | --- |
| `h-05` | `wlkZ7ZUqZ2F1LHacwslg` | `DBH9YELqXoFpupCqZcNe` | Rejeté |
| `h-07` | `mzDBwBWuniJ3nqjL8Ztw` | `Twg1yc6OBTJtweMNCStJ` | Disponible, ancienne direction |
| `v-04` | `QC1Iy7A171bYgpVZXjFp` | `an5nfIn62wGBLix0hZBR` | Disponible, ancienne direction |
| `v-05` | `XbtoAeMWBBWMPohCYWOG` | `uEBm6agGGxEIwY5tscrs` | Rejeté |
| `v-06` | `NECSTL7fMnrmuOqwnDNr` | `FY4ErULCpcZ4ka3gQ7p2` | Disponible, ancienne direction |
| `v-07` | `ovChZku0IquYggtGTXN9` | `GfrsEBRK4Opv6jAI5rWW` | Disponible, ancienne direction |

Les nœuds Sync associés, sessions, prompts historiques et tarifs par génération sont dans les manifestes JSON archivés. Le pilote Égypte est une génération supplémentaire, hors des six clips finaux.

## Fin officielle, produit et son

La fin doit reprendre **la séquence officielle du site**, et non une approximation générée du logo. Sources : `brand-reference/guteneo-homepage-horizontal-v8-fr.mp4` et `guteneo-homepage-vertical-v8-fr.mp4`, provenant respectivement de `https://guteneo.com/videos/guteneo-horizontal-v8-fr.mp4` et `https://guteneo.com/videos/guteneo-vertical-v8-fr.mp4`.

Extraction de **59,5 à 66,5 secondes** : environ 2 s sur bleu avec « La suite de vos mots. » et hirondelles blanches, puis environ 5 s sur ivoire avec timbre Gutenberg, cachet Luxembourg, guteneo.com et hirondelles bleues. Maintenir le dernier visuel, sans finir au noir. La source verticale est 1320 × 2868 ; le recadrage central 1320 × 2346 puis réduction en 1080 × 1920 conserve la composition officielle.

Fins préparées : `production/finishing/endcard-horizontal-silent.mp4`, `endcard-vertical-silent.mp4` et leurs variantes `-preview.mp4` sonorisées. Manon est décalée de +0,55 s ; musique officielle adoucie et bruitage d'hirondelles complètent la séquence.

Captures produit : `production/product/desktop.png` (1920 × 1080) et `mobile-wide.png` (1080 × 1920) sont de vraies captures du **site responsive**, pas des captures d'une application native. La version mobile large a été prise avec un viewport CSS 540 × 960 et DPR 2, afin de garder tout le contenu utile. Les captures `*-verification.png` proviennent d'une démonstration publique affichant des exemples fictifs : ne pas les présenter comme les documents réels d'un utilisateur.

Le manifeste insère la capture dans les 3 dernières secondes du plan 6, avec un fondu de 6 images : 54–57 s dans le film complet et 14–17 s dans l'aperçu de 34 s. L'insertion est faite au montage à partir des pixels réels, jamais en demandant au modèle de redessiner l'interface. Les contrôles SSIM sont consignés dans les rapports QA.

Bruitages réutilisables : `stone.mp3`, `papyrus.mp3`, `press.mp3`, `fax.mp3`, `digital.mp3`, `swallows.mp3`. Mixage : voix autour de −16 LUFS, bruitages autour de −34 LUFS, hirondelles autour de −37 LUFS, limiteur visant −2 dBTP. Les bruitages entrent respectivement à 0,25 / 0,35 / 0,45 / 0,45 / 0,50 / 0,65 s des scènes 1–6 ; le plan 7 n'a pas de bruitage principal. Ils doivent rester sous la voix et ne pas masquer de syllabe.

## Reprendre localement sans crédits

Prérequis : Python 3.10 ou plus récent, `ffmpeg` et `ffprobe` avec encodeur `libx264` et AAC. Les trois scripts de montage n'utilisent que la bibliothèque standard Python et les exécutables FFmpeg ; aucun SDK ni secret ElevenLabs n'est requis. Les données médias sont archivées dans Git. Après un clone, exécuter `python3 videos/guteneo-gutenberg/tools/restore_large_media.py` depuis la racine pour reconstituer les six plus gros fichiers historiques stockés en blocs. Les vocaux, la proposition 2 et l’aperçu de 34 s sont accessibles directement. Aucun téléchargement ElevenLabs ni génération ne sont nécessaires. Le vérificateur et le script d’archivage demandent Python 3.11 ou plus récent ; Python 3.10 suffit aux scripts de montage.

Depuis la racine du dépôt, examiner les entrées sans rien générer :

```bash
python3 --version
ffmpeg -version
ffprobe -version
python3 - <<'PY'
import json
from pathlib import Path

base = Path('videos/guteneo-gutenberg/archive/production')
manifest = json.loads((base / 'assembly-manifest.json').read_text())
for kind in ('horizontal', 'vertical'):
    for scene, relative in enumerate(manifest[kind], 1):
        file = base / relative
        state = 'REJETÉ' if scene == 5 else ('PRÉSENT' if file.is_file() else 'MANQUANT')
        print(f'{kind:10} plan {scene}: {state:8} {relative}')
for relative in manifest['voices']:
    file = base / relative
    if not file.is_file():
        raise SystemExit(f'Voix absente : {file}')
print('Huit fichiers voix présents.')
PY
```

Pour reproduire l'aperçu actuel sans modifier les fichiers archivés dans Git, travailler dans une copie temporaire. La copie complète demande environ 1,1 Go ; le rendu exige de l'espace supplémentaire.

```bash
GUTENEO_REPLAY_DIR="$(mktemp -d)"
cp -R videos/guteneo-gutenberg/archive "$GUTENEO_REPLAY_DIR/archive"
python3 "$GUTENEO_REPLAY_DIR/archive/production/salvage_preview.py"
ffprobe -v error -show_format -show_streams -of json \
  "$GUTENEO_REPLAY_DIR/archive/production/deliverables/Guteneo-apercu-court-sans-plan-ordinateur-34s.mp4"
```

`salvage_preview.py` réutilise les fins silencieuses et les mixages `scene-01-audio.wav` à `scene-07-audio.wav` et `endcard-audio.wav` présents dans l'archive. S'ils ont été volontairement retirés de la copie de travail, les reconstruire localement, puis relancer l'aperçu :

```bash
python3 "$GUTENEO_REPLAY_DIR/archive/production/partial.py" --prepare
python3 "$GUTENEO_REPLAY_DIR/archive/production/salvage_preview.py"
```

Ces commandes n'appellent aucun service, ne chargent aucun média vers ElevenLabs et ne consomment aucun crédit de génération. Elles écrivent des résultats dans la copie temporaire. Les 37 petits fichiers de cache ont été omis de la copie Git : ils sont régénérables. Les caches reposent sur chemins, tailles et dates de modification ; un déplacement ou leur absence peut provoquer un recalcul local attendu.

### Limites et pièges des scripts

- **`assemble.py --assemble` est indisponible pour le film complet actuel** : il exige les 14 clips listés et échoue si l'un manque. De plus, son manifeste inclut encore H05 et V05 rejetés. Même si les 14 fichiers existaient, le script ne détecterait pas ce rejet créatif tout seul.
- **`partial.py` lancé sans `--prepare` sélectionne V04 + V05 + V06 + V07 par défaut** et reconstitue l'ancien aperçu de 43 s contenant le moniteur défectueux. Ne pas l'utiliser comme aperçu courant.
- **`salvage_preview.py` est le seul point d'entrée actuel pour l'aperçu de 34 s**, car il remplace la sélection par `[4, 6, 7]` avant d'utiliser les fonctions de `partial.py`.
- `salvage_preview.py` exécute son montage au niveau du module : ne pas l'importer pour une simple inspection de code. Lire le fichier ou utiliser un parseur de syntaxe.
- `assemble.py --prepare-endcards` ne prépare que la fin officielle. `partial.py --prepare` prépare aussi les mixages de toutes les scènes.
- Ne pas utiliser le script de capture web pour une simple vérification de l'archive : les captures réelles sont déjà présentes. Une nouvelle capture peut changer avec le site.
- Les scripts écrivent avec l'option FFmpeg `-y` : une relance remplace les résultats de même nom dans leur dossier de travail. C'est la raison de la copie temporaire proposée.

## Ce qui a été vérifié et ce qui reste à vérifier

L'aperçu de 34 s dispose de `production/deliverables/qa-apercu-court-34s.json` : 34,000 s, 1080 × 1920, H.264 High/yuv420p, 30 images/s, AAC stéréo 48 kHz, −15,97 LUFS, −2,09 dBTP, décodage sans erreur, 14 539 864 octets. La capture produit correspond à l'original avec SSIM 0,989434, sans recadrage.

Une revue visuelle indépendante sur des images échantillonnées chaque seconde de V04/V06/V07 n'a pas détecté de duplication de feuille dans le fax, d'interface sur le dos de la tablette, ni de défaut évident du folio et des mains. Cela **ne prouve ni la perfection de chaque image, ni une synchronisation labiale parfaite**. La géométrie du moniteur de V05 avait justement échappé à une revue trop rapide.

Pour les prochaines images et vidéos, vérifier concrètement :

1. Le visage, la barbe, les proportions et le marbre ivoire restent ceux de la proposition 2.
2. Le lieu, l'époque, la palette et l'éclairage permettent d'identifier chaque scène, surtout fax / emails / web.
3. Le personnage, sa bouche et ses accessoires importants restent dans la zone utilisable en portrait ; simuler le recadrage avant toute vidéo.
4. Un écran a une face d'affichage et une coque arrière opaques ; connectique, clavier, mains et regard correspondent à la même orientation.
5. Les gestes ne dédoublent pas les doigts, les feuilles ou les objets. Limiter les déplacements aux scènes où ils apportent quelque chose.
6. Lire les lèvres au début, au milieu et à la fin tout en écoutant les vrais fichiers voix, puis regarder le plan entier à vitesse normale.
7. Contrôler les inserts produit avec la vraie capture, puis la fin officielle, les hirondelles, la prononciation Manon et l'absence de coupe de mot.

La génération native en 1080p est une exigence utilisateur. Un cadrage central en 1920 × 1080 ne procure qu'environ 608 pixels de largeur après recadrage 9:16, avant agrandissement vers 1080 × 1920 : il ne faut pas présenter cela comme du portrait natif. Le choix entre cadrage/reformatage et deux générations natives a un coût et doit être explicite avant la prochaine dépense. Il ne faut ni baisser la qualité en secret, ni doubler automatiquement les générations.

## Audit des crédits et leçons pour la reprise

Source chiffrée : `production/deliverables/cost-audit.json` et `.csv`. Les chiffres ci-dessous sont des crédits issus des enregistrements de générations, **pas une facture**. Les montants en euros et le solde réel du compte n'ont pas été vérifiés. Les prix API en dollars ne constituent pas une conversion fiable du crédit facturé à l'utilisateur.

| Groupe | Variantes / générations | Crédits constatés |
| --- | ---: | ---: |
| Voix initiales du flux actuel | 32 | 0 rapporté par l'outil |
| Références maître initiales | 4 | 5 109,545199 |
| Images réalistes paysage | 24 | 30 657,271196 |
| Images réalistes portrait | 28 | 35 766,816395 |
| Bruitages | 24 | 453,333333 |
| Pilote vidéo Égypte | 1 | 68 919,774000 |
| Propositions du personnage stylisé | 4 | 5 109,545199 |
| Révision vocale finale | 4 | 0 rapporté par l'outil |
| Images finales stylisées | 52 | 66 424,087591 |
| Vidéos Seedance finales abouties | 6 | 344 598,870000 |
| Synchronisations de ces vidéos | 6 | 44 644,844160 |
| **Production actuelle tracée** |  | **601 684,0870744676** |

Les 112 images représentent 143 067,265581 crédits environ : 56 dans l'ancienne direction réaliste et 56 dans la direction stylisée. Les lots par défaut de quatre variantes ont contribué au volume. Les huit contrôles de transcription n'ont pas été chiffrés dans ce sous-total. « 0 rapporté » pour la synthèse vocale ne garantit pas la gratuité d'une future synthèse.

L'ancien premier projet représente séparément **123 555,631651 crédits confirmés** pour vidéo et synchronisation ; ses autres coûts audio/composition ne sont pas complètement comptabilisés. Ne pas additionner les périmètres sans les nommer.

L'utilisateur se souvenait d'une estimation initiale de **630 000 crédits / 156 $**. L'audit a retrouvé une estimation de **947 569,476 crédits / 156,35 $**, limitée aux 14 vidéos finales et à leur synchronisation, sans préparation ni pilote. La stratégie avait glissé du brief « paysage composé pour un recadrage portrait centré » à **14 générations natives indépendantes**. Cette extension et les coûts de tests/préparation n'avaient pas été correctement exposés avant consommation. L'erreur de planification et de suivi a été reconnue ; elle ne vient pas d'une faute de l'utilisateur.

Selon l'ancienne liste de plans, les huit vidéos manquantes et leur synchronisation étaient estimées à **558 641,706 crédits**, pour un total projeté du flux actuel de **1 160 325,7930744677 crédits**. Ces valeurs sont historiques : elles **n'incluent pas un nouveau tournage des scènes rejetées ni la nouvelle révision des décors**, et ne sont donc pas un devis de la proposition actuelle.

Avant toute reprise payante : établir le nombre exact d'images et de vidéos, la stratégie des deux formats, les éventuelles passes Sync, les frais de tests, une réserve de reprises et un plafond global. Présenter le total consommé, le reste estimé et le maximum prévu. Obtenir l'accord sur ce budget révisé, puis avancer par étapes revues. Ne pas relancer une génération réussie pour « récupérer » son résultat : retrouver son identifiant ou son fichier local. Ne pas abaisser la qualité pour contourner le manque de crédits.

## Prochaine séquence de travail conseillée

1. Ouvrir la proposition 2, l'aperçu de 34 s, le scénario révisé et les captures officielles depuis cette archive.
2. Préparer et vérifier les sept prompts de lieux différents ; garder les voix inchangées. Aucune génération n'est nécessaire pour cette étape.
3. Valider les compositions en série, l'orientation des appareils et le cadrage des deux formats avant toute vidéo payante.
4. Chiffrer explicitement le scénario révisé et le plafond, sans assimiler les anciennes estimations à un devis encore valable.
5. Seulement après autorisation de ce budget, générer par petits lots, inspecter chaque plan avec sa voix, puis actualiser les manifestes de montage en excluant les prises rejetées.
6. Produire les deux films complets, vérifier réellement leurs images et leurs mots, puis les présenter comme terminés uniquement lorsque les 74 secondes et les deux formats sont validés.

La connexion au compte ElevenLabs sera nécessaire pour des lectures distantes ou une future génération ; aucun identifiant secret ne doit être ajouté à cette archive Git. Les identifiants de flux, nœuds et générations suffisent à relier les fichiers à leur provenance.
