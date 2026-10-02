# Narration anglaise — 2 octobre 2026

Les trois vidéos anglaises utilisent la voix masculine **George — Warm,
Captivating Storyteller**, générée dans ElevenLabs avec le modèle **Eleven v4**.
Chaque phrase provient du résultat **Génération 2** choisi dans l'interface web,
selon la préférence exprimée par l'utilisateur. « Génération 2 » désigne ici le
second résultat de cette génération, pas le modèle Multilingual v2.

Les onze phrases de présentation sont réutilisées dans les deux formats ; les
six phrases de rôles ont leur propre piste. Les dix-sept reçus de génération
indiquent `webGeneration: 2`, un hash du MP3 et une durée compatible avec leur
scène. Le mix place la voix à −18 LUFS et abaisse la musique à 22 % pendant les
phrases. La musique retrouve son niveau habituel entre les phrases et sur la
conclusion. Aucun appel à un fournisseur ne se produit pendant la lecture.

| Fichier public | Durée | Octets | SHA-256 |
| --- | --- | --- | --- |
| `/videos/guteneo-horizontal-v6-en.mp4` | 56 s | 10270654 | `f40d811d4123c383cda80ad6db241d11987b26af85cd6f12c5554d1601b6fc2b` |
| `/videos/guteneo-vertical-v6-en.mp4` | 56 s | 12162130 | `93b75943f6128d5bef295bbee9ad10486f24aff21d2ca62ddd1be8991973147e` |
| `/videos/guteneo-roles-v2-en.mp4` | 36 s | 2052663 | `2cf94bce41d9981ef95342cf8a44d8fd9bafda2b5585b9b015e962ef31751a5c` |

Les paquets H.264 sont identiques à ceux des versions anglaises instrumentales
V5/V1. Cadrages, animations et logo final sont conservés. Les présentations
comptent 1680 images ; la vidéo des rôles en compte 1080. La dernière phrase se
termine à 47,540 s pour les présentations et à 30,738 s pour les rôles, avant les
cinq secondes finales du logo. Les sorties restent H.264/AAC stéréo, 30 images/s,
avec démarrage rapide, et sous la limite Cloudflare de 25 MiB par fichier.

Le catalogue partagé sélectionne ces fichiers lorsque la langue résolue est
l'anglais, sur l'accueil et sur `/roles/`. Les posters conservent leurs fichiers
V5/V1. Les anciens MP4 anglais instrumentaux restent disponibles comme sources
de régénération ; ils ne sont plus les fichiers actifs du lecteur. Les autres
langues restent sur leurs vidéos précédentes pendant la préparation des voix.

Les preuves de mixage et les sources audio sont conservées séparément du dépôt.
La préparation a passé TypeScript, lint, 64 tests ciblés de médias/langues/plages
et 57 tests du lecteur sur Chromium ordinateur et WebKit iPhone, avec un cas
réservé au téléphone ignoré sur ordinateur. Les trois MP4 ont été décodés
entièrement par FFmpeg et leurs paquets vidéo comparés aux originaux.
Le décodage et les empreintes sont des contrôles techniques : aucune écoute
humaine complète ni qualification sur téléphone physique n'est revendiquée.
La publication suit [MAIN_RELEASE.md](MAIN_RELEASE.md), avec CI du commit
fusionné et vérification des deux origines publiques après déploiement.
