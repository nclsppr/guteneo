# Horizon — maîtriser les coûts Cloudflare

Documentation technique uniquement. Tarifs officiels consultés le **3 octobre
2026** ; montants en **USD, hors taxes**, sans conversion en euros.
Les estimations ci-dessous sont des modèles de consommation, pas une facture.
Les mesures Docker sont distinguées des hypothèses et ne constituent pas une
preuve de déploiement ou de performance hébergée.

Le principal coût évitable est la mémoire et le disque **provisionnés pendant
que l'instance reste éveillée**. Ils restent facturables lorsqu'aucun PDF n'est
traité. Le CPU est facturé à l'usage actif. Une mise en veille courte économise
donc davantage qu'une réduction de quelques millisecondes de code Worker pour
des demandes espacées.

## Tarifs et ressources

Le forfait Workers Paid coûte au minimum **5 USD par mois pour le compte**.
Les allocations suivantes sont partagées avec le scanner et les autres
applications du compte : elles ne sont pas recréées pour chaque service.

| Ressource Containers | Allocation mensuelle incluse | Prix au-delà |
| --- | --- | --- |
| Mémoire | 25 GiB-heures = 90 000 GiB-secondes | 0,0000025 USD / GiB-seconde |
| CPU actif | 375 vCPU-minutes = 22 500 vCPU-secondes | 0,000020 USD / vCPU-seconde |
| Disque provisionné | 200 GB-heures = 720 000 GB-secondes | 0,00000007 USD / GB-seconde |
| Sortie réseau, Europe / Amérique du Nord | 1 TB | 0,025 USD / GB |

Containers mesure les ressources par périodes de 10 ms. Respecter les unités :
la mémoire est exprimée en **GiB**, le disque en **GB**, et une vCPU-seconde est
une quantité de calcul, pas une seconde d'attente HTTP.

| Instance | CPU disponible | Mémoire | Disque | Mémoire + disque pour une heure éveillée, hors allocation |
| --- | --- | --- | --- | --- |
| `lite` / alias `dev` | 1/16 vCPU | 256 MiB | 2 GB | 0,002754 USD |
| `basic` | 1/4 vCPU | 1 GiB | 4 GB | 0,010008 USD |
| `standard-1` / alias `standard` | 1/2 vCPU | 4 GiB | 8 GB | 0,038016 USD |

Le seul tas Java configuré pour veraPDF est de 384 MiB. `lite` et son alias
`dev` sont donc exclus avant même de compter Python, la mémoire native et le
système. Les tailles personnalisées ont un minimum de 1 vCPU et 3 GiB par vCPU :
elles ne permettent pas de fabriquer une variante moins chère de `basic`.

Passer de `standard-1` à `basic` réduit de **73,7 %** le coût horaire mémoire +
disque. Il divise aussi la capacité CPU par deux : la baisse n'est acceptable
qu'après qualification des PDF de référence, du démarrage, de la mémoire et des
échéances. Avec 0,25 vCPU, 10 vCPU-secondes de calcul nécessitent déjà 40 secondes
à pleine capacité. L'échéance moteur de 40 secondes et celle du Worker de
45 secondes ne doivent pas être allongées pour masquer cette limite.

## Le temps de veille fait la différence

Le candidat initial utilisait `standard-1`, une instance maximum et
`sleepAfter="2m"`. Pour une demande isolée, les seules 120 secondes d'inactivité
coûtent 0,0012672 USD de mémoire + disque. Sur `basic`, elles coûtent
0,0003336 USD. Une veille après 20 secondes réduit cette traîne de **83,3 %** ;
une veille après 5 secondes la réduit de **95,8 %**, à 0,0000139 USD sur `basic`.
Le gain concerne la traîne, pas tout le calcul ni toute la facture.

