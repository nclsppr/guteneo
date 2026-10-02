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
originale de Guteneo, avec sa cadence de fin, sans voix.

```sh
npm run videos:render -- --kind roles
```

Les exports sont `apps/web/public/videos/guteneo-roles-v1-{fr,en,de,lb}.mp4`,
H.264/AAC stéréo, 1920 × 1080, 30 images/s, avec posters WebP et démarrage rapide.
Le manifeste commun inclut ces quatre vidéos dans sa liste publique exacte.

Les rôles et invitations sont déjà publiés dans la version `8b060bb` (PR #37).
Cette mise à jour ajoute les médias localisés et leur lecture à cette base,
sans modifier les permissions ni ajouter de migration. Les migrations 0042 et
0043 et les contrôles propres aux rôles restent décrits dans
`WORKSPACE_ROLES.md`. La préparation locale et la preuve de publication sont
distinctes ; publier les vidéos ne déclenche aucun envoi réel.
