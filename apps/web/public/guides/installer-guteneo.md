# Installer Guteneo dans votre assistant

Guide du 18 septembre 2026. Serveur : https://guteneo.com/mcp

L’aperçu public ne connecte aucun compte et n’envoie aucun document. Sur le service Guteneo, la connexion à Claude.ai et l’appel de lecture des fonctions disponibles ont été vérifiés le 17 septembre 2026. Cela ne qualifie pas le transfert de PDF, les envois ou les autres assistants, et ne constitue pas une publication dans un annuaire.

## ChatGPT

1. Ouvrez Paramètres → Sécurité et connexion → Mode développeur, si votre compte et votre espace le permettent.
2. Dans Plugins, cliquez sur + et ajoutez Guteneo avec l’URL https://guteneo.com/mcp.
3. Connectez votre compte Guteneo, examinez les permissions et vérifiez les outils.
4. Dans une conversation, ajoutez la connexion Guteneo depuis le menu des outils.

Source : https://developers.openai.com/plugins/deploy/connect-chatgpt

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

## Cursor

Téléchargez /guides/cursor-mcp.json et fusionnez son entrée guteneo dans votre fichier .cursor/mcp.json. Conservez les autres serveurs déjà configurés. Connectez ensuite votre compte Guteneo dans les paramètres MCP, puis vérifiez les outils disponibles. Le fichier ne contient ni secret ni commande exécutée localement.

Cette configuration ne donne pas accès au disque. Déposez le PDF dans Guteneo. L’adaptateur d’import local décrit dans le dépôt du projet exige une configuration séparée et un dossier explicitement choisi.

Source : https://cursor.com/docs/mcp

## GitHub Copilot dans VS Code

Téléchargez /guides/copilot-vscode-mcp.json. Fusionnez l’entrée guteneo sous la clé `servers` dans `.vscode/mcp.json`, en conservant vos autres serveurs. Dans VS Code, ouvrez `MCP: List Servers`, sélectionnez Guteneo et examinez les permissions de connexion avant de vérifier les outils.

La configuration utilise HTTP et l’adresse publique Guteneo. Si un client OAuth préenregistré est nécessaire, Guteneo devra fournir son identifiant public ; le modèle seul ne crée pas ce client. Un compte et une politique d’organisation autorisant MCP sont requis.

Source : https://code.visualstudio.com/docs/agents/reference/mcp-configuration

## GitHub Copilot CLI

Téléchargez /guides/copilot-cli-mcp.json et fusionnez l’entrée guteneo sous `mcpServers` dans `~/.copilot/mcp-config.json`. Le CLI ne lit pas le fichier `.vscode/mcp.json` : les deux modèles sont distincts. Dans une session interactive, `/mcp auth guteneo` ouvre la connexion OAuth lorsqu’elle est nécessaire ; `/mcp show guteneo` affiche les outils.

Ces deux parcours GitHub Copilot restent à qualifier sur des comptes réels. Ils ne concernent pas Microsoft Copilot grand public. Déposez le PDF dans Guteneo : ces configurations ne donnent aucun accès au disque et ne promettent pas le transfert d’une pièce jointe Copilot. Elles n’installent aucun paquet de skills.

Sources : https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers et https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference

## Votre premier message

Avec Guteneo, vérifie les fonctions disponibles pour mon compte. Aide-moi à préparer un courrier et à choisir son canal. Demande-moi les informations manquantes, puis présente le document, le destinataire et le coût pour ma validation dans Guteneo. N’effectue aucun envoi sans cette validation.

Ce message ne peut pas installer un connecteur, accorder une permission ou remplacer l’authentification. La validation humaine a lieu dans Guteneo sur une version précise du document, du destinataire et du coût. Un résultat fournisseur incertain n’est jamais relancé automatiquement.

## Crédit et tarification

À l’ouverture du service, l’offre prévue est une dotation unique de 50 € à la création du compte, partagée entre les canaux, sans renouvellement mensuel. Un solde insuffisant bloque les nouveaux envois. Le rechargement Stripe est désactivé.

Tarifs clients indicatifs, hors taxes, vérifiés le 17 septembre 2026 :

- E-mail : environ 0,28 € pour 1 000 e-mails à un destinataire. Pièces jointes : environ 0,21 € par Go en supplément. Offre Essentials.
- Fax : environ 0,03 à 0,12 € pour le scénario d’une page vers un numéro fixe luxembourgeois, depuis un numéro de l’EEE, pour 1 à 3 minutes de transmission. Le montant varie selon la route et les surcharges ; cette estimation n’est pas un plafond garanti. Autres destinations et durées sur devis.
- Courrier postal : dès 2,50 € par lettre vers la France et dès 3,02 € vers le Luxembourg. Exemples pour une page en noir et blanc sur papier normal, port économique inclus, moins de 500 lettres par mois et grille locale du pays concerné. Autres routes, pages, couleur, papier et modes d’expédition sur devis.

La conversion des montants en dollars utilise le cours BCE du 16 septembre 2026 : 1 € = 1,1537 $ US. Le devis final, ses éventuels suppléments, sa devise et les taxes seront présentés avant validation. Ces services sont en préparation ; l’aperçu n’effectue aucun envoi réel.

Grok est présenté à titre informatif : son intégration n’est pas disponible. Les logos identifient leurs produits respectifs et n’indiquent ni partenariat ni validation des parcours Guteneo.
