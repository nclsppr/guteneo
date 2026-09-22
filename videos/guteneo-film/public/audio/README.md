# Bande-son Guteneo

`soundtrack.wav` est le master complet de **46 secondes**, stéréo, PCM 16 bits,
48 kHz. Il contient la musique, les textures de papier et le clap final.

La partition, la mélodie et tous les timbres sont des créations procédurales
originales du script `scripts/create-soundtrack.py` : oscillateurs, bruit à graine
fixe, enveloppes, harmoniques et diffusion stéréo. Aucun extrait musical,
enregistrement, échantillon tiers, modèle audio ni service payant n'est utilisé.
Les timbres de piano feutré, de pad et de percussion sont des synthèses, pas des
enregistrements d'instruments acoustiques.

## Montage

| Temps | Intention sonore |
| --- | --- |
| 0–5 s | Bruissement de papier, notes espacées, ouverture harmonique lumineuse |
| 5–13 s | Première phrase mélodique, entrée progressive de la pulsation |
| 13–20 s | Piano, pad doux, basse et percussion discrète |
| 20–25 s | Accent papier à 20,06 s, progression de la musique |
| 25–31 s | Accent papier à 25,05 s, reprise du motif |
| 31–36 s | Accent papier à 31,07 s, dernière expansion de la mélodie |
| 36–40,25 s | Retrait progressif de la pulsation puis de la musique |
| **40,500 s** | **Clap sec**, attaque à l'échantillon 1 944 000 |
| **41,000 s** | **Accord final du logo**, ré majeur, puis résonance |
| 44,9–46 s | Extinction douce jusqu'au silence |

La composition est en ré majeur, à 80 BPM. Le master démarre à la première image
du film, à vitesse normale et volume 1. **Ne pas ajouter un deuxième clap** :
`clap.wav` est seulement une alternative autonome pour un remontage. Sa durée
est 0,75 s, avec une attaque locale à 0 s.

## Génération reproductible

Depuis la racine du dépôt, avec Python 3.9+ et NumPy :

```sh
python3 videos/guteneo-film/scripts/create-soundtrack.py
```

Le script produit les deux WAV et `soundtrack-measurements.json`. Aucun réseau
n'est nécessaire à son exécution.

## Vérification

Mesures du WAV relu par FFmpeg, sans modification du master :

```sh
ffmpeg -hide_banner -i videos/guteneo-film/public/audio/soundtrack.wav \
  -af loudnorm=I=-16:TP=-1:LRA=11:print_format=json -f null -
```

- Durée : 46,000 s ; 2 208 000 échantillons par canal.
- Crête numérique : −1,000 dBFS ; RMS stéréo : −16,439 dBFS.
- Loudness intégré : −14,33 LUFS ; true peak : −0,95 dBTP.
- Loudness range : 2,20 LU.
- Échantillons écrêtés : 0.
- RMS des 100 dernières millisecondes : −68,982 dBFS.

La validation automatisée porte sur le format, la durée, le signal, les niveaux
et les attaques. Aucune écoute humaine n'est revendiquée.
