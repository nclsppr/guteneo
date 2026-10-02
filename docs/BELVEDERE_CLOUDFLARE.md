# Belvédère — Cloudflare en lecture seule

Le connecteur local interroge un compte et un Worker configurés côté serveur.
Il ne provisionne rien, ne déploie rien et n'active aucun accès distant.
Sa qualification repose sur des réponses simulées au format de l'API ; un
compte Cloudflare réel n'a pas été interrogé pendant ces tests.

## Configuration après autorisation d'activation

| Variable serveur                     | Valeur attendue                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `BELVEDERE_CLOUDFLARE_ACCOUNT_ID`    | Identifiant du seul compte Guteneo, 32 caractères hexadécimaux                               |
| `BELVEDERE_CLOUDFLARE_SCRIPT_NAME`   | Nom exact du Worker à observer, sans route ni URL                                            |
| `BELVEDERE_CLOUDFLARE_API_TOKEN`     | Secret Cloudflare limité à **Account / Account Analytics / Read** et au seul compte Guteneo  |
| `BELVEDERE_CLOUDFLARE_BILLING_TOKEN` | Secret distinct limité à **Account / Billing / Read** et au seul compte Guteneo ; facultatif |

Cloudflare documente les [jetons Analytics et leur permission en lecture](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/).
Ne pas réutiliser une clé globale, un jeton de déploiement ou un compte externe.
Ne pas placer le jeton dans une variable `VITE_*`, une URL, le dépôt, les logs ou
le navigateur. Le compte et le script sont également des paramètres serveur :
l'utilisateur de l'API ne peut pas en choisir d'autres.

L'API Belvédère doit vérifier son identité navigateur privilégiée avant
d'appeler `getBelvedereCloudflareMetrics`. Le résultat doit être servi avec
`Cache-Control: no-store`. L'adaptateur ne conserve aucune donnée dans D1, R2,
KV, un cache externe ou un fournisseur tiers.

## Données effectivement implémentées

