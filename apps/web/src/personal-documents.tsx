import { useCallback, useRef, useState } from "react";
import { go } from "./components";
import type { PersonalSession } from "./personal-api";
import {
  clearPendingDocumentInvitation,
  pendingDocumentInvitation,
} from "./document-invitation";
import { ClaimDocumentInvitation } from "./personal-document-claim";
import {
  PersonalDocumentList,
  readPersonalDocumentQuery,
} from "./personal-document-list";
import { PersonalDocumentReader } from "./personal-document-reader";

export function PersonalDocuments({
  route,
  session,
  onSessionInvalid,
}: {
  route: string;
  session: PersonalSession;
  onSessionInvalid: () => void;
}) {
  const page = route.split("?")[0] ?? "/app/my-documents";
  const [, setInvitationVersion] = useState(0);
  // The list route last shown in this account's visit. While a document is
  // open the list stays mounted, hidden, so returning keeps its filters, page
  // and position without another read.
  const listRoute = useRef<{ user: string; route: string } | null>(null);
  const [listRevision, setListRevision] = useState(0);
  const refreshList = useCallback(
    () => setListRevision((current) => current + 1),
    [],
  );
  const invitation = pendingDocumentInvitation();
  if (invitation)
    return (
      <ClaimDocumentInvitation
        token={invitation}
        session={session}
        onDismiss={() => {
          clearPendingDocumentInvitation();
          setInvitationVersion((current) => current + 1);
          go("/app/my-documents");
        }}
      />
    );
  const id = page.startsWith("/app/my-documents/")
    ? page.slice("/app/my-documents/".length)
    : "";
  if (!id) listRoute.current = { user: session.user.id, route };
  const remembered =
    listRoute.current?.user === session.user.id
      ? listRoute.current.route
      : null;
  return (
    <>
      {id && (
        <PersonalDocumentReader
          key={`${session.user.id}:${id}`}
          id={id}
          session={session}
          onSessionInvalid={onSessionInvalid}
          backRoute={remembered ?? undefined}
          onChanged={refreshList}
        />
      )}
      {remembered !== null && (
        // One mounted list per account: filter changes reread pages and keep
        // the category counts instead of restarting the whole view.
        <PersonalDocumentList
          key={session.user.id}
          query={readPersonalDocumentQuery(
            new URLSearchParams(remembered.split("?")[1]),
          )}
          session={session}
          onSessionInvalid={onSessionInvalid}
          active={!id}
          revision={listRevision}
        />
      )}
    </>
  );
}
