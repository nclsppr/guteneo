# Guteneo — e-mails et correspondance PDF

Ce dossier prépare le candidat **1.0.0**. La version du paquet, les capacités
applicatives et l’identité du serveur MCP suivent la même version source ;
l’empreinte de publication permet de vérifier le code réellement servi.
Une archive construite localement ne met pas à jour le serveur ni un annuaire.
Le build produit aussi deux archives Claude Code dédiées :
`guteneo-claude-code.zip` et `guteneo-claude-marketplace.zip`, avec des parcours
adaptés à Claude. Leurs README distinguent validation du format, installation,
connexion OAuth et qualification réelle.

## Fonctions et accès

Ce paquet réunit le serveur MCP Guteneo et les parcours `get-started`, `email`,
`fax-pdf`, `postal-pdf`, `document-studio` et `pdf-accessibility`. Sa version est
indiquée dans `plugin.json`. Les fonctions utilisables dépendent du serveur
connecté, des droits du compte, des canaux et services activés, et des capacités
réelles de l’hôte. L’installation n’accorde aucun mandat et ne prouve ni recette
complète, ni approbation OpenAI, ni publication dans l’annuaire.

Les contrôles PDF/UA et PDF/A nécessitent un compte disposant de l’accès existant
et un service veraPDF disponible. Ils produisent des diagnostics liés à
l’original ; ils ne certifient ni l’accessibilité complète ni la conformité
juridique. Le plugin ne souscrit, n’annule et ne renouvelle aucun forfait,
n’achète aucun crédit et ne gère pas la facturation.

L’e-mail demeure désactivé dans la configuration de production. Les permissions,
restrictions documentaires et validations avant envoi restent applicables. Le
paquet n’installe aucun exécutable ni hook local et ne contient aucun secret.

Serveur : **https://guteneo.com/mcp**. Connexion OAuth requise. La configuration serveur et l’accès de votre compte doivent être opérationnels ; un paquet valide ne prouve pas une connexion ni un envoi réussi.

