# Présentation vidéo des rôles

Le guide public `/roles/` contient une vidéo commune de **36 secondes**, en
français, anglais, allemand et luxembourgeois. Le lecteur et son poster suivent
la langue active du site et la préférence du compte. Lecture au clic, contrôles
natifs, plein écran, reprise après erreur et présentation textuelle restent
accessibles. La vidéo de rôles utilise le format horizontal sur tous les écrans.

| Temps | Message |
| --- | --- |
| 0–3 s | Quatre rôles, des droits clairs |
| 3–9 s | Administrateur : accès, facturation, préparation, approbation et rapports |
| 9–15 s | Superviseur : préparation ; approbation et rapports en options indépendantes, désactivées par défaut |
| 15–21 s | Opérateur : importe et prépare ; validation par un administrateur ou superviseur habilité |
| 21–27 s | Observateur : lecture des documents, destinataires et suivi, sans modification |
| 27–31 s | Parcours standard : validation navigateur du contenu, destinataire, options et coût |
| 31–36 s | Conclusion V5 inchangée : timbre officiel tramé et oblitéré, `guteneo.com` |

Les droits montrés proviennent du contrat existant
`packages/contracts/src/roles.ts` et de `docs/WORKSPACE_ROLES.md`. La vidéo
n’attribue aucun droit. Elle ne présente pas l’observateur comme un accès à des
données anonymisées. Le parcours standard est distingué de la délégation expert,
qui conserve ses règles propres dans la documentation.

Les sources éditables sont `videos/guteneo-film/src/roles/`, avec quatre
compositions `Guteneo-Roles-FR`, `EN`, `DE` et `LB`. La séquence finale réutilise
directement `src/landscape/End.tsx` ; le logo est le même composant et le même
média que dans le spot V5. La musique est un montage reproductible de la partition
originale de Guteneo, avec sa cadence de fin. Les versions française et anglaise ajoutent la
narration masculine ElevenLabs en génération 2 ; les autres langues restent
instrumentales. Voir [VIDEO_NARRATION_PUBLISHED.md](VIDEO_NARRATION_PUBLISHED.md).

```sh
npm run videos:render -- --kind roles
```

Cette commande rend les bases musicales V1, puis remixe les voix FR/EN du
snapshot suivi `narration/releases/fr-en-g2/` vers les exports actifs V2 avec
leurs sous-titres. Elle ne contacte pas ElevenLabs et ne modifie pas le snapshot.
La qualification Génération 2, les hashes et le calage précèdent les écritures
publiques ; un cache invalide bloque le rendu.

Les exports actifs sont `apps/web/public/videos/guteneo-roles-v1-{de,lb}.mp4`
et `guteneo-roles-v2-{fr,en}.mp4`,
H.264/AAC stéréo, 1920 × 1080, 30 images/s, avec posters WebP et démarrage rapide.
Le manifeste commun inclut ces quatre vidéos dans sa liste publique exacte.

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
