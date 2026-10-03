# Audit de l’archive Gutenberg / Guteneo

Audit en lecture seule du dossier source `/workspace/guteneo`, le 3 octobre 2026. Aucun appel de génération, aucune modification des fichiers source. Les chemins de ce rapport sont relatifs à ce dossier sauf indication contraire.

## Volume et stratégie Git

**Décision finale d’archivage : Git classique.** La recommandation LFS ci-dessous était celle de l’audit initial. Le point d’accès LFS a refusé l’authentification disponible ; aucun objet média n’a été transféré par LFS. Tous les médias sont donc enregistrés comme blobs Git normaux, sans changer leurs octets ni leur qualité. Un clone récupère toutes les données. Six fichiers historiques de plus de 16 Mio sont segmentés sous `media-parts/` pour la limite de requête de l’API GitHub ; `tools/restore_large_media.py` les reconstitue exactement depuis `large-media.json`. Le volume du dépôt augmente en conséquence.

- 491 fichiers ; 1 142 285 277 octets (~1,142 Go ou 1,064 Gio).
- Un seul fichier dépasse 50 Mio : `production/deliverables/Guteneo-Pixar2-kit-production.zip`, 59 954 205 octets (~57,18 Mio).
- Aucun fichier ne dépasse 100 Mio.
- Recommandation : Git LFS pour `.mp4`, `.wav`, `.mp3`, `.png`, `.jpg`, `.webp`, `.zip` ; Git classique pour documentation, code, JSON, CSV, VTT et références HTML/JS. Le faible nombre de gros fichiers individuels n’enlève pas le problème du volume total des médias dans l’historique Git.
- Les 2 fichiers `.pyc` (47 698 octets) et 35 `.cache` (2 240 octets) sont des caches reproductibles, dispensables à la reprise. Si exclus de la copie Git, les signaler dans le manifeste d’archivage.
- Quatre groupes de doublons médias stricts représentent 8 224 695 octets de copies supplémentaires. Garder les chemins actuels facilite la reproductibilité ; LFS déduplique le même contenu par identifiant.

| Extension | Fichiers | Octets |
|---|---:|---:|
| `.cache` | 35 | 2240 |
| `.csv` | 1 | 396 |
| `.html` | 1 | 48795 |
| `.jpg` | 93 | 9971671 |
| `.js` | 1 | 763770 |
| `.json` | 68 | 564481 |
| `.md` | 1 | 3122 |
| `.mp3` | 15 | 1949859 |
| `.mp4` | 41 | 425630600 |
| `.png` | 182 | 554352412 |
| `.py` | 5 | 40361 |
| `.pyc` | 2 | 47698 |
| `.txt` | 5 | 8272 |
| `.vtt` | 1 | 1649 |
| `.wav` | 38 | 88769916 |
| `.webp` | 1 | 175830 |
| `.zip` | 1 | 59954205 |

## URLs temporaires et données d’accès

Le scan ciblé des fichiers texte a détecté **18 fichiers avec 229 occurrences d’URLs signées ou d’URLs contenant un code `oobCode`**. Ces URLs ne doivent pas être commitées telles quelles : retirer leurs paramètres d’accès temporaires dans la copie d’archivage, garder les identifiants de génération, les chemins locaux et l’URL canonique du flow. Les noms des paramètres ne constituent pas une valeur secrète ; aucune valeur n’est reproduite ici.

Aucune clé API de format connu, clé privée, jeton GitHub, clé AWS ou valeur Bearer n’a été détectée par les motifs de recherche. Ce contrôle est ciblé, et ne garantit pas l’absence de tout format de secret possible. Les captures de produit proviennent du site public et ne sont pas des captures authentifiées de l’application native.

| Fichier | Occurrences d’URL avec accès temporaire |
|---|---:|
| `project.json` | 1 |
| `verification/stone.json` | 1 |
| `verification/corrections.json` | 2 |
| `verification/final-download.json` | 1 |
| `verification/master-download.json` | 2 |
| `verification/downloads.json` | 4 |
| `production/final-production.json` | 29 |
| `production/state.json` | 50 |
| `production/audio/manifest.json` | 8 |
| `production/audio/final-conclusion-revision-manifest.json` | 4 |
| `production/sfx/manifest.json` | 6 |
| `production/images/scenes-vertical-manifest.json` | 27 |
| `production/images/scenes-manifest.json` | 23 |
| `production/images/pixar-manifest.json` | 4 |
| `production/images/master-manifest.json` | 4 |
| `production/video/final/sync-manifest.json` | 6 |
| `production/video/final/seedance-manifest.json` | 6 |
| `production/images/final/manifest.json` | 51 |

L’ancien ZIP `production/deliverables/Guteneo-Pixar2-kit-production.zip` contient 31 entrées, pour 63 603 820 octets non compressés. Les entrées texte ont aussi été scannées : aucun URL signé, `oobCode` ou motif de secret détecté. Il peut être conservé comme archive historique. **Son storyboard et ses prompts sont antérieurs à la nouvelle direction des sept lieux : ce ZIP ne doit pas servir de consigne actuelle de génération.**

