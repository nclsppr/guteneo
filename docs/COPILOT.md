# Guteneo avec GitHub Copilot

Vérifié le **17 septembre 2026** sur les documentations officielles. Ce guide concerne GitHub Copilot dans **VS Code** et **Copilot CLI**. Il n’établit aucune compatibilité avec Microsoft Copilot grand public, Microsoft 365 Copilot, GitHub.com ou le coding agent hébergé. Aucune connexion réelle, publication dans un registre ou transmission depuis Copilot n’a été qualifiée ici.

Le serveur cible est `https://guteneo.com/mcp`, en Streamable HTTP. L’aperçu public reste une démonstration et n’ouvre pas ce serveur. L’accès réel nécessite la configuration Guteneo, un compte autorisé et un parcours OAuth qualifié. Les politiques de votre organisation peuvent interdire les serveurs MCP externes.

## VS Code

1. Installer une version actuelle de VS Code et se connecter à son compte GitHub Copilot autorisé.
2. Télécharger [copilot-vscode-mcp.json](../integrations/config/copilot-vscode-mcp.json). Fusionner son entrée `guteneo` dans `.vscode/mcp.json`, sous la clé **`servers`**, sans remplacer les autres serveurs. La commande `MCP: Open User Configuration` permet une configuration au niveau du profil plutôt que du dépôt.
3. Ouvrir `MCP: List Servers`, sélectionner Guteneo et démarrer la connexion. Examiner la confiance accordée au serveur et les permissions OAuth proposées. Vérifier les outils disponibles avant de les utiliser dans la conversation.

Le modèle contient uniquement `type: "http"` et l’URL. Il ne fournit ni jeton ni client OAuth enregistré. Si Guteneo fournit un **identifiant public préenregistré**, ajouter `"oauth": { "clientId": "IDENTIFIANT_PUBLIC_FOURNI_PAR_GUTENEO" }` dans l’objet `guteneo`. Ce marqueur n’est pas un client existant. L’enregistrement dynamique ne doit pas être supposé activé.

Sources : [format MCP VS Code](https://code.visualstudio.com/docs/agents/reference/mcp-configuration), [MCP dans GitHub Copilot Chat](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/extend-copilot-chat-with-mcp).

## Copilot CLI

Fusionner [copilot-cli-mcp.json](../integrations/config/copilot-cli-mcp.json) dans `~/.copilot/mcp-config.json`, sous **`mcpServers`**. Copilot CLI ne lit pas `.vscode/mcp.json` : les deux fichiers fournis ne sont pas interchangeables.

Autre possibilité, depuis le terminal :

```sh
copilot mcp add --transport http guteneo https://guteneo.com/mcp
```

Dans une session interactive, `/mcp` affiche les serveurs. `/mcp auth guteneo` relance l’authentification OAuth dans le navigateur quand elle est nécessaire ; `/mcp show guteneo` permet d’examiner les outils. `tools: ["*"]` expose les outils annoncés par ce serveur, sans supprimer leurs demandes de permission ni les contrôles Guteneo.

Pour un client préenregistré, les champs documentés sont `oauthClientId`, `oauthPublicClient: true` et `oauthGrantType: "authorization_code"` dans l’objet `guteneo`. N’ajouter l’identifiant qu’une fois fourni et qualifié. Aucun secret fournisseur, jeton collé en clair ou flux partagé `client_credentials` n’est nécessaire dans ces modèles.

Sources : [ajouter un serveur au CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers), [configuration et OAuth du CLI](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference).

## PDF, permissions et validation

Déposer le PDF original dans l’espace Documents authentifié de Guteneo, puis le retrouver avec `list_documents` / `get_document`, si ces outils sont annoncés. Aucun transfert d’une pièce jointe Copilot, chemin local, accès au disque ou adaptateur local n’est qualifié par ces modèles. Le paquet ZIP et ses instructions `fax-pdf` / `postal-pdf` ne sont pas installés par la simple configuration MCP.

Commencer par `get_capabilities`. Utiliser uniquement le canal, les outils et les tarifs retournés pour le compte. Le document, son destinataire, ses options et son devis doivent être approuvés **par la personne dans Guteneo**. Une permission donnée à Copilot n’est pas l’approbation d’envoi. Un résultat `submission_unknown` demande un rapprochement ; il ne doit jamais entraîner un renvoi automatique.

## Qualification à conserver avant ouverture

Pour chacune des deux surfaces : version exacte, permissions du compte, callback OAuth **réellement observé et enregistré**, consentement, expiration/renouvellement et révocation, isolation des organisations, PDF exact et empreinte SHA-256. Aucun callback arbitraire ou joker ne doit être ajouté pour faire fonctionner un exemple. Ne conserver aucun jeton, code OAuth, URL signée ou document personnel dans les preuves. Les tests du dépôt vérifient les fichiers distribués et l’interface locale ; ils ne constituent pas une connexion Copilot réussie.
