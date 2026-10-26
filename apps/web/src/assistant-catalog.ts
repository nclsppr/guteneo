import { msg , msgIn } from "./messages";
export const assistantEndpoint = "https://guteneo.com/mcp";

export function getAssistantReadOnlyPrompt() {
  return msg(
    "With Guteneo, list only the functions and channels currently available for my account. Use read-only tools only. Do not create any document or draft, prepare or send any communication, or change any authorisation.",
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
  installationTitle?: string;
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
  variantPrompt?: string;
  variants: readonly AssistantGuideVariant[];
};

// These describe documented host setup, never a Guteneo connection status.
// Official source pages were checked on 13 October 2026.
export function getAssistantCatalog(): readonly AssistantDefinition[] {
  return [
    {
      id: "chatgpt",
      name: "ChatGPT",
      logo: "/brands/chatgpt.svg",
      description: msg(
        "Add Guteneo to the tools in a conversation in ChatGPT on the web.",
      ),
      audience: msg("Web conversation"),
      variantPrompt: msg("How would you like to add Guteneo?"),
      variants: [
        {
          id: "archive",
          label: msg("Plugin archive (ZIP)"),
          installationTitle: msg("Install the plugin"),
          intro: msg(
            "Add the Guteneo plugin to ChatGPT using its ZIP archive. It contains the connection to the Guteneo server and instructions for the assistant.",
          ),
          prerequisites: [
            msg(
              "A ChatGPT account that allows adding plugins from an archive.",
            ),
            msg(
              "In a professional workspace, administrator authorisation may be required.",
            ),
          ],
          steps: [
            {
              title: msg("Download the Guteneo plugin"),
              text: msg(
                "Save guteneo-plugin.zip. Keep the ZIP archive without extracting it so you can import it into ChatGPT.",
              ),
              link: {
                label: msg("Download the Guteneo plugin (ZIP)"),
                href: "/integrations/guteneo-plugin.zip",
                download: true,
              },
            },
            {
              title: msg("Import the archive into ChatGPT"),
              text: msg(
                "Open Plugins, then the option to add a plugin from an archive. Select guteneo-plugin.zip and review the displayed information before adding the plugin.",
              ),
              link: {
                label: msg("Open ChatGPT plugins"),
                href: "https://chatgpt.com/plugins",
              },
            },
            {
              title: msg("Connect your Guteneo account"),
              text: msg(
                "Follow the authentication flow and review the permissions before granting them. Then return to ChatGPT.",
              ),
            },
            {
              title: msg("Select Guteneo in a conversation"),
              text: msg(
                "Open a new conversation, then its tools menu, and select the Guteneo connection you just added. Use the verification prompt below.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Official ChatGPT guide"),
              href: "https://developers.openai.com/plugins/deploy/connect-chatgpt",
            },
          ],
          troubleshooting: [
            {
              question: msg("I cannot see the option to add an archive"),
              answer: msg(
                "Check your account’s features and your ChatGPT workspace rules. If adding an archive is unavailable, select “MCP address” in this guide to see the other method.",
              ),
            },
            {
              question: msg("How do I update the plugin?"),
              answer: msg(
                "Download the archive again from this guide, then use the update option provided by ChatGPT for the Guteneo plugin. Check the connection in a new conversation afterwards.",
              ),
            },
          ],
        },
        {
          id: "web",
          label: msg("MCP address"),
          intro: msg(
            "In ChatGPT, the Plugins menu also lets you create your own MCP connection. Add Guteneo yourself using its address, without a published plugin from the catalogue.",
          ),
          prerequisites: [
            msg("A ChatGPT account that allows custom plugins."),
            msg(
              "In a professional workspace, administrator authorisation may be required.",
            ),
          ],
          steps: [
            {
              title: msg("Open ChatGPT plugins"),
              text: msg(
                "Open Plugins, then + → Add custom MCP server. If this option is missing, check your account features and workspace rules.",
              ),
              link: {
                label: msg("Open ChatGPT"),
                href: "https://chatgpt.com/plugins",
              },
            },
            {
              title: msg("Add the Guteneo server"),
              text: msg(
                "Name the connection Guteneo, paste this address into the MCP server field and choose OAuth.",
              ),
              endpoint: true,
            },
            {
              title: msg("Connect your Guteneo account"),
              text: msg(
                "Complete Guteneo authentication, review the permissions and choose Create as a plugin. Check the available tools, then install your personal plugin.",
              ),
            },
            {
              title: msg("Select Guteneo in a conversation"),
              text: msg(
                "Open a new conversation, select Guteneo with @ or in the tools menu, then use the verification request below.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Official ChatGPT guide"),
              href: "https://developers.openai.com/plugins/deploy/connect-chatgpt",
            },
          ],
          troubleshooting: [
            {
              question: msg("I cannot see Plugins or the custom add option"),
              answer: msg(
                "Check your account’s features and your ChatGPT workspace rules. Custom additions must be allowed before you continue.",
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
        "Choose a remote connector or the Guteneo plugin for Claude.",
      ),
      audience: msg("Web conversation"),
      variants: [
        {
          id: "web",
          label: msg("Claude web"),
          prerequisites: [
            msg(
              "Custom connectors are documented for Free, Pro, Max, Team and Enterprise plans; Free is limited to one connector.",
            ),
            msg(
              "On Team and Enterprise, an owner first adds the connector to the organisation.",
            ),
          ],
          steps: [
            {
              title: msg("Open Claude connectors"),
              text: msg(
                "In Customize → Connectors, select +, then Add custom connector. In a team, your owner first goes to organisation settings → Connectors.",
              ),
              link: { label: msg("Open Claude"), href: "https://claude.ai/" },
            },
            {
              title: msg("Enter the Guteneo server"),
              text: msg(
                "Name the connector Guteneo and add the address below. Team members select the connector already added by their owner.",
              ),
              endpoint: true,
            },
            {
              title: msg("Sign in to Guteneo"),
              text: msg(
                "Select Connect, sign in to your Guteneo account and check the requested permissions.",
              ),
            },
            {
              title: msg("Enable the connector in the conversation"),
              text: msg(
                "In a conversation, open + → Connectors and select Guteneo. Then run the read-only check suggested below.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Official Claude guide"),
              href: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp",
            },
          ],
          troubleshooting: [
            {
              question: msg("I can see the connector, but cannot add it"),
              answer: msg(
                "Check your plan’s limit or ask your workspace owner to add it. Each member then connects their own Guteneo account.",
              ),
            },
          ],
        },
        {
          id: "plugin",
          label: msg("Claude web and Desktop plugin"),
          prerequisites: [
            msg(
              "A Claude account that allows plugins and custom connectors.",
            ),
          ],
          steps: [
            {
              title: msg("Download the Guteneo package"),
              text: msg(
                "Download the ZIP below. Keep the ZIP file for uploading to Claude.",
              ),
              link: {
                label: msg(
                  "Download the plugin package (manual installation)",
                ),
                href: "/integrations/guteneo-plugin.zip",
                download: true,
              },
            },
            {
              title: msg("Load the plugin in Claude"),
              text: msg(
                "In Plugins → Add → Upload plugin, select the Guteneo ZIP. Review the included skills and connector.",
              ),
            },
            {
              title: msg("Connect your Guteneo account"),
              text: msg(
                "In Connectors, connect Guteneo and review the permissions. Then use the verification request in a new conversation.",
              ),
              endpoint: true,
            },
          ],
          documentation: [
            {
              label: msg("Official Claude plugins guide"),
              href: "https://claude.com/docs/plugins/overview",
            },
          ],
          troubleshooting: [],
        },
        {
          id: "code",
          label: "Claude Code",
          prerequisites: [
            msg("Claude Code installed with local plugins allowed."),
            msg(
              "An OAuth client registered for this application, or verified automatic registration. If the application asks for a client ID or rejects the redirect address, contact Guteneo support before continuing.",
            ),
          ],
          steps: [
            {
              title: msg("Load the plugin for this session"),
              text: msg(
                "Run this command to load the public package. From a repository clone, you can also use claude --plugin-dir ./integrations/guteneo.",
              ),
              code: "claude --plugin-url https://guteneo.com/integrations/guteneo-plugin.zip",
              link: {
                label: msg(
                  "Download the plugin package (manual installation)",
                ),
                href: "/integrations/guteneo-plugin.zip",
                download: true,
              },
            },
            {
              title: msgIn("connection", "Sign in to Guteneo"),
              text: msg(
                "Open /mcp in Claude Code and complete guteneo authentication. Claude Code uses a separate OAuth client from Claude web.",
              ),
              endpoint: true,
            },
            {
              title: msg("Check the tools in your conversation"),
              text: msg(
                "Use the verification request below. Loading the package alone does not confirm a connection to your account.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Official Claude Code guide"),
              href: "https://code.claude.com/docs/en/plugins/create",
            },
          ],
          troubleshooting: [],
        },
      ],
    },
    {
      id: "grok",
      name: "Grok",
      logo: "/brands/grok.svg",
      description: msg(
        "Use the custom connector option in Grok on the web.",
      ),
      audience: msg("Web conversation"),
      variants: [
        {
          id: "web",
          label: msg("Grok web"),
          prerequisites: [
            msg(
              "A Grok account with access to adding a custom connector.",
            ),
            msg(
              "In Grok Business or Enterprise, the administrator must first authorise the connector for the team.",
            ),
          ],
          steps: [
            {
              title: msg("Open Grok connectors"),
              text: msg(
                "Go to the Connectors page, then select New Connector and Custom.",
              ),
              link: {
                label: msgIn("action", "Open Grok connectors"),
                href: "https://grok.com/connectors",
              },
            },
            {
              title: msg("Add the Guteneo address"),
              text: msg(
                "Enter the server below in the field provided. This is Guteneo’s public address.",
              ),
              endpoint: true,
            },
            {
              title: msg("Complete authentication"),
              text: msg(
                "Follow Guteneo’s sign-in flow and review the permissions. Grok then discovers the tools offered by the server.",
              ),
            },
            {
              title: msg("Check the tools in your conversation"),
              text: msg(
                "Use the verification prompt below. If Grok cannot see Guteneo, return to Connectors to check the connection result.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Official Grok guide"),
              href: "https://docs.x.ai/grok/connectors",
            },
            {
              label: msg("Grok connectors for organisations"),
              href: "https://docs.x.ai/grok/connector-management",
            },
          ],
          troubleshooting: [
            {
              question: msg("The custom connector option is missing"),
              answer: msg(
                "Check your Grok account’s options. In an organisation, ask the administrator to check which connectors are authorised.",
              ),
            },
          ],
        },
        {
          id: "build",
          label: "Grok Build",
          prerequisites: [
            msg(
              "Grok Build installed with custom MCP servers allowed.",
            ),
            msg(
              "An OAuth client registered for this application, or verified automatic registration. If the application asks for a client ID or rejects the redirect address, contact Guteneo support before continuing.",
            ),
          ],
          steps: [
            {
              title: msg("Add the Guteneo server"),
              text: msg(
                "In Grok Build, add Guteneo as a remote HTTP server with this command.",
              ),
              code: "grok mcp add --transport http guteneo https://guteneo.com/mcp",
              endpoint: true,
            },
            {
              title: msgIn("connection", "Sign in to Guteneo"),
              text: msg(
                "Open /mcps to connect Guteneo. Review the permissions, then check the connection with this command.",
              ),
              code: "grok mcp doctor guteneo",
            },
            {
              title: msg("Check the tools in your conversation"),
              text: msg(
                "Use the verification request below. Loading the package alone does not confirm a connection to your account.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Official Grok Build guide"),
              href: "https://docs.x.ai/build/features/mcp-servers",
            },
          ],
          troubleshooting: [],
        },
      ],
    },
    {
      id: "copilot",
      name: "GitHub Copilot",
      logo: "/brands/copilot.svg",
      description: msg(
        "Choose your tool: the guide differs between VS Code and Copilot CLI.",
      ),
      audience: msg("VS Code or terminal"),
      variants: [
        {
          id: "vscode",
          label: "VS Code",
          prerequisites: [
            msg("An up-to-date version of VS Code with access to GitHub Copilot Chat."),
            msg(
              "If your organisation requires an approved server list, Guteneo must be on it.",
            ),
          ],
          steps: [
            {
              title: msg("Add a server in VS Code"),
              text: msg(
                "Open the command palette and run MCP: Add Server. Choose an HTTP server.",
              ),
              code: "MCP: Add Server",
            },
            {
              title: msg("Enter the address and name"),
              text: msg(
                "Paste this address, name the server guteneo and choose your user profile to make it available across your projects.",
              ),
              endpoint: true,
              link: {
                label: msg("VS Code configuration"),
                href: "/guides/copilot-vscode-mcp.json",
                download: true,
              },
            },
            {
              title: msg("Start the server and sign in"),
              text: msg(
                "In MCP: List Servers, select guteneo. Start it, check its configuration and follow the Guteneo authentication offered by VS Code.",
              ),
            },
            {
              title: msg("Find Guteneo in Copilot Chat"),
              text: msg(
                "Check that Guteneo tools are available in the tool selector, then use the verification prompt below.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Official VS Code guide"),
              href: "https://code.visualstudio.com/docs/agent-customization/mcp-servers",
            },
            {
              label: msg("Authentication in GitHub Copilot Chat"),
              href: "https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/extend-copilot-chat-with-mcp",
            },
          ],
          troubleshooting: [
            {
              question: msg(
                "The server is present, but its tools are missing",
              ),
              answer: msg(
                "In MCP: List Servers, check that guteneo is enabled and review its status. Also check your conversation’s tool selection and your organisation’s restrictions.",
              ),
            },
          ],
        },
        {
          id: "cli",
          label: "Copilot CLI",
          prerequisites: [
            msg(
              "GitHub Copilot CLI installed, with access authorised by your account or organisation.",
            ),
            msg(
              "Your organisation’s MCP policy must allow the Guteneo server.",
            ),
          ],
          steps: [
            {
              title: msg("Open the add-server flow"),
              text: msg(
                "In an interactive Copilot CLI session, enter the command below. Name the server guteneo and choose the HTTP type.",
              ),
              code: "/mcp add",
            },
            {
              title: msg("Paste the server address"),
              text: msg(
                "Enter this address in the URL field. Save the configuration without adding your Guteneo password.",
              ),
              endpoint: true,
              link: {
                label: msg("Copilot CLI configuration"),
                href: "/guides/copilot-cli-mcp.json",
                download: true,
              },
            },
            {
              title: msg("Connect your account"),
              text: msg(
                "Follow the Guteneo authentication window. If the server requests authentication, run the following command to open that flow.",
              ),
              code: "/mcp auth guteneo",
            },
            {
              title: msg("Run your first check"),
              text: msg(
                "Return to Copilot CLI and paste the verification prompt below. Copilot’s own confirmations still apply.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Official Copilot CLI guide"),
              href: "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers",
            },
            {
              label: msg("MCP authentication in Copilot CLI"),
              href: "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference",
            },
          ],
          troubleshooting: [
            {
              question: msg("Copilot reports needs-auth"),
              answer: msg(
                "Run /mcp auth guteneo to resume authentication. If your organisation blocks this server, ask its administrator to check the MCP policy.",
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
        "An organisational setup: an administrator or creator prepares the agent that will use Guteneo.",
      ),
      audience: msg("Organisation agent"),
      variants: [
        {
          id: "microsoft365",
          label: "Microsoft 365",
          intro: msg(
            "This guide concerns a Microsoft 365 Copilot agent. It does not describe adding Guteneo to the consumer version of Microsoft Copilot.",
          ),
          prerequisites: [
            msg(
              "A Microsoft 365 environment that permits agents and custom apps, authorised by your administrator.",
            ),
            msg(
              "VS Code and Microsoft 365 Agents Toolkit 6.12 or later, used by the person configuring the agent.",
            ),
          ],
          steps: [
            {
              title: msg("Create the agent with your administrator"),
              text: msg(
                "In Agents Toolkit, select Create a New Agent/App → Declarative Agent → Add an Action → Start with an MCP Server.",
              ),
            },
            {
              title: msg("Enter the Guteneo server"),
              text: msg(
                "Use this address as the action’s MCP server.",
              ),
              endpoint: true,
            },
            {
              title: msg("Configure authentication"),
              text: msg(
                "Use OAuth with dynamic registration if the server supports it. If manual configuration is requested, have the administrator and Guteneo verify the client and redirect address.",
              ),
            },
            {
              title: msg("Install the authorised agent"),
              text: msg(
                "The person responsible for the agent follows Microsoft’s publication and installation instructions. In Microsoft 365 Copilot, open that agent, connect your Guteneo account and run the check below.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Create a Microsoft 365 agent with MCP"),
              href: "https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/build-mcp-plugins",
            },
            {
              label: msg("Microsoft 365 prerequisites"),
              href: "https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/prerequisites",
            },
          ],
          troubleshooting: [
            {
              question: msg("I cannot install the agent"),
              answer: msg(
                "Your administrator must check permission to add custom apps, access to agents and your Microsoft 365 environment’s rules.",
              ),
            },
          ],
        },
        {
          id: "studio",
          label: "Copilot Studio",
          intro: msg(
            "In Copilot Studio, the connection is added to the tools of an agent created for your organisation.",
          ),
          prerequisites: [
            msg(
              "Access to Copilot Studio and permission to edit the relevant agent.",
            ),
            msg(
              "Your organisation’s Power Platform policies must allow the connector and its authentication.",
            ),
          ],
          steps: [
            {
              title: msg("Open your agent’s tools"),
              text: msg(
                "In Copilot Studio, select the agent, then Tools → Add a tool → New tool → Model Context Protocol.",
              ),
            },
            {
              title: msg("Add the server"),
              text: msg(
                "Name the server Guteneo and use the address below. Copilot Studio expects a Streamable HTTP server.",
              ),
              endpoint: true,
            },
            {
              title: msg("Choose OAuth authentication"),
              text: msg(
                "In the setup wizard, use OAuth 2.0. Dynamic discovery is suitable if the server supports it; otherwise, have your administrator check the manual settings.",
              ),
            },
            {
              title: msg("Create the user connection"),
              text: msg(
                "Complete Guteneo authentication, add the server to the agent and check its tools in the test panel using the prompt below. Distributing the agent remains a separate step.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Official Copilot Studio guide"),
              href: "https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-existing-server-to-agent",
            },
          ],
          troubleshooting: [
            {
              question: msg(
                "The connector is blocked or cannot finish connecting",
              ),
              answer: msg(
                "Ask the administrator to check Power Platform policies and OAuth settings. Copilot Studio no longer supports SSE transport for MCP.",
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
        "Add Guteneo to Cursor’s MCP servers, then find its tools in the agent.",
      ),
      audience: msg("Editor and agent"),
      variants: [
        {
          id: "desktop",
          label: "Cursor",
          prerequisites: [
            msg("Cursor with custom MCP servers allowed."),
            msg(
              "An OAuth client registered for this application, or verified automatic registration. If the application asks for a client ID or rejects the redirect address, contact Guteneo support before continuing.",
            ),
            msg(
              "In an organisation, the approved server list must allow Guteneo’s address.",
            ),
          ],
          steps: [
            {
              title: msg("Open your MCP configuration"),
              text: msg(
                "In Cursor, open MCP server customisation. For a project-specific configuration, use its .cursor/mcp.json file.",
              ),
            },
            {
              title: msg("Add Guteneo to the configuration"),
              text: msg(
                "The supplied file contains the guteneo entry in mcpServers and this address. Add it to your configuration while keeping your other servers.",
              ),
              endpoint: true,
              link: {
                label: msg("Download the Cursor configuration"),
                href: "/guides/cursor-mcp.json",
                download: true,
              },
            },
            {
              title: msgIn("connection", "Sign in to Guteneo"),
              text: msg(
                "Find guteneo in Cursor’s MCP servers, follow the authentication flow and check the requested permissions.",
              ),
            },
            {
              title: msg("Check the tools in the agent"),
              text: msg(
                "With the server enabled, paste the verification prompt below into a conversation. Keep the confirmations required by your Cursor configuration.",
              ),
            },
          ],
          documentation: [
            {
              label: msg("Official Cursor guide"),
              href: "https://cursor.com/docs/mcp",
            },
          ],
          troubleshooting: [
            {
              question: msg("Guteneo does not appear in this project"),
              answer: msg(
                "Check the open project’s .cursor/mcp.json file, or ~/.cursor/mcp.json for a global configuration. Then check that the server is enabled and authorised by your organisation.",
              ),
            },
          ],
        },
        {
          id: "plugin",
          label: msg("Local Cursor plugin"),
          prerequisites: [
            msg("Cursor with local plugin imports allowed."),
            msg(
              "An OAuth client registered for this application, or verified automatic registration. If the application asks for a client ID or rejects the redirect address, contact Guteneo support before continuing.",
            ),
          ],
          steps: [
            {
              title: msg("Download the Guteneo package"),
              text: msg(
                "Extract the ZIP and copy all its contents, including hidden folders, to ~/.cursor/plugins/local/guteneo/.",
              ),
              link: {
                label: msg(
                  "Download the plugin package (manual installation)",
                ),
                href: "/integrations/guteneo-plugin.zip",
                download: true,
              },
            },
            {
              title: msg("Reload Cursor"),
              text: msg(
                "Run Developer: Reload Window, then find Guteneo in Customize. A symbolic link to an external folder is not sufficient.",
              ),
            },
            {
              title: msgIn("connection", "Sign in to Guteneo"),
              text: msg(
                "Connect the guteneo server, review the permissions and use the verification request below.",
              ),
              endpoint: true,
            },
          ],
          documentation: [
            {
              label: msg("Official Cursor plugins guide"),
              href: "https://cursor.com/docs/plugins",
            },
          ],
          troubleshooting: [],
        },
      ],
    },
  ];
}

export function getAssistant(id: string | null | undefined) {
  return getAssistantCatalog().find((assistant) => assistant.id === id);
}
