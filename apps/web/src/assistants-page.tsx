import { msg } from "./messages";
import { ArrowLeft, ArrowRight, DownloadSimple } from "@phosphor-icons/react";
import { PublicHeader } from "./public-chrome";
import { workspaceEntryHref } from "./auth-navigation";
import { AssistantGuide, AssistantPicker } from "./assistant-guides";
import { getAssistant } from "./assistant-catalog";
import { LuxembourgFooter } from "./landing-sections";
import "./assistant-workspace.css";

export function AssistantsPage({ assistantId }: { assistantId?: string }) {
  const assistant = getAssistant(assistantId);
  return (
    <div className="landing assistants-public">
      <a className="skip-link" href="#assistants-main">
        {msg("Skip to content")}
      </a>
      <PublicHeader activePage="assistants" />
      <main id="assistants-main" tabIndex={-1}>
        {assistant ? (
          <>
            <a className="back-link" href="/assistants/">
              <ArrowLeft size={18} aria-hidden="true" />
              {msg("All assistants")}
            </a>
            <AssistantGuide assistantId={assistant.id} />
          </>
        ) : assistantId ? (
          <section className="assistants-intro">
            <h1>{msg("This guide does not exist.")}</h1>
            <p>
              {msg(
                "Find instructions for your assistant in the catalogue.",
              )}
            </p>
            <a className="button primary" href="/assistants/">
              {msg("Choose my assistant ")}
              <ArrowRight size={18} aria-hidden="true" />
            </a>
          </section>
        ) : (
          <>
            <section className="assistants-intro">
              <h1>
                {msg("Your assistant.")}
                <br />
                <em>{msg("Your correspondence.")}</em>
              </h1>
              <p>
                {msg(
                  "Connect your assistant to Guteneo via MCP. Choose your tool and follow the steps to add the server and connect your account.",
                )}
              </p>
              <p className="assistants-intro-note">
                {msg(
                  "Installation via MCP does not require a published plugin. The guides are available without an account.",
                )}
              </p>
            </section>
            <AssistantPicker />
            <section
              className="assistant-direct-route"
              aria-labelledby="plugin-package-title"
            >
              <div>
                <h2 id="plugin-package-title">{msg("The Guteneo plugin")}</h2>
                <p>
                  {msg(
                    "The package includes skills and the MCP connection. Choose your application’s guide to install it and verify your account connection.",
                  )}
                </p>
              </div>
              <a
                className="button"
                href="/integrations/guteneo-plugin.zip"
                download
              >
                {msg("Download the plugin (ZIP)")}
                <DownloadSimple size={18} aria-hidden="true" />
              </a>
            </section>
            <section
              className="assistant-direct-route"
              aria-labelledby="direct-route-title"
            >
              <div>
                <h2 id="direct-route-title">
                  {msg("Already have your document?")}
                </h2>
                <p>
                  {msg(
                    "Add it directly in Guteneo, choose its recipient and check the summary before confirming. No assistant is required.",
                  )}
                </p>
              </div>
              <a
                className="button"
                href={workspaceEntryHref("/app/prepare?entry=direct")}
              >
                {msg("Send from Guteneo")}{" "}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </section>
          </>
        )}
      </main>
      <LuxembourgFooter />
    </div>
  );
}
