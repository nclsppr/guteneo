# Guteneo dans ChatGPT, Claude, Grok, Cursor et GitHub Copilot

Parcours d’installation relus dans les sources officielles le **13 octobre 2026**. Serveur cible : **https://guteneo.com/mcp**, transport Streamable HTTP, OAuth par utilisateur. La disponibilité du serveur, le téléchargement du paquet, sa connexion réelle dans un hôte et sa publication dans un catalogue sont quatre preuves distinctes. Les parcours ci-dessous expliquent l’installation manuelle ; ils ne constituent pas une nouvelle qualification des clients ou une approbation de marketplace. Les offres, versions et politiques de votre espace peuvent limiter les installations personnalisées.

Dans ChatGPT, la connexion de développement privée, la lecture, le transfert exact d’un PDF et sa vérification ont été observés dans le vrai client en septembre 2026. Un fax a ensuite été livré sur une route luxembourgeoise après approbation dans Guteneo : voir [la qualification datée et ses limites](CHATGPT_QUALIFICATION.md). Ces preuves ne qualifient ni le paquet complet actuel, ni tous les modèles ou destinations, ni le renouvellement et la révocation OAuth. Le [dossier de soumission ChatGPT](CHATGPT_MARKETPLACE.md) conserve les pièces et les prérequis ; le statut courant de revue doit être relu dans le portail avant toute publication.

Claude.ai : le consentement OAuth, le retour réussi, la découverte de 21 outils et un appel réel de `get_capabilities` sont qualifiés dans Safari le 17 septembre 2026 à 17:55 UTC, en mode `production` avec `simulation:false`. Les autres lectures, le PDF, les écritures, les envois, l’expiration et la révocation restent non qualifiés dans Claude.ai. Voir [la qualification Claude.ai](CLAUDE_QUALIFICATION.md).

Le bouton **Connecter à Claude** fournit un formulaire Claude.ai prérempli et un identifiant public à copier. Il facilite la saisie ; il ne prouve pas une connexion réussie. Le [dossier de renouvellement Claude.ai](CLAUDE_RENEWAL.md) décrit la configuration rotative préparée et ses limites. Un ancien succès de connexion ne prouve pas le renouvellement d’un jeton expiré.

## Paquet et téléchargements

Le dossier `integrations/guteneo/` contient les manifestes Agent Plugins, Claude et Cursor, les images et six parcours : accueil, e-mail, fax PDF, courrier postal, studio documentaire et contrôle PDF. Les instructions sont conditionnelles : elles n’ajoutent pas d’outil et n’activent aucun canal. Le paquet distant n’installe ni exécutable, ni hook, ni accès local au disque, et ne contient aucun secret.

