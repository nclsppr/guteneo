# Référence développeurs — 17 septembre 2026

Release `118ce087` publishes an optional customer-only `faxPricing` projection in REST/MCP results: estimated range in nanoEUR, firm cap in centimes, frozen FX and a separate settlement status. Existing `estimated_minor` is not a final usage charge. Supplier cost projections are removed from public dispatch responses; private accounting is unchanged. These additions have no public price-write or settlement endpoint. The publication is recorded in [LIVE_RELEASE.md](LIVE_RELEASE.md); sending remains disabled and no active fax v3 tariff is installed.

La page `/developpeurs/` et le fichier `/openapi.json` décrivent le contrat REST de la bêta, pas une ouverture commerciale. Le domaine canonique sert l’application ; seule la démonstration séparée sur `guteneo-preview.nclsppr.workers.dev` refuse ses routes API avec `403 PREVIEW_ONLY`. Vérifier les capacités et la release réellement servies avant d’utiliser un nouveau parcours. Un compte, un crédit promotionnel ou des identifiants fournisseur ne prouvent ni un transport activé ni un test réel d’assistant.

## Périmètre exact

OpenAPI 3.0.3, version métier 0.2.0 : **20 chemins, 23 opérations**. Source de vérité : `apps/api/src/index.ts`, `apps/api/src/auth.ts`, `apps/api/src/documents.ts`, `apps/api/src/postal.ts`, `packages/domain/src/index.ts` et les contrats partagés de contenu/revue postale.

| Route                                                         | Méthode               | Scope OAuth                                      |
| ------------------------------------------------------------- | --------------------- | ------------------------------------------------ |
| `/api/health`, `/api/capabilities`                            | GET                   | Public, sous réserve de la configuration globale |
| `/api/documents`                                              | GET                   | `documents:read`                                 |
| `/api/documents`                                              | POST multipart `file` | `documents:write`                                |
| `/api/documents/render`                                       | POST                  | `documents:write`                                |
| `/api/documents/{id}/content`                                 | GET PDF               | `documents:read`                                 |
| `/api/documents/{id}/rescan`                                  | POST sans corps       | `documents:write`                                |
| `/api/dispatches`                                             | GET                   | `dispatches:read`                                |
| `/api/dispatches`                                             | POST                  | `dispatches:prepare`                             |
| `/api/dispatches/{id}`                                        | GET                   | `dispatches:read`                                |
| `/api/dispatches/{id}/confirm`, `/api/dispatches/{id}/cancel` | POST sans corps       | `dispatches:send`                                |
| `/api/campaigns`                                              | GET                   | `dispatches:read`                                |
| `/api/campaigns`                                              | POST                  | `dispatches:prepare`                             |
| `/api/campaigns/{id}`                                         | GET                   | `dispatches:read`                                |
| `/api/recipients/validate`                                    | POST                  | `dispatches:prepare`                             |
| `/api/senders`, `/api/usage`                                  | GET                   | `dispatches:read`                                |
| `/api/postal/requirements` | GET, query `country` | `documents:read` |
| `/api/postal/preflights` | POST avec `Idempotency-Key` | `documents:write` et `dispatches:prepare` |
| `/api/postal/preflights/{id}` | GET | `documents:read` |
| `/api/postal/preflights/{id}/address.png` | GET PNG privé | `documents:read` |
| `/api/postal/preflights/{id}/quote` | POST sans corps, avec `Idempotency-Key` | `dispatches:prepare` |

Il n’existe pas de route REST `/api/documents/import` : `import_document` est un outil MCP. Le dépôt REST est multipart. Les URL importées par MCP doivent appartenir à l’allowlist explicite, en HTTPS et sans redirection ; un chemin local ou une URL inventée ne convient jamais.

Pour un courrier de production, lire d’abord les règles du compte, contrôler le PDF exact puis ouvrir le `reviewUrl` retourné. Le transfert vers un brouillon Pingen requiert la revue et le consentement dans le navigateur ; sa route `/transfer` reste exclue de cette référence OAuth. Le devis est une étape ultérieure qui réutilise le brouillon sans effectuer un second dépôt. Le contrôle renvoie toujours `canSend:false`. Le détail du contrat et des limites figure dans [POSTAL_REVIEW.md](POSTAL_REVIEW.md).

La réponse REST de préparation est un `Dispatch`, sans `approvalUrl`. Le client ouvre `https://guteneo.com/#/app/dispatch/{id}` avec l’identifiant retourné. MCP construit lui-même `approvalUrl`. Aucun droit OAuth ni endpoint de cette référence ne permet de produire le consentement humain : `/approve` exige une session navigateur et un contrôle CSRF. Les routes d’administration, de compte, de facturation, les callbacks et la gestion privée des fournisseurs sont exclus.

## OAuth et organisation

