# Documentation développeurs Guteneo

Commencer par l’[atlas technique](FEATURE_MAP.md) : arbre des fonctionnalités, matrice des droits et parcours clients, avec liens vers le code et les contrats détaillés.

Pour une lecture visuelle, ouvrir [FEATURE_MAP.html](FEATURE_MAP.html) localement dans un navigateur. La vue est autonome, responsive, recherchable et imprimable. Les cinq colonnes distinguent quatre rôles humains et l’acteur assistant connecté ; elles ne créent aucun droit supplémentaire.

La source éditable est [feature-map.json](feature-map.json). Après modification :

```sh
node docs/build-feature-map.mjs
node docs/build-feature-map.mjs --check
```

La CI refuse des vues générées périmées, une matrice incohérente, des références manquantes ou des parcours incomplets. La revue vérifie la couverture sémantique des changements.

Chaque feature ajoutée, modifiée ou retirée exige la mise à jour de l’arbre, des permissions et des parcours affectés dans la même PR, conformément à [AGENTS.md](../AGENTS.md). Conserver conditions d’entrée, résultat, erreurs/reprise, confidentialité, disponibilité, code, contrat et preuves de tests. L’activation d’un service et sa publication restent des faits distincts de son implémentation.

Cette documentation reste dans le dépôt : aucun de ces fichiers n’est intégré au site officiel.

| Besoin | Référence |
| --- | --- |
| Comprendre toute l’offre et les parcours | [Atlas](FEATURE_MAP.md) |
| Vérifier les droits d’atelier | [Rôles](WORKSPACE_ROLES.md) |
| Concevoir les changements | [Architecture](ARCHITECTURE.md), [modèle de données](DATA_MODEL.md) |
| Intégrer web, API ou assistant | [Contrat API](API_CONTRACT.md), [identité MCP](IDENTITY_MCP.md), [studio](TEMPLATES_DATA_DISTRIBUTION.md) |
| Vérifier et publier | [CI](CI.md), [publication depuis main](MAIN_RELEASE.md), [migrations](D1_MIGRATION.md) |
| Ouvrir Horizon sur les crédits disponibles | [Décision d’ouverture](HORIZON_OPENING_2026_10_03.md), [qualification et activation](HORIZON_ACTIVATION_RUNBOOK.md) |
| Dimensionner Horizon et suivre ses coûts | [Tarifs, hypothèses et mesures](HORIZON_COSTS.md) |
| Exploiter et diagnostiquer | [Runbook](RUNBOOK.md), [restauration](RESTORE_PROOF.md), [preuves datées](TEST_RESULTS.md) |
