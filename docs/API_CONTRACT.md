# Référence API et MCP

État vérifié dans le code le 16 septembre 2026. Cette référence décrit les routes livrées, pas un engagement de stabilité d’une API publique. REST, MCP et l’interface utilisent `DomainService` et `DocumentService`.

## Conventions et accès

La base est `APP_ORIGIN`, par exemple `http://localhost:8787` en développement. Les réponses métier sont JSON, sauf les PDF et les redirections d’authentification. Les identifiants sont opaques ; les dates sont ISO 8601 UTC ; les montants sont des entiers en centimes avec `currency: "EUR"`. `known_minor: null` signifie coût fournisseur inconnu. Conserver `X-Correlation-ID` pour diagnostiquer une erreur sans copier le contenu du document.

Deux accès sont implémentés :

- Session navigateur : cookie `HttpOnly`, `SameSite=Lax`, sécurisé hors développement. Toute mutation requiert `Origin: APP_ORIGIN` et `X-CSRF-Token`, obtenu par `GET /api/session` ; la connexion locale requiert l’origine mais n’a pas encore de session CSRF.
- Jeton délégué : `Authorization: Bearer …`, validé pour l’issuer et l’audience Auth0 configurés, puis rattaché à une connexion et à une adhésion enregistrées. Il peut appeler les routes métier REST et `/mcp`, mais ne remplace pas une session humaine pour approuver.

L’organisation provient de l’adhésion authentifiée. Aucun champ ou en-tête d’organisation fourni par le client ne permet de changer de locataire. Les rôles sont `admin`, `member`, `viewer` ; ce dernier ne peut pas créer, approuver, confirmer ou annuler un envoi. L’administration présentée ici est celle de l’organisation, pas une console transverse d’opérateur.

Les routes métier REST authentifiées et MCP partagent une limite de 180 requêtes par organisation et par minute ; dépassement : `429 RATE_LIMITED`, `Retry-After: 60`. Les crédits documentaires et les quotas d’envoi sont des limites distinctes. Les routes d’authentification, de santé et de callbacks ne passent pas par ce compteur métier.

| Route REST avec bearer                            | Scope exigé          |
| ------------------------------------------------- | -------------------- |
| `GET /api/documents…`                             | `documents:read`     |
| Mutation `/api/documents…`                        | `documents:write`    |
| Mutation se terminant par `/confirm` ou `/cancel` | `dispatches:send`    |
| Autre lecture métier                              | `dispatches:read`    |
| Autre mutation métier                             | `dispatches:prepare` |

Les restrictions de rôle et de session humaine s’ajoutent aux scopes. Les routes `/api/session`, `/api/logout` et `/api/connections` utilisent exclusivement la session navigateur. Voir [Identité et MCP](IDENTITY_MCP.md) pour les réglages Auth0, le consentement, PKCE, politique de compte vérifié, MFA conditionnelle et limites de validation réelle.

## Authentification et découverte

| Méthode et chemin                           | Entrée et résultat                                                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /auth/login`                           | Option `returnTo` relative à la même origine ; redirection vers Auth0 avec PKCE. Retour par défaut : `/#/app`.                                                             |
| `GET /auth/callback`                        | Retour Auth0 avec `state` et `code` ; vérifie et consomme l’état une fois, crée la session puis redirige.                                                                  |
| `GET /api/session`                          | `{organization:{id,name},user:{id,name,role},csrfToken,simulation,mfa,verifiedAccount}`.                                                                                                   |
| `POST /api/logout`                          | Révoque la session Guteneo courante ; `{signedOut:true}`. Ce n’est pas une déconnexion globale Auth0.                                                                      |
| `GET /api/connections`                      | `{items:[{id,client_id,organization_id,status,created_at,updated_at}]}` ; connexions du membre courant dans son organisation, maximum 100.                                 |
| `POST /api/connections`                     | `{clientId}` ; rattache ce client OAuth à l’organisation courante, invalide ses anciens jetons pour ce rattachement ; `{bound:true,reconnectRequired:true}`.               |
| `DELETE /api/connections/:id`               | Révocation locale immédiate d’une connexion possédée par le membre ; `{revoked:true}`. La révocation du grant/refresh token Auth0 reste une opération fournisseur séparée. |
| `GET /.well-known/oauth-protected-resource` | Métadonnées OAuth : ressource `/mcp`, serveur d’autorisation Auth0 et scopes disponibles. Même réponse au suffixe `/mcp`. `503` si l’identité n’est pas configurée.        |
| `POST /api/dev/login`                       | `{organization:"atelier"\|"studio"}` ; renvoie la session. Autorisé seulement en environnement `local`, mode `simulation`, sur l’origine loopback configurée.              |
| `POST /api/dev/mcp-token`                   | Session locale et CSRF requis ; `{token,expiresAt,simulation:true}`. Jeton local valable une heure, inutilisable hors de ce mode. Ne pas le journaliser.                   |

