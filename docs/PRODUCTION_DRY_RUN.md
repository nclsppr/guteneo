# Contrôle à blanc d’un envoi existant

Contrat déployé le **10 octobre 2026 à 02:30:52 UTC** avec l’application
`c953596dc0650961a7294da622703f5edc3a764d` ; 262 assets publics ont été vérifiés.
Le contrôle anonyme `GET /api/dispatches/status-probe/dry-run` a répondu
**401 avec `Cache-Control: no-store`**. Cette preuve établit le refus d’accès
anonyme de la route, pas l’exécution de ses gardes métier.

Le **parcours authentifié reste non qualifié en production** : aucun dry-run
authentifié n’a été exécuté sur un envoi de production et aucune livraison
n’a été effectuée pour cette qualification.

Le contrôle relit un envoi déjà préparé et ses preuves enregistrées. Il ne prépare
pas un nouveau devis, ne renouvelle pas celui qui existe et ne le consomme pas.
Il ne crée aucune approbation, réservation de crédits, entrée d’outbox ou tentative
fournisseur. Il ne contacte ni fournisseur, ni antivirus, ni service de rendu.

Un résultat favorable reste **partiel** : l’acceptation atomique et la livraison
ne sont pas exécutées. Une preuve manquante n’est jamais transformée en succès.

## Entrée, accès et surfaces

L’entrée est l’identifiant d’un envoi existant. Le contexte authentifié fournit
l’atelier ; aucun identifiant d’atelier fourni par le client ne devient une preuve
d’accès. Les droits courants et la confidentialité documentaire sont ceux de
`getDispatch` : un document privé d’un autre créateur reste inaccessible, sauf
l’accès de revue déjà permis à un approbateur actuel dans cette demande précise.

| Surface | Contrat | Autorité |
| --- | --- | --- |
| REST | `GET /api/dispatches/:id/dry-run`, sans corps ni clé d’idempotence | Authentification existante ; scope OAuth `dispatches:read` |
| MCP | `dry_run_dispatch` avec `dispatchId` | Connexion OAuth valide, scope `dispatches:read`, droits actuels du membre |
| Web | Aucun nouveau bouton ou parcours dans le tableau de bord | Pas de droit supplémentaire |
| Natif | Aucun nouvel écran ni nouvelle route mobile dédiée | Les contrats natifs existants restent inchangés |

Les quatre rôles humains peuvent lire ce contrôle lorsqu’ils peuvent lire l’envoi.
L’option « Approbation » du superviseur n’est pas nécessaire pour cette lecture ;
elle peut toutefois déterminer l’accès de revue à un PDF privé. Un observateur
n’acquiert aucun droit de préparation, d’approbation ou de confirmation. Un
assistant ne peut pas déclarer le consentement d’une personne ni activer un mandat.

« Lecture seule » désigne ici le **métier**. La méthode du domaine n’effectue que
des lectures. Les couches HTTP/authentification et MCP peuvent enregistrer des
compteurs de limitation ou de l’observabilité de connexion. L’outil conserve donc
les annotations existantes de lecture observée : `readOnlyHint: false`,
`idempotentHint: false`, `destructiveHint: false`, `openWorldHint: false`. Elles
n’autorisent ni envoi ni modification métier. Les requêtes consomment toujours les
ressources ordinaires de l’application ; aucun coût d’infrastructure nul n’est
promis. L’authentification peut également relire les clés publiques d’Auth0 :
l’absence de contact fournisseur métier ne signifie pas absence absolue de réseau.

## Résultat et portée des contrôles

La réponse REST est l’objet ci-dessous ; MCP retourne le même résultat du domaine
par son transport habituel. Les valeurs de cet extrait décrivent un schéma, pas
une preuve de production :

```ts
{
  schema: 1,
  execution: "validation_only",
  dispatchId: string,
  fingerprint: string,
  dispatchMode: "production" | "simulation",
  checkedAt: string,
  status: "partial" | "blocked",
  checks: Array<{
    id: string,
    status: "passed" | "blocked" | "not_checked",
    code?: string
  }>
}
```