Une valeur courte doit préserver les demandes en cours et être qualifiée avec
le SDK réellement installé. Le délai configuré n'atteste pas, à lui seul, le
moment exact d'arrêt observé dans Cloudflare. Conserver la configuration
effectivement retenue et sa preuve dans le dossier de qualification et le
[runbook d'activation](HORIZON_ACTIVATION_RUNBOOK.md).

Les contrôles publics de santé et de capacités doivent rester sans appel au
moteur. Le `/health` privé du validateur **réveille** le conteneur : ne pas le
transformer en sonde périodique de disponibilité. Le scanner est une charge
distincte avec ses propres exigences de mémoire et de démarrage ; une économie
du validateur ne justifie pas de réduire le scanner sans qualification dédiée.

## Mesures locales et choix du candidat

Les mesures du 3 octobre 2026 sont réalisées avec Docker `linux/amd64`, réseau
désactivé, racine en lecture seule, swap désactivé et quotas CPU/mémoire alignés
sur les tailles comparées. Elles ne qualifient **pas** un Container hébergé.
Les budgets de traitement du moteur / Worker restent **40 / 45 secondes**.

Le candidat JVM conserve `-Xmx384m` et ajoute `-Xms32m`,
`-XX:ActiveProcessorCount=1`, `-XX:+UseSerialGC` et
`-XX:TieredStopAtLevel=1`. Le lot identique inclut les douze références
positives/négatives des six profils, les PDF synthétiques, la concurrence,
les rejets et le test synthétique de délai de processus. Ce dernier ne démontre
pas un timeout Java sur un vrai PDF.

| Observation locale, premier lot sans grand PDF | Image initiale, `standard-1` | Image JVM optimisée, `basic` |
| --- | --- | --- |
| Ressources CPU / RAM | 0,5 vCPU / 4 GiB | 0,25 vCPU / 1 GiB |
| Santé après démarrage à froid | 18,267 s | 19,296 s |
| Maximum des douze références | 16,608 s | 17,398 s |
| Pic mémoire de tout le lot | 125 284 352 octets, soit 119,5 MiB | 102 690 816 octets, soit 97,9 MiB |
| Somme CPU des requêtes chronométrées | 64,567 vCPU-s | 33,564 vCPU-s |
| CPU total du cgroup en fin de lot | 66,856 vCPU-s | 34,963 vCPU-s |
| Différence total − requêtes | 2,289 vCPU-s | 1,399 vCPU-s |

La somme CPU des requêtes baisse d'environ **48 %** dans cette comparaison.
La différence entre CPU total et somme des requêtes est une estimation
majorante du démarrage, de l'initialisation et des sondes du pilote ; ce n'est
pas une mesure pure et universelle d'un démarrage Cloudflare. Le pic inférieur
à 1 GiB motive l'essai de `basic`, sans démontrer une borne mémoire pour tous
les documents possibles. Les contraintes `lite` / tas de 384 MiB restent
incompatibles.

Le complément de stress utilise un PDF synthétique de **100 pages,
9,887 MiB**, SHA-256
`d3e4f48e0c7bd3ca3f8739062eac029a0d68d801fa04430dad4d351e96bc391e`.
Les douze références et les six réponses de ce grand PDF sont identiques
entre les images comparées après exclusion des timings ; ces fichiers ne
contiennent aucune donnée client.

| Observation locale, grand PDF sur les six profils | Ancien `standard-1` | `basic` optimisé |
| --- | --- | --- |
| Temps par profil | 18,380–19,598 s | 18,913–20,289 s |
| CPU par profil | 4,399–5,163 vCPU-s | 2,273–2,586 vCPU-s |
| Pic mémoire du lot complet | 192,5 MiB | 165,7 MiB |
| Santé à froid de ce complément | 17,142 s | 17,753 s |
| Somme CPU des requêtes du lot complet | 91,456 vCPU-s | 48,244 vCPU-s |
| CPU total du cgroup en fin de lot complet | 93,671 vCPU-s | 49,522 vCPU-s |
| Différence total − requêtes | 2,214 vCPU-s | 1,278 vCPU-s |

Le lot complet conserve environ **47 %** de réduction de CPU de requête.
Ces compteurs cgroup incluent le client Python du pilote local : ils permettent
le comparatif mais ne représentent pas une télémétrie de facturation hébergée.

La somme indicative du froid et du profil le plus lent sur `basic` est
**38,042 secondes** dans ce complément, sous 45 secondes. Cette addition
ne constitue pas une requête hébergée de bout en bout, et ne garantit pas
le délai sur des fichiers autres que ce corpus. Les mesures locales retiennent
**`basic` et une veille de 5 secondes comme candidat**, avec les profils,
bornes, nettoyage et échéances préservés.

Preuves de travail locales :

- [Résumé versionné des ressources et coûts](../apps/pdf-validator/tests/benchmark-fixtures/local-resource-proof.json),
  avec les empreintes des
  [observations `basic`](../apps/pdf-validator/tests/benchmark-fixtures/local-docker-basic-proof.json)
  et [observations `standard-1`](../apps/pdf-validator/tests/benchmark-fixtures/local-docker-standard-1-proof.json)
  du lot complet ;
- `/workspace/scratch/horizon-validator/docker-standard-1-proof.json`, image
  `sha256:ae8a2523611c2f72763856a61808662cbd83fbdf2a44a586d10170c64b5ac840` ;
- `/workspace/scratch/horizon-validator/docker-basic-optimized-proof.json`, image
  `sha256:e2a8edd58c410cd9639b3350ee66d573cc7b0c7b6409bfed4d5a45f4715af1ca` ;
- `/workspace/scratch/horizon-validator/docker-standard-1-large-proof.json` et
  `/workspace/scratch/horizon-validator/docker-basic-large-proof.json` : même
  comparaison complétée par le grand PDF sur les six profils.

Les chemins `/workspace/scratch/...` appartiennent au workspace de qualification,
pas à une URL publique ou à des fichiers versionnés ; les liens relatifs sont
les preuves conservées dans le dépôt. Le bilan de publication doit conserver
les empreintes de l'image réellement hébergée.

### Choisir la veille à partir du coût de démarrage

Pour `basic`, le coût mémoire + disque éveillé est **0,00000278 USD/s**.
Le démarrage majoré localement à 1,399 vCPU-s vaut environ
**0,00002798 USD** de CPU hors allocation. Une attente de **10,06 secondes**
consommerait autant de mémoire/disque que cette estimation CPU d'un nouveau
démarrage. Le lot complet donne 1,278 vCPU-s, soit un seuil voisin de
**9,20 secondes** : les deux mesures situent cette comparaison entre
**9 et 10 secondes**, avec 1,4 vCPU-s retenu pour le modèle prudent ci-dessous.
Cette comparaison exclut le coût mémoire/disque du prochain
démarrage et les frais Durable Objects ; elle n'établit donc pas un optimum
universel de trafic.

En l'absence de trafic pilote mesuré, **5 secondes** constitue le candidat de
veille courte à qualifier : moins de traîne que 20 ou 120 secondes, avec une
petite fenêtre de reprise rapprochée. Une veille de 1 seconde réduit encore
l'attente mais peut provoquer davantage de redémarrages entre deux demandes
espacées de quelques secondes. Le SDK doit garder en vie les requêtes en cours
et redémarrer le délai après leur réponse.

Le choix final de publication attend la qualification hébergée de l'arrêt
automatique et de la reprise. Ne pas présenter les réglages candidats ou ces
mesures Docker comme une configuration déployée ou une économie déjà facturée.

## Modèle reproductible

Pour un mois donné, soit `T` le temps éveillé total en secondes, `M` la mémoire
provisionnée en GiB, `D` le disque en GB et `U` le CPU actif en vCPU-secondes.
Si le reste du compte consomme déjà `Am`, `Ad`, `Au` dans les mêmes unités, le
coût marginal Containers du validateur est :

```text
mémoire = [max(0, Am + M*T - 90000) - max(0, Am - 90000)] * 0.0000025
disque  = [max(0, Ad + D*T - 720000) - max(0, Ad - 720000)] * 0.00000007
CPU     = [max(0, Au + U - 22500) - max(0, Au - 22500)] * 0.000020
```

Le coût brut, sans aucune allocation, est :

```text
(M*T*0.0000025) + (D*T*0.00000007) + (U*0.000020)
```

Ce modèle ne déduit pas une allocation déjà consommée par le scanner. Pour
une prévision réelle, récupérer les métriques du compte plutôt que supposer
`Am=Ad=Au=0`.

### Scénarios de demandes isolées et rapprochées

Hypothèses explicites :

- `N` diagnostics acceptés dans le mois ; 1 à 10 vCPU-secondes de calcul par
  diagnostic, **hypothèse**, pas mesure de veraPDF.
- `B=N` démarrages pour des demandes isolées ; `B=N/10` pour des séries de dix
  demandes successives sans intervalle entre elles. Ce dernier cas décrit le
  trafic et ne crée pas d'API de traitement par lots.
- 20 secondes de démarrage par série, arrondi de planification proche de la
  santé à froid locale observée. Cloudflare donne souvent 1–3 secondes pour un
  démarrage, mais cette généralité ne remplace pas la mesure de notre image.
- CPU de démarrage `K` arrondi à 1,4 vCPU-s sur `basic` et 2,3 vCPU-s sur
  l'ancienne image `standard-1`, d'après les différences locales ci-dessus.
- Durée totale `W` du traitement : 20 secondes pour la borne basse, 40 pour
  la borne haute. CPU `C` : respectivement 1 et 10 vCPU-secondes. Les durées et
  CPU restent des hypothèses de planification distinctes : attendre n'est pas
  consommer du CPU. Aucun temps supplémentaire d'alarme, de nettoyage ou d'arrêt
  n'est ajouté ; ajouter la consommation réellement observée.
- `S` représente le délai de veille : `T = B*(20+S) + N*W` et
  `U = N*C + B*K`.

**Coûts bruts Containers seulement**, avant toute allocation mensuelle :

| Diagnostics / mois | Répartition | `standard-1`, veille 120 s | `basic`, veille 120 s | `basic`, veille 20 s | `basic`, veille 5 s |
| --- | --- | --- | --- | --- | --- |
| 100 | Isolés | 0,176–0,215 USD | 0,049–0,073 USD | 0,021–0,045 USD | 0,017–0,041 USD |
| 100 | Séries de 10 | 0,038–0,077 USD | 0,012–0,035 USD | 0,009–0,033 USD | 0,009–0,032 USD |
| 1 000 | Isolés | 1,756–2,147 USD | 0,493–0,728 USD | 0,215–0,450 USD | 0,173–0,409 USD |
| 1 000 | Séries de 10 | 0,384–0,775 USD | 0,117–0,353 USD | 0,090–0,325 USD | 0,085–0,321 USD |

Dans le scénario isolé, cela représente **0,000173–0,000409 USD par diagnostic**
sur `basic` / 5 s, contre **0,001756–0,002147 USD** sur `standard-1` / 120 s.
Ces montants unitaires comprennent le démarrage supposé et la traîne de veille,
mais uniquement les ressources Containers du modèle. Ils ne sont pas un prix
garanti pour n'importe quel PDF ou pour le compte Cloudflare entier.

Par exemple, 1 000 demandes isolées avec `basic` et une veille de 5 secondes
consommeraient **12,5–18,1 heures éveillées**, **12,5–18,1 GiB-heures**,
**50–72,2 GB-heures de disque** et **2 400–11 400 vCPU-secondes** dans ce modèle.
Ces quantités entrent dans les allocations Containers si elles sont encore
entièrement disponibles. La composante Containers supplémentaire serait alors
nulle ; le forfait, les autres services et les usages du compte subsistent.
La borne haute de calcul approche l'échéance moteur sur `basic` et ne démontre
pas qu'un tel PDF serait accepté dans le délai réel.

### Si l'instance reste éveillée tout le mois

Une instance unique limite l'utilisation simultanée, **pas le budget mensuel
du compte**. Un flux continu de requêtes, y compris des réponses `busy`, peut
empêcher sa mise en veille. Voici les coûts bruts pour **31 jours**, sans
allocation et avant les autres postes :

| Instance unique éveillée | Mémoire + disque | Avec CPU constamment à pleine capacité |
| --- | --- | --- |
| `basic` | 7,445952 USD | 20,837952 USD |
| `standard-1` | 28,283904 USD | 55,067904 USD |

Ces valeurs illustrent le coût des ressources d'une instance configurée à cette
taille pendant 744 heures. Elles ne plafonnent ni les Worker requests, ni les
Durable Objects, ni le scanner, ni le stockage documentaire, ni la facture
Cloudflare. Une limite de 100 diagnostics par compte client et par période ne
constitue pas une limite globale lorsque plusieurs comptes utilisent Horizon.

## Les autres lignes de facture

| Poste | Point à garder visible |
| --- | --- |
| Workers | Standard : 10 millions de requêtes / mois, puis 0,30 USD / million ; 30 millions de CPU-ms, puis 0,02 USD / million de CPU-ms. Une attente réseau n'est pas du CPU. Le binding de service n'ajoute pas de frais de requête Worker ; le CPU des Workers appelés compte. |
| Durable Objects | Une instance de Container a son Durable Object. 1 million de requêtes et 400 000 GB-secondes / mois inclus ; puis 0,15 USD / million de requêtes et 12,50 USD / million de GB-secondes. La durée considère 128 MB par objet actif ou non éligible à l'hibernation. Les unités supplémentaires sont arrondies selon la documentation : ne pas assimiler un petit dépassement à une fraction exacte de centime. |
| État Durable Objects | L'état SQLite et les opérations d'alarme peuvent subsister indépendamment de la veille du Container. Le stockage persistant reste facturable jusqu'à suppression ; ce n'est pas le disque éphémère du Container. |
| Logs | La configuration privée désactive l'observabilité persistée. L'activation des logs consommerait l'allocation Workers Logs et peut ajouter des frais. La FAQ annonce une tarification Cloudflare Observability des logs Containers à partir du 1er décembre 2026 : recontrôler les tarifs avant cette date. |
| D1 et R2 | L'historique, les documents et les rapports ont leurs propres consommations partagées. Les tarifs Containers ne comprennent pas leur stockage ni leurs opérations. |
| Images | Cloudflare indique ne facturer le calcul que pour les instances actives, pas les images préparées non exécutées. La limite documentée de stockage des images est de 50 GB par compte. Aucun prix séparé de registry n'est indiqué dans les pages citées ; ne pas en déduire une promesse tarifaire permanente. Conserver les images utiles au rollback avant de supprimer les anciennes. |

La mise en veille arrête les frais des ressources Containers. Elle n'annule
pas le forfait Workers Paid, les requêtes, les états persistants ou les autres
services. Aucun « tout éteint = facture zéro » n'est garanti.

## Vérifications avant ouverture et suivi

1. Qualifier la taille retenue avec le corpus positif/négatif, le démarrage à
   froid, les délais, la concurrence et le nettoyage. Conserver les timings et
   les limites mémoire ; un test à 1 CPU ne qualifie pas automatiquement
   `basic` à 0,25 vCPU.
2. Garder un nom Durable Object partagé, une seule instance et un seul calcul
   concurrent. Aucun réveil périodique, maintien artificiel en vie ou nouvelle
   instance par client. Réutiliser le résultat des replays idempotents après
   nouvelle vérification des droits.
3. Rejeter les accès sans droit et les quotas épuisés avant l'appel au moteur.
   Garder les limites d'octets et de temps ainsi que l'absence de relance
   automatique. Une requête en erreur peut aussi consommer des ressources.
4. Après publication, comparer les métriques Containers, Workers et Durable
   Objects et la consommation du scanner au modèle. Les sondes publiques sans
   réveil sont adaptées au suivi ; réserver les sondes moteur à une qualification
   ponctuelle. Les alertes de coût informent, elles ne garantissent pas un arrêt
   automatique de la facturation.

### Lire les coûts réellement facturables

Pour un compte Pay-as-you-go, utiliser **Manage Account → Billing → Billable
Usage** dans le tableau de bord Cloudflare, avec le droit `Billing read`.
Sélectionner la **période de facturation du compte**, qui peut différer du mois
calendaire, puis filtrer les familles et produits concernés. Relever :

- `Total usage` : consommation mesurée, y compris la part couverte par les
  allocations ;
- `Billable usage` : quantité au-delà des allocations ;
- `Usage cost` : coût cumulé de cette période par produit.

Conserver une lecture avant la qualification, après celle-ci, puis après un
intervalle d'utilisation réelle. Documenter les autres changements de charge
du scanner et du compte : un delta global ne permet pas d'attribuer tout le
coût à Horizon. Comparer les dimensions mémoire/disque/CPU du modèle aux unités
du tableau, sans additionner une seconde fois les allocations incluses.

Le tableau lit la même source que la facture mais affiche seulement les
**dépassements d'usage**, pas les abonnements fixes. La facture de la période
terminée reste la référence finale. Les comptes Enterprise utilisent les
conditions de leur contrat et ne disposent pas de ce tableau Pay-as-you-go.

Les alertes de budget sont des notifications par email pour les dépassements
du compte entier. Elles **ne suspendent et ne plafonnent pas** l'usage. Cette
documentation ne crée aucune alerte ni aucun destinataire ; si elles sont
configurées ultérieurement, conserver leur périmètre et le seuil choisi par
l'opérateur.

### Réviser l'architecture à partir des mesures

Si le démarrage Java devient le poste dominant, distinguer **démarrage du
conteneur** et **nouveau processus veraPDF par document**. Garder le conteneur
éveillé plus longtemps évite certains démarrages de conteneur ; cela ne supprime
pas le lancement du nouveau processus Java prévu par le serveur actuel.

Comparer d'abord sur le même corpus : temps de démarrage à froid, CPU de
construction du rapport, temps total, mémoire maximale, profils et charge
près de la limite d'octets. Ne pas déduire le CPU actif de la seule durée
HTTP ; utiliser les compteurs CPU et les métriques de la qualification.
Éviter une taille d'image réduite qui n'abaisse pas le disque provisionné et
fait perdre des polices ou dépendances utiles aux résultats.

Quand les mesures montrent un gain matériel, évaluer une JVM réutilisable ou
une intégration directe à l'API Java de veraPDF avec les mêmes profils épinglés.
Une telle réécriture exige une nouvelle qualification de tous les verdicts,
des limites, de l'arrêt à l'échéance et de l'effacement des données entre
documents. Le coût ne justifie ni un résultat mis en cache entre clients ni
une isolation affaiblie. L'instance unique et l'échéance doivent continuer à
borner la consommation ; une JVM conservée en mémoire ne doit pas servir de
raison pour empêcher la veille.

Pour ajuster la durée de veille, comparer le CPU de démarrage effectivement
évité au coût supplémentaire de l'attente :

```text
coût du maintien éveillé = secondes ajoutées * (M*0.0000025 + D*0.00000007)
CPU de démarrage évité  = vCPU-secondes réellement évitées * 0.000020
```

Ce calcul marginal suppose les allocations épuisées et ne couvre pas le
Durable Object. Mesurer le trafic rapproché avant d'allonger la veille : les
demandeurs espacés consommeraient toute la traîne sans profiter de la reprise.
Une nouvelle architecture ou un réglage ne doit être annoncé comme économie
réalisée qu'après mesure et qualification du candidat.

## Sources officielles

Pages récupérées directement sur `developers.cloudflare.com` le 3 octobre 2026 :

- [Containers — Pricing](https://developers.cloudflare.com/containers/platform/pricing/),
  mise à jour du 28 août 2026 : taux, ressources provisionnées, CPU actif,
  allocations, egress et facturation Workers / Durable Objects.
- [Containers — Limits and Instance Types](https://developers.cloudflare.com/containers/platform/limits/),
  mise à jour du 30 septembre 2026 : tailles, alias, minimum custom et stockage
  des images.
- [Containers — Lifecycle](https://developers.cloudflare.com/containers/concepts/architecture/),
  mise à jour du 30 septembre 2026 : démarrages, facturation des images préparées,
  arrêt, disque éphémère et absence de garantie de durée de vie d'une instance.
- [Containers — FAQ](https://developers.cloudflare.com/containers/faq/) :
  démarrage, veille et changement annoncé de tarification des logs.
- [Workers — Pricing](https://developers.cloudflare.com/workers/platform/pricing/),
  mise à jour du 2 octobre 2026 : minimum du forfait par compte, allocations,
  CPU, bindings de service, D1 et R2.
- [Durable Objects — Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) :
  durée, 128 MB, allocations, arrondis et état persistant.
- [Billing — Monitor billable usage](https://developers.cloudflare.com/billing/manage/billable-usage/),
  mise à jour du 30 juin 2026 : accès, période, champs, coûts d'usage et lien
  avec la facture.
- [Billing — Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/),
  mise à jour du 29 mai 2026 : notifications du compte entier et absence
  de plafond automatique.

Configuration et garanties à relire dans
[`apps/pdf-validator/wrangler.jsonc`](../apps/pdf-validator/wrangler.jsonc),
[`apps/pdf-validator/src/index.ts`](../apps/pdf-validator/src/index.ts),
[`apps/pdf-validator/container/server.py`](../apps/pdf-validator/container/server.py)
et [`PDF_VALIDATOR.md`](PDF_VALIDATOR.md). Ces fichiers décrivent le candidat ;
la qualification et la version hébergée sont attestées séparément.