Une nouvelle inscription Auth0 crée une organisation sans crédit de transport et avec les canaux désactivés. Le navigateur ne propose pas encore de sélection multi-organisation. Une connexion OAuth ne constitue pas une approbation d’expédition.

## Capacités et documents

| Méthode et chemin                      | Entrée et résultat                                                                                                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                      | Public ; `{status:"ok",mode}`. Indique que le Worker répond, sans certifier la santé des prestataires.                                                                                               |
| `GET /api/capabilities`                | Public ; `mode`, `simulation`, `channels`, `limits`, `documents`, `mcpUrl`, `identity`, `scanner`, `assistants`, `productionBlockers`, `humanApproval:"authenticated_browser"`, `liveSending:false`. |
| `GET /api/documents?cursor=…&limit=30` | `{items:Document[],nextCursor:string\|null}`.                                                                                                                                                        |
| `POST /api/documents`                  | `multipart/form-data`, champ binaire `file` ; `201 Document`. Aucun envoi n’est créé.                                                                                                                |
| `POST /api/documents/render`           | JSON strict `{name,html}` ; `201 Document`, `source:"render"`. Crée un nouveau PDF à partir du HTML filtré.                                                                                          |
| `GET /api/documents/:id/content`       | PDF privé exact, `Content-Type: application/pdf`, `X-Document-SHA256`, `Cache-Control: private, no-store` ; consultation auditée.                                                                    |

`Document` contient `id`, `organization_id`, `name`, `sha256`, `size`, `pages`, `status`, `source`, `created_at` et actuellement `storage_key`. Cette clé interne ne donne aucun droit d’accès au bucket privé ; utiliser la route de contenu authentifiée. `source` vaut `import` ou `render`, et `status` vaut `ready`, `quarantined`, `rejected` ou `purged`.

Un import conserve les octets d’origine et déduplique par SHA-256 dans l’organisation. Réutiliser son `documentId` pour plusieurs envois. La réponse d’import peut être `quarantined` : un succès HTTP ne signifie pas que le fichier peut être affiché ou expédié. L’aperçu en quarantaine renvoie `423 DOCUMENT_QUARANTINED` ; la préparation d’envoi est également bloquée. Hors simulation locale, scan exact et validation isolée sont nécessaires pour passer à `ready`.

Limites actuelles : PDF 10 Mio et 100 pages ; HTML 128 Kio UTF-8 ; nom de rendu 180 caractères. Le rendu supprime scripts, styles utilisateur, images, SVG et ressources externes, puis applique un modèle A4 contrôlé. Il n’est pas une conversion fidèle d’un HTML arbitraire. L’import URL est exposé par MCP uniquement : HTTPS sur hôtes explicitement autorisés, sans redirection ; une URL locale ou arbitraire est refusée.

## Préparation, approbation et acceptation d’un envoi

| Méthode et chemin                       | Entrée et résultat                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `POST /api/dispatches`                  | Corps ci-dessous et `Idempotency-Key` ; `201 Dispatch` au statut `prepared`.                             |
| `GET /api/dispatches?cursor=…&limit=30` | `{items:Dispatch[],nextCursor:string\|null}`.                                                            |
| `GET /api/dispatches/:id`               | `{dispatch,events,attempts,approval}`.                                                                   |
| `POST /api/dispatches/:id/approve`      | Session humaine + CSRF ; JSON strict `{fingerprint}` (SHA-256 hexadécimal). Retourne `Dispatch`.         |
| `POST /api/dispatches/:id/confirm`      | `Idempotency-Key` requis ; aucun paramètre de corps utilisé. Retourne le `Dispatch` accepté durablement. |
| `POST /api/dispatches/:id/cancel`       | Aucun paramètre de corps utilisé ; retourne `Dispatch` annulé ou `409 CANCELLATION_TOO_LATE`.            |

