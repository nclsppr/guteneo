# Partition de la présentation des rôles

`roles-soundtrack.wav` est un montage de la partition instrumentale originale de
Guteneo, `vertical-soundtrack.wav`, dont la provenance et le générateur sont
conservés dans ce dossier et dans `scripts/create-vertical-soundtrack.py`.

Le montage prend les 31,2 premières secondes puis les cinq dernières secondes,
avec un fondu croisé triangulaire de 0,2 seconde. Durée finale : 36 secondes,
48 kHz, PCM 16 bits stéréo. La cadence finale reste celle du film V5.
`scripts/render-localized.mjs` régénère ce montage avec FFmpeg avant le rendu.
Il n'utilise aucun échantillon externe, voix de synthèse ou service distant.
