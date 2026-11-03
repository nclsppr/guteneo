import { useState } from "react";
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
  const query = new URLSearchParams(route.split("?")[1]);
  const [, setInvitationVersion] = useState(0);
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
  if (id)
    return (
      <PersonalDocumentReader
        key={`${session.user.id}:${id}`}
        id={id}
        session={session}
        onSessionInvalid={onSessionInvalid}
      />
    );
  // One mounted list per account: filter changes reread pages and keep the
  // category counts instead of restarting the whole view.
  return (
    <PersonalDocumentList
      key={session.user.id}
      query={readPersonalDocumentQuery(query)}
      session={session}
      onSessionInvalid={onSessionInvalid}
    />
  );
}