Un seul POST de lecture vers `https://api.cloudflare.com/client/v4/graphql`
interroge `viewer.accounts.workersInvocationsAdaptive`, avec les filtres
`accountTag`, `scriptName`, `datetime_geq` et `datetime_lt`. La fenêtre vaut
strictement les dernières **24 heures** ou **7 jours**. Le
[tutoriel Workers officiel](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/)
décrit ce dataset, ses sommes et quantiles. La
[référence GraphQL du dépôt officiel Cloudflare](https://github.com/cloudflare/skills/blob/main/skills/cloudflare/references/graphql-api/api.md)
confirme les dimensions horaires et les quantiles de wall time utilisés ici.

- Requêtes, erreurs d'invocation et sous-requêtes sur la fenêtre entière.
- Proportion d'erreurs d'invocation parmi les requêtes.
- Wall time p50 et p99 en millisecondes, calculés par Cloudflare sur la période
  entière, dans une sélection distincte sans dimension temporelle.
- Série horaire de requêtes, erreurs et sous-requêtes, limitée à 169 intervalles
  possibles pour sept jours glissants. Les heures absentes restent absentes.

Les percentiles horaires ne sont jamais moyennés. Aucun coût n'est extrapolé à
partir d'un percentile multiplié par un nombre de requêtes. Les
[métriques Workers](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)
distinguent wall time, latence de réponse et statut HTTP : une erreur
d'invocation n'est donc pas une réponse HTTP 4xx/5xx. Les quantiles sont issus
d'échantillons et la télémétrie peut arriver avec un délai. Le résultat expose
`sampled: true` et ses bornes temporelles ; ce n'est pas un journal exhaustif.

Les pays des membres proviennent des événements d'authentification Guteneo.
Le code de datacenter `coloCode` de Cloudflare n'est pas le pays d'un membre ;
ce connecteur ne mélange pas ces deux sources.

## États et limites

| État             | Signification                                                                |
| ---------------- | ---------------------------------------------------------------------------- |
| `ok`             | Réponse validée, compteurs et série présents                                 |
| `not_configured` | Paramètre absent ou invalide, aucun appel réseau                             |
| `forbidden`      | Refus HTTP 401/403 ou erreur GraphQL d'authentification reconnue             |
| `no_data`        | Dataset valide mais aucune invocation observée                               |
| `unavailable`    | Délai, quota, erreur de schéma, réponse incohérente ou autre indisponibilité |

La réponse complète est bornée à 128 Kio et huit secondes, corps compris.
Les redirections et les nouvelles tentatives automatiques sont désactivées.
Les [erreurs GraphQL peuvent accompagner un HTTP 200](https://developers.cloudflare.com/analytics/graphql-api/errors/) :
toute erreur rend les données partielles inutilisables. Les corps et messages
du fournisseur ne sont jamais renvoyés au navigateur ni journalisés. Une
indisponibilité ne devient jamais un compteur nul.

`billing.status: unavailable` signifie **dépense d'infrastructure non
rapprochée**. `amountMinor` et `currency` restent `null`. Les métriques ne
constituent ni une facture ni une preuve de marge nette.

## Coûts d'usage déclarés par Cloudflare

Le second adaptateur `getBelvedereCloudflareBilling` utilise un secret de
facturation distinct et un seul GET vers
`/accounts/{account_id}/billable-usage`. Il prend le **cycle de facturation en
cours**, indépendamment de la fenêtre des métriques Workers. La
[référence v1](https://developers.cloudflare.com/api/resources/billing/subresources/usage/methods/get_account_usage_v1/)
précise qu'un filtre `from`/`to` excluant le jour d'ancrage de l'abonnement
retourne un résultat vide : demander arbitrairement sept jours produirait une
absence de coûts trompeuse. Aucun paramètre temporel arbitraire n'est exposé.

La [présentation officielle de Billable Usage](https://blog.cloudflare.com/billable-usage-api/)
documente `ContractedCost` dans `BillingCurrency`, les périodes de charge et les
sous-totaux cumulatifs. Le connecteur additionne exclusivement `ContractedCost`,
jamais `CumulatedContractedCost`, et conserve les devises séparées. Il restitue
des sous-totaux par service et par devise, avec les premières et dernières
dates des périodes de charge observées. Les noms de compte, zone, abonnement,
descriptions détaillées et URL de facture ne sont pas renvoyés.

Chaque jeton numérique `ContractedCost` est conservé sous forme décimale avant
la conversion JSON en nombre binaire. Le calcul utilise `BigInt`, avec jusqu'à
18 décimales dans l'unité monétaire principale. Les sous-centimes sont
additionnés exactement ; chaque sous-total d'affichage est ensuite arrondi une
fois au centime le plus proche, les demi-centimes vers le haut. La réponse
fournit l'entier `amountMinor`, la chaîne décimale exacte
`reportedAmountDecimal` et `rounding: nearest_minor_half_up`. Ainsi la somme des
lignes affichées peut différer d'un centime du total arrondi après addition.
EUR et USD sont acceptés ; une autre devise rend le résultat indisponible
plutôt que d'inventer son nombre de décimales ou un taux de conversion.

La lecture est bornée à huit secondes, 512 Kio et 2 000 lignes. Des périodes
dupliquées ou incohérentes, un autre compte, des corrections, un coût négatif,
une précision non représentable ou un dépassement d'entier sûr rendent
l'ensemble indisponible. Le contrat couvre les cycles mensuels courants :
les cycles de plus de 62 jours et les périodes de charge de plus de 31 jours
nécessitent une extension explicite. Aucun sous-total partiel n'est présenté
comme complet. Une réponse vide est `no_data`, distincte d'un coût nul validé.

La couverture reste `metered_usage_only`. Le
[suivi officiel des coûts](https://developers.cloudflare.com/billing/manage/billable-usage/)
exclut les abonnements à prix fixe et aligne les données sur le cycle propre au
compte. Ce connecteur ne démontre ni un paiement, ni une facture totale incluant
taxes et frais fixes, ni une marge nette de Guteneo. Il n'utilise pas l'API v2 :
sa [référence actuelle](https://developers.cloudflare.com/api/resources/billing/subresources/usage/methods/get_account_usage_v2/)
indique que les champs de coût et de prix ne sont pas encore alimentés.

## Extensions documentées, non activées

Les pistes ci-dessous sont des capacités officiellement documentées et non des
connecteurs déjà implémentés :

| Source                                                                                                                | Extension possible                                                                | Qualification nécessaire                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [D1 Analytics](https://developers.cloudflare.com/d1/observability/metrics-analytics/)                                 | `d1AnalyticsAdaptiveGroups`, `d1StorageAdaptiveGroups`, `d1QueriesAdaptiveGroups` | Fixer les identifiants des seules bases Guteneo et vérifier schéma, période et permissions accessibles                                                                       |
| [R2 Analytics](https://developers.cloudflare.com/r2/platform/metrics-analytics/)                                      | Opérations, nombre d'objets, volume stocké et bande passante                      | Fixer les buckets ; utiliser le préfixe de juridiction `eu_` attendu pour les buckets européens ; les transferts inférieurs à 100 Kio sont absents du dataset bande passante |
| [Account Billing History](https://developers.cloudflare.com/api/resources/billing/subresources/history/methods/list/) | Historique des factures et règlements                                             | Jeton distinct **Account / Billing / Read**, pagination, validation devise/unité et rapprochement par facture ; ne pas compter facture et règlement deux fois                |

L'API d'historique de facturation existe mais n'est pas appelée : elle expose
des champs `action`, `type` et `status` sans vocabulaire permettant de prouver
ici un rapprochement des factures réglées. Une extension devra qualifier ces
états, préserver les devises sans taux de change implicite, et distinguer
dépenses facturées, paiements et estimations. Les URL de facture hébergée, qui
peuvent être sensibles, ne devront pas apparaître dans des logs ou exports publics.

## Preuve locale

`npx vitest run tests/unit/belvedere-cloudflare.test.ts --reporter=default`
vérifie les fenêtres et filtres, le format des résultats, l'absence de requête
sans configuration, les refus d'accès HTTP/GraphQL, les données partielles et
malformées, les limites de taille et de délai, et l'absence de fuite des secrets.
Ces tests n'activent pas Cloudflare. Une validation avec le compte réel et la
publication demandent leurs autorisations explicites respectives.

`npx vitest run tests/unit/belvedere-cloudflare-billing.test.ts --reporter=default`
vérifie séparément le transport de facturation, la précision décimale, l'arrondi
après addition, les devises, l'identité du compte, les périodes, l'absence de
double comptage et les limites de lecture. Les réponses utilisées sont des
fixtures fictives, jamais des preuves de dépenses réelles.

Sources officielles consultées le 2 octobre 2026.
