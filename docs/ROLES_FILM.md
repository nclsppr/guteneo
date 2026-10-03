# Présentation vidéo des rôles

Le guide public `/roles/` présente les quatre rôles en français, anglais,
allemand et luxembourgeois avec **Manon Eleven v4**. Le lecteur, le poster et
les sous-titres suivent la langue du site et la préférence du compte. La durée
affichée vient du catalogue réel : elle varie avec le débit naturel de la langue.
Le format reste horizontal sur tous les écrans. Lecture au clic, contrôles
natifs, plein écran et reprise après erreur utilisent le lecteur de l’accueil.

Les phrases décrivent les droits du contrat `packages/contracts/src/roles.ts`
et de `WORKSPACE_ROLES.md` : l’administrateur gère et approuve ; le superviseur
prépare, avec approbation et rapports en options indépendantes désactivées par
défaut ; l’opérateur importe et prépare sans approuver ; l’observateur consulte
sans modifier ni approuver. Dans le parcours standard, une personne habilitée
approuve dans le navigateur. Le film ne modifie aucun droit ni migration.

## Narration et montage

La méthode C génère trois blocs de deux paragraphes complets, après l’action
native ElevenLabs **Améliorer**. La seconde variation du plugin est retenue,
avec les IDs et MP3 réels. Les ajustements de balises après Enhance restent
explicites dans la preuve. Les six coupes PCM24 conservent la totalité des trois
prises à leur débit original. Les scènes suivent la voix, sans accélération.
Les compositions éditables sont `Guteneo-Roles-{FR,EN,DE,LB}-Natural-C`.

La vidéo FR approuvée par l’utilisateur conserve ses octets et son chemin V3,
soit **44,8667 secondes**. Les autres films utilisent V4. Les fichiers et leurs
durées figurent dans [VIDEO_NARRATION_PUBLISHED.md](VIDEO_NARRATION_PUBLISHED.md).
Les compositions historiques de 36 secondes restent des archives.

| Début de scène FR | Message |
| --- | --- |
| 0 s | Découvrons les quatre rôles et les droits de chacun |
| 4,53 s | L’administrateur gère l’atelier, prépare, approuve et consulte les rapports |
| 11,60 s | Le superviseur prépare ; approbation et rapports sont distincts et désactivés par défaut |
| 19,27 s | L’opérateur importe et prépare, sans approuver |
| 25,13 s | L’observateur consulte, sans modifier ni approuver |
| 34,33 s | Une personne autorisée approuve dans le navigateur |
| 39,87–44,87 s | Même timbre officiel et guteneo.com, cinq secondes sans voix |

Chaque langue réutilise directement `src/landscape/End.tsx` et le même logo V5
pendant cinq secondes sans narration. La musique reste au gain constant **0,22**,
y compris entre les phrases et au logo ; sa cadence et son fondu final sont
conservés. Les snapshots sont immuables et le rendu n’appelle aucun fournisseur.

```sh
npm run videos:render -- --kind roles
```

Les actifs sont `guteneo-roles-v3-fr.mp4` et
`guteneo-roles-v4-{en,de,lb}.mp4`, H.264/AAC stéréo, 1920 × 1080, 30 images/s,
avec posters WebP, pistes VTT locales et démarrage rapide. Le manifeste public
inclut exactement ces quatre vidéos avec les huit introductions. La diffusion
ne déclenche aucun envoi réel. Les preuves techniques des langues nouvelles ne
sont pas présentées comme une écoute humaine.

Les tests du lecteur vérifient les fichiers réels, leur progression et le saut
vers la conclusion dans chaque langue. Sous Linux, la CI utilise le sélecteur
WebKit officiel `WEBKIT_GST_USE_PLAYBIN3=1` : le pipeline GStreamer historique
bloquait trois fichiers à environ 0,14 seconde malgré leur décodage complet par
FFmpeg et leur lecture dans Safari natif. Le pipeline actuel lit les octets
originaux ; les assertions et les médias restent identiques. Ce réglage concerne
le navigateur de test Linux, pas le lecteur publié ni Safari macOS/iOS.

Source du sélecteur :
[`MediaPlayerPrivateGStreamer.cpp`](https://github.com/WebKit/WebKit/blob/4d05d732e5a84f32675bef4cc135a2e7a9269a87/Source/WebCore/platform/graphics/gstreamer/MediaPlayerPrivateGStreamer.cpp).

Les rôles et invitations sont déjà publiés dans la version `8b060bb` (PR #37).
Cette mise à jour ajoute les médias localisés et leur lecture à cette base,
sans modifier les permissions ni ajouter de migration. Les migrations 0042 et
0043 et les contrôles propres aux rôles restent décrits dans
`WORKSPACE_ROLES.md`. La préparation locale et la preuve de publication sont
distinctes ; publier les vidéos ne déclenche aucun envoi réel.
