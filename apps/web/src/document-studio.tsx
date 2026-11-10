import { isAdvancedLocalPreview } from "./local-preview";
import { msg } from "./messages";
import type { Session } from "./api";
import { isPublicPreview, permissionsFor, sessionAuthorityKey } from "./api";
import { TemplateLibrary, TemplateEditor } from "./template-pages";
import { DatasetLibrary, DatasetMapper } from "./dataset-pages";
import { GenerationList, GenerationDetail } from "./generation-pages";
import { studioRoutes } from "./app-routes";
import "./document-studio.css";

export default function DocumentStudio({
  route,
  session,
}: {
  route: string;
  session: Session;
}) {
  const [path, query] = route.split("?");
  const permissions = permissionsFor(session);
  const readOnly = isPublicPreview && !isAdvancedLocalPreview;
  const canPrepare = permissions.prepareDispatches && !readOnly;
  const identity = sessionAuthorityKey(session);
  if (path.startsWith(studioRoutes.template("")))
    return (
      <TemplateEditor
        key={`${identity}:${route}`}
        id={path.slice(studioRoutes.template("").length)}
        session={session}
        readOnly={readOnly}
      />
    );
  if (path.startsWith(studioRoutes.dataset("")))
    return (
      <DatasetMapper
        key={`${identity}:${route}`}
        identity={identity}
        id={path.slice(studioRoutes.dataset("").length)}
        canPrepare={canPrepare}
      />
    );
  if (path.startsWith(studioRoutes.generation("")))
    return (
      <GenerationDetail
        key={`${identity}:${route}`}
        identity={identity}
        id={path.slice(studioRoutes.generation("").length)}
        canPrepare={canPrepare}
      />
    );
  if (path === studioRoutes.datasets)
    return <DatasetLibrary session={session} readOnly={readOnly} />;
  if (path === studioRoutes.generations)
    return <GenerationList canPrepare={canPrepare} />;
  return (
    <TemplateLibrary
      identity={identity}
      canPrepare={canPrepare}
      startBlank={new URLSearchParams(query).get("new") === "blank"}
    />
  );
}

export function StudioSteps() {
  return (
    <ol className="studio-guide" aria-label={msg("Document workflow")}>
      <li>{msg("Your data")}</li>
      <li>{msg("Your template")}</li>
      <li>{msg("Verified PDFs")}</li>
      <li>{msg("Optional distribution")}</li>
    </ol>
  );
}
