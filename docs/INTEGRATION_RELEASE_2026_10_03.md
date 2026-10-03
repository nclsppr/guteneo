# Intégration du 3 octobre 2026

La demande utilisateur autorise la vérification des PR, leur intégration dans
`main`, les tests du commit fusionné puis le déploiement. La demande complémentaire
impose un arbre technique de toutes les fonctionnalités et de tous les parcours,
avec une vue immédiate des droits, exclusivement dans la documentation du dépôt.

## Inventaire et frontières

| PR | Contenu | Source conservée |
| --- | --- | --- |
| #43 | Partage multilingue et boutons lecture | `c232f2e` ; fusionnée dans `5417aa0` après CI complète réussie |
| #38 | Métadonnées des skills et garde-fous e-mail | `fde084a` ; ascendance conservée dans le candidat #41 |
| #41 | Horizon et diagnostic PDF | `f46aae9` ; correction de l’entrée publique et intégration avec #43 |
| #47 | Atlas technique, droits, parcours et règle de maintenance | `417c414` ; ascendance conservée dans le candidat #41 |

Le candidat #41 réunit les trois sources restantes avec leurs commits parents,
sans squash ni remplacement de leurs fonctionnalités. Le seul conflit plugin
concerne les notes de version : conserver le paquet 0.3.2, les diagnostics PDF,
les limites de consentement et les garde-fous e-mail/reviewer.

Le serveur reste fermé pour Horizon sans `HORIZON_ENABLED=true` et service privé
`PDF_VALIDATOR` qualifié. Les migrations additives 0050–0051 doivent être appliquées
avant une publication du backend qui consulte ces tables. Merge et déploiement
applicatif ne qualifient ni le validateur hébergé, ni les obligations commerciales,
ni les achats récurrents. Les canaux, mandats et envois réels ont leurs autorités
distinctes ; aucun n’est activé ou exécuté par cette intégration.

## Régression d’intégration corrigée

Sur la première base actualisée d’Horizon, les suites desktop et iPhone ont
signalé `#/app/plan` comme ancre publique sans cible. L’offre utilise désormais
`/app/plan`, une entrée privée explicite servie avec `no-store` et
`noindex, nofollow`, puis transmise au routeur existant. Les tests conservent
l’exigence de cibles réelles pour les liens de fragments publics, sans exception
pour masquer le défaut.

Les assertions serveur couvrent GET/HEAD et le refus de mutations dans la
maquette ; le parcours navigateur couvre clic, route, reload et absence de
requêtes backend dans la maquette. La correction a été retestée après intégration
de #43 : 147 assertions unitaires (entrées publiques, abonnement et diagnostics)
et deux parcours navigateur desktop réussis.

## Documentation et rôles

L’[atlas technique](FEATURE_MAP.md) décrit 16 domaines, 118 fonctionnalités et
15 parcours, avec contrats, sources, interfaces et tests. La [vue HTML](FEATURE_MAP.html)
est autonome, responsive et recherchable. Le contrat actuel comporte quatre
rôles humains ; la cinquième colonne décrit l’acteur assistant OAuth sans créer
une cinquième valeur d’adhésion. Les options Approbation et Rapports du superviseur
restent indépendantes. La propriété des données, modèles et PDF privés prime sur
un droit générique de consultation de l’atelier.

`AGENTS.md` et le modèle de PR imposent la mise à jour de l’arbre, des droits et
des parcours dans chaque changement de fonctionnalité. Les vues sont générées
depuis une même source JSON. Aucun fichier de cet atlas n’est intégré aux assets,
à la navigation ou au générateur du site officiel.

## Vérification et publication

La CI complète doit réussir sur le candidat final, puis sur le commit fusionné
dans `main`. Les preuves ciblées et historiques ne remplacent pas ces deux gates.
Le contrôle de publication exige `main` propre, synchronisé avec `origin/main`,
ainsi que des assets et un manifeste correspondant exactement aux sources.

Cet environnement cloud n’a actuellement aucune identité ni secret Cloudflare
configuré ; `wrangler whoami` confirme l’absence d’authentification. Aucun
déploiement, changement distant de schéma ou service privé n’est revendiqué.
Après configuration sécurisée d’un accès autorisé, appliquer la procédure
[MAIN_RELEASE.md](MAIN_RELEASE.md), contrôler ledger/bookmark/intégrité D1,
puis vérifier le manifeste, les assets et la santé sur les deux hôtes applicatifs.
