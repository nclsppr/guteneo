import { useState, type FormEvent } from "react";
import { api, ApiError, isPublicPreview, type Session } from "./api";
import { ErrorNotice, PageHeading, useAction } from "./components";
import { msg } from "./messages";
import { WorkspaceOperations } from "./administration-operations";

/** Workspace identity and operations; personal profile settings stay in the account. */
export function AdministrationSettings({
  session,
  onUpdated,
}: {
  session: Session;
  onUpdated: () => void | Promise<void>;
}) {
  const [name, setName] = useState(session.organization.name);
  const [saved, setSaved] = useState(false);
  const action = useAction();
  const invalid =
    action.error instanceof ApiError && action.error.code === "INVALID_INPUT";
  const changed = name.trim() !== session.organization.name;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    await action.run(async (view) => {
      await view.wait(
        api("/account", {
          method: "PATCH",
          body: { organizationName: name },
        }),
      );
      await view.wait(onUpdated());
      setSaved(true);
    });
  }
  return (
    <>
      <PageHeading
        title={msg("Workspace settings")}
        intro={msg(
          "The workspace name, channel availability and operating diagnostics. Your own profile and language stay in your account.",
        )}
      />
      <form
        className="form-panel"
        onSubmit={(event) => void save(event)}
        aria-busy={action.pending}
      >
        <h2>{msg("Workspace identity")}</h2>
        <div className="field">
          <label htmlFor="administration-workspace-name">
            {msg("Workspace name")}
          </label>
          <input
            id="administration-workspace-name"
            name="organization"
            autoComplete="organization"
            value={name}
            maxLength={120}
            required
            disabled={action.pending || isPublicPreview}
            aria-invalid={invalid || undefined}
            aria-describedby="administration-workspace-name-help"
            onChange={(event) => {
              setName(event.target.value);
              setSaved(false);
              action.clear();
            }}
          />
          <small id="administration-workspace-name-help">
            {msg("All members of this workspace can see this name.")}
          </small>
        </div>
        <button
          className="button primary"
          type="submit"
          disabled={action.pending || !changed || isPublicPreview}
        >
          {action.pending ? msg("Saving…") : msg("Save changes")}
        </button>
        {saved && (
          <p role="status">{msg("The workspace name has been saved.")}</p>
        )}
        <ErrorNotice error={action.error} />
      </form>
      <WorkspaceOperations />
    </>
  );
}
