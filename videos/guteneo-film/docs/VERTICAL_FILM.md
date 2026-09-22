# guteneo — La promesse finale

Second spot, indépendant du premier film horizontal : **56 secondes, 30 images/s**.

La révision 5 corrige la première scène : logo simplifié sans cachet, aussi sur la feuille. Le master actuel est `out/guteneo-v5-vertical-iphone.mp4` (1320 × 2868). La composition `Guteneo-Horizontal-Vision` adapte le même spot en 1920 × 1080.

La révision 4 reste conservée avec ses deux exports plein écran :

| Export | Dimensions | Composition |
| --- | --- | --- |
| `out/guteneo-v4-iphone-18-pro.mp4` | 1206 × 2622 | `Guteneo-iPhone-18-Pro` |
| `out/guteneo-v4-iphone-18-pro-max.mp4` | 1320 × 2868 | `Guteneo-iPhone-18-Pro-Max` |

Les dimensions proviennent de la [fiche technique Apple](https://www.apple.com/iphone-18-pro/specs/), consultée le 22 septembre 2026. Le 9:16 historique (`Guteneo-Vertical-Vision`, 1080 × 1920) reste disponible pour les formats sociaux. Les anciennes V1/V2/V3 exportées sont conservées.

Le stage s’adapte au ratio du modèle : largeur de travail 1080, hauteur proportionnelle au ratio réel. Les positions verticales sont recomposées, les photos couvrent toute la hauteur, et les textes, timbres et documents gardent leurs proportions. Il ne s’agit ni d’un étirement de l’ancien MP4 ni d’un ajout de bandes.

## Cadre créatif retenu

L'utilisateur a choisi explicitement de se projeter dans le produit terminé. Le film raconte donc sa promesse finale, sans réserve de disponibilité, « bientôt », « en projet » ou « mise en scène » dans la vidéo. Ce choix ne constitue pas une validation de disponibilité actuelle. L'audit réel, réalisé avant ce choix, reste dans `vertical-claims.md`. Aucun envoi, changement métier ou déploiement n'a été effectué.

Le film présente les 10 000+ documents, la personnalisation de campagne, le PDF importé ou créé depuis un modèle, ChatGPT/Claude/Copilot, la génération d'un PDF avec l'assistant, le bon à tirer et le devis, les e-mails classiques/chiffrés, le fax, l'impression et la distribution postale européenne, le web et l'application iOS projetée.

Les écrans de conversation, de BAT et de l'application iOS sont des compositions publicitaires originales en React, pas des enregistrements de fonctions déjà publiées. La homepage web mobile montrée avant l'interface iOS est une vraie capture publique, dont la provenance est conservée ; la révision 4 lui superpose uniquement le logo simplifié dans l’en-tête, pour sa lisibilité en miniature.

## Intention visuelle et sonore

Papier ivoire, encre, cobalt Guteneo. Le véritable timbre tramé `gutenberg-portrait-stamp.webp` est conservé pour les grandes présentations, notamment le final de 425 unités. En miniature (taille optique de 80 unités ou moins dans une scène de 1080 de large, soit environ 27–33 points sur les iPhone ciblés), le composant utilise le véritable logo simplifié `guteneo-mark.png`, sans reconstruction. Les timbres restent oblitérés. Le PNG de capture web reste intact ; seul son minuscule logo d’en-tête est remplacé par une couche Remotion avec le logo simplifié. Le panorama bleu de Luxembourg du footer apparaît une seule fois, dans la séquence Europe, à son ratio natif avec recadrage et mouvement de caméra modérés.

Compteur numérique, documents en perspective, arrivées de lettres, personnalisation des prénoms, panneaux rapides, zooms, déplacement panoramique, bascule web/app dans un iPhone et envols d’hirondelles issus du footer. Les timbres portent le cachet postal de Luxembourg du footer, avec son grain d’encre et ses vagues d’oblitération. Les textes essentiels restent dans une zone protégée des commandes latérales et de la légende des formats sociaux (marges latérales de travail 80/160 px ; contenu principal au-dessus de 1 600 px).

La musique originale synthétisée à **120 BPM** dure 56 s. Le clap et la mention « fin » ont été supprimés ; la signature musicale du logo démarre à **51 s**, après la signature typographique sur fond bleu. Sources, partition, niveaux et provenance : `public/audio/vertical-provenance.md`.

## Montage

| Temps | Plan |
| --- | --- |
| 0–3 | Tout part d'un document |
| 3–6 | Changement d'échelle, 1 → 10 000+ |
| 6–10 | Campagnes simples ou ultra-personnalisées |
| 10–14 | PDF existant ou modèle |
| 14–18 | ChatGPT, Claude, Copilot |
| 18–23 | L'assistant crée le PDF et prépare l'envoi |
| 23–29 | Bon à tirer, destinataire et devis avant accord |
| 29–35 | Fax, courrier, e-mail classique et chiffré |
| 35–40 | Europe et Luxembourg bleu |
| 40–44 | Impression, remise de courrier, fax — trois plans photographiques |
| 44–49 | Site web puis concept de l'application iOS |
| 49–51 | La suite de vos mots, signature typographique ivoire sur fond bleu et hirondelles |
| 51–56 | Envol discret, timbre tramé oblitéré et guteneo.com ; les oiseaux quittent le cadre avant la tenue finale |

## Reproduire ou modifier

Depuis `videos/guteneo-film` :

```sh
npm ci
npm run dev
npm run lint
npm run render:iphone:pro
npm run render:iphone:pro-max
# Variante sociale 9:16
npm run render:vertical
```

Compositions Studio : **Guteneo-iPhone-18-Pro**, **Guteneo-iPhone-18-Pro-Max**, **Guteneo-Vertical-Vision**. Sources : `src/vertical/`. Une version rapide est disponible via `npm run render:vertical:review`.

Les images finales, polices locales, logos et audio sont embarqués dans `public/`. Aucun accès à un compte ou service métier n'est nécessaire pour le rendu. L'image verticale de lettres a été générée pour ce spot ; prompt et provenance : `public/vertical/PROVENANCE.md`. Aucun achat de logiciel, plugin ou service tiers supplémentaire.

## Vérifications

Lint et TypeScript du projet vidéo ; contrôles de cadrage sur des images extraites du montage ; audit indépendant des zones de lecture et du rythme ; synchronisation des 1 680 frames avec la piste audio ; contrôle du codec, des dimensions, des pistes, du ratio de pixel et décodage intégral des MP4 finaux. Les exports natifs sont contrôlés sur leurs images rendues ; aucune lecture sur iPhone physique n’est revendiquée. La vérification audio est technique, sans revendication d'écoute humaine.