| Contrôle | Preuve recherchée | Limite |
| --- | --- | --- |
| `prepared_state` | L’envoi est encore `prepared`. | Un autre état est bloqué ; le contrôle ne le remet pas en préparation. |
| `submission_not_started` | Absence de tentative ou de trace fournisseur incompatible avec une préparation intacte. | Ne reprend pas une soumission existante ou inconnue. |
| `quote` | Validité du devis de production enregistré pour cet envoi exact. | Expiration, révocation et préparation réservée à la revue restent bloquantes ; aucun nouveau prix n’est demandé. |
| `protected_document` | Gardes enregistrées du document protégé, lorsque ce mode s’applique. | Aucun téléchargement, nouveau lien, hébergement ou rendu n’est créé. |
| `recipient_suppression` | Absence de blocage enregistré du destinataire e-mail lorsque ce contrôle s’applique. | Aucun contact du destinataire et aucune qualification de sa boîte. |
| `acceptance` | `not_checked`, code `NOT_EXECUTED`. | L’acceptation, les quotas et la réservation atomique ne sont pas exercés. |
| `provider_delivery` | `not_checked`, code `NOT_EXECUTED`. | Aucune soumission, réception de callback ou livraison n’est testée. |

`partial` signifie que les gardes exécutées n’ont pas trouvé de blocage. Il ne
signifie ni « prêt à envoyer », ni « le produit fonctionne de bout en bout ».
`blocked` signale au moins un blocage dans ces gardes. Un contrôle hors du canal
ou du chemin applicable reste `not_checked` avec `NOT_APPLICABLE`, jamais
`passed` par défaut. En simulation, le contrôle de devis reste `not_checked` avec
`SIMULATION_NOT_PRODUCTION_PROOF` ; le mode explicite ne fournit aucune preuve de
production.

Un état différent de `prepared` produit `INVALID_STATE` pour `prepared_state` ;
les gardes de préparation qui ne sont pas exécutées portent
`DISPATCH_NOT_PREPARED`. Une tentative ou une trace de fournisseur déjà présente
bloque `submission_not_started` avec `SUBMISSION_ALREADY_STARTED`.

La réponse ne contient ni destinataire, ni contenu, ni secret, ni URL signée.
L’identifiant et l’empreinte permettent de relier la mesure à l’envoi exact. Ils
restent des métadonnées privées de l’atelier : ne pas publier ce rapport dans un
moniteur anonyme ou dans des journaux de contenu.

## Parcours et automatisation

1. Choisir un envoi de test déjà préparé et accessible dans l’atelier courant.
   Sa préparation antérieure est une opération distincte : elle peut avoir
   enregistré des données ou nécessité un transfert postal autorisé.
2. Appeler le contrôle REST ou MCP sur le même identifiant. Le contrôle seul ne
   crée ni nouvel envoi ni devis de remplacement.
3. Conserver `checkedAt`, le mode, l’empreinte, le statut global et chaque résultat.
   Afficher séparément gardes validées, blocages et étapes non exécutées.
4. Si une garde bloque, examiner son code avec le parcours existant. Une réponse
   `partial` n’autorise aucune approbation ou confirmation automatique.
5. Relire au besoin le même identifiant. Le devis continue d’expirer normalement ;
   l’appel ne prolonge aucune échéance et ne réserve pas sa validité future.

Pour un contrôle programmé, utiliser un accès autorisé à faible privilège et des
identifiants de test existants, sans faire créer de devis par la sonde. Borner la
fréquence, la concurrence et le nombre d’envois lus ; tenir compte des réponses de
limitation. Un changement de l’envoi, des droits, du devis ou du temps peut changer
le résultat entre deux lectures. Les gardes sont lues successivement, sans
verrouillage ni réservation : une modification concurrente peut rendre la mesure
périmée. Seuls les contrôles du parcours réel autorisent ensuite son acceptation.
Aucun planificateur de dry-run ni secret de production n’est installé pour
cette fonction.

Les refus d’authentification, de scope, d’atelier ou d’accès documentaire restent
des erreurs d’accès, pas des contrôles métier réussis. Reconnecter ou corriger
l’autorité explicitement ; ne pas choisir un autre atelier ou document pour
contourner le refus. En cas d’erreur réseau, le résultat courant est inconnu : la
relecture est permise, sans lancer de préparation, de renouvellement ou d’envoi.
Un devis expiré demande une action distincte via le parcours existant ; une
ancienne approbation ne se reporte pas implicitement sur un devis renouvelé.

## Exécution automatisable en production

Le runner `scripts/production-dry-run.ts` effectue uniquement ces lectures sur
`https://guteneo.com`. Il accepte de 1 à 10 identifiants distincts d’envois
existants, via un argument `--dispatch` par envoi. Aucun domaine arbitraire ni
redirection n’est accepté. Les requêtes sont séquentielles, chacune bornée à
10 secondes et à 64 Kio de réponse.

