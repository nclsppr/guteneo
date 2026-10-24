import { PersonalDocuments } from "./personal-documents";
import { PersonalSpace } from "./personal-space";
import { useLayoutEffect, useState } from "react";
import { captureDocumentInvitation } from "./document-invitation";
import { Loading } from "./components";

export default function PersonalArea({ route }: { route: string }) {
  const [captured, setCaptured] = useState<{
    route: string;
    storageBlocked: boolean;
  }>();
  useLayoutEffect(() => {
    setCaptured({ route, ...captureDocumentInvitation() });
  }, [route]);
  if (captured?.route !== route) return <Loading />;
  return (
    <PersonalSpace
      route={route}
      invitationStorageBlocked={captured.storageBlocked}
      documents={(session, onSessionInvalid) => (
        <PersonalDocuments
          route={route}
          session={session}
          onSessionInvalid={onSessionInvalid}
        />
      )}
    />
  );
}
