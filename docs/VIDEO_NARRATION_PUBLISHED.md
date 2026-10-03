# Narrations naturelles — lot du 3 octobre 2026

Les douze vidéos du catalogue actif utilisent **Manon Voix française spontanée
sérieuse**, Eleven v4 et la méthode C : trois blocs de phrases complètes dans
la langue du film. Les introductions sont en V8, les rôles EN/DE/LB en V4 ; les
rôles FR restent en V3 avec les octets approuvés par l’utilisateur. Film, poster,
sous-titres et durée affichée suivent la langue résolue de l’interface et la
préférence du compte. Une langue ne remplace jamais le média d’une autre langue.

L’action native ElevenLabs **Améliorer**, acceptée avec **Garder** dans Safari,
a été appliquée aux huit textes complets. Le résultat natif exact reste dans
chaque snapshot. Les pauses et le ton sont ensuite harmonisés pour une
présentation calme : les changements sont enregistrés dans `editorialEdits`.
Le plugin Creative génère deux variations par bloc avec langue explicite ; la
seconde est retenue par ses vrais IDs de session et de génération. La provenance
est `elevenlabs-creative-plugin`, `variationIndex: 2`, distincte de la seconde
Génération web historique.

Les huit snapshots immuables `narration/releases/*-natural-c-v1/` conservent
**24 MP3 sélectionnés et 68 WAV PCM24**. Chaque groupe de coupes reconstruit
exactement les trois sources canoniques, sans mot retiré ni accélération. Les
scènes suivent le débit réel. Les horodatages Whisper sont utilisés pour
FR/EN/DE ; le luxembourgeois utilise les exports JSON natifs Scribe, sans texte
attendu ni terme clé, après une transcription locale insuffisante. Les
variantes lexicales ASR restent archivées et ne sont pas présentées comme une
écoute humaine.

Le fond musical reçoit un **gain constant de 0,22** pendant toute la vidéo,
y compris les pauses et le logo. La cadence et le fondu final sont conservés.
Chaque film garde le même composant et média officiel de conclusion pendant
**150 images à 30 fps**, sans voix. L’introduction conserve également ses deux
secondes de Signature silencieuse. Les douze images de logo à la même frame
locale sont identiques aux compositions historiques correspondantes.

Le mix conserve les paquets H.264 des nouvelles bases musicales. Les formats
sont H.264/AAC stéréo, 30 images/s, démarrage rapide, sous 25 MiB par fichier.
Les deux présentations d’une langue partagent une piste VTT ; les rôles ont leur
propre piste. Les posters sont extraits des nouvelles scènes. La durée exacte
vient des timelines qualifiées dans le catalogue partagé.

| Fichier public                         | Durée     | Octets   | SHA-256                                                            |
| -------------------------------------- | --------- | -------- | ------------------------------------------------------------------ |
| `/videos/guteneo-horizontal-v8-fr.mp4` | 66.5000 s | 11244768 | `43316dde6e0a8cfabb667b782ef09aae26d35db79287b1e597908fa8b7ce6eb9` |
| `/videos/guteneo-vertical-v8-fr.mp4`   | 66.5000 s | 13753772 | `594a2eb91aeab05419a721451d204eecb47335be05bdaf8f6653e46e382463c9` |
| `/videos/guteneo-roles-v3-fr.mp4`      | 44.8667 s | 2332702  | `59342f77a5ca4b6e8975c34ca7b72fdd53cd408c486f9565d3785a145fb9e88e` |
| `/videos/guteneo-horizontal-v8-en.mp4` | 65.8000 s | 11200999 | `af02ff096911c16957a42e250572b227931db600dff3da5f781bbdc51f01f79e` |
| `/videos/guteneo-vertical-v8-en.mp4`   | 65.8000 s | 13748532 | `ffea64cc53445e85932c2dab298c2400643707bcfbf1e1e8b0500698fb6edfd3` |
| `/videos/guteneo-roles-v4-en.mp4`      | 47.3000 s | 2348260  | `3dab17cd2fbc4f341c4e6dd36d72150050ea08edb98250133b339650efd4b36b` |
| `/videos/guteneo-horizontal-v8-de.mp4` | 64.8667 s | 11071478 | `2b9a157420797739e2a254daccae1821879dbe81ceeaf4a6a001005f9322b8a3` |
| `/videos/guteneo-vertical-v8-de.mp4`   | 64.8667 s | 13335809 | `b18c9dee9f74f41e32fc7ca8a4a4fe1c33d70c67f31cab4c515d06c96149be5c` |
| `/videos/guteneo-roles-v4-de.mp4`      | 49.1333 s | 2477503  | `a1b7c2a74bc78709d4569795c6fb0ac914fb58c92b88d4e4848241347479325c` |
| `/videos/guteneo-horizontal-v8-lb.mp4` | 67.4667 s | 11662999 | `07e9c738ae13e8621b755868d29917e377b8d1ad9c30f1c31cb7508a3964438b` |
| `/videos/guteneo-vertical-v8-lb.mp4`   | 67.4667 s | 14098855 | `35dea41eac0431a7102709299d3a3bc19b3fa78e6b161ceb1d136e03b213960c` |
| `/videos/guteneo-roles-v4-lb.mp4`      | 50.4000 s | 2515634  | `4af8832d5a8aacd377044e91cce4af0f33c36fb8b3330546b9e75de27cce669c` |