Le corps de préparation est strict au premier niveau :

```ts
{
  channel: "fax" | "email" | "postal";
  recipient: Record<string, string>;
  documentId?: string;
  senderId?: string;
  subject?: string;
  html?: string;
  text?: string;
  options?: Record<string, unknown>;
  campaignId?: string;
  ceilingMinor?: number;
}
```

| Canal    | Destinataire et contenu                                                                                                                                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fax`    | `{phone}` international ; normalisation des espaces, parenthèses et tirets. Indicatifs autorisés `+33`, `+352`, `+49`. `documentId` prêt requis. Aucune destination réelle n’est préremplie.                                                  |
| `email`  | `{email}` normalisé en minuscules ; objet et HTML final filtré, texte explicite ou dérivé. `documentId` facultatif pour joindre un PDF prêt. Chaque commande vise un seul destinataire.                                                       |
| `postal` | `{name,line1,postalCode,city,country}` ; pays `FR`, `LU`, `DE`. `documentId` prêt requis. Le modèle courant persiste une seule ligne de rue ; un `line2` non vide est refusé par `ADDRESS_LINE_UNSUPPORTED`, jamais supprimé silencieusement. |

L’expéditeur doit être vérifié pour l’organisation, le canal et le mode. Sans `senderId`, le service sélectionne un profil vérifié existant. `options.kind:"marketing"` est refusé (`MARKETING_NOT_ENABLED`) tant que le parcours de désinscription n’est pas raccordé. Les options simulées d’impression ne démontrent pas une qualification du format réel Pingen.

La réponse REST `Dispatch` expose notamment `id`, `organization_id`, `campaign_id`, `channel`, `recipient_json`, `document_id`, `sender_id`, `sender_address`, `subject`, `html`, `text`, `options_json`, `status`, `mode`, `estimated_minor`, `ceiling_minor`, `known_minor`, `currency`, `fingerprint`, `provider`, `provider_id`, `created_at`, `updated_at`. Les champs suffixés `_json` sont des chaînes JSON, pas des objets. Des champs internes de suivi sont également présents ; ils ne sont pas modifiables par une route publique.

Le parcours attendu est préparation → consultation du contenu final → approbation humaine → confirmation. L’approbation est enregistrée en base, liée à l’empreinte de l’envoi et valable 15 minutes. **`GET /api/dispatches/:id` renvoie `approval:{fingerprint,expires_at}` uniquement si elle correspond à l’empreinte courante et n’a pas expiré ; sinon `approval:null`.** Le statut reste `prepared` après approbation : le frontend ne doit pas déduire le consentement d’un état local ou du statut seul. Les événements et tentatives renvoyés sont ordonnés et limités à cet envoi.

La confirmation réserve atomiquement un envoi et son plafond `ceiling_minor`, change son état et insère l’outbox. La publication Queue est tentée ensuite ; une panne de publication ne supprime pas l’acceptation en base. Les montants de simulation sont des valeurs de test, pas des tarifs commerciaux. **En mode `production`, le fax exige un devis immuable issu d’un tarif qualifié côté serveur ; sans configuration effective, la préparation retourne `409 LIVE_PRICING_REQUIRED`. Les autres canaux restent fermés.** Configurer les secrets des connecteurs ou activer un canal ne contourne pas cette fermeture.

`Idempotency-Key` est requis pour préparer et confirmer : 1 à 200 caractères, sans CR/LF/NUL, limité à l’organisation et à l’opération. Même clé et même entrée retrouvent la commande ; une entrée différente renvoie `409 IDEMPOTENCY_CONFLICT`. Deux confirmations ne créent pas deux réservations. Les autres créations, notamment celle d’une campagne, n’offrent pas ce contrat d’idempotence. Il n’existe pas de route de modification d’un contenu approuvé : préparer une nouvelle commande avec une nouvelle clé et obtenir une nouvelle approbation.

Les statuts sont `prepared`, `queued`, `submitting`, `submission_unknown`, `accepted`, `delivered`, `failed`, `cancelled`, `bounced`, `complained`, `printed`, `handed_to_post`. `accepted` signifie acceptation par le prestataire ; `delivered` par e-mail ne prouve pas la lecture ; `printed` et `handed_to_post` ne prouvent pas la livraison postale. `submission_unknown` exige rapprochement et conserve la réservation : aucun retry ou changement de canal automatique. L’annulation publique fonctionne seulement depuis `prepared` ou `queued` ; une répétition sur `cancelled` reste sans nouvelle expédition.

## Campagnes, CSV et administration

| Méthode et chemin                      | Entrée et résultat                                                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/campaigns`                  | JSON strict `{name}` (1–150 caractères) ; `201 Campaign`, statut initial `draft`.                                                                         |
| `GET /api/campaigns?cursor=…&limit=30` | `{items:Campaign[],nextCursor:string\|null}`.                                                                                                             |
| `GET /api/campaigns/:id`               | `{campaign,dispatches:Dispatch[]}` ; détail borné à 500 envois.                                                                                           |
| `POST /api/recipients/validate`        | JSON strict `{csv}` ; `{rows,errors,duplicates,valid}`. Validation sans création d’envoi.                                                                 |
| `GET /api/senders`                     | `{items:[{id,channel,name,address,status,mode}]}`. Lecture uniquement.                                                                                    |
| `GET /api/usage`                       | `{items:[{channel,period,limit_count,reserved_count,confirmed_count,limit_minor,reserved_minor,confirmed_minor,currency}]}` ; mois UTC courant `YYYY-MM`. |
| `GET /api/admin`                       | Rôle `admin` ; `{states,outbox,uncertain,audit,controls,deadLetters,simulation,capabilities}` limité à l’organisation.                                    |
| `POST /api/admin/channels/:channel`    | Session navigateur `admin` + CSRF ; JSON strict `{enabled:boolean}` ; arrêt/reprise audité du canal, réponse `{channel,enabled}`.                         |

