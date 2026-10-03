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
          "Le studio documentaire est disponible dans l’espace privé. Cette démonstration publique ne traite pas de fichiers. ",
        )}
      </p>
    );
  if (path.startsWith("/app/template/"))
    return (
      <TemplateEditor
        key={path}
        id={path.slice("/app/template/".length)}
        session={session}
      />
    );
  if (path.startsWith("/app/dataset/"))
    return (
      <DatasetMapper
        key={path}
        id={path.slice("/app/dataset/".length)}
        canPrepare={permissions.prepareDispatches}
      />
    );
  if (path.startsWith("/app/generation/"))
    return (
      <GenerationDetail
        key={path}
        id={path.slice("/app/generation/".length)}
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
  if (path === "/app/datasets") return <DatasetLibrary session={session} />;
  if (path === "/app/generations")
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
    <ol className="studio-guide" aria-label={msg("Parcours documentaire")}>
      <li>{msg("Vos données")}</li>
      <li>{msg("Votre modèle")}</li>
      <li>{msg("PDF vérifiés")}</li>
      <li>{msg("Distribution facultative")}</li>
    </ol>
  );
}
