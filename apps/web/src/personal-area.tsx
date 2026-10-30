import { PersonalDocuments } from "./personal-documents";
import { PersonalSpace } from "./personal-space";
import { useLayoutEffect, useState } from "react";
import { captureDocumentInvitation } from "./document-invitation";
import { Loading } from "./components";
import type { PersonalSessionRead } from "./personal-api";

export default function PersonalArea({
  route,
  initialSession,
}: {
  route: string;
  initialSession?: PersonalSessionRead;
}) {
  const [captured, setCaptured] = useState<{
    route: string;
    storageBlocked: boolean;
  }>();
  useLayoutEffect(() => {
    setCaptured({ route, ...captureDocumentInvitation() });
  }, [route]);
  if (!captured) return <Loading />;
  // Capture and remove a new invitation before its route reaches the children.
  // Keep the verified personal shell mounted while that layout effect runs;
  // replacing it with a fallback would restart authentication on every link.
  return (
    <PersonalSpace
      route={captured.route}
      initialSession={initialSession}
      invitationStorageBlocked={captured.storageBlocked}
      documents={(session, onSessionInvalid) => (
        <PersonalDocuments
          route={captured.route}
          session={session}
          onSessionInvalid={onSessionInvalid}
        />
      )}
    />
  );
}
