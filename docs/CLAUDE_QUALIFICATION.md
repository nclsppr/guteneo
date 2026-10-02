# Qualification Claude.ai — 17 septembre 2026

La configuration Auth0 dédiée à Claude.ai a été créée et relue. **Le consentement, le retour OAuth réussi, la découverte de 21 outils et un appel réel de `get_capabilities` sont qualifiés dans le vrai navigateur.** L’appel a réussi le **17 septembre 2026 à 17:55 UTC**, en mode `production` avec `simulation:false`. Ce constat concerne Claude.ai dans Safari avec le compte Free observé ; il ne qualifie ni Claude Code ni d’autres comptes ou surfaces Claude.

Suite du 18 septembre : le bouton d’installation et le renouvellement rotatif
sont préparés dans [CLAUDE_RENEWAL.md](CLAUDE_RENEWAL.md). Leur validation locale
ne modifie pas l’état distant décrit ci-dessous ; activation et qualification
du renouvellement réel restent à effectuer.

## Configuration Auth0 vérifiée

Le client a été créé puis relu le **17 septembre 2026 à 17:48:15.683 UTC**.

| Paramètre | Valeur vérifiée |
| --- | --- |
| Nom | `Guteneo - Claude hosted` |
| Identifiant public du client | `IhJieRsvZBAnl1uJO125X2SPoIHxT8ed` |
| Callback | `https://claude.ai/api/mcp/auth_callback` |
| Authentification au token endpoint | `none` |
| Grant autorisé | `authorization_code` uniquement |
| Ressource cible | `https://guteneo.com/mcp` |
| Connexion de compte | `Guteneo-Accounts` uniquement |

L’identifiant du client est une configuration publique, pas un secret. La liaison à `Guteneo-Accounts` a été vérifiée par lecture de la relation `GET /connections/{id}/clients`. Aucun autre client OAuth n’a été modifié. Les Actions, les réglages du tenant et le Worker n’ont pas été redéployés ou modifiés pour cette installation.

Les codes effectivement déployés des deux Actions Auth0 ont été relus puis exécutés localement en VM avec des fixtures. Un nouveau client demandant la bonne audience, avec la bonne connexion, un compte vérifié et PKCE S256, déclenche les appels d’ajout du claim `https://guteneo.com/verified_account` dans les API simulées des jetons ID et d’accès. Les cas mauvais PKCE et mauvaise connexion sont refusés ; un compte non vérifié ne déclenche pas cet ajout. Cette vérification locale ne produit pas de JWT signé. Elle explique la couverture du nouveau client par l’audience, sans modifier les Actions, et reste distincte de la preuve du parcours réel dans Claude.ai ci-dessous.

## Installation observée dans Claude.ai

Dans Safari, avec l’utilisateur connecté à Claude.ai, un connecteur personnalisé nommé **Guteneo** a été ajouté avec les paramètres suivants :

- Serveur : `https://guteneo.com/mcp`.
- Transport : Streamable HTTP.
- Client OAuth propre : identifiant public ci-dessus.
- Secret client : champ vide.

Le consentement Auth0 réel a été accepté pour les cinq permissions `documents:read`, `documents:write`, `dispatches:prepare`, `dispatches:send` et `dispatches:read`. Ces permissions n’établissent pas qu’un outil a été invoqué ; elles ne créent pas d’approbation humaine d’envoi ni de mandat expert.

Le retour Auth0 a réussi dans Claude.ai : l’interface affiche le bouton **Disconnect** et 21 outils, classés en neuf outils de lecture et douze outils d’écriture. Tous les réglages **Needs approval** ont été conservés.

## Appel réel en lecture seule

Une nouvelle conversation avec **Sonnet 5, High** a reçu cette demande :

> Vérifie la connexion à Guteneo en appelant uniquement son outil get_capabilities. Indique si cet appel a réussi et le mode retourné. Ne consulte aucun document ou envoi, ne crée rien et ne déclenche aucune communication.

L’approbation dans Claude a été limitée à **Allow once**. Les réglages persistants **Needs approval** restent inchangés. À **17:55 UTC**, la trace dépliée **Get capabilities** a exposé une réponse brute réussie. Les champs vérifiés sont :

| Champ | Valeur observée |
| --- | --- |
| `ok` | `true` |
| `data.name` | `Guteneo` |
| `data.version` | `0.2.0` |
| `data.mode` | `production` |
| `data.simulation` | `false` |
| `data.humanApproval` | `authenticated_browser` |
| `data.approval.default` | `authenticated_browser` |
| `data.approval.expert.connection.state` | `inactive` |
| `data.approval.expert.connection.canUseExpert` | `false` |
| `data.approval.expert.connection.canTransferPostalDraft` | `false` |

Claude a ensuite confirmé la réussite dans sa réponse finale. Cette preuve porte sur l’authentification du connecteur, la découverte des outils et cet unique appel de capacités en production. Aucun appel de `list_documents` ou `list_dispatches` n’a été effectué ; aucun document ou envoi existant n’a été consulté. La version applicative retournée ne constitue pas une preuve d’un nouveau déploiement du Worker.

## Qualification restant à effectuer

1. Qualifier séparément les autres lectures et les outils d’écriture. Leur présence dans la liste ne prouve pas leur exécution.
2. Qualifier l’expiration, la reconnexion et la révocation. Le client enregistré n’autorise que `authorization_code` et les refresh tokens restent désactivés : une reconnexion est nécessaire à l’expiration, sans preuve de ce parcours dans cette recette.
3. Qualifier l’import exact et son SHA-256 avant toute affirmation de transfert natif d’un PDF joint à Claude. Le dépôt authentifié dans Guteneo, suivi de `list_documents` / `get_document`, reste le parcours documenté, non testé ici.
4. Qualifier séparément les préparations, approbations et communications réelles sous leur autorisation propre. Le succès de `get_capabilities` ne qualifie aucun envoi ni transfert de document.

Aucun import, rendu, préparation, approbation d’envoi, envoi de communication ou activation de mandat expert n’a été effectué pour cette installation. Aucun jeton, code OAuth, URL de retour contenant un code, adresse e-mail ou contenu utilisateur n’est conservé dans cette note. L’installation privée du connecteur reste distincte de la publication dans un annuaire et de l’installation du paquet de skills.

Configuration générale et limites des hôtes : [LLM_SETUP.md](LLM_SETUP.md). Contrôles d’identité : [IDENTITY_MCP.md](IDENTITY_MCP.md).
