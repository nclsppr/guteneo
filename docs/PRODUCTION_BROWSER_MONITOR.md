# Observations navigateur de production

Le candidat `.github/workflows/production-e2e.yml` exécute une observation toutes
les six heures, à la minute 17, sur `main`. Un lancement manuel est possible sur
la même branche. Une planification GitHub peut être retardée ; elle ne remplace
pas le collecteur Cloudflare existant toutes les quinze minutes.

Ce changement est préparé dans les sources. Sa présence locale ne prouve ni
une exécution GitHub ni l’installation de la migration ou du Worker en production.
Il n’installe aucun secret, compte ou infrastructure payante et ne publie rien
pendant un lancement local.

## Périmètre réellement exécuté

Le framework `e2e` 0.21.3 et son moteur `@e2e-dev/web` 0.15.3 ouvrent les sept
pages publiques fixes dans Chromium, aux largeurs 1440 et 390 pixels. Les tests
vérifient les repères visibles, la langue et l’absence de débordement horizontal.
Ces deux fenêtres ne constituent pas une qualification de téléphone physique.
Quatorze lectures HTTP indépendantes contrôlent aussi les empreintes des pages,
le manifeste, les contrats publics et les refus anonymes attendus.

Chaque rapport contient exactement **28 contrôles**. Le pilote lit la version
servie avant et après le parcours. Un changement pendant l’exécution reste
inconnu. Aucun contrôle ne se transforme en succès faute de résultat.

Le moteur refuse les mutations HTTP, l’authentification, les destinations
externes et les ressources autres que les pages et fichiers publics fixes.
Il ne clique aucun bouton métier. Aucun e-mail, fax, courrier, achat, devis,
import, scan hébergé ou rendu payant n’est lancé. La télémétrie et les modèles
sont désactivés. Aucune capture, vidéo ou trace n’est demandée. Les preuves
brutes du framework sont éphémères et supprimées avant publication ; seul le
rapport strictement nettoyé est conservé dans l’artifact GitHub.

Pour une lecture publique ponctuelle sans publication :

```sh
E2E_TELEMETRY_DISABLED=1 npx --no-install e2e-web install chromium
E2E_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 node --import tsx scripts/production-e2e.ts
```

Le fichier local `test-results/production-e2e/sanitized-report.json` marque
explicitement `execution: local_read_only_observation` et n’invente pas
d’identifiant de run GitHub. Il ne satisfait pas le contrat d’ingestion signé.

## Autorité du dépôt et intégrité du rapport

`POST https://status.guteneo.com/api/e2e-reports` accepte uniquement une preuve
GitHub OIDC signée, jamais un secret partagé de Cloudflare. La politique fixe :

- issuer `https://token.actions.githubusercontent.com`, signature RS256 et clés
  publiques GitHub obtenues à une adresse fixe ;
- dépôt `nclsppr/guteneo`, ID numérique **1373468624**, propriétaire **9432084** ;
- fichier `.github/workflows/production-e2e.yml` sur `refs/heads/main` ;
- événement `schedule` ou `workflow_dispatch`, runner hébergé par GitHub ;
- mêmes SHA de workflow, SHA du runner, run et tentative que dans le rapport ;
- JWT récent et observation bornée à dix minutes.

L’audience contient le SHA-256 du corps exact. Elle lie donc aussi le nonce,
les résultats, la version servie et le numéro de tentative. Modifier une valeur
après émission du JWT invalide l’audience. Une seule écriture est permise par
run/tentative ; nonce et identifiant de JWT sont également uniques. Une nouvelle
tentative ne peut pas réécrire l’échec précédent. Le schéma refuse les champs
inconnus, les contrôles manquants et tout texte libre. Aucun JWT, nom de compte,
destinataire, contenu, capture ou état de session n’est admis dans le rapport.

Référence de la politique : [GitHub, OpenID Connect reference](https://docs.github.com/en/actions/reference/security/oidc).
Les IDs du dépôt ont été relus par l’API GitHub le 24 octobre 2026.

## Lecture publique et conservation

`GET /api/e2e-status` ne lance aucun test. Il rend les vingt derniers résumés,
les détails du dernier rapport et un état propre à ce périmètre. Le rapport
reste frais pendant huit heures. Son SHA de production doit correspondre à la
dernière mesure Cron, elle-même récente de moins de trente minutes. Absence,
retard, changement de version ou exécution interrompue donnent un état neutre
`unknown`. Un échec observé sur une version courante reste `attention`.

Les rapports sont stockés dans la base D1 indépendante du statut, migration
`apps/status/migrations/0002_production_e2e.sql`, avec une rétention de 366 jours
et une purge bornée. Aucun événement métier ou document client n’y est lié.
La publication exige le circuit existant de déploiement du statut et la fusion
autorisée du workflow. Aucun de ces actes n’est effectué par les tests locaux.

## Parcours authentifiés

Le résultat `authenticated.status: blocked` est indépendant des 28 contrôles
publics et du bilan des quatorze sondes Cron. Les comptes forts dédiés, les
passkeys réelles et les fixtures métier préapprouvées restent à qualifier.
Le rapport anonyme ne peut pas déclarer ce cycle réussi. Une future suite
authentifiée nécessite un job protégé et un schéma de preuve distinct ; elle
ne doit jamais publier de JWT, capture de document, trace, état de session ou
détail de compte. Voir `PRODUCTION_TEST_ACCOUNTS.md` pour l’étude correspondante.