Une campagne contient `id`, `organization_id`, `name`, `status`, `manifest_hash`, `created_at`, `updated_at`. Ajouter les destinataires par des préparations individuelles avec le même `campaignId`, en réutilisant le document. La première approbation fige la liste et son manifeste ; toute insertion ultérieure est rejetée. Chaque envoi est approuvé et confirmé séparément. Il n’existe pas encore de route d’acceptation en masse ou de matérialisation asynchrone d’une très grande campagne.

Le CSV est limité à 256 Kio UTF-8 et 500 lignes de données. `channel` est obligatoire ; seules les colonnes `channel,email,phone,name,line1,postalCode,city,country` sont acceptées. Les lignes retournées ont `{line,channel,recipient}` ; les erreurs `{line,message}` ; les doublons `{line,duplicateOf}`. Les numéros incluent l’en-tête (première ligne de données : 2). Les doublons restent présents dans `rows` et rendent `valid:false` : le client doit les résoudre avant de créer des commandes. Les formules de tableur sont refusées ; aucun canal de remplacement n’est choisi.

Les listes paginées utilisent `cursor` opaque et `limit` (30 par défaut, borné de 1 à 100), tri décroissant par création puis identifiant. Utiliser le `nextCursor` retourné sans le reconstruire. Les diagnostics admin exposent au plus 100 états incertains, 100 éléments de file d’échec et 50 lignes d’audit. Il n’y a pas de route publique de crédit de compte, de vérification d’expéditeur, de retry physique aveugle ou d’accès opérateur au contenu d’une autre organisation.

## Callbacks et récupération fournisseur

`POST /webhooks/telnyx`, `/webhooks/ses` et `/webhooks/pingen` sont des points d’entrée fournisseurs, sans session utilisateur. Ils vérifient la signature sur le corps original et les paramètres attendus de compte/application/topic selon le connecteur. Corps limité à 1 000 000 octets. L’événement normalisé vérifié, ou les métadonnées d’un événement non reconnu, est enregistré et dédupliqué avant acquittement ; projection immédiate si possible, sinon reprise bornée par le cron.

Réponse usuelle : `200 {received:true}` ; événement durable dont la projection est différée : `202 {received:true,projection:"pending"}`. Échecs : `401 WEBHOOK_REJECTED`, `413 WEBHOOK_TOO_LARGE`, `503 WEBHOOK_UNAVAILABLE` ou `503 WEBHOOK_STORAGE_UNAVAILABLE`. Ces erreurs ont une enveloppe `{error:{code}}`. Une notification SNS de souscription ne provoque jamais l’appel d’une `SubscribeURL` arbitraire ; l’opérateur termine le raccordement documenté dans [Prestataires](PROVIDERS.md).