## Rejeu et preuve

`npm run videos:render` qualifie les huit bibliothèques, rend leurs bases
musicales et remixe les voix locales, posters, VTT et manifeste sans appel
ElevenLabs. Les sources V5/V1 et la bibliothèque George historique restent
immuables. Le manifeste serveur couvre exactement les douze MP4 actifs.

Les hashes MP3/WAV et PCM canonique sont stricts. La qualification portable des
huit bibliothèques a passé sous macOS et Ubuntu/FFmpeg 6.1.1. Le décodeur scalaire
(`-cpuflags 0`) conserve les nombres d’échantillons exacts et les hashes stricts
des médias canoniques. Sous Ubuntu arm64 et x86_64, le delta maximal mesuré sur
les 24 sources est de **3 LSB PCM24**, sous la borne inchangée de 8 LSB. La fixture
`tests/fixtures/natural-c-scalar-qualification.json` archive ces deux mesures ;
`natural-c-linux-qualification.json` conserve la qualification initiale arm64
(maximum 4 LSB). Les décodeurs MP3 ne sont pas déclarés bit-identiques.

La vidéo française des rôles a été écoutée et approuvée par l’utilisateur. Son
MP4 SHA `59342f77…`, sa piste VTT, son poster et sa base musicale sont restés
strictement identiques au preview validé. Les autres narrations conservent
`criticalListening: pending` dans leurs preuves techniques : noms propres,
accents et variantes de reconnaissance ne sont pas certifiés par une écoute
humaine. Aucun test sur téléphone physique n’est revendiqué.

L’audit indépendant des douze MP4 confirme le décodage intégral, les paquets
H.264 identiques aux bases musicales, les formats/durées et le manifeste exact.
Le gain musical mesuré sous la voix, dans les pauses et au logo est compris
entre **0,217734 et 0,219883**, cohérent avec 0,22 après compression AAC. Les pics
du prémix reconstruit sont compris entre **0,6301 et 0,69235**, sous le seuil 0,95 :
le limiteur reste inactif et ne modifie pas le niveau musical.

Les vérifications locales couvrent PCM, calage, logo, catalogue et lecteur sur
Chromium/WebKit. La publication exige les
contrôles du commit fusionné et les preuves exactes sur les deux origines selon
[MAIN_RELEASE.md](MAIN_RELEASE.md). La preuve de déploiement est conservée hors
dépôt ; aucune livraison métier n’est déclenchée par ces vidéos.

# Historique V6/V2 — publié le 3 octobre 2026

Le lot précédent de cinq vidéos — introductions françaises et anglaises dans les deux
formats, et rôles anglais — utilisent la voix masculine **George —
Warm, Captivating Storyteller**, générée dans ElevenLabs avec **Eleven v4**.
Chaque phrase provient du résultat **Génération 2** choisi dans l'interface web,
selon la préférence exprimée par l'utilisateur. « Génération 2 » désigne le second
résultat de cette génération, pas le modèle Multilingual v2.

