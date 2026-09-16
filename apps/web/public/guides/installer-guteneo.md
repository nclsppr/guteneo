# Installer Guteneo dans votre assistant

Guide du 17 septembre 2026. Serveur : https://guteneo.com/mcp

Guteneo est en préparation. L’aperçu public ne connecte aucun compte et n’envoie aucun document. Les parcours OAuth, les permissions et le transfert de PDF restent à qualifier sur des comptes réels. Ce guide n’atteste ni installation réussie ni publication dans un annuaire.

## ChatGPT

1. Ouvrez Paramètres → Sécurité et connexion → Mode développeur, si votre compte et votre espace le permettent.
2. Dans Plugins, cliquez sur + et ajoutez Guteneo avec l’URL https://guteneo.com/mcp.
3. Connectez votre compte Guteneo, examinez les permissions et vérifiez les outils.
4. Dans une conversation, ajoutez la connexion Guteneo depuis le menu des outils.

Source : https://developers.openai.com/plugins/deploy/connect-chatgpt

## Claude web et Desktop

1. Ouvrez Personnaliser → Connecteurs. Sur un compte individuel compatible, choisissez + puis Ajouter un connecteur personnalisé.
2. Indiquez Guteneo et l’URL https://guteneo.com/mcp.
3. Connectez votre compte, examinez les permissions, puis activez le connecteur dans votre conversation.

Sur Team et Enterprise, le propriétaire ajoute d’abord le connecteur dans les paramètres de l’organisation. Un connecteur distant passe par l’infrastructure Anthropic, même depuis Desktop. Déposez votre PDF original dans le navigateur Guteneo puis retrouvez-le depuis votre conversation ; aucun accès implicite aux fichiers de votre ordinateur ou pièces jointes n’est promis.

Source : https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp

## Cursor

Téléchargez /guides/cursor-mcp.json et fusionnez son entrée guteneo dans votre fichier .cursor/mcp.json. Conservez les autres serveurs déjà configurés. Connectez ensuite votre compte Guteneo dans les paramètres MCP, puis vérifiez les outils disponibles. Le fichier ne contient ni secret ni commande exécutée localement.

Cette configuration ne donne pas accès au disque. Déposez le PDF dans Guteneo. L’adaptateur d’import local décrit dans le dépôt du projet exige une configuration séparée et un dossier explicitement choisi.

Source : https://cursor.com/docs/mcp

## Votre premier message

Avec Guteneo, vérifie les fonctions disponibles pour mon compte. Aide-moi à préparer un courrier et à choisir son canal. Demande-moi les informations manquantes, puis présente le document, le destinataire et le coût pour ma validation dans Guteneo. N’effectue aucun envoi sans cette validation.

Ce message ne peut pas installer un connecteur, accorder une permission ou remplacer l’authentification. La validation humaine a lieu dans Guteneo sur une version précise du document, du destinataire et du coût. Un résultat fournisseur incertain n’est jamais relancé automatiquement.

## Crédit et tarification

À l’ouverture du service, l’offre prévue est une dotation unique de 50 € à la création du compte, partagée entre les canaux, sans renouvellement mensuel. Un solde insuffisant bloque les nouveaux envois. Le rechargement Stripe est désactivé.

Le principe tarifaire est deux fois le coût prestataire qualifié. Les montants commerciaux, leurs unités, leurs arrondis et les taxes restent à qualifier et seront présentés avant validation. Les chiffres de la démonstration ne sont pas des prix fournisseurs.
