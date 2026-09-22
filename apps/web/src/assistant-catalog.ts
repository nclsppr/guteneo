import { msg } from "./messages";
export const assistantEndpoint = "https://guteneo.com/mcp";

export function getAssistantReadOnlyPrompt() {
  return msg(
    "Avec Guteneo, indique uniquement les fonctions et les canaux actuellement disponibles pour mon compte. Utilise seulement les outils de lecture. Ne crée ni document ni brouillon, ne prépare et n’envoie aucune communication, et ne modifie aucune autorisation.",
  );
}

export type AssistantId =
  "chatgpt" | "claude" | "grok" | "copilot" | "microsoft365" | "cursor";

export type AssistantGuideLink = {
  label: string;
  href: string;
  download?: boolean;
};

export type AssistantGuideStep = {
  title: string;
  text: string;
  endpoint?: boolean;
  code?: string;
  link?: AssistantGuideLink;
};

export type AssistantGuideVariant = {
  id: string;
  label: string;
  intro?: string;
  prerequisites: readonly string[];
  steps: readonly AssistantGuideStep[];
  documentation: readonly AssistantGuideLink[];
  troubleshooting: readonly { question: string; answer: string }[];
};

export type AssistantDefinition = {
  id: AssistantId;
  name: string;
  logo: string | null;
  description: string;
  audience: string;
  variants: readonly AssistantGuideVariant[];
};

