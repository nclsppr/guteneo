# Notifications Pingen : inscription privée

Ce module permet d'inspecter puis d'inscrire les notifications du compte Pingen configuré, sans compte utilisateur Guteneo, PDF, brouillon, crédit ou courrier. Il est publié dans la source `44d1d5bb64418372c5174faa1ce5601681fcc813` ; l'inscription réelle du 17 septembre 2026 est consignée ci-dessous. Il ne remplace pas la qualification du parcours utilisateur et n'active aucun envoi.

Le récepteur publié `/webhooks/pingen` vérifie déjà la signature HMAC-SHA256 du corps intact, l'organisation fournisseur et le canal `letters`. Il enregistre un reçu durable avant de répondre positivement, déduplique les événements et reprend les projections interrompues par cron. La présence de ce code ne prouve pas qu'un abonnement existe chez Pingen, que son secret est installé, ni qu'une notification réelle a été reçue. Les événements `issues` restent conservés comme métadonnées d'un reçu `unrecognized` ; ils ne provoquent pas automatiquement un échec définitif.

## Inscription réellement vérifiée — 17 septembre 2026

L'inspection privée initiale a lu une liste complète : les quatre catégories étaient absentes, sans journal et sans secret local. Une clé aléatoire de 32 caractères hexadécimaux a ensuite été transmise directement à l'entrée standard de Wrangler, sans fichier, argument ni affichage de sa valeur. La relecture Cloudflare confirme le binding secret, la version `7eb55d92-4434-4c0d-9701-4a4e8c348f87` à 100 % du trafic et `LIVE_SENDS_ENABLED=false` ; la source reste `44d1d5b`.

Les inscriptions ont été exécutées et leurs résultats examinés une par une : `issues`, `sent`, `undeliverable`, puis `delivered`. Une dernière inspection indépendante a relu les quatre catégories `matched` et leurs quatre journaux `registered`. Le récepteur public refuse un corps non signé avec `401 WEBHOOK_REJECTED`. Les comptes utilisateurs, organisations, documents, dispatches et reçus Pingen sont toujours à zéro dans D1.

Cette preuve établit la configuration des abonnements, pas la réception d'une notification signée par Pingen. Aucun bouton fournisseur de test n'a été utilisé, aucun courrier n'a été créé ou expédié et aucun crédit n'a été acheté. La recette du transport signé et du parcours applicatif reste ouverte. Preuves filtrées : `reports/pingen-webhook-registration-20260917.json`, `reports/pingen-webhook-secret-20260917.json`, `reports/pingen-webhook-public-checks-20260917.json` et `reports/pingen-webhooks-d1-counts-20260917.json`. Les heures des étapes dans le premier rapport sont celles des captures locales, pas les dates de création internes du fournisseur.

## Contrat et autorité

`ProviderInspection.configurePingenWebhooks(input)` est une RPC accessible uniquement par service binding Cloudflare privé. `ProviderInspection.fetch()` reste 404. Aucun endpoint HTTP applicatif, outil MCP ou rôle utilisateur ne reçoit cette capacité. L'autorité est celle de l'opérateur autorisé à configurer ce Worker ; un accès de compte Guteneo ne donne pas cette autorité.

Seules ces entrées strictes sont acceptées :

```json
{"action":"inspect"}
{"action":"register","category":"issues"}
{"action":"register","category":"sent"}
{"action":"register","category":"undeliverable"}
{"action":"register","category":"delivered"}
```

Tout champ supplémentaire est refusé. Le client ne choisit ni organisation, identifiant d'abonnement, secret, URL, environnement, portée OAuth ou méthode fournisseur. L'organisation et les accès proviennent des bindings existants. L'unique cible est `https://guteneo.com/webhooks/pingen`. Le service ne possède aucun chemin de modification, suppression, test de notification, dépôt, envoi ou achat.

Les deux actions exigent `ENVIRONMENT=production`, `MODE=production`, `PINGEN_SANDBOX=false` et les accès Pingen configurés. L'inscription exige en plus `LIVE_SENDS_ENABLED=false` et un `PINGEN_WEBHOOK_SECRET` composé d'exactement 32 caractères hexadécimaux. Le secret doit être aléatoire et installé dans le binding Cloudflare par le parcours opérateur sécurisé ; il n'est ni généré, ni rendu, ni installé par cette RPC. L'inspection reste possible sans secret, et sans aucune écriture fournisseur ou R2.

