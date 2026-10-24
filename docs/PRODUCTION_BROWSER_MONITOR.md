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

Le pilote Node demande `Accept-Encoding: identity` et `Cache-Control: no-transform`
sur ces seules destinations fixes. Le collecteur vérifie toujours les octets
reçus et leur SHA-256 contre le manifeste : ignorer ces en-têtes, transformer
une page ou servir une variante ne peut pas faire passer un écart. Aucun
second essai automatique ne remplace une observation échouée. Pour un écart de
taille ou d’empreinte, le journal CI contient seulement le chemin public fixe,
les tailles et empreintes attendues/reçues, et un encodage issu d’une liste fermée.
L’encodage de réponse est distinct des octets décodés observés par Node. Ces
diagnostics restent hors du corps signé, dont le schéma demeure inchangé.

Cette requête ne peut pas, à elle seule, interdire une transformation Cloudflare.
La [documentation de compression](https://developers.cloudflare.com/speed/optimization/content/compression/#content-length-header-handling)
exige `no-transform` dans la **réponse de l’origine**. Le candidat d’application
l’ajoute donc au `Cache-Control` existant des seuls HTML publics canoniques
réussis et de leurs réponses conditionnelles 304. Il conserve les autres
directives, octets, ETag, encodages déjà présents et cadrages de réponse ; les
API, sessions, requêtes privées, fichiers JS/CSS/images/vidéos et hôtes de repli
ne gagnent aucune règle de cache. Aucun script n’est retiré avant comparaison.
La [documentation Web Analytics](https://developers.cloudflare.com/web-analytics/get-started/#sites-proxied-through-cloudflare)
précise que `public, no-transform` empêche l’injection automatique de sa balise
et que le mode excluant l’UE n’injecte pas cette balise aux visiteurs européens.
Ce garde nécessite la publication de l’application ; un changement du seul
pilote Node ne suffit pas. Il peut aussi empêcher une recompression CDN de ces
HTML : bande passante et latence servies restent à observer après publication,
sans en déduire une facture fixe ou une gratuité.

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
- `job_workflow_ref` et `job_workflow_sha` tous deux absents dans l’ancien
  format, ou couple exactement égal au workflow canonique ci-dessus sur main
  et au commit du runner ; aucune autre paire, valeur partielle ou nulle ;
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

Un refus de publication reste un échec. Son diagnostic distingue contexte
autorisé, obtention OIDC et ingestion, avec un statut HTTP et un code serveur
explicitement autorisé ; toute autre réponse devient `UNKNOWN`. Les lectures
de réponse sont bornées en octets et à cinq secondes. Les erreurs libres,
URL OIDC, JWT, en-têtes et corps amont ne sont jamais imprimés. La présence de
l’artefact, écrit avant l’ingestion, ne prouve pas que le statut l’a enregistré.

Après un vrai `401 REPORT_REJECTED` seulement, le pilote peut produire un
diagnostic OIDC à clés fixes : comparaisons booléennes explicitement **non
vérifiées**, puis résultat fermé d’une unique exécution du même vérifieur que
le serveur. Les clés publiques GitHub conservent leur délai de cinq secondes
et le diagnostic entier expire en six secondes. Il ne demande pas de nouveau
JWT, ne répète pas le POST et ne change aucune autorité du Worker. Le refus
initial reste l’échec final, même si la vérification locale réussit. Aucun
contenu de claim, JWT/JWK, URL, en-tête, corps ou exception libre n’est publié.

## Première observation hébergée — 24 octobre 2026

Le Worker de statut `b0d2ed61-227c-47d3-8f09-57b0545fb568` a été publié depuis
`4f033e2f233ee2960a579eef839191531e6f8b8d`, avec les vingt fichiers publics
et la configuration d’en-têtes vérifiés. Le run GitHub
[`40128432279`, tentative 1](https://github.com/nclsppr/guteneo/actions/runs/40128432279)
a échoué : les quatorze contrôles navigateur ont réussi et sept comparaisons
HTTP de pages ont signalé `CONTENT_LENGTH_MISMATCH`, soit **21/28 réussis**.
Le rapport expurgé porte le SHA-256
`ee8159896ada1b413a9e37d3c3d31bb511cba8b8da220ec47c2ca0fa167a9daf`.
Son ingestion n’est pas qualifiée ; `latest` était nul après cette tentative.
Le collecteur exact et les variantes d’encodage passaient ensuite depuis le
Mac : cela ne prouve pas la cause de l’écart depuis le runner GitHub. Le
correctif de transport/diagnostic doit encore être qualifié par un nouveau run
autorisé après revue et CI ; aucun succès de production n’en est déduit.

Qualification locale du correctif : **117 tests ciblés réussis** (36 ingestion/
publication, 51 collecteur/historique, 30 transport/confidentialité/délais), neuf
tests du circuit de publication statut, typecheck, lint ciblé et atlas généré.
Une lecture publique depuis le Mac avec le nouveau transport passe 14/14 HTTP
sur l’application `4f033e2` ; elle ne constitue ni une nouvelle tentative GitHub
ni une preuve d’ingestion hébergée. Les tests simulent aussi l’ingestion complète
d’un rapport `attention` à sept écarts, avec audience liée à son corps exact.

La seconde observation réelle,
[`40131421762`, tentative 1](https://github.com/nclsppr/guteneo/actions/runs/40131421762),
utilisait le runner `1d23931d37407d7fd9fcd5291cbd6dbc8e17f1ef` et l’application
`4f033e2`. Elle a également échoué à **21/28** : les sept HTML reçus en
`identity` avaient chacun exactement **367 octets supplémentaires**. Le dépôt
du rapport a ensuite reçu `401 REPORT_REJECTED`. Ce refus d’ingestion est un
problème distinct de l’écart HTTP. La transformation HTML automatique est une
hypothèse cohérente avec la documentation et l’écart UE/runner ; la projection
ne conserve pas le HTML et n’identifie pas à elle seule la balise ajoutée.
Le nouveau garde d’origine reste à publier puis qualifier depuis le runner.
Localement, 94 tests du périmètre assets et deux tests réels workerd/Static Assets
passent ; ils vérifient notamment les quatre langues, GET/HEAD/304, les octets,
ETag, directives existantes et l’absence d’élargissement des caches privés/API.

Un diagnostic GitHub isolé sur branche, run
[`40132056947`](https://github.com/nclsppr/guteneo/actions/runs/40132056947), a
ensuite vérifié la signature et les prédicats bornés d’un JWT de job direct :
`job_workflow_ref` est présent et égal à `workflow_ref`, et
`job_workflow_sha` est égal au SHA du job. Aucune requête de production n’a été
émise par ce diagnostic et aucun JWT n’a été conservé dans sa projection.
Le garde précédent refusait cette forme dès qu’il voyait `job_workflow_ref`.
Le correctif du serveur accepte désormais uniquement l’absence des deux champs
ou le couple exact du workflow de production sur main et du commit attendu ;
les autres critères de signature, audience liée au corps, dépôt/IDs, branche,
événement, fraîcheur et anti-rejeu restent obligatoires. Le fichier ou SHA
étranger, le couple partiel et les valeurs nulles sont refusés. Cette adaptation
requiert aussi une publication du Worker de statut ; le diagnostic sur branche
ne prouve aucune ingestion de production. Application et statut doivent donc
être publiés et qualifiés séparément, puis le rapport doit prouver 28/28 et son
stockage exact avant tout succès déclaré.
La qualification ciblée de cette règle et du diagnostic passe **114/114 tests
locaux** : 52 d’intégration statut, 32 du diagnostic OIDC et 30 du transport/
projection. Ces JWT RS256 sont synthétiques et vérifiés hors réseau ; ils ne
constituent pas des comptes, une nouvelle exécution GitHub ou une ingestion
de production. La CI de la tête finale et les publications restent distinctes.

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
publics et du bilan des quatorze sondes Cron. Les comptes de recette dédiés,
leur accès CI protégé et les fixtures métier préapprouvées restent à qualifier.
Le profil live `verified_account` ne requiert pas de passkey ou de MFA ;
leur absence ne constitue pas le blocage de cette suite.
Le rapport anonyme ne peut pas déclarer ce cycle réussi. Une future suite
authentifiée nécessite un job protégé et un schéma de preuve distinct ; elle
ne doit jamais publier de JWT, capture de document, trace, état de session ou
détail de compte. Voir `PRODUCTION_TEST_ACCOUNTS.md` pour l’étude correspondante.