// These describe documented host setup, never a Guteneo connection status.
// Official source pages were checked on 20 September 2026.
export function getAssistantCatalog(): readonly AssistantDefinition[] {
  return [
    {
      id: "chatgpt",
      name: "ChatGPT",
      logo: "/brands/chatgpt.svg",
      description: msg(
        "Ajoutez Guteneo aux outils d’une conversation dans ChatGPT sur le web.",
      ),
      audience: msg("Conversation web"),
      variants: [
        {
          id: "web",
          label: msg("ChatGPT web"),
          intro: msg(
            "Dans ChatGPT, le menu « Plugins » sert aussi à créer votre connexion MCP personnalisée. Vous ajoutez vous-même Guteneo avec son adresse, sans passer par un plugin publié dans le catalogue.",
          ),
          prerequisites: [
            msg(
              "Un compte ChatGPT qui autorise le mode développeur et les plugins personnalisés.",
            ),
            msg(
              "Dans un espace professionnel, l’autorisation de son administrateur peut être nécessaire.",
            ),
          ],
          steps: [
            {
              title: msg("Ouvrez les réglages ChatGPT"),
              text: msg(
                "Dans Paramètres → Sécurité et connexion, activez le mode développeur s’il est disponible pour votre compte.",
              ),
              link: {
                label: msg("Ouvrir ChatGPT"),
                href: "https://chatgpt.com/",
              },
            },
            {
              title: msg("Ajoutez le serveur Guteneo"),
              text: msg(
                "Ouvrez Plugins, choisissez le bouton +, puis nommez la connexion Guteneo. Collez cette adresse dans le champ du serveur MCP.",
              ),
              endpoint: true,
            },
            {
              title: msg("Connectez votre compte Guteneo"),
              text: msg(
                "Suivez l’authentification proposée et examinez les permissions avant de les accorder. Revenez ensuite dans ChatGPT.",
              ),
            },
            {
              title: msg("Choisissez Guteneo dans une conversation"),
              text: msg(
                "Ouvrez une nouvelle conversation, puis son menu d’outils et sélectionnez la connexion Guteneo que vous venez d’ajouter. Utilisez la demande de vérification ci-dessous.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Guide officiel ChatGPT"),
              href: "https://developers.openai.com/plugins/deploy/connect-chatgpt",
            },
          ],
          troubleshooting: [
            {
              question: msg("Je ne vois pas le mode développeur ou Plugins"),
              answer: msg(
                "Consultez les possibilités de votre compte et les règles de votre espace ChatGPT. L’ajout personnalisé doit être autorisé avant de poursuivre.",
              ),
            },
          ],
        },
      ],
    },
    {
      id: "claude",
      name: "Claude",
      logo: "/brands/claude.svg",
      description: msg(
        "Ajoutez un connecteur web, puis choisissez les conversations où l’utiliser.",
      ),
      audience: msg("Conversation web"),
      variants: [
        {
          id: "web",
          label: msg("Claude web"),
          prerequisites: [
            msg(
              "Les connecteurs personnalisés sont documentés pour les offres Free, Pro, Max, Team et Enterprise ; Free est limité à un connecteur.",
            ),
            msg(
              "Sur Team et Enterprise, un propriétaire ajoute d’abord le connecteur à l’organisation.",
            ),
          ],
          steps: [
            {
              title: msg("Ouvrez les connecteurs Claude"),
              text: msg(
                "Dans Personnaliser → Connecteurs, choisissez + puis Ajouter un connecteur personnalisé. En équipe, votre propriétaire passe d’abord par les réglages de l’organisation → Connecteurs.",
              ),
              link: { label: msg("Ouvrir Claude"), href: "https://claude.ai/" },
            },
            {
              title: msg("Renseignez le serveur Guteneo"),
              text: msg(
                "Nommez le connecteur Guteneo et ajoutez l’adresse ci-dessous. Les membres d’une équipe choisissent le connecteur déjà ajouté par leur propriétaire.",
              ),
              endpoint: true,
            },
            {
              title: msg("Identifiez-vous auprès de Guteneo"),
              text: msg(
                "Choisissez Connecter, suivez la connexion à votre compte Guteneo et vérifiez les permissions demandées.",
              ),
            },
            {
              title: msg("Activez le connecteur dans la conversation"),
              text: msg(
                "Dans une conversation, ouvrez + → Connecteurs et choisissez Guteneo. Lancez ensuite la vérification en lecture seule proposée plus bas.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Guide officiel Claude"),
              href: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
            },
          ],
          troubleshooting: [
            {
              question: msg("Je peux voir le connecteur, mais pas l’ajouter"),
              answer: msg(
                "Vérifiez la limite de votre offre ou demandez au propriétaire de votre espace de l’ajouter. Chaque membre connecte ensuite son propre compte Guteneo.",
              ),
            },
          ],
        },
      ],
    },
    {
      id: "grok",
      name: "Grok",
      logo: "/brands/grok.svg",
      description: msg(
        "Utilisez l’ajout d’un connecteur personnalisé dans Grok sur le web.",
      ),
      audience: msg("Conversation web"),
      variants: [
        {
          id: "web",
          label: msg("Grok web"),
          prerequisites: [
            msg(
              "Un compte Grok donnant accès à l’ajout d’un connecteur personnalisé.",
            ),
            msg(
              "Dans Grok Business ou Enterprise, l’administrateur doit d’abord autoriser le connecteur pour l’équipe.",
            ),
          ],
          steps: [
            {
              title: msg("Ouvrez les connecteurs Grok"),
              text: msg(
                "Rendez-vous sur la page Connectors, puis choisissez New Connector et Custom.",
              ),
              link: {
                label: msg("Ouvrir les connecteurs Grok"),
                href: "https://grok.com/connectors",
              },
            },
            {
              title: msg("Ajoutez l’adresse Guteneo"),
              text: msg(
                "Indiquez le serveur ci-dessous dans le champ prévu. Il s’agit de l’adresse publique de Guteneo.",
              ),
              endpoint: true,
            },
            {
              title: msg("Terminez l’authentification"),
              text: msg(
                "Suivez la connexion proposée par Guteneo et examinez les permissions. Grok recherche ensuite les outils proposés par le serveur.",
              ),
            },
            {
              title: msg("Vérifiez les outils dans votre conversation"),
              text: msg(
                "Utilisez la demande de vérification ci-dessous. Si Grok ne voit pas Guteneo, revenez dans Connectors pour examiner le résultat de la connexion.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Guide officiel Grok"),
              href: "https://docs.x.ai/grok/connectors",
            },
            {
              label: msg("Connecteurs Grok en entreprise"),
              href: "https://docs.x.ai/grok/connector-management",
            },
          ],
          troubleshooting: [
            {
              question: msg("L’ajout personnalisé n’apparaît pas"),
              answer: msg(
                "Vérifiez les options de votre compte Grok. En entreprise, demandez à l’administrateur de contrôler les connecteurs autorisés.",
              ),
            },
          ],
        },
      ],
    },
    {
      id: "copilot",
      name: "GitHub Copilot",
      logo: "/brands/copilot.svg",
      description: msg(
        "Choisissez votre outil : le guide diffère entre VS Code et Copilot CLI.",
      ),
      audience: msg("VS Code ou terminal"),
      variants: [
        {
          id: "vscode",
          label: "VS Code",
          prerequisites: [
            msg("VS Code à jour, avec un accès à GitHub Copilot Chat."),
            msg(
              "Si votre organisation impose une liste de serveurs autorisés, Guteneo doit y figurer.",
            ),
          ],
          steps: [
            {
              title: msg("Ajoutez un serveur dans VS Code"),
              text: msg(
                "Ouvrez la palette de commandes et lancez MCP: Add Server. Choisissez un serveur HTTP.",
              ),
              code: "MCP: Add Server",
            },
            {
              title: msg("Renseignez l’adresse et le nom"),
              text: msg(
                "Collez cette adresse, nommez le serveur guteneo et choisissez votre profil utilisateur pour le retrouver dans vos projets.",
              ),
              endpoint: true,
              link: {
                label: msg("Configuration VS Code"),
                href: "/guides/copilot-vscode-mcp.json",
                download: true,
              },
            },
            {
              title: msg("Démarrez le serveur et connectez-vous"),
              text: msg(
                "Dans MCP: List Servers, sélectionnez guteneo. Démarrez-le, vérifiez sa configuration et suivez l’authentification Guteneo proposée par VS Code.",
              ),
            },
            {
              title: msg("Retrouvez Guteneo dans Copilot Chat"),
              text: msg(
                "Vérifiez que les outils Guteneo sont disponibles dans le sélecteur d’outils, puis utilisez la demande de vérification ci-dessous.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Guide officiel VS Code"),
              href: "https://code.visualstudio.com/docs/agent-customization/mcp-servers",
            },
            {
              label: msg("Authentification dans GitHub Copilot Chat"),
              href: "https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/extend-copilot-chat-with-mcp",
            },
          ],
          troubleshooting: [
            {
              question: msg(
                "Le serveur est présent, mais ses outils sont absents",
              ),
              answer: msg(
                "Dans MCP: List Servers, vérifiez que guteneo est activé et consultez son état. Vérifiez aussi la sélection d’outils de votre conversation et les restrictions de votre organisation.",
              ),
            },
          ],
        },
        {
          id: "cli",
          label: "Copilot CLI",
          prerequisites: [
            msg(
              "GitHub Copilot CLI installé et un accès autorisé par votre compte ou votre organisation.",
            ),
            msg(
              "La politique MCP de votre organisation doit autoriser le serveur Guteneo.",
            ),
          ],
          steps: [
            {
              title: msg("Ouvrez l’ajout de serveur"),
              text: msg(
                "Dans une session interactive Copilot CLI, entrez la commande ci-dessous. Nommez le serveur guteneo et choisissez le type HTTP.",
              ),
              code: "/mcp add",
            },
            {
              title: msg("Collez l’adresse du serveur"),
              text: msg(
                "Renseignez le champ URL avec cette adresse. Enregistrez la configuration sans y ajouter votre mot de passe Guteneo.",
              ),
              endpoint: true,
              link: {
                label: msg("Configuration Copilot CLI"),
                href: "/guides/copilot-cli-mcp.json",
                download: true,
              },
            },
            {
              title: msg("Connectez votre compte"),
              text: msg(
                "Suivez la fenêtre d’authentification Guteneo. Si le serveur demande une authentification, lancez la commande suivante pour ouvrir ce parcours.",
              ),
              code: "/mcp auth guteneo",
            },
            {
              title: msg("Faites une première vérification"),
              text: msg(
                "Revenez dans Copilot CLI et collez la demande de vérification ci-dessous. Les confirmations propres à Copilot continuent de s’appliquer.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Guide officiel Copilot CLI"),
              href: "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers",
            },
            {
              label: msg("Authentification MCP dans Copilot CLI"),
              href: "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference",
            },
          ],
          troubleshooting: [
            {
              question: msg("Copilot indique needs-auth"),
              answer: msg(
                "Lancez /mcp auth guteneo pour reprendre l’authentification. Si l’organisation interdit ce serveur, demandez à son administrateur de vérifier la politique MCP.",
              ),
            },
          ],
        },
      ],
    },
    {
      id: "microsoft365",
      name: "Microsoft 365 Copilot",
      logo: "/brands/microsoft365.svg",
      description: msg(
        "Un parcours d’organisation : un administrateur ou un créateur prépare l’agent qui utilisera Guteneo.",
      ),
      audience: msg("Agent d’organisation"),
      variants: [
        {
          id: "microsoft365",
          label: "Microsoft 365",
          intro: msg(
            "Ce guide concerne un agent de Microsoft 365 Copilot. Il ne décrit pas un ajout dans Microsoft Copilot grand public.",
          ),
          prerequisites: [
            msg(
              "Un environnement Microsoft 365 permettant l’usage d’agents et l’ajout d’applications personnalisées, autorisé par votre administrateur.",
            ),
            msg(
              "VS Code et Microsoft 365 Agents Toolkit 6.12 ou ultérieur, utilisés par la personne qui configure l’agent.",
            ),
          ],
          steps: [
            {
              title: msg("Créez l’agent avec votre administrateur"),
              text: msg(
                "Dans Agents Toolkit, choisissez Create a New Agent/App → Declarative Agent → Add an Action → Start with an MCP Server.",
              ),
            },
            {
              title: msg("Renseignez le serveur Guteneo"),
              text: msg(
                "Utilisez cette adresse comme serveur MCP de l’action.",
              ),
              endpoint: true,
            },
            {
              title: msg("Configurez l’authentification"),
              text: msg(
                "Utilisez OAuth avec enregistrement dynamique si le serveur le permet. Si une configuration manuelle est demandée, faites vérifier le client et l’adresse de retour par l’administrateur et Guteneo.",
              ),
            },
            {
              title: msg("Installez l’agent autorisé"),
              text: msg(
                "La personne chargée de l’agent suit la publication et l’installation décrites par Microsoft. Dans Microsoft 365 Copilot, ouvrez cet agent, connectez votre compte Guteneo et faites la vérification ci-dessous.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Créer un agent Microsoft 365 avec MCP"),
              href: "https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/build-mcp-plugins",
            },
            {
              label: msg("Prérequis Microsoft 365"),
              href: "https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/prerequisites",
            },
          ],
          troubleshooting: [
            {
              question: msg("Je ne peux pas installer l’agent"),
              answer: msg(
                "Votre administrateur doit vérifier l’autorisation d’ajouter des applications personnalisées, l’accès aux agents et les règles de votre environnement Microsoft 365.",
              ),
            },
          ],
        },
        {
          id: "studio",
          label: "Copilot Studio",
          intro: msg(
            "Dans Copilot Studio, la connexion s’ajoute aux outils d’un agent créé pour votre organisation.",
          ),
          prerequisites: [
            msg(
              "Un accès à Copilot Studio et les droits pour modifier l’agent concerné.",
            ),
            msg(
              "Les politiques Power Platform de votre organisation doivent autoriser le connecteur et son authentification.",
            ),
          ],
          steps: [
            {
              title: msg("Ouvrez les outils de votre agent"),
              text: msg(
                "Dans Copilot Studio, choisissez l’agent, puis Tools → Add a tool → New tool → Model Context Protocol.",
              ),
            },
            {
              title: msg("Ajoutez le serveur"),
              text: msg(
                "Nommez le serveur Guteneo et utilisez l’adresse ci-dessous. Copilot Studio attend un serveur Streamable HTTP.",
              ),
              endpoint: true,
            },
            {
              title: msg("Choisissez l’authentification OAuth"),
              text: msg(
                "Dans l’assistant de configuration, utilisez OAuth 2.0. La découverte dynamique convient si le serveur la prend en charge ; sinon, faites vérifier les paramètres manuels par votre administrateur.",
              ),
            },
            {
              title: msg("Créez la connexion utilisateur"),
              text: msg(
                "Suivez l’authentification Guteneo, ajoutez le serveur à l’agent et vérifiez ses outils dans le panneau de test avec la demande ci-dessous. La diffusion de l’agent reste une étape distincte.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Guide officiel Copilot Studio"),
              href: "https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-existing-server-to-agent",
            },
          ],
          troubleshooting: [
            {
              question: msg(
                "Le connecteur est bloqué ou ne termine pas la connexion",
              ),
              answer: msg(
                "Demandez à l’administrateur de vérifier les politiques Power Platform et les paramètres OAuth. Copilot Studio ne prend plus en charge le transport SSE pour MCP.",
              ),
            },
          ],
        },
      ],
    },
    {
      id: "cursor",
      name: "Cursor",
      logo: "/brands/cursor.svg",
      description: msg(
        "Ajoutez Guteneo aux serveurs MCP de Cursor, puis retrouvez ses outils dans l’agent.",
      ),
      audience: msg("Éditeur et agent"),
      variants: [
        {
          id: "desktop",
          label: "Cursor",
          prerequisites: [
            msg("Cursor avec les serveurs MCP personnalisés autorisés."),
            msg(
              "En entreprise, la liste de serveurs autorisés doit permettre l’adresse de Guteneo.",
            ),
          ],
          steps: [
            {
              title: msg("Ouvrez votre configuration MCP"),
              text: msg(
                "Dans Cursor, ouvrez la personnalisation des serveurs MCP. Pour une configuration propre au projet, utilisez son fichier .cursor/mcp.json.",
              ),
            },
            {
              title: msg("Ajoutez Guteneo à la configuration"),
              text: msg(
                "Le fichier proposé contient l’entrée guteneo dans mcpServers et cette adresse. Ajoutez-la à votre configuration en conservant les autres serveurs.",
              ),
              endpoint: true,
              link: {
                label: msg("Télécharger la configuration Cursor"),
                href: "/guides/cursor-mcp.json",
                download: true,
              },
            },
            {
              title: msg("Connectez-vous à Guteneo"),
              text: msg(
                "Retrouvez guteneo dans les serveurs MCP de Cursor, suivez l’authentification proposée et vérifiez les permissions demandées.",
              ),
            },
            {
              title: msg("Vérifiez les outils dans l’agent"),
              text: msg(
                "Avec le serveur activé, collez la demande de vérification ci-dessous dans une conversation. Conservez les confirmations prévues par votre configuration Cursor.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Guide officiel Cursor"),
              href: "https://cursor.com/docs/mcp",
            },
          ],
          troubleshooting: [
            {
              question: msg("Guteneo n’apparaît pas dans ce projet"),
              answer: msg(
                "Vérifiez le fichier .cursor/mcp.json du projet ouvert, ou ~/.cursor/mcp.json pour une configuration globale. Vérifiez ensuite que le serveur est activé et autorisé par votre organisation.",
              ),
            },
          ],
        },
      ],
    },
  ];
}

export function getAssistant(id: string | null | undefined) {
  return getAssistantCatalog().find((assistant) => assistant.id === id);
}