## Inspection complète avant création

Chaque opération demande explicitement le seul scope OAuth `webhook`. Conformément à RFC 6749 §5.1, son omission dans la réponse est acceptée lorsque le scope demandé reste inchangé ; une portée annoncée différente, élargie ou malformée est refusée.

La liste des abonnements est lue sur l'organisation configurée avec `page[number]` et `page[limit]=100`. La pagination doit être cohérente et complète : au maximum 5 pages et 500 entrées, sans identités répétées. Chaque objet doit appartenir à l'organisation attendue. Les liens renvoyés par le fournisseur ne sont jamais suivis. Un résultat incomplet, un changement de compte, une réponse malformée ou excessive bloque toute création. Chaque requête et sa consommation du corps sont limitées à 8 secondes et 64 Kio ; le budget réseau total d'une opération est 30 secondes.

Les abonnements visant d'autres URL et la catégorie `channel_subscriptions` sont laissés intacts. Pour la cible canonique, une catégorie peut être absente, correspondre exactement au secret configuré, rester invérifiable sans secret, ou présenter un conflit. Deux abonnements pour la même cible/catégorie, un secret différent ou une identité enregistrée remplacée constituent un conflit. Un conflit sur l'une des quatre catégories bloque toute nouvelle création. Aucune rotation ou réparation destructive n'est implicite.

Une inspection réussie avec `configuration:unverified` confirme seulement l'existence d'un abonnement, pas son secret. La comparaison des secrets s'effectue en mémoire avec `timingSafeEqual`. Les jetons, clés, identifiants, URL reçues et messages fournisseur ne sont jamais renvoyés ou écrits dans les logs applicatifs. Seul l'identifiant d'un abonnement connu peut être conservé dans le journal privé décrit ci-dessous.

## Concurrence et issue inconnue

Le journal opérateur privé utilise quatre objets R2 séparés du métier, sous `configuration/pingen/webhooks/v1/{category}.json`. Il contient une empreinte du compte/client, la catégorie, la date, une révision, un état et éventuellement l'identifiant fournisseur connu. Il ne contient ni clé de signature, ni jeton, ni accès client, ni URL reçue. Il n'écrit aucune table D1 ni organisation utilisateur.

Avant le seul POST de création, une écriture conditionnelle R2 `etagDoesNotMatch:*` revendique durablement la catégorie. Deux opérations concurrentes ne peuvent pas toutes deux créer. Les transitions du journal exigent ensuite l'ETag exact. Les états sont `claimed`, `registered`, `unknown` et `rejected`. Une perte de réponse R2, un crash avant ou après POST, une erreur HTTP ambiguë, une expiration ou un accusé 201 invalide ne redonnent jamais le droit de créer. Il n'existe aucun bail expirant vers une nouvelle tentative.

Une réponse 4xx non ambiguë laisse un état `rejected`, également sans relance automatique. Les erreurs 408/409/425/429, redirections et 5xx sont conservées comme inconnues. Le fournisseur peut avoir créé l'abonnement avant la perte de réponse : recommencer le POST serait dangereux même lorsque la première liste suivante ne le retrouve pas.

Une inspection ultérieure peut constater un abonnement unique, exactement conforme, et rendre `configuration:matched` avec un journal encore `claimed` ou `unknown`. Elle ne change pas le journal. Une action `register` explicite suivante peut finaliser ce journal par CAS à partir de cette observation, sans nouveau POST. Un abonnement conforme déjà présent sans journal est simplement reconnu sans être modifié ni adopté comme une création de cet outil. Une disparition ou un changement d'identité après inscription nécessite une décision opérateur séparée ; cet outil ne supprime jamais un verrou pour réparer automatiquement.

La protection concurrente couvre les opérations passant par ce journal. Une modification administrative simultanée directement chez Pingen ne peut pas être rendue transactionnelle avec R2 ; éviter ces modifications pendant l'inscription, puis relire l'état final.

## Résultat filtré pour le driver