Le candidat local **0.3.4 du 13 octobre 2026** harmonise cinq descriptions et titres en anglais, les liens publics anglais et la documentation d’installation. Il accompagne une correction locale de découverte de l’issuer ; il ne la déploie pas et n’active pas Auth0 ou le renouvellement. La version 0.3.2 en revue et le brouillon 0.3.3 de la [PR #52](https://github.com/nclsppr/guteneo/pull/52) restent distincts. Le candidat ne remplace aucune revue ou archive publique. Les liens `?lang=en` ne modifient pas la préférence enregistrée du compte.

Téléchargements publics : [paquet ZIP](https://guteneo.com/integrations/guteneo-plugin.zip), [version et empreinte SHA-256](https://guteneo.com/integrations/manifest.json), [Cursor MCP](https://guteneo.com/integrations/cursor-mcp.json), [Cursor OAuth statique](https://guteneo.com/integrations/cursor-static-oauth.json), [Claude Code OAuth statique](https://guteneo.com/integrations/claude-static-oauth.json), [Copilot VS Code](https://guteneo.com/integrations/copilot-vscode-mcp.json) et [Copilot CLI](https://guteneo.com/integrations/copilot-cli-mcp.json). Les modèles OAuth statiques doivent recevoir un identifiant public réellement enregistré avant utilisation.

Ces téléchargements et `main` fournissent leur dernière version publiée, pas automatiquement le candidat local 0.3.4. Le contrôle du 13 octobre a vérifié le ZIP public 0.3.2. Pour installer une version précise, comparer son manifeste et son empreinte avant de choisir une archive ou un dossier.

Le [dépôt GitHub public](https://github.com/nclsppr/guteneo) permet aussi de récupérer le dossier depuis `main` sans publication dans un catalogue :

```sh
git clone --branch main --depth 1 https://github.com/nclsppr/guteneo.git
cd guteneo
```

Les commandes de chargement du dossier ci-dessous ne nécessitent pas de compiler Guteneo. Pour **reconstruire** le ZIP depuis les sources, installer les dépendances du dépôt puis lancer :

```sh
npm ci
npm run build:integrations
# Ou fournir le dossier public de sortie, après le build du site :
node integrations/build.mjs dist/web/integrations
```

Le résultat contient `guteneo-plugin.zip`, cinq modèles JSON hôtes et `manifest.json` avec version, SHA-256 et statut de qualification. Les noms internes, leur ordre et les dates ZIP sont fixes ; le contenu est identique entre deux constructions identiques. Le script valide les manifestes portables contre les schémas officiels conservés dans `integrations/schemas/`. Le dossier de sortie par défaut est `dist/integrations`. Le build ne publie rien.

[Format OpenAI/Agent Plugins](https://developers.openai.com/plugins/build/plugins), [format Cursor](https://cursor.com/docs/reference/plugins), [format Claude Code](https://code.claude.com/docs/en/plugins-reference).

## Connexion des hôtes

### ChatGPT web

1. Ouvrir Plugins, puis `+` → **Add custom MCP server**.
2. Nommer Guteneo, décrire son usage et saisir `https://guteneo.com/mcp`.
3. Configurer OAuth, examiner les permissions et l’avertissement, puis choisir **Create as a plugin**.
4. Vérifier les outils découverts, installer le plugin créé, puis ouvrir une nouvelle conversation et sélectionner Guteneo avec `@`.

Ce parcours crée une connexion personnelle au serveur, sans attendre une publication publique. Les règles du compte ou de l’espace s’appliquent. Le guide officiel courant ne demande pas d’activer systématiquement le mode développeur. Une connexion MCP personnalisée ne distribue pas à elle seule les six skills du paquet : le plugin complet se teste séparément via une source locale et son catalogue. Après modification du serveur, utiliser **Refresh** sur sa connexion et reprendre dans une nouvelle conversation. [Parcours officiel ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt).

### Claude web et Desktop

Pour le connecteur seul, utiliser **Connecter à Claude** dans le [guide Guteneo](https://guteneo.com/assistants/claude/), ou Personnaliser → Connecteurs → Ajouter un connecteur personnalisé avec l’URL MCP. Les paramètres avancés peuvent recevoir l’identifiant public du client Claude hébergé présenté par Guteneo. Chaque membre connecte son propre compte ; les règles d’organisation restent applicables. [Connecteurs Claude](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

Pour les skills et le connecteur groupés, télécharger le ZIP, puis **Customize → Plugins → Add → Upload plugin** dans Claude web ou Desktop. Ouvrir ensuite l’onglet **Connectors** du plugin, ajouter Guteneo si nécessaire et connecter le compte. L’import du ZIP ne réalise pas le consentement OAuth. [Plugins Claude](https://claude.com/docs/plugins/overview).

### Claude Code

Depuis la racine du dépôt :

```sh
claude --plugin-dir ./integrations/guteneo
```

Ou charger directement l’archive publique :

```sh
claude --plugin-url https://guteneo.com/integrations/guteneo-plugin.zip
```

Ces options chargent le paquet pour la session. Ouvrir `/mcp` pour connecter Guteneo ; en cas d’erreur de chargement, consulter l’onglet Errors de `/plugin`. Le client OAuth hébergé Claude.ai ne remplace pas un client enregistré pour le callback localhost de Claude Code. [Chargement sans marketplace](https://code.claude.com/docs/en/plugins/create#develop-without-a-marketplace).

### Grok web et Grok Build

Sur le web, ouvrir [Connectors](https://grok.com/connectors) → **New Connector → Custom**, saisir `https://guteneo.com/mcp`, puis terminer l’authentification et examiner les outils. Un administrateur peut devoir autoriser le connecteur. [Connecteurs Grok](https://docs.x.ai/grok/connectors).

Dans Grok Build :

```sh
grok mcp add --transport http guteneo https://guteneo.com/mcp
grok mcp list
grok mcp doctor guteneo
```

Le premier usage d’un serveur OAuth ouvre le navigateur ; `/mcps` permet aussi d’authentifier le serveur. [MCP Grok Build](https://docs.x.ai/build/features/mcp-servers).

Grok Build documente également le chargement de plugins compatibles Claude Code. Depuis le dépôt, le chemin candidat du paquet est :

```sh
grok --plugin-dir ./integrations/guteneo
```

La compatibilité documentée de l’hôte ne prouve pas la connexion Guteneo ni le chargement réel de ces skills dans Grok. Le client OAuth et son callback doivent être qualifiés sur cette surface. [Plugins Grok Build](https://docs.x.ai/build/features/skills-plugins-marketplaces).

### Cursor

Pour le MCP seul, fusionner `integrations/config/cursor-mcp.json` dans `.cursor/mcp.json`. Si un client statique est nécessaire, la variante `cursor-static-oauth.json` utilise `GUTENEO_CURSOR_CLIENT_ID`, renseigné avec l’identifiant public réellement enregistré. [MCP et OAuth Cursor](https://cursor.com/docs/mcp).

Pour le plugin local, depuis la racine du dépôt :

```sh
mkdir -p ~/.cursor/plugins/local/guteneo
cp -R ./integrations/guteneo/. ~/.cursor/plugins/local/guteneo/
```

Cette copie inclut les fichiers cachés. Si une copie existe déjà, utiliser un dossier vide après avoir préservé ses éventuelles modifications. Redémarrer Cursor ou lancer **Developer: Reload Window**, puis vérifier les skills et le serveur dans **Customize** et connecter Guteneo. L’espace doit autoriser les imports locaux ; un lien symbolique pointant hors du dossier local n’est pas chargé. [Installation locale Cursor](https://cursor.com/docs/plugins#test-plugins-locally).

### GitHub Copilot et fichiers PDF

GitHub Copilot possède deux configurations distinctes : `copilot-vscode-mcp.json` pour `.vscode/mcp.json` (`servers`), et `copilot-cli-mcp.json` pour `~/.copilot/mcp-config.json` (`mcpServers`). Installation, variantes OAuth et limites : [guide GitHub Copilot](COPILOT.md). Aucun parcours Microsoft Copilot grand public n’est annoncé. Ces modèles MCP ne prouvent pas l’installation du paquet ZIP dans Copilot.

Dans ChatGPT, `import_document` utilise `openai/fileParams` lorsqu’il est fourni par l’hôte. Guteneo accepte une source HTTPS publique directe et vérifie les octets ; une source privée, expirée ou redirigée est refusée. Pour les autres hôtes sans transfert qualifié, déposer le PDF dans [Documents Guteneo](https://guteneo.com/#/app/documents), puis reprendre avec `list_documents` / `get_document`. L’adaptateur local optionnel Cursor / Claude Code est configuré séparément suivant [CURSOR.md](CURSOR.md) ; le paquet distant ne l’installe pas.

## Enregistrement OAuth

Utiliser des clients **distincts** de celui du navigateur Guteneo. Chaque client délègue un utilisateur par Authorization Code + PKCE S256 ; aucun `client_credentials` partagé ne représente un utilisateur. Ressource/audience exacte : `https://guteneo.com/mcp`. Le serveur vérifie chaque permission et résout l’organisation depuis la connexion authentifiée.

Permissions du parcours : `documents:read documents:write dispatches:prepare dispatches:send dispatches:read`. Pour une installation de consultation, limiter aux permissions de lecture. Une permission manquante produit `INSUFFICIENT_SCOPE` ; elle ne devient pas un accès parce qu’un outil est visible.

| Surface             | Callback à enregistrer                                                                                                                                                                                                                                         | Configuration                                                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ChatGPT             | Copier **exactement** le callback affiché dans la gestion du serveur. `https://chatgpt.com/connector_platform_oauth_redirect` exige l’identification d’issuer correctement annoncée et renvoyée ; sinon le callback comporte `/connector/oauth/{callback_id}`. | Client préenregistré, DCR ou CIMD réellement configuré. Ne pas déduire un callback à partir d’un identifiant fictif.                                               |
| Claude hébergé      | `https://claude.ai/api/mcp/auth_callback`                                                                                                                                                                                                                      | Client ID dans les paramètres avancés. Un client public sans secret est possible si l’autorisation serveur et l’hôte le permettent.                                |
| Claude Code         | `http://localhost:8788/callback` pour le port fixé dans le modèle fourni.                                                                                                                                                                                      | `oauth.clientId`, `oauth.callbackPort`, `oauth.scopes` dans `.mcp.json`. Remplacer `REPLACE_WITH_REGISTERED_PUBLIC_CLIENT_ID` par l’identifiant public enregistré. |
| Cursor Desktop      | `http://localhost:8787/callback`                                                                                                                                                                                                                               | `auth.CLIENT_ID` et `auth.scopes`, via le modèle `cursor-static-oauth.json`.                                                                                       |
| Cursor Web / Agents | `https://www.cursor.com/agents/mcp/oauth/callback`                                                                                                                                                                                                             | Client séparé ou callback additionnel explicitement enregistré pour cette surface.                                                                                 |

Le modèle Claude Code fixe les permissions ; remplacer son marqueur par le véritable identifiant public. L’interpolation des variables dans `oauth.clientId` n’est pas présumée. L’autre chemin documenté est `claude mcp add --transport http --client-id CLIENT_ID --callback-port 8788 guteneo https://guteneo.com/mcp`, puis connexion via `/mcp`. Aucun secret de client public ne doit être inventé. [Claude Code OAuth](https://code.claude.com/docs/en/mcp), [Claude hébergé OAuth](https://claude.com/docs/connectors/building/authentication), [Cursor OAuth](https://cursor.com/docs/mcp).

Copier une URL MCP, importer un ZIP ou conserver `REPLACE_WITH_REGISTERED_PUBLIC_CLIENT_ID` ne crée pas un client OAuth. Le modèle doit être complété par un administrateur avec un client et un callback réels. La présence d’un `registration_endpoint` dans la découverte ne prouve pas que DCR est activé, autorisé ou utilisable par ce compte. CIMD requiert également une configuration effective. À défaut d’enregistrement automatique qualifié, utiliser un client préenregistré adapté à l’hôte.

**Attention de configuration Auth0** : les clients tiers stricts Auth0 documentés dans [IDENTITY_MCP.md](IDENTITY_MCP.md) n’acceptent pas les scopes OIDC. ChatGPT peut demander `openid`, `profile` ou `email` si l’autorité les annonce. Il faut donc qualifier un client préenregistré compatible, avec consentement et permissions exactes, ou une configuration d’autorité adaptée ; annoncer DCR/CIMD ou retirer arbitrairement les scopes ne prouve pas la compatibilité. Le vrai parcours consentement, preuve signée de compte vérifié, renouvellement et révocation doit passer sur chaque hôte. La bêta Auth0 Free utilise `verified_email` sans MFA obligatoire ; la politique historique conserve son contrôle MFA lorsqu’elle est choisie. [Contrat d’authentification OpenAI](https://developers.openai.com/plugins/build/auth).

## Diagnostics de connexion et renouvellement

- **Découverte ou issuer refusé** : examiner [les métadonnées MCP](https://guteneo.com/.well-known/oauth-protected-resource/mcp), puis la découverte de l’autorité annoncée. `authorization_servers` doit conserver exactement son `issuer`, y compris le slash final. Le contrôle public du 13 octobre 2026 a observé `https://pieper.eu.auth0.com` côté Guteneo et `https://pieper.eu.auth0.com/` côté Auth0 : cet écart bloque les clients stricts. Une correction locale doit être déployée puis recontrôlée pour lever ce constat. Ne pas confondre cet issuer avec la ressource MCP `https://guteneo.com/mcp`. [RFC 8414 §3.3](https://www.rfc-editor.org/rfc/rfc8414.html#section-3.3), [découverte du SDK MCP](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/src/client/auth.ts), [autorisation MCP](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).
- **Callback refusé ou `invalid_client`** : reprendre le callback affiché par l’hôte et les paramètres du client enregistré. Le client Claude hébergé, le client localhost Code et le client Cursor ont des callbacks distincts. Le formulaire prérempli et l’identifiant public ne corrigent pas une configuration d’autorité incompatible.
- **Jeton expiré ou nouveaux scopes** : reconnecter Guteneo dans l’hôte et examiner les permissions demandées. Dans ChatGPT, **Refresh** actualise les métadonnées ; il ne prouve pas le renouvellement du jeton. Dans Code, utiliser `/mcp` ; dans Grok Build, `/mcps`. Refaire ensuite une lecture `get_capabilities` et vérifier `mode` / `simulation` et les fonctions du compte.
- **Renouvellement automatique** : la présence du code de refresh ne suffit pas. Le contrôle de production du 13 octobre 2026 ne constatait ni `offline_access` annoncé par les métadonnées MCP, ni grant refresh actif pour le client reviewer, ni accès hors ligne activé sur l’API. Le renouvellement reste à qualifier séparément pour chaque client ; reconnecter une fois après une activation réelle afin qu’une nouvelle autorisation puisse délivrer les nouveaux droits. [Configuration Claude et limites](CLAUDE_RENEWAL.md), [rotation Auth0](https://auth0.com/docs/secure/tokens/refresh-tokens/configure-refresh-token-rotation).

Conserver uniquement une preuve expurgée : date, hôte/version, issuer, outils découverts et résultat de lecture. Aucun jeton, code OAuth, contenu privé ou URL signée ne doit être copié dans un rapport. Un test local, une archive téléchargeable ou une installation sans erreur ne remplace pas la recette OAuth de bout en bout.

## Contrôle PDF/UA et PDF/A — candidat Horizon

Le candidat de paquet **0.3.2**, préparé le 2 octobre 2026, ajoute
`validate_pdf` et `get_pdf_validation`. Sur un compte disposant du forfait
**guteneo Horizon**, l’assistant contrôle l’original déjà importé et prêt, choisit
explicitement PDF/UA-1, PDF/UA-2, PDF/A-1b, PDF/A-2b, PDF/A-3b ou PDF/A-4 et garde
une clé d’idempotence stable. Le rapport est lié au SHA-256 du fichier et peut
être relu sans recommencer l’analyse. L’assistant ne souscrit pas le forfait et
ne gère pas la facturation : ces actions restent réservées à l’administrateur
authentifié dans le navigateur.

Le contrôle veraPDF couvre les règles vérifiables automatiquement. Même un
résultat favorable exige une revue humaine ; il ne certifie ni l’accessibilité
complète ni la conformité juridique. Le candidat demeure désactivé en
production ; le paquet local ne prouve aucune publication ou qualification
dans un hôte LLM réel. [Contrat et limites](PDF_ACCESSIBILITY.md),
[annonces préparées dans les quatre langues](HORIZON_LAUNCH.md).

## E-mail sans fichier, PDF joint ou lien protégé

Ajout au candidat **0.3.0 le 21 septembre 2026**. Cette mise à jour du paquet ne prouve ni sa publication dans ChatGPT, ni un envoi réel depuis un hôte. Le prompt MCP `email` et le skill distribué suivent le même contrat court :

1. Lire `get_capabilities`, puis réutiliser le destinataire, l’objet, le message et le plafond déjà fournis. Un e-mail sans fichier n’exige ni dépôt, ni analyse de PDF. Un PDF joint ou protégé doit être `ready` ; réutiliser son `documentId` ou importer les octets exacts selon les possibilités qualifiées de l’hôte.
2. Appeler `prepare_dispatch` avec `channel="email"`. Omettre `documentId` pour aucun fichier. Le fournir pour joindre le PDF original. Pour le lien protégé, ajouter `options.emailDeliveryMode="protected_link"` et `options.protectedDays` parmi `1`, `7`, `30` (défaut `7`). Le serveur construit le lien destinataire dans le contenu avant de figer l’empreinte et le devis. Présenter le message final, le mode, la durée, le supplément d’hébergement de 1 € par document lorsqu’il s’applique, et le plafond. Aucun fournisseur n’est contacté par la préparation pour remettre un message.
3. Par défaut, l’utilisateur ouvre `approvalUrl`, relit et approuve dans Guteneo, puis `confirm_dispatch` vérifie cette approbation. Sous un mandat expert déjà actif couvrant l’e-mail, `review_dispatch` permet de lire le message exact et toutes les pages du PDF éventuel ; `approve_and_send_dispatch` vérifie la revue, le mandat et l’attestation réelle `recipientRequested`. L’assistant ne crée ni n’étend son mandat. Le compte de revue ChatGPT reste limité à la préparation.
4. Un lien protégé retourne `emailDelivery.mode`, `protectedDocument.expiresAt`, `durationDays`, `hostingFeeMinor`, `passwordDelivery="sender_browser_only"` et `passwordAccessUrl`. Cette dernière URL pointe vers l’envoi dans le compte expéditeur : **l’utilisateur l’ouvre lui-même** pour révéler le mot de passe et le transmettre séparément au destinataire. L’assistant ne visite pas cette page pour le lire, ne demande pas sa copie et ne le joint jamais au même e-mail. Il n’existe aucun outil MCP de lecture de mot de passe. Les résumés MCP ne publient ni l’identifiant interne d’hébergement, ni le token du lien. La revue du contenu exact conserve le lien destinataire protégé, sans mot de passe.
5. Suivre le même envoi avec `get_dispatch_status`. `accepted` signifie accepté par le prestataire, `delivered` indique la remise au serveur destinataire et ne prouve pas la lecture du PDF. `submission_unknown` interdit un nouvel envoi ou une nouvelle clé ; le rapprochement est opérateur. Un devis e-mail expiré ne se renouvelle pas via l’outil fax.

Les API de révélation et de révocation sont réservées au navigateur avec session, contrôle CSRF et refus d’Authorization OAuth. Le destinataire ouvre une page avec mot de passe, sans compte requis ; l’expéditeur peut révoquer l’accès dans Guteneo. Les listes de destinataires multi-format, les fichiers Excel et autres pièces jointes, puis les comptes destinataires sont prévus ultérieurement.

Les tests `mcp-email` couvrent les trois modes sur le vrai transport MCP local, le refus des options secrètes, la projection limitée des réponses et l’absence d’acceptation automatique. Le ZIP combiné conserve les manifestes [Agent Plugins/OpenAI](https://developers.openai.com/plugins/reference) et [Claude Code](https://code.claude.com/docs/en/plugins-reference), avec les [skills distribués par Claude Code](https://code.claude.com/docs/en/skills). Sources officielles consultées le 21 septembre 2026.

## De l’original au fax

1. `get_capabilities` indique le mode et les blocages. Le mode de simulation ne devient jamais un envoi réel.
2. Importer le fichier exact par `import_document`, l’adaptateur local ou le dépôt authentifié `/#/app/documents`. `list_documents` retrouve un dépôt existant ; `get_document` permet de vérifier son SHA-256, ses pages et son statut. Un PDF en quarantaine reste bloqué.
3. Fournir le `documentId`, le destinataire E.164 et un plafond entier en centimes EUR à `prepare_fax`. La clé d’idempotence est stable pour cette préparation ; le serveur calcule le prix, conserve le document et retourne `approvalUrl`.
4. En mode standard, l’utilisateur ouvre ce lien, relit le document et approuve dans Guteneo. Le mode expert est désactivé par défaut ; seul un administrateur dans Guteneo peut enregistrer un mandat limité pour cette connexion OAuth. La visibilité d’un outil, ses scopes et une autorisation dans l’hôte ne créent pas ce mandat.
5. En mode standard, `confirm_dispatch` vérifie l’approbation persistée puis effectue l’acceptation commune. Sous mandat expert actif pour le fax, utiliser `review_dispatch({dispatchId})`, lire la version finale, puis `approve_and_send_dispatch({dispatchId,fingerprint,ceilingMinor,reviewToken,idempotencyKey})` : le jeton serveur expire au plus après cinq minutes, et l’outil réalise l’approbation déléguée puis l’acceptation. Ne pas ajouter de confirmation automatique ensuite. `get_dispatch_status` distingue file, acceptation fournisseur et livraison. Une réponse perdue impose de relire l’état ; une issue fournisseur inconnue ne se relance pas.

Le prompt MCP `fax_pdf` et le skill du paquet expliquent ce parcours à l’hôte. Ils ne modifient pas les droits et ne remplacent pas les contrôles serveur. Le contrat ChatGPT conserve les quatre propriétés officielles de fichier et requiert seulement `download_url` et `file_id`. [Contrat de fichier OpenAI](https://developers.openai.com/plugins/reference).

## Mandat expert facultatif

Le mandat se configure dans Mon compte, par un administrateur connecté dans le navigateur, pour une connexion OAuth précise. Il limite les canaux, les EUR par envoi et par jour, le nombre quotidien et sa durée (30 jours au plus). L’assistant ne l’active ni ne l’étend ; ses actions sont tracées comme déléguées, jamais comme une revue humaine fictive. Pour les e-mails, `recipientRequested:true` ne peut être fourni que si le destinataire a réellement demandé le message. Les permissions et confirmations de l’hôte, scopes OAuth, scanner, fournisseur, devis et crédit ne sont pas modifiés par le mandat. En cas de refus, le lien navigateur reste le repli standard. Le contrat des trois outils et leurs scopes figurent dans [EXPERT_APPROVAL.md](EXPERT_APPROVAL.md). Leur documentation n’atteste pas leur qualification dans un hôte réel.

## Preuves et recette avant publication

Le parcours courrier dispose désormais de `get_postal_requirements`, `preflight_postal_pdf`, `get_postal_preflight` et `quote_postal_draft`. Le skill `postal-pdf` impose la lecture des règles du compte avant de créer le PDF, puis le contrôle de toutes les pages et la comparaison de l’adresse. En mode standard, l’utilisateur ouvre la revue Guteneo et consent séparément au dépôt `auto_send:false`. Le mode expert peut déléguer ce transfert au moyen de `transfer_postal_draft({preflightId,fingerprint})`, uniquement sous un mandat postal préalable couvrant le transfert des données à Pingen. Le brouillon ne constitue pas une approbation d’expédition ; la revue d’envoi et son acceptation sont une étape ultérieure distincte. Une analyse Pingen en attente se consulte à nouveau sans recréer le brouillon ; une issue incertaine exige un rapprochement. Voir [POSTAL_REVIEW.md](POSTAL_REVIEW.md) pour les champs et permissions exacts. La présence des outils ne prouve pas leur qualification dans un hôte réel.

`npx vitest run tests/unit/mcp-integrations.test.ts tests/unit/auth.test.ts` couvre les vrais schémas et transports SDK locaux, la validation du paquet ZIP, la lecture isolée par organisation, les scopes, la préparation d’un fax de simulation et l’approbation humaine avant réservation atomique. Il n’appelle ni ChatGPT, ni Claude, ni Grok, ni Cursor, ni GitHub Copilot, ni un prestataire de communication.

Pour chaque hôte, conserver une preuve datée du compte/surface, de la version, du consentement OAuth, du renouvellement et de la révocation, puis du fichier original et de son SHA-256 importé. Tester les refus : mauvais scope, autre organisation, PDF en quarantaine, plafond insuffisant, approbation absente et statut incertain. Ne conserver ni jeton, ni URL signée, ni numéro personnel dans les journaux de recette. Une transmission réelle nécessite un destinataire d’essai explicitement autorisé, la configuration scanner/prestataire et un devis réel qualifié.

Pour chaque annuaire, relire le statut courant dans le portail et distinguer soumission, revue, approbation et publication effective. Les captures d’un Inspecteur MCP ou les tests locaux ne valent pas installation ou publication dans un annuaire. Chaque hôte et chaque parcours supplémentaire nécessitent leur qualification propre.
