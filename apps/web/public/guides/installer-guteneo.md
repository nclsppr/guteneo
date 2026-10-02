# Installer Guteneo par MCP

Connectez votre assistant au serveur MCP de Guteneo, puis identifiez-vous avec votre compte Guteneo. Ce parcours ne nécessite pas de plugin publié dans un catalogue.

Les guides par application sont réunis sur [guteneo.com/assistants/](https://guteneo.com/assistants/). Ils sont consultables sans compte et présentent les prérequis, les étapes de configuration, une première demande de vérification et les solutions aux problèmes courants.

- [ChatGPT](https://guteneo.com/assistants/chatgpt/)
- [Claude](https://guteneo.com/assistants/claude/)
- [Grok](https://guteneo.com/assistants/grok/)
- [GitHub Copilot, dans VS Code ou le CLI](https://guteneo.com/assistants/copilot/)
- [Microsoft 365 Copilot, parcours administrateur](https://guteneo.com/assistants/microsoft365/)
- [Cursor](https://guteneo.com/assistants/cursor/)

L'adresse du serveur public Guteneo est https://guteneo.com/mcp. La connexion et l'examen des permissions se font dans l'assistant. Dans ChatGPT, le menu « Plugins » permet aussi de créer cette connexion MCP personnalisée.

Après la première demande utilisant les outils Guteneo, consultez « Assistants » dans votre espace pour retrouver la date du dernier échange réussi.

## Plugins des catalogues

Aucun plugin Guteneo n'est publié dans les catalogues pour le moment. Utilisez les guides MCP ci-dessus. Le paquet proposé dans la documentation développeurs sert à une installation manuelle.

## Sans assistant

Vous pouvez aussi [envoyer directement depuis Guteneo](https://guteneo.com/#/app/prepare?entry=direct), sans assistant. Dans les deux parcours, les contrôles du document, du destinataire et du coût restent applicables. Le mode expert est une option distincte, limitée et révocable, réservée à un administrateur.

L'aperçu public est une démonstration isolée : aucune connexion réelle, autorisation ou communication n'y est créée. Les logos identifient les produits respectifs et n'indiquent pas de partenariat.

## Claude.ai — web et Desktop

1. Créez votre propre compte sur https://guteneo.com, vérifiez votre adresse e-mail et connectez-vous une première fois dans le navigateur.
2. Copiez cet identifiant public : `IhJieRsvZBAnl1uJO125X2SPoIHxT8ed`.
3. Ouvrez [Connecter à Claude](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Guteneo&connectorUrl=https%3A%2F%2Fguteneo.com%2Fmcp). Le formulaire contient déjà le nom Guteneo et l’adresse du serveur. Vous pouvez aussi ouvrir Personnaliser → Connecteurs → Ajouter un connecteur personnalisé et saisir Guteneo et https://guteneo.com/mcp.
4. Choisissez « Use your own OAuth client », collez l’identifiant dans « Client ID » et laissez « Client secret » vide. Ajoutez le connecteur, connectez votre propre compte Guteneo et examinez les permissions.
5. Activez Guteneo dans votre conversation. Pour vérifier la connexion sans consulter de documents ni effectuer d’envoi, demandez uniquement l’appel de `get_capabilities`.

L’identifiant public est commun aux utilisateurs ; ce n’est pas un secret et il ne donne pas accès au compte d’une autre personne. Vous n’avez aucune application Auth0 à créer. Le lien prépare le formulaire : il n’installe pas le connecteur et n’accorde aucune permission à votre place.

Sur Team et Enterprise, le propriétaire ajoute d’abord le connecteur dans les paramètres de l’organisation, puis chaque membre connecte son propre compte Guteneo. Un connecteur distant passe par l’infrastructure Anthropic, même depuis Desktop. Déposez votre PDF original dans le navigateur Guteneo puis retrouvez-le depuis votre conversation ; aucun accès implicite aux fichiers de votre ordinateur ou pièces jointes n’est promis.

Après expiration, reconnectez votre compte depuis les paramètres de connecteurs de Claude. Si vous avez révoqué l’accès dans Guteneo, réassociez d’abord l’assistant à votre organisation dans « Connecter un assistant », puis reconnectez-le dans Claude. Les fichiers de configuration « Claude Code » concernent le terminal et ne servent pas à installer le connecteur dans Claude.ai.

Sources : https://claude.com/docs/connectors/building/directory-vs-custom#share-an-install-link et https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