Client enregistré, Authorization Code + PKCE S256, `state` vérifié, retour enregistré exact. Autorisation : `https://pieper.eu.auth0.com/authorize`. Échange du code : `https://pieper.eu.auth0.com/oauth/token`. Audience REST et MCP : `https://guteneo.com/mcp`. Le jeton d’accès passe uniquement dans `Authorization: Bearer …` ; un ID token, une clé fournisseur ou un token dans l’URL n’est pas un substitut. Aucun secret client dans un client public.

Le parcours navigateur préalable crée l’espace après vérification de l’e-mail et de la preuve signée du compte. La bêta reste sur Auth0 Free avec la politique `verified_email` ; la MFA n’est pas obligatoire. L’API retrouve ensuite l’adhésion et la connexion OAuth : ni le corps de requête ni un en-tête arbitraire ne choisit le tenant. Une seule adhésion permet l’association implicite à cet espace ; plusieurs adhésions nécessitent une sélection dans les connexions. Un rôle `viewer` interdit les écritures même avec le scope ; les mêmes contrôles de compte vérifié s’appliquent à un administrateur. Le claim signé `https://guteneo.com/verified_account=true` est obligatoire dans les jetons ID et d’accès du callback en mode bêta, puis la preuve `verifiedAccount` est persistée dans la session. Une ancienne session sans cette preuve doit se reconnecter. La politique historique `verified_email_and_mfa`, conservée par défaut en l’absence de configuration explicite, exige toujours la MFA pour l’administrateur. La présence des URL OAuth dans le contrat ne garantit pas l’enregistrement d’un client donné.

## Documents et fiabilité

PDF original : 10 Mio et 100 pages maximum après validation. Les octets et le SHA-256 restent liés au document. Une création `201` peut retourner `quarantined`, avec zéro page ; seul `ready` autorise la consultation et la préparation. Le rendu HTML crée un nouveau document A4 nettoyé et ne reconstitue pas un original. La consultation PDF est privée, sans cache, sans URL signée. Le réexamen ne remplace pas une preuve d’analyse : un résultat incertain conserve la quarantaine.

Préparation et confirmation exigent chacune leur clé `Idempotency-Key` stable, de 1 à 200 caractères sans CR/LF/NUL. Les scopes d’idempotence sont distincts. Une même clé avec un contenu différent est un conflit. Aucune garantie d’idempotence n’est inventée pour la création d’une campagne.

L’empreinte lie les paramètres et le coût ; l’approbation expire au plus après 15 minutes, plus tôt si le devis expire. Confirmation, quota, crédit réservé et outbox sont atomiques. `accepted` n’est pas `delivered`. `submitting` et `submission_unknown` ne déclenchent jamais de relance automatique ; après un timeout, relire l’envoi, conserver sa clé logique et ne pas recréer une expédition.

Montants de solde/plafond en centimes EUR entiers. Les lectures enrichies des devis e-mail/postal exposent `quote_customer_nanoeur`, entier nullable en nanoEUR (1 EUR = 1 000 000 000 nanoEUR), `quote_expires_at`, `quote_pricing_basis` et, pour une base publique HT, `quote_fx` (`numerator`, `denominator`, `date`, `source`). Ces champs restent optionnels, notamment dans les listes. Aucun coût fournisseur n’est exposé. Une absence ou un null ne signifie pas zéro. `estimated_minor` est une borne arrondie au supérieur, pas un centime facturé par e-mail ni un prix final d’usage fax v3.

La consommation des devis fractionnaires utilise `ceil(cumul nanoEUR / 10^7) - ceil(cumul précédent / 10^7)` pour l’organisation entière ; le surarrondi du cumul reste inférieur à un centime. WelcomeCredit/Usage conservent leur contrat en centimes. Le crédit de bienvenue est attribué une seule fois à hauteur de 5 000 centimes aux organisations de production du parcours prévu, sans renouvellement ni recharge ; consulter `/api/usage` pour les valeurs effectives. La confirmation réserve le plafond. Les devis fixes se règlent à l’acceptation fournisseur qualifiée ; le fax v3 conserve sa réservation après acceptation ou livraison jusqu’à une preuve d’usage vérifiée séparément. Son objet `faxPricing` expose la fourchette HT, le plafond, le FX figé et `settlement.status` (`not_reserved`, `reserved`, `settled`, `released`). Après règlement, `customerNanoeur` indique la consommation validée et `chargedMinor` le débit incrémental du solde, qui peut être nul malgré une consommation positive. Une issue inconnue garde la réserve et ne déclenche aucun nouvel envoi.

Les simulations restent explicitement distinctes. Le fax réel exige une qualification privée du compte, du profil, de l’expéditeur, de la route et du tarif ; les devis e-mail/postal exigent leurs politiques qualifiées par organisation, expéditeur, compte/région, options, source, FX et date. Le courrier exige aussi un brouillon fournisseur exact lié à la revue consentie et son calcul de prix réussi. Aucune valeur tarifaire soumise par le client ne fait autorité.