`GET /media/:token` sert uniquement la récupération temporaire d’un PDF par Telnyx. Le jeton opaque est créé au début de la tentative réelle, valable au plus 45 minutes et lié à l’organisation, au document exact, à l’envoi et à la tentative active. La route recontrôle l’état autorisé et l’intégrité SHA-256. Elle ne nécessite pas de cookie : le jeton est une capacité sensible à ne jamais copier dans les logs. Hors activation réelle autorisée, après expiration ou pour une référence invalide, elle retourne `404` sans révéler l’existence du document. L’aperçu utilisateur reste `/api/documents/:id/content`.

`preparePostalDraft` est une fonction interne du pont Pingen, avec préflight et empreinte ; **aucune route REST ni aucun outil MCP public ne crée ce brouillon fournisseur**. L’activation du courrier réel reste bloquée par le raccordement de ce parcours au tarif et à l’approbation. Voir [Activation réelle](LIVE_ACTIVATION.md).

## MCP Streamable HTTP

`/mcp` utilise `createMcpHandler`, sans session MCP durable. Le serveur exige un bearer ; un appel non authentifié reçoit le challenge OAuth avec `resource_metadata`. Les jobs survivent à la conversation. Les entrées des outils sont strictes ; les résultats incluent `structuredContent` et une version texte JSON : `{ok:true,data}` ou `{ok:false,error:{code,message}}`, avec `isError:true` pour une erreur d’outil. Les erreurs de protocole et d’authentification peuvent intervenir avant ce résultat métier.

| Outil                 | Entrée principale                                     | Scope                  |
| --------------------- | ----------------------------------------------------- | ---------------------- |
| `get_capabilities`    | `{}`                                                  | Authentification seule |
| `import_document`     | `{file:{download_url,file_id,mime_type?,file_name?}}` | `documents:write`      |
| `render_pdf`          | `{name,html}`                                         | `documents:write`      |
| `prepare_dispatch`    | Champs de préparation et `idempotencyKey`             | `dispatches:prepare`   |
| `confirm_dispatch`    | `{dispatchId,idempotencyKey}`                         | `dispatches:send`      |
| `get_dispatch_status` | `{dispatchId}`                                        | `dispatches:read`      |
| `list_dispatches`     | `{cursor?,limit?}`, défaut 20, maximum 50             | `dispatches:read`      |
| `cancel_dispatch`     | `{dispatchId}`                                        | `dispatches:send`      |

`import_document` déclare `_meta["openai/fileParams"]:["file"]` et les quatre propriétés de fichier ; seules `download_url` et `file_id` sont obligatoires. Il importe les octets avant de rendre un identifiant durable, jamais un chemin du disque distant. L’utilisation effective d’un PDF généré dans ChatGPT reste non vérifiée. Voir [Identité et MCP](IDENTITY_MCP.md) et [Adaptateur Cursor](CURSOR.md).

Les résumés MCP utilisent des champs camelCase : document `{id,name,sha256,size,pages,status,source,createdAt,previewUrl,simulation}` ; envoi `{id,channel,status,mode,recipient,documentId,campaignId,fingerprint,estimatedMinor,ceilingMinor,knownMinor,currency,updatedAt,approvalUrl,nextActions}`. `get_dispatch_status` expose ce résumé, pas la timeline complète ni le champ REST `approval`. Le lien d’approbation est `/#/app/dispatch/:id` et exige la connexion humaine. Aucun outil d’approbation n’est exposé ; `user_confirmed:true` n’est pas accepté. Les options MCP actuellement déclarées sont `kind`, `color` et `duplex`, plus étroites que l’objet REST.

## Erreurs et preuve disponible

Les erreurs REST métier suivent `{error:{code,message}}`, éventuellement `fields:[{path,message}]` pour `VALIDATION_ERROR`. Traiter `code` plutôt que le texte localisé. Codes usuels :

