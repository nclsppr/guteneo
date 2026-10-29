import { msg } from "./messages";
import type { Session } from "./api";
import { isPublicPreview, permissionsFor } from "./api";
import { TemplateLibrary, TemplateEditor } from "./template-pages";
import { DatasetLibrary, DatasetMapper } from "./dataset-pages";
import {
  GenerationList,
  GenerationDetail,
  DistributionDetail,
} from "./generation-pages";
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
  if (isPublicPreview)
    return (
      <p className="notice info">
        {msg(
          "The document studio is available in your private workspace. This public demo does not process files. ",
        )}
      </p>
    );
  if (path.startsWith(studioRoutes.template("")))
    return (
      <TemplateEditor
        key={route}
        id={path.slice(studioRoutes.template("").length)}
        session={session}
      />
    );
  if (path.startsWith(studioRoutes.dataset("")))
    return (
      <DatasetMapper
        key={route}
        id={path.slice(studioRoutes.dataset("").length)}
        canPrepare={permissions.prepareDispatches}
      />
    );
  if (path.startsWith(studioRoutes.generation("")))
    return (
      <GenerationDetail
        key={path}
        id={path.slice(studioRoutes.generation("").length)}
        canPrepare={permissions.prepareDispatches}
      />
    );
  if (path.startsWith("/app/distribution/"))
    return (
      <DistributionDetail
        key={path}
        id={path.slice("/app/distribution/".length)}
        canPrepare={permissions.prepareDispatches}
        canApprove={permissions.approveDispatches}
      />
    );
  if (path === studioRoutes.datasets)
    return <DatasetLibrary session={session} />;
  if (path === studioRoutes.generations)
    return <GenerationList canPrepare={permissions.prepareDispatches} />;
  return (
    <TemplateLibrary
      canPrepare={permissions.prepareDispatches}
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