Limites : HTML et texte e-mail 128 Kio UTF-8 ; CSV 256 Kio et 500 lignes ; pagination par défaut 30, maximum 100 ; HTTP authentifié 180 requêtes/minute/organisation, `Retry-After: 60` sur cette limite ; réexamens 10/jour/organisation. Dépôts/rendus ont leurs quotas quotidiens configurés. Les codes d’erreur restent des chaînes ouvertes pour intégrer les futurs diagnostics fournisseur, sans les confondre avec une permission de réessayer.

## Rendu, sécurité et maintenance

La sixième page publique est prérendue avec son titre, sa description, sa canonique, WebPage/BreadcrumbList et son contenu lisible sans JavaScript. Elle rejoint le sitemap et l’allowlist publique du Worker de preview ; les inconnues restent 404, le hostname de repli reste noindex et les routes métier restent inaccessibles. Le build conserve l’entrée JavaScript uniquement sur l’accueil et `/developpeurs/`. Le wrapper d’App épargne au guide les hooks de session et de capabilities de l’atelier.

Swagger UI **5.33.0** est empaqueté localement, sans CDN. Le loader, le bundle et sa CSS sont importés seulement au clic sur « Ouvrir la référence Swagger ». Le guide et le téléchargement fonctionnent sans ce chargement. La seule lecture du loader est `/openapi.json`, sans credentials et sans redirection ; le fichier est autonome, aucun `$ref` distant. Aucun appel API métier, formulaire OAuth, jeton ou soumission d’exemple depuis cette page.

Configuration : `supportedSubmitMethods: []`, `tryItOutEnabled: false`, `validatorUrl: null`, `queryConfigEnabled: false`, `persistAuthorization: false`, `withCredentials: false`, `deepLinking: false`. Les composants d’autorisation sont neutralisés et le `requestInterceptor` refuse toute demande issue de Swagger. Aucun `initOAuth` ni URL de configuration configurable par query. La CSP du site reste inchangée, sans `unsafe-eval` ni scripts externes. L’application publiée utilise une politique d’indexation dépendant de l’origine : voir [TECHNICAL_SEO.md](TECHNICAL_SEO.md).

La spec est volontairement suivie en JSON : une modification de route, scope, champ, statut ou limite demande une révision du contrat. Les tests comparent les opérations documentées au routeur et les scopes au middleware, valident la spec avec **@apidevtools/swagger-parser 13.0.0**, interdisent les références externes et protègent les formes sensibles (centimes entiers, champs JSON sérialisés, nullable, idempotence, absence de route d’approbation).

Sources d’intégration : [configuration officielle Swagger UI](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/), [installation officielle](https://swagger.io/docs/open-source-tools/swagger-ui/usage/installation/). Versions vérifiées sur npm le 17 septembre 2026. Les scripts optionnels de télémétrie du paquet `@scarf/scarf` n’ont pas été approuvés.

## Validation locale initiale — historique

- `npm run typecheck` et lint ciblé : passent.
- `node --test tests/security/openapi.test.mjs tests/security/public-pages.test.mjs` : 11/11 passent : contrat + génération/encodage SSR, à conserver avec toute modification.
- `npx vitest run tests/unit/preview-worker.test.ts --reporter=default` : 37 assertions de frontière preview passent.
- `npm run build:preview` : build local réussi ; bundle Swagger et CSS dans des chunks séparés, aucun changement de CSP.
- `npx playwright test --config playwright.preview.config.ts tests/preview-e2e/developers.spec.ts tests/preview-e2e/seo.spec.ts --reporter=list` : 8/8 passent sur Chromium desktop et WebKit iPhone : six routes initiales, HTTP réels, lecture sans JS, chargement différé, aucune API/exécution/authentification Swagger, requête du contrat sans cookie/Authorization, paramètres de configuration non suivis et absence de débordement. Synchronisation finale nanoEUR et présentation Swagger mobile incluses dans le dernier passage.

Aucun commit, déploiement, accès OAuth réel, communication ou activation fournisseur n’est une conséquence de ce travail de documentation.

## Published qualification — 17 September 2026

Release `118ce087c3fe5a1ad63bd4c562adb8e26aa8af21` exposes 20 paths and 23 operations on https://guteneo.com/openapi.json, with the customer-only fax v3 contract. Post-deployment developer/SEO checks passed **8/8** across desktop and iPhone in 4.6 seconds (`reports/published-118ce087-public-browser.json`); the Swagger page remains error-free, without API execution, bearer tokens or cookies on its specification request. The explicit production-public test mode verifies the separate anonymous session 401 instead of the fictional preview 403. Both exact-source CI runs passed. See [LIVE_RELEASE.md](LIVE_RELEASE.md) for exact source, Worker versions and asset proof; these checks do not qualify an authenticated API journey or activate a transport.