Le manifeste fournit un listing anglais, sa traduction française et les liens [support](https://guteneo.com/support/?lang=en), [confidentialité](https://guteneo.com/confidentialite/?lang=en) et [conditions](https://guteneo.com/conditions/?lang=en). L’accueil consulte les fonctions du compte sans importer ni envoyer. Les skills déclarent leur dépendance au MCP Guteneo ; seuls les outils effectivement exposés par cette connexion sont utilisables.

Les parcours excluent les données de carte de paiement PCI DSS, les données de santé protégées, les identifiants gouvernementaux, les secrets d’authentification et les données personnelles sensibles, y compris dans un document Guteneo existant lorsque leur présence est connue. Ils ne prétendent pas que l’analyse antivirus détecte ces catégories. Un devis `review_prepare_only` s’arrête à la préparation : aucune approbation, revue expert ni expédition ne suit.

L’accès repose sur un compte Guteneo existant et ses droits. Ce paquet ne crée ni checkout, ni abonnement, ni recharge ou montée en gamme. Les devis et le solde expliquent l’opération disponible ; ils ne servent pas à vendre des crédits dans le plugin.

La vidéo référencée dans le manifeste est l’enregistrement public du **21 septembre 2026** ; elle ne prouve ni cette nouvelle version de paquet, ni une nouvelle recette reviewer, ni une qualification postale. Les cas de test ne sont pas redéclarés dans le ZIP afin de conserver ceux déjà enregistrés dans le portail. Les identifiants et instructions d’accès reviewer restent dans ses champs sécurisés. Aucun résultat de test, approbation OpenAI ou publication dans l’annuaire n’est attesté par le paquet.

## Installation manuelle

Parcours relus dans les sources officielles le **13 octobre 2026**. Le [ZIP public](https://guteneo.com/integrations/guteneo-plugin.zip) et son [manifeste de version et SHA-256](https://guteneo.com/integrations/manifest.json) permettent de récupérer le paquet sans attendre sa publication dans un catalogue. Le [dépôt public](https://github.com/nclsppr/guteneo) contient aussi son dossier `integrations/guteneo/` sur `main`. Le chargement d’un dossier ne nécessite pas de compiler Guteneo ; la reconstruction du ZIP utilise `npm ci`, puis `npm run build:integrations` depuis la racine du dépôt.

Les commandes Claude Code et le chargement de ZIP dans Claude web/Desktop ont
été revérifiés le **23 octobre 2026**, avec Claude Code 2.1.309 et les guides
officiels. La distribution Claude dédiée précise ses prérequis OAuth ; les
instructions ci-dessous conservent aussi la compatibilité du paquet combiné.

Les liens du site et de `main` fournissent leurs versions respectives. Vérifiez
la version et l’empreinte du paquet choisi avant l’installation. Les preuves de
connexion, de déploiement et de revue sont distinctes du contenu du ZIP.

- **ChatGPT** : Plugins → `+` → **Add custom MCP server**, saisir `https://guteneo.com/mcp`, configurer OAuth, examiner les permissions puis **Create as a plugin**. Vérifier les outils, installer le plugin créé et le sélectionner avec `@` dans une nouvelle conversation. Les règles du compte ou de l’espace s’appliquent ; le mode développeur n’est pas une étape systématique du guide courant. Cette connexion MCP personnelle ne distribue pas à elle seule les skills de ce ZIP. [Guide OpenAI](https://developers.openai.com/plugins/deploy/connect-chatgpt).
- **Claude web / Desktop** : pour le connecteur seul, utiliser [Connecter à Claude](https://guteneo.com/assistants/claude/) ou ajouter l’URL dans Personnaliser → Connecteurs. Pour le paquet complet : **Customize → Plugins → Add → Upload plugin**, choisir le ZIP, puis ouvrir **Connectors** dans le plugin pour ajouter et connecter Guteneo. Charger les skills ne réalise pas le consentement OAuth. [Plugins Claude](https://claude.com/docs/plugins/overview).
- **Claude Code** : depuis le dépôt, lancer `claude --plugin-dir ./integrations/guteneo`, ou `claude --plugin-url https://guteneo.com/integrations/guteneo-plugin.zip` sans clone. Dans un paquet extrait, passer son chemin réel. Le chargement vaut pour la session ; ouvrir `/mcp` pour connecter Guteneo. [Chargement direct Claude Code](https://code.claude.com/docs/en/plugins/create#develop-without-a-marketplace).
- **Grok web** : [Connectors](https://grok.com/connectors) → **New Connector → Custom**, ajouter l’URL MCP et terminer l’authentification. Les règles d’équipe peuvent nécessiter une autorisation administrateur. [Connecteurs Grok](https://docs.x.ai/grok/connectors).
- **Grok Build** : `grok mcp add --transport http guteneo https://guteneo.com/mcp`, puis `grok mcp doctor guteneo` ; `/mcps` permet l’authentification. `grok --plugin-dir ./integrations/guteneo` est aussi un chemin candidat fondé sur la compatibilité Claude Code documentée par Grok. La connexion Guteneo et les skills restent à qualifier dans ce client. [MCP Grok Build](https://docs.x.ai/build/features/mcp-servers), [plugins Grok Build](https://docs.x.ai/build/features/skills-plugins-marketplaces).
- **Cursor** : copier le contenu complet du paquet, fichiers cachés inclus, dans `~/.cursor/plugins/local/guteneo/`. Préserver les modifications d’une éventuelle copie existante et utiliser un dossier cible vide. Depuis le dépôt, créer le dossier s’il manque avec `mkdir -p ~/.cursor/plugins/local/guteneo`, puis copier avec `cp -R ./integrations/guteneo/. ~/.cursor/plugins/local/guteneo/`. Redémarrer ou lancer **Developer: Reload Window**, puis vérifier **Customize** et connecter le MCP. Les imports locaux doivent être autorisés ; un lien symbolique externe est ignoré. Pour le MCP seul, fusionner `cursor-mcp.json` dans `.cursor/mcp.json`. [Plugins locaux Cursor](https://cursor.com/docs/plugins#test-plugins-locally).
- **GitHub Copilot dans VS Code** : fusionner `copilot-vscode-mcp.json` dans `.vscode/mcp.json`, puis ouvrir `MCP: List Servers`. **Copilot CLI** utilise `copilot-cli-mcp.json` dans `~/.copilot/mcp-config.json`, puis `/mcp auth guteneo` si demandé. Ces modèles ne prouvent pas l’installation de ce ZIP dans Copilot ni sa compatibilité avec Microsoft Copilot grand public. [Guide Guteneo Copilot](https://github.com/nclsppr/guteneo/blob/main/docs/COPILOT.md).

L’URL, le ZIP et les modèles JSON sont des moyens d’installation, pas une preuve de connexion réelle ou de publication. Un modèle OAuth contenant `REPLACE_WITH_REGISTERED_PUBLIC_CLIENT_ID` ou `GUTENEO_CURSOR_CLIENT_ID` doit recevoir l’identifiant public d’un client réellement enregistré pour le callback de cet hôte. Le client Claude.ai hébergé ne remplace pas un client localhost Claude Code. La découverte d’une URL d’enregistrement ne prouve pas que DCR ou CIMD permettent une installation automatique.

En cas de refus OAuth, vérifier que l’issuer annoncé dans les métadonnées MCP est **identique** à celui de l’autorité, slash final compris. En cas de jeton expiré ou de nouveaux scopes, reconnecter Guteneo et vérifier `get_capabilities`. **Refresh** dans ChatGPT actualise les métadonnées et ne prouve pas le renouvellement d’un jeton. Le refresh automatique et la révocation restent à qualifier par client. [Diagnostic et callbacks exacts](https://github.com/nclsppr/guteneo/blob/main/docs/LLM_SETUP.md#diagnostics-de-connexion-et-renouvellement), [RFC 8414 §3.3](https://www.rfc-editor.org/rfc/rfc8414.html#section-3.3).

Demandez : « Prépare cet e-mail avec mon PDF et montre-moi le devis », « Prépare cet e-mail sans pièce jointe » ou « Prépare un lien protégé pour ce PDF pendant 7 jours ». Le fax et le courrier postal restent disponibles selon le compte. Le destinataire, le canal et le plafond restent à préciser. Si le canal ou son outil manque, le parcours doit signaler ce blocage. Par défaut, vous relisez et approuvez le document et le devis dans Guteneo. Le mode expert est facultatif et désactivé : un administrateur peut accorder dans le navigateur un mandat à cette connexion OAuth, pour des canaux choisis, avec plafond EUR par envoi/jour, nombre maximal quotidien et expiration dans les 30 jours. L’assistant ne l’active ni ne l’étend. L’assistant vérifie le mandat de sa connexion avec `get_expert_status`. Sous ce mandat, `review_dispatch` fournit les pages lisibles du PDF dans la conversation (jusqu’à 10 Mio, trois pages par appel), puis une preuve de revue valable au plus cinq minutes seulement après toutes les pages. Ensuite, `approve_and_send_dispatch` demande une approbation déléguée et l’envoi exact. Le dépôt postal via `transfer_postal_draft` est une étape distincte, explicitement déléguée, sans expédition. Les confirmations de votre hôte et les contrôles Guteneo restent applicables. Aucun « oui » dans le chat ne crée à lui seul ce mandat.

Dans ChatGPT, l’import utilise le contrat de fichier fourni par l’hôte. Guteneo télécharge directement les octets depuis une source HTTPS publique et vérifie le PDF avant utilisation ; une URL privée, expirée ou redirigée reste refusée. Pour Claude, GitHub Copilot ou tout hôte sans transfert de fichier qualifié, déposez le PDF dans [Documents Guteneo](https://guteneo.com/?lang=en#/app/documents), puis utilisez son identifiant. Un adaptateur local optionnel pour Cursor et Claude Code est documenté séparément ; ce paquet ne lui donne aucun accès au disque.

Pour « envoie ce PDF par courrier », le parcours reste postal. `get_postal_setup` retrouve l’expéditeur du compte ; s’il manque, l’assistant demande son nom et son adresse complète directement dans la conversation. Un administrateur OAuth disposant de `dispatches:prepare` peut les enregistrer via `configure_postal_sender`, sans formulaire web. Une configuration existante ne peut pas être remplacée ou réactivée par cet outil. Son origine dans la conversation est enregistrée distinctement ; elle ne prouve pas une vérification physique de l’adresse et ne constitue pas une approbation d’envoi. L’assistant recueille les seules informations manquantes, utilise le contrôle postal, puis donne le `reviewUrl` de Guteneo. Un mandat limité au fax n’empêche pas cette préparation standard.

Après l’import, `analysis` explique si la vérification continue, si le PDF est prêt ou si une action est nécessaire. La suite reste dans la conversation avec le même document ; `documentUrl` est une consultation facultative si vous souhaitez ouvrir le site. Une indisponibilité temporaire du scanner est reprise automatiquement par Guteneo ; l’assistant consulte `get_document` après le délai indiqué, sans réimporter ni multiplier les relances. La vérification ne prépare, n’approuve et n’envoie aucune communication.

Installation, enregistrement dans un annuaire et qualification réelle de chaque hôte sont des étapes distinctes. Guide détaillé : [LLM_SETUP.md](https://github.com/nclsppr/guteneo/blob/main/docs/LLM_SETUP.md).

Le serveur reste l’autorité ; n’utilisez que les outils effectivement disponibles et les champs de leur schéma courant. Une réponse incertaine se consulte, elle ne justifie jamais une nouvelle expédition. Détails du contrat : [EXPERT_APPROVAL.md](https://github.com/nclsppr/guteneo/blob/main/docs/EXPERT_APPROVAL.md).

## Identité et publication

Le logo d’annuaire conserve l’emblème simple Guteneo approuvé dans `assets/guteneo-mark.png` (512 × 512). Le composer utilise son dérivé `assets/guteneo-composer.png` (1 254 × 1 254), avec un contour extérieur transparent et un cadre simplifié pour les petites tailles. Le portrait tramé reste réservé aux surfaces du site et de connexion. Ces assets ne constituent pas une preuve de publication dans ChatGPT.

Le dossier de revue, les cas de test reproductibles et les prérequis encore ouverts sont décrits dans [CHATGPT_MARKETPLACE.md](https://github.com/nclsppr/guteneo/blob/main/docs/CHATGPT_MARKETPLACE.md). La création du dossier, sa soumission, l’approbation OpenAI et la mise en ligne sont des étapes distinctes.

## E-mail et document protégé

Le parcours `email` réutilise `prepare_dispatch` pour les e-mails sans pièce jointe, les PDF joints et les PDF remis par lien protégé. Le devis distingue la remise et le supplément d’hébergement lorsqu’il s’applique : 1 € par document protégé. La durée choisie est de 1, 7 ou 30 jours ; le PDF original reste soumis à sa vérification. Le destinataire consulte une page protégée par mot de passe, sans compte requis. L’expéditeur consulte le mot de passe uniquement dans son compte navigateur et le transmet séparément. Aucun outil MCP ne lit ou ne transmet ce mot de passe.

Le studio documentaire prépare des PDF personnalisés depuis des données CSV, XLSX, XML ou JSON. Il ne joint pas les fichiers de données aux e-mails ; les autres pièces jointes et les comptes destinataires restent hors de ce parcours. Le compte de revue ChatGPT conserve ses restrictions de préparation seule.

## Studio documentaire

Le parcours `document-studio` couvre les modèles pdfme rééditables, l’import DOCX
avec avertissements, CSV/XLSX/XML/JSON, les mappings versionnés, les jobs de PDF et la
préparation séparée de la distribution. Les exemples exécutables figurent dans
`examples/template-workflow/` du dépôt. Les autorisations OAuth dédiées sont
`templates:read`, `templates:write`, `templates:publish`, `templates:share`,
`datasets:read`, `datasets:write`, `generations:read`, `generations:write`, auxquelles
s’ajoutent les scopes documents/envois pour leurs opérations propres.

Les assistants découvrent les règles avec `get_template_authoring_guide`, puis
les cinq bases fictives avec `list_template_examples` et `get_template_example`.
Ils peuvent adapter une enveloppe et la créer avec `create_template`, sans
appel IA interne. La [référence de création](skills/document-studio/references/template-authoring.md)
est aussi incluse dans le ZIP. Le propriétaire peut supprimer ses créations,
y compris les copies de démonstration, depuis l’interface ou `delete_template` ;
les PDF déjà générés et leur historique restent conservés.

La présence du parcours ne prouve ni disponibilité du service pour le compte,
ni nouvelle autorisation accordée à un client existant, ni publication marketplace.
Le transfert natif de fichiers dépend des capacités réellement annoncées par l’hôte.