| Statut        | Exemples et réaction                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `400`         | `VALIDATION_ERROR`, `IDEMPOTENCY_REQUIRED`, `INVALID_CURSOR`, `SOURCE_NOT_ALLOWED` : corriger la requête.                                                                                                                                  |
| `401` / `403` | Session ou jeton invalide, scope/rôle insuffisant, CSRF/origine refusés : réauthentifier ou corriger l’autorisation ; ne pas attribuer l’organisation côté client.                                                                         |
| `404`         | `NOT_FOUND`, `DOCUMENT_UNAVAILABLE` : ressource absente ou non accessible dans cette organisation.                                                                                                                                         |
| `409`         | `IDEMPOTENCY_CONFLICT`, `APPROVAL_REQUIRED`, `FINGERPRINT_MISMATCH`, `QUOTA_EXCEEDED`, `CHANNEL_DISABLED`, `CAMPAIGN_FROZEN`, `RECIPIENT_SUPPRESSED`, `LIVE_PRICING_REQUIRED`, `LIVE_QUOTE_INVALID` : résoudre la condition métier avant une nouvelle tentative. |
| `413` / `423` | Contenu trop volumineux ou document en quarantaine.                                                                                                                                                                                        |
| `429`         | `RATE_LIMITED` ou `CONTENT_QUOTA_EXCEEDED` : débit HTTP ou budget documentaire, respectivement.                                                                                                                                            |
| `500` / `503` | `INTERNAL_ERROR`, `CONFIGURATION_INVALID`, `RENDERER_NOT_CONFIGURED` : conserver la corrélation ; après une confirmation dont la réponse est perdue, lire l’envoi ou rejouer la même clé, sans créer une nouvelle commande.                |

La vérification HTTP exécutée est conservée dans [reports/http-smoke.json](../reports/http-smoke.json). Commande : `node scripts/http-smoke.mjs --with-server`, après installation, migration, seed et build web du README. Elle utilise les services locaux Wrangler/workerd/D1/R2/Queues, ajoute 15 e-mails simulés à `org_studio`, conserve les données existantes et n’accorde pas de crédits supplémentaires.

Ce rapport atteste 28 contrôles et un p95 de 21,01 ms pour 15 confirmations séquentielles locales, en incluant l’acceptation D1 et la tentative de publication Queue, hors upload/rendu/préparation/revue humaine. La première observation du résultat simulé a un p95 de 1 018,61 ms et inclut le passage en file et le polling après le lot. **Ce n’est pas une mesure de latence d’ingestion des callbacks, de staging, de charge cible, de disponibilité mensuelle ou de livraison réelle.** Auth0, les trois assistants et les prestataires n’ont pas été qualifiés dans leurs comptes réels.

## Comptes, facturation et intégrations v0.2

Les routes de profil, sessions et équipe sont décrites dans [ACCOUNT_ADMIN.md](ACCOUNT_ADMIN.md). Les routes de facturation et le webhook Stripe sont documentés dans [BILLING.md](BILLING.md). Les deux modules exigent une session navigateur et vérifient les droits actuels de l’atelier ; un jeton d’assistant ne donne pas accès à ces réglages.

`POST /api/documents/:id/rescan` relance l’analyse du PDF original avec les droits `documents:write` ou une session navigateur protégée contre les requêtes forgées. `POST /api/admin/scanner/warm` est réservé à l’administrateur dans le navigateur. Le serveur ne déclare le document prêt qu’après analyse propre, égalité de hash et validation PDF isolée. Voir [SCANNER_RESCAN.md](SCANNER_RESCAN.md).

Le MCP ajoute la consultation des documents, la préparation simplifiée d’un fax et `rescan_document`. Les outils conservent les mêmes portées et ne peuvent pas accorder l’approbation humaine. Installation et limites des hôtes : [LLM_SETUP.md](LLM_SETUP.md). Devis fax, expiration et source de tarification : [LIVE_FAX_QUOTES.md](LIVE_FAX_QUOTES.md).

## Shared welcome credit

`GET /api/billing` and `GET /api/usage` expose the same `welcomeCredit` projection: `kind`, `currency`, `grantedMinor`, `reservedMinor`, `spentMinor`, `availableMinor`, `grantedAt`, `status`, `renewal: "none"` and `topUpAvailable: false`. Production grants EUR5000 minor units once per organization. A local simulation does not create a real promotional grant; the standalone public preview has its own fictional balance. Dispatch confirmation reserves the approved ceiling atomically with acceptance and the outbox write. See [WELCOME_CREDIT.md](WELCOME_CREDIT.md) for settlement and uncertainty rules.