Chaque langue comporte onze phrases de présentation réutilisées dans les deux
formats ; six phrases anglaises sont propres aux rôles. Le snapshot conserve
trente-quatre reçus de génération, dont six rôles français historiques exclus
des actifs pendant la réécriture en trois blocs naturels choisie par l’utilisateur.
Les reçus
indiquent `webGeneration: 2`, un hash du MP3 et une durée compatible avec leur
scène. Les ajustements de durée locaux conservent les mots des fichiers générés.
Le mix vise −18 LUFS pour la voix et abaisse la musique à 22 % pendant les phrases.
La musique retrouve son niveau habituel entre les phrases et sur la conclusion.
Aucun appel à un fournisseur ne se produit pendant la lecture.

| Fichier public                         | Durée | Octets   | SHA-256                                                            |
| -------------------------------------- | ----- | -------- | ------------------------------------------------------------------ |
| `/videos/guteneo-horizontal-v6-fr.mp4` | 56 s  | 10347697 | `7c2535462e5314ad741b5a82b10f88c087290c96cd42e76cbb97de7994683cee` |
| `/videos/guteneo-vertical-v6-fr.mp4`   | 56 s  | 12240339 | `e2d32af8b85b540073cc8a7feee59b837b30b1fefc9ab6431f5c74f3442c8b70` |
| `/videos/guteneo-horizontal-v6-en.mp4` | 56 s  | 10270654 | `f40d811d4123c383cda80ad6db241d11987b26af85cd6f12c5554d1601b6fc2b` |
| `/videos/guteneo-vertical-v6-en.mp4`   | 56 s  | 12162130 | `93b75943f6128d5bef295bbee9ad10486f24aff21d2ca62ddd1be8991973147e` |
| `/videos/guteneo-roles-v2-en.mp4`      | 36 s  | 2052663  | `2cf94bce41d9981ef95342cf8a44d8fd9bafda2b5585b9b015e962ef31751a5c` |

Les paquets H.264 sont identiques à ceux des versions instrumentales V5/V1.
Cadrages, animations et logo final sont conservés. Les présentations comptent
1680 images ; les rôles en comptent 1080. La dernière phrase française se termine
à 46,730 s pour les présentations ; la dernière phrase
anglaise à 47,540 s et 30,738 s. Les cinq secondes finales du logo commencent
respectivement à 51 s et 31 s, sans narration. Les sorties restent H.264/AAC
stéréo, 30 images/s, avec démarrage rapide, sous 25 MiB par fichier.

Le catalogue partagé sélectionne le fichier de la langue résolue sur l'accueil
et sur `/roles/`. Les posters conservent leurs fichiers V5/V1. Les anciens MP4
instrumentaux restent disponibles comme sources de régénération. L'allemand et
le luxembourgeois restent sur leurs vidéos précédentes pendant la préparation
des voix. Les rôles français restent sur leur V1 instrumentale : l’ancien
candidat voix V2 FR et sa piste VTT sont exclus de cette publication.

Les deux formats de présentation partagent les onze phrases sous-titrées dans
`/videos/guteneo-v6.{fr,en}.vtt`. Les rôles anglais utilisent leurs six phrases
propres dans `/videos/guteneo-roles-v2.en.vtt`. Le catalogue désigne ces pistes,
calées sur les clips réellement mixés et disponibles dans les contrôles natifs.
Les pistes musicales V5 sont conservées pour les sources instrumentales.

Les 34 sources audio, scripts et reçus nettoyés sont suivis dans le
[snapshot FR/EN Génération 2](../videos/guteneo-film/narration/releases/fr-en-g2/README.md).
Le rejeu hors ligne des cinq actifs retenus depuis ce snapshot a retrouvé exactement
les SHA-256 ci-dessus. `npm run videos:render` rend les bases musicales V5/V1,
puis remixe ce snapshot vers les chemins actifs V6/V2 et régénère les pistes VTT
et le manifeste. Les entrées sont qualifiées avant toute écriture publique ; le
snapshot reste immuable et aucun appel fournisseur n’est nécessaire.
Les preuves détaillées de mixage et de revue restent hors du dépôt.
Les deux langues ont passé un décodage FFmpeg complet et une revue indépendante
des hashes, paquets vidéo, reçus Génération 2 et fins musicales. Les contrôles
techniques n'attestent pas une écoute humaine complète ni un téléphone physique.
La publication suit [MAIN_RELEASE.md](MAIN_RELEASE.md), avec CI du commit fusionné
et vérification des deux origines publiques après déploiement.