```ts
type Category = "issues" | "sent" | "undeliverable" | "delivered";
type Result = {
  provider: "pingen";
  environment: "production";
  mode: "webhook_setup";
  action: "inspect" | "register" | null;
  status: "ok" | "error";
  secretPresent: boolean;
  secretValid: boolean;
  listComplete: boolean;
  categories: Record<
    Category,
    {
      configuration:
        "unknown" | "missing" | "matched" | "unverified" | "conflict";
      journal: "none" | "claimed" | "registered" | "unknown" | "rejected";
    }
  >;
  notificationsVerified: false;
  canSend: false;
  error?: { code: Code; httpStatus?: number };
};
```

Les codes sont limités à `input_invalid`, `configuration_invalid`, `secret_required`, `secret_invalid`, `request_failed`, `request_timeout`, `response_invalid`, `http_error`, `scope_mismatch`, `list_incomplete`, `webhook_conflict`, `journal_invalid`, `journal_unavailable`, `journal_conflict`, `registration_pending`, `registration_rejected`. Le statut HTTP éventuel est numérique ; aucune erreur libre n'est transmise. Les quatre catégories sont toujours présentes, y compris lors d'un échec initial.

Le driver doit limiter sa connexion et son appel RPC, refiltrer le résultat et ne jamais relancer une inscription après expiration. Une expiration avant l'appel RPC n'est pas une création ; après son déclenchement, l'issue peut être inconnue et la prochaine action est seulement `inspect`.

## Preuve requise après publication

Le driver opérateur dédié utilise ces commandes, une catégorie à la fois :

```sh
node scripts/setup-pingen-webhooks.mjs --inspect
node scripts/setup-pingen-webhooks.mjs --register issues
node scripts/setup-pingen-webhooks.mjs --register sent
node scripts/setup-pingen-webhooks.mjs --register undeliverable
node scripts/setup-pingen-webhooks.mjs --register delivered
node scripts/setup-pingen-webhooks.mjs --inspect
```

Les inscriptions ne doivent être exécutées qu'après le contrôle initial et l'installation autorisée du secret ; cette liste n'est pas un script à lancer sans examiner chaque résultat.

1. Exécuter `inspect` sans secret et examiner les conflits éventuels.
2. Si la configuration le permet et que l'opérateur l'a autorisé, installer le secret de 32 caractères hexadécimaux sans fichier, argument ou sortie contenant sa valeur.
3. Inscrire explicitement chaque catégorie manquante, puis relire les quatre correspondances exactes. Conserver uniquement le résultat filtré.
4. Qualifier séparément une notification réellement signée par Pingen, au moyen de son bouton officiel **Send test webhook**, sans courrier. Les chemins `requests/send-test`, `requests` et `retry` ont des opérations vides dans l'OpenAPI observé : cette tranche n'invente aucun appel à ces chemins. Ne pas fabriquer une notification locale et la présenter comme une preuve fournisseur.

Une réponse 201 d'inscription ou un résultat `matched` prouve une configuration, pas une notification. Même après un test de transport, la corrélation réelle d'une lettre, les transitions de suivi, le financement, le tarif, le compte utilisateur et le consentement restent des qualifications distinctes. `notificationsVerified` et `canSend` restent toujours faux dans cet outil.

Sources primaires consultées le 17 septembre 2026 : [OpenAPI Pingen](https://api.pingen.com/documentation/swagger-docs) (`GET/POST /organisations/{organisationId}/webhooks`, scope `webhook`, clé de 20–32 caractères), [intégration officielle n8n Pingen](https://github.com/pingencom/n8n-nodes-pingen2), [RFC 6749 §5.1](https://www.rfc-editor.org/rfc/rfc6749#section-5.1), [écritures R2 conditionnelles](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/). Les documents/API officiels ne constituent pas une preuve d'exécution sur notre compte.

Preuve locale : tests unitaires avec véritables écritures conditionnelles R2 Miniflare et transport fournisseur fictif, notamment concurrence, résultat inconnu, crash, perte d'écriture, pagination, clés/compte étrangers, entrées strictes, délais et absence de fuite. Rapport isolé `test-results/pingen-webhook-setup-vitest.json`, distinct du rapport global de release. Aucun fournisseur réel ni configuration distante n'est sollicité par ces tests.
