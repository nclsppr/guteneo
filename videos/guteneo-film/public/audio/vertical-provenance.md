# Guteneo — musique du spot vertical

`vertical-soundtrack.wav` est une composition originale de **56 secondes**, à
**120 BPM**, livrée en stéréo PCM 16 bits, 48 kHz. Elle est indépendante de la
première bande-son de 46 secondes, laissée intacte.

La musique mêle un motif de trois notes immédiat, un piano électrique feutré
synthétisé, des accords ouverts, un pad chaleureux, une basse syncopée, un kick
précis, des percussions sèches et de courts mouvements d'air pour les changements
de plan. La tonalité de fa dièse mineur se résout en la majeur sur le logo.

Tous les éléments, musique comme bruitages, sont produits par le script
`scripts/create-vertical-soundtrack.py` avec oscillateurs, enveloppes, bruit
filtré à graine fixe et diffusion stéréo. Aucun échantillon, enregistrement,
extrait musical tiers, modèle audio, téléchargement ou service payant n'est
utilisé. Les noms d'instruments désignent des timbres de synthèse.

## Calage du montage

| Temps | Son |
| --- | --- |
| 0–1 s | Impact discret, premier accord et accroche mélodique immédiate |
| 3 / 6 / 10 / 14 / 18 s | Courts mouvements d'air accompagnant les cuts ; groove progressif |
| 23 / 29 / 35 s | Accents de caméra, percussion et texture papier |
| 40–44 s | Retrait de la densité et respiration musicale |
| 44 s | Retour du groove et dernier sommet mélodique |
| 49–51,35 s | Décroissance progressive du groove, continuité harmonique |
| 50,15–51,30 s | Souffle doux continu, sans impact |
| **51,000 s** | **Accord de signature du logo**, attaque adoucie et tenue de cinq secondes |
| 55,1–56 s | Extinction douce, dernier échantillon nul |

Placer ce master à **t=0**, vitesse normale, volume 1. Le clap est supprimé,
ainsi que le silence qui le préparait. La signature visuelle de 49 à 51 secondes
se prolonge directement dans le timbre final de 51 à 56 secondes, avec un accord
sans percussion. Le groove et ses événements avant 49 secondes sont conservés ;
le gain statique global est recalculé pour la nouvelle fin.

## Reproduction et mesures

Depuis la racine du dépôt, Python 3.9+ avec NumPy ; FFmpeg permet la mesure et
l'ajustement du loudness final :

```sh
python3 videos/guteneo-film/scripts/create-vertical-soundtrack.py
```

Le script analyse le WAV avec `loudnorm` puis applique un gain statique prudent,
sans modification de tempo ni limiteur de loudness. La mesure finale porte sur
le WAV PCM effectivement livré.

- Durée : **56,000 s**, 2 688 000 échantillons par canal.
- Niveau intégré : **−15,00 LUFS**.
- True peak : **−1,92 dBTP** ; crête numérique : **−1,920 dBFS**.
- RMS stéréo : **−16,812 dBFS** ; plage de loudness : **3,50 LU**.
- Échantillons écrêtés : **0**.
- RMS des 100 dernières millisecondes : **−68,967 dBFS**.
- SHA-256 : `3a62ed43b423d900debfcb54a841037a9867378634e0d83c552ebcaac3af28bb`.

Les valeurs structurées sont conservées dans `vertical-measurements.json`.
Format, durée, attaques, absence d'écrêtage et niveaux sont vérifiés par calcul.
Aucune écoute humaine n'est revendiquée.
