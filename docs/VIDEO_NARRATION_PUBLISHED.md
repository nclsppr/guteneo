# Narrations publiées — préparation du 2 octobre 2026

Les cinq vidéos retenues — introductions françaises et anglaises dans les deux
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

| Fichier public | Durée | Octets | SHA-256 |
| --- | --- | --- | --- |
| `/videos/guteneo-horizontal-v6-fr.mp4` | 56 s | 10347697 | `7c2535462e5314ad741b5a82b10f88c087290c96cd42e76cbb97de7994683cee` |
| `/videos/guteneo-vertical-v6-fr.mp4` | 56 s | 12240339 | `e2d32af8b85b540073cc8a7feee59b837b30b1fefc9ab6431f5c74f3442c8b70` |
| `/videos/guteneo-horizontal-v6-en.mp4` | 56 s | 10270654 | `f40d811d4123c383cda80ad6db241d11987b26af85cd6f12c5554d1601b6fc2b` |
| `/videos/guteneo-vertical-v6-en.mp4` | 56 s | 12162130 | `93b75943f6128d5bef295bbee9ad10486f24aff21d2ca62ddd1be8991973147e` |
| `/videos/guteneo-roles-v2-en.mp4` | 36 s | 2052663 | `2cf94bce41d9981ef95342cf8a44d8fd9bafda2b5585b9b015e962ef31751a5c` |

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
