import { useEffect, useState } from "react";
import type { Session } from "./api";
import { useRefreshOnFocus, useResource } from "./components";

export type AssistantConnection = {
  id: string;
  client_id: string;
  status: string;
  created_at: string;
  display_name?: string | null;
  assistant?: string | null;
  last_successful_tool_at?: string | null;
  verification?: "verified" | "unverified";
};

export function useAssistantConnections() {
  const resource = useResource<{ items: AssistantConnection[] }>(
    "/connections",
  );
  useRefreshOnFocus(resource.refresh);
  return resource;
}

function preferenceKey(session: Session) {
  return `guteneo:assistant-invitation:${session.organization.id}:${session.user.id}`;
}
function readDirectChoice(key: string) {
  try {
    return localStorage.getItem(key) === "direct";
  } catch {
    return false;
  }
}
export function useDirectChoice(session: Session) {
  const key = preferenceKey(session);
  const [saved, setSaved] = useState(() => ({
    key,
    direct: readDirectChoice(key),
  }));
  const direct = saved.key === key ? saved.direct : readDirectChoice(key);
  function chooseDirect(value: boolean) {
    try {
      if (value) localStorage.setItem(key, "direct");
      else localStorage.removeItem(key);
    } catch {
      // The current visit remains usable when browser storage is unavailable.
    }
    setSaved({ key, direct: value });
  }
  return { direct, chooseDirect };
}

export function RememberDirectChoice({ session }: { session: Session }) {
  const key = preferenceKey(session);
  useEffect(() => {
    try {
      localStorage.setItem(key, "direct");
    } catch {
      // Saving a display preference never gates preparation or sending.
    }
  }, [key]);
  return null;
}
