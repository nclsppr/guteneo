# Guteneo — préparer sa correspondance PDF

Version de développement 0.2.0. Ce paquet décrit un serveur distant MCP, les parcours `fax-pdf` et `postal-pdf`, et les manifestes Agent Plugins, Claude Code et Cursor. Les parcours sont des instructions conditionnelles : seuls les outils annoncés et les canaux activés pour le compte peuvent être utilisés. Le paquet n’installe aucun exécutable ni hook local et ne contient aucun secret.

Serveur : **https://guteneo.com/mcp**. Connexion OAuth requise. La configuration serveur et l’accès de votre compte doivent être opérationnels ; un paquet valide ne prouve pas une connexion ni un fax réussi.

- **ChatGPT** : dans le mode développeur disponible pour votre compte, ajoutez le serveur HTTPS dans Plugins, connectez votre compte Guteneo et vérifiez les outils. Le paquet Agent Plugins peut ensuite distribuer le parcours. Aucun identifiant de plugin enregistré n’est inventé dans ce paquet.
- **Claude web / Desktop** : ajoutez l’URL comme connecteur distant dans les réglages de Claude. Le paquet Claude Code n’est pas le mécanisme d’installation du connecteur web.
- **Claude Code** : depuis le dépôt, testez avec `claude --plugin-dir ./integrations/guteneo` ; dans un paquet extrait, passez son chemin réel. Connectez-vous via `/mcp`. Un client OAuth préenregistré peut être nécessaire ; voir le guide du dépôt.
- **Cursor** : utilisez le paquet Agent Plugins ou copiez l’entrée distante dans `.cursor/mcp.json`. Si la configuration exige un client OAuth statique, utilisez le modèle Cursor du dépôt avec le véritable identifiant public délivré par Guteneo.
- **GitHub Copilot dans VS Code** : fusionnez la configuration `copilot-vscode-mcp.json` du dépôt dans `.vscode/mcp.json`, puis ouvrez `MCP: List Servers`. **Copilot CLI** utilise un fichier différent : fusionnez `copilot-cli-mcp.json` dans `~/.copilot/mcp-config.json`, puis `/mcp auth guteneo` si une authentification est demandée. Ces configurations distantes restent à qualifier avec OAuth. Elles ne prouvent pas l’installation de ce ZIP dans Copilot, sa présence dans un annuaire, ni une compatibilité avec Microsoft Copilot grand public.

Demandez : « Vérifie les fonctions de mon compte Guteneo, puis aide-moi à préparer ce PDF pour un fax ou un courrier postal ». Le destinataire, le canal et le plafond restent à préciser. Si le canal ou son outil manque, le parcours doit signaler ce blocage. Vous relisez et approuvez le document et le devis dans Guteneo avant toute transmission.

Dans ChatGPT, l’import utilise le contrat de fichier fourni par l’hôte, si sa source est autorisée par Guteneo. Pour Claude, GitHub Copilot ou tout hôte sans transfert de fichier qualifié, déposez le PDF dans [Documents Guteneo](https://guteneo.com/#/app/documents), puis utilisez son identifiant. Un adaptateur local optionnel pour Cursor et Claude Code est documenté séparément ; ce paquet ne lui donne aucun accès au disque.

Installation, enregistrement dans un annuaire et qualification réelle de chaque hôte sont des étapes distinctes. Guide détaillé : [LLM_SETUP.md](https://github.com/nclsppr/guteneo/blob/main/docs/LLM_SETUP.md).