## Portabilité

- `production/assemble.py`, `production/partial.py`, `production/salvage_preview.py` et `verification/check_media.py` utilisent leur chemin `__file__` pour se repérer : bonne base portable.
- `production/product/capture.py`, ligne 5, fixe le dossier de sortie à `/workspace/guteneo/production/product`. Remplacer ce chemin dans la copie Git par `Path(__file__).resolve().parent`.
- Les manifests de production, les rapports QA, des manifests de téléchargement et quatre fichiers `production/finishing/*.concat.txt` contiennent aussi des chemins `/workspace/guteneo/...`. Conserver l’information source ou la convertir en chemin relatif explicite pour que l’archive fonctionne depuis un autre checkout.
- `production/assembly-manifest.json` est déjà relatif à `production/`, mais décrit encore les 14 clips de l’ancienne stratégie, dont huit n’existent pas et deux sont rejetés. Il n’est pas un manifeste de montage final validé.

## Statut des principaux éléments

### Réutiliser

- `production/images/Pixar-proposition-2.png` : référence du personnage approuvée par l’utilisateur. Ne pas copier son bureau dans chaque lieu.
- `production/audio/01-voix.mp3` à `08-voix.mp3` : narration finale approuvée ; conserver exactement ces vocaux. Le texte du plan 7 actuellement valide commence par « Guteneo réunit fax, email et courrier dans votre conversation ».
- `production/audio/07-reference-finale.wav` : piste de référence temporelle du plan 7 révisé.
- `production/sfx/` : effets sonores déjà générés.
- `production/product/` : captures publiques réelles de guteneo.com ; ne pas faire redessiner l’interface par IA.
- `brand-reference/guteneo-homepage-{horizontal,vertical}-v8-fr.mp4` et `production/finishing/endcard-*` : sources officielles / adaptations du carton de fin ; conserver logo, timbre, cachet, hirondelles et voix Manon.
- `production/deliverables/cost-audit.{json,csv}` : état des coûts traçables, pas une facture réelle en euros.

### Meilleur aperçu existant, pas le film final

- `production/deliverables/Guteneo-apercu-court-sans-plan-ordinateur-34s.mp4` : mini-montage vertical de 34 secondes, V04 + V06 + V07 + fin officielle ; exclut le moniteur erroné. Les environnements demeurent ceux de l’ancienne direction et ne satisfont pas encore la diversité demandée.
- `production/deliverables/Extrait-Pixar2-Horizontal-17s.mp4` : extrait du plan 7 avec fin officielle.

### Rejeté pour erreur physique

- `production/video/final/h-05-seedance.mp4`, `h-05-sync.mp4`, `v-05-seedance.mp4`, `v-05-sync.mp4` : interface visible sur le dos du moniteur ; à conserver pour traçabilité, mais ne pas réutiliser au montage.
- `production/deliverables/Extrait-Pixar2-Instagram-43s.mp4` : contient le plan 5 rejeté.
- Les images / frames QA associées servent à documenter ce défaut.

### Historique ou remplacé

- `Guteneo-La-suite-de-vos-mots.mp4`, `Guteneo-film-final.mp4`, `project.json`, `verification/` : première production, antérieure aux voix et à la direction approuvées ; le mot « final » du nom ne leur donne pas valeur de rendu actuel.
- `production/deliverables/Test-Egypte-voix-originale-v4-1080p.mp4` et `production/video/test-egypte-*` : ancien pilote réaliste, synchronisation imparfaite.
- `production/images/master-*`, `01-*`…`07-*` : anciens essais réalistes ; archives.
- `production/images/final/*`, `Storyboard-Pixar2-selection.jpg` et l’ancien ZIP : références Pixar réalisées avant la nouvelle différenciation des scènes 4/5/6 ; les prompts doivent être révisés avant toute génération.
- Le terme `final` dans les noms des fichiers et des manifests ne signifie pas que le film est achevé ou approuvé.

## Limites de l’inventaire

Cet inventaire prouve la présence des fichiers locaux listés. Il ne prouve pas que toutes les sorties autrefois générées via ElevenLabs ont été téléchargées : les manifests et identifiants de génération sont nécessaires pour retrouver les éléments hébergés dans le flow. Aucun fichier n’a été identifié avec certitude comme copie originale de l’image jointe au premier message ; conserver aussi cette distinction dans le dossier de reprise.

Les nouveaux sept plans écrits dans la conversation doivent être enregistrés séparément comme direction actuelle. Aucune vidéo correspondant à cette nouvelle direction n’a été générée. La pause des générations payantes pour revue du budget reste applicable ; l’autorisation d’archiver et de fusionner dans Git n’autorise pas une nouvelle dépense de crédits.