Prérequis : version publiée compatible avec ce contrat, jeton OAuth encore
valide avec `dispatches:read`, appartenance actuelle à l’atelier, accès à chaque envoi choisi
et devis préparés non expirés. Le jeton est injecté dans
`GUTENEO_DRY_RUN_TOKEN` par le gestionnaire de secrets du processus ; ne pas le
placer dans les arguments ou les journaux. Remplacer l’identifiant illustratif
ci-dessous par celui de l’envoi de test déjà choisi :

```sh
npm run test:prod:dry-run -- --dispatch dsp_EXEMPLE
```

Le runner vérifie le schéma, l’identifiant demandé, le mode `production`, les
sept contrôles attendus sans doublon et leur cohérence. Il refuse une mesure de
plus de 120 secondes ou datée de plus de 30 secondes dans le futur. Acceptation
et livraison doivent toutes deux rester `not_checked` / `NOT_EXECUTED`.
La simulation n’est jamais acceptée comme preuve de production.

| Résultat du runner | Code de sortie | Interprétation |
| --- | --- | --- |
| `validation_passed`, `qualification: partial` | 0 | Les gardes exécutées passent pour chaque envoi choisi ; aucune acceptation ni livraison n’a eu lieu. |
| `attention` | 1 | Au moins un envoi est bloqué ou ne fournit pas de preuve exploitable : erreur HTTP, réseau, délai, schéma, mode ou fraîcheur. |
| Prérequis ou arguments invalides | 2 | Le runner n’a pas démarré les lectures. |

La sortie JSON numérote les scénarios et conserve leurs codes et heures ; elle
retire les identifiants d’envoi, empreintes, contenus, destinataires et jetons.
Une étape de CI doit lire aussi `qualification: partial`, pas seulement le code
0. Les identifiants restent des entrées privées du processus, à ne pas publier
avec les commandes exécutées.

Ce runner n’installe pas de cron. Une exécution programmée reste à configurer et
à qualifier avec des accès bornés ; elle ne doit jamais renouveler un devis ou
remplacer un envoi expiré pour obtenir un résultat favorable. La durée de validité
du devis et celle du jeton continuent de s’appliquer indépendamment.

## Preuves et qualification restante

La méthode commune est `DomainService.validateDispatch` dans
`packages/domain/src/index.ts`, avec le schéma partagé
`packages/contracts/src/dispatch-validation.ts`. Les surfaces passent par `apps/api/src/index.ts`
et `apps/api/src/mcp.ts`. La suite dédiée
`tests/integration/dispatch-validation.test.ts` couvre le contrat du domaine ;
`tests/unit/mcp-dispatch-validation.test.ts` vérifie la surface MCP et
`tests/unit/production-dry-run.test.ts` le runner borné et ses preuves expurgées.
Preuve locale du 10 octobre : la suite d’intégration dédiée passe **31/31 tests**
sur D1 local avec les migrations appliquées. Elle couvre les devis fax v3,
postaux et Resend, les liens protégés, expiration/révocation/configuration, les quatre rôles,
l’isolation d’atelier et de document, les états déjà engagés et l’absence de
mutation métier, y compris après lectures répétées. Le passage par la vraie route
HTTP locale vérifie un observateur autorisé, le refus anonyme et `no-store` ;
seuls les compteurs HTTP autorisés évoluent. Les données de mode production de
ces tests sont des fixtures locales, pas des requêtes sur la production. Le cas
postal prépare une fixture D1 avec préflight, consentement et devis ; deux lectures
conservent toutes les tables métier et ne rappellent ni résolveur ni fournisseur.
Les preuves des suites MCP et runner sont distinctes.

La qualification authentifiée en production reste à faire, avec un
compte de test réel et un envoi existant explicitement choisi. Le contrôle ne
qualifie pas une nouvelle connexion Auth0, les octets réellement stockés, la
fraîcheur des signatures antivirus, l’analyse ou le rendu effectifs, la
réservation SQL, le solde ou les quotas disponibles, ni un fournisseur. Une
livraison réelle nécessite toujours une autorisation et une preuve séparées.

Voir aussi [les rôles](WORKSPACE_ROLES.md), [les invariants d’envoi](ARCHITECTURE.md),
[les crédits](WELCOME_CREDIT.md) et [les devis de livraison](LIVE_DELIVERY_QUOTES.md).
