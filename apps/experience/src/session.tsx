import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  advanceAuthority,
  api,
  ApiError,
  currentAuthority,
  isAbort,
  SESSION_EXPIRED_EVENT,
  setCsrfToken,
  setRequestLocale,
  synchronizeAuthority,
} from "./api/client";
import type {
  Capabilities,
  PersonalSession,
  WorkspaceSession,
} from "./api/types";
import { API_IS_LOOPBACK } from "./config";
import { useI18n } from "./i18n";
import { isSupportedLocale } from "../../../packages/contracts/src/locale";

/**
 * Two kinds of authority can be present, both read from the server:
 * - a workspace session: membership, role and permissions for sending;
 * - a personal session: the person's own received documents.
 * A workspace session always carries the personal one. Nothing here is
 * decided by the browser; these values only choose what to show.
 */
export type SessionState =
  | { status: "loading" }
  | { status: "unreachable"; error: Error }
  | {
      status: "signed-out";
      capabilities: Capabilities | null;
    }
  | {
      status: "ready";
      authority: number;
      workspace: WorkspaceSession | null;
      personal: PersonalSession | null;
      capabilities: Capabilities | null;
    };

type SessionActions = {
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Move the browser session to another workspace the person belongs to. */
  enterWorkspace: (organizationId: string) => Promise<void>;
  /** A person without a workspace opens their own sending workspace. */
  createWorkspace: (name: string) => Promise<void>;
  /** Local simulation only; the server refuses it everywhere else. */
  developmentSignIn: (
    identity: "atelier" | "studio" | "recipient",
  ) => Promise<void>;
  expired: boolean;
  /** Local simulation entry may be offered: loopback API reporting simulation. */
  developmentEntry: boolean;
};

const SessionContext = createContext<{ state: SessionState } & SessionActions>(
  null!,
);

async function optional<T>(path: string): Promise<T | null> {
  try {
    return await api<T>(path);
  } catch (error) {
    if (isAbort(error)) throw error;
    // Signed out, or signed in without this kind of authority.
    if (error instanceof ApiError && [401, 403].includes(error.status))
      return null;
    throw error;
  }
}

/** A session rotation during the parallel probes must not mix two identities. */
export function sessionAuthorityKey(
  workspace: WorkspaceSession | null,
  personal: PersonalSession | null,
): string {
  if (
    workspace &&
    (!personal ||
      workspace.user.id !== personal.user.id ||
      workspace.csrfToken !== personal.csrfToken)
  )
    throw new ApiError(
      "SESSION_CHANGED",
      "The session changed. Try again.",
      409,
    );
  return JSON.stringify([
    workspace?.user.id,
    workspace?.organization.id,
    workspace?.csrfToken,
    workspace?.user.role,
    workspace?.permissions,
    workspace?.canAccessBelvedere,
    personal?.user.id,
    personal?.csrfToken,
    personal?.documentAccessAllowed,
    personal?.documentAccessMode,
    personal?.strongAuthentication,
    personal?.verifiedAccount,
    personal?.canAccessBelvedere,
  ]);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [expired, setExpired] = useState(false);
  const { setLocale, locale } = useI18n();
  const reading = useRef(0);
  const appliedLocaleFor = useRef<string | null>(null);

  const read = useCallback(async () => {
    const turn = ++reading.current;
    try {
      const capabilitiesRequest = api<Capabilities>("/capabilities").catch(
        () => null,
      );
      let workspace: WorkspaceSession | null = null;
      let personal: PersonalSession | null = null;
      let identity = "";
      // A cookie rotation can happen between the two requests. Retry that
      // bounded read once, never publish a mixed workspace/personal snapshot.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        [workspace, personal] = await Promise.all([
          optional<WorkspaceSession>("/session"),
          optional<PersonalSession>("/personal/session"),
        ]);
        try {
          identity = sessionAuthorityKey(workspace, personal);
          break;
        } catch (error) {
          if (attempt === 1) throw error;
        }
      }
      const capabilities = await capabilitiesRequest;
      if (turn !== reading.current) return;
      const authority = synchronizeAuthority(identity);
      setCsrfToken(workspace?.csrfToken ?? personal?.csrfToken);
      setExpired(false);
      if (!workspace && !personal) {
        setState({ status: "signed-out", capabilities });
        return;
      }
      setState({
        status: "ready",
        authority,
        workspace,
        personal,
        capabilities,
      });
      // The saved account language wins once per identity; a later manual
      // switch in this visit is not overridden by a background refresh.
      const user = workspace?.user ?? personal?.user;
      const preferred = user?.preferredLocale;
      if (user && appliedLocaleFor.current !== user.id) {
        appliedLocaleFor.current = user.id;
        if (isSupportedLocale(preferred)) void setLocale(preferred);
      }
    } catch (error) {
      if (isAbort(error) || turn !== reading.current) return;
      advanceAuthority();
      setState({ status: "unreachable", error: error as Error });
    }
  }, [setLocale]);

  useEffect(() => {
    void read();
  }, [read]);

  useEffect(() => {
    const expire = () => {
      advanceAuthority();
      setState({ status: "loading" });
      setExpired(true);
      void read();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expire);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expire);
  }, [read]);

  // Another tab may have signed out or switched workspace meanwhile.
  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === "visible") void read();
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [read]);

  const reset = useCallback(async () => {
    advanceAuthority();
    setState({ status: "loading" });
    await read();
  }, [read]);

  const actions = useMemo<SessionActions>(
    () => ({
      refresh: read,
      expired,
      developmentEntry:
        API_IS_LOOPBACK &&
        (state.status === "signed-out" || state.status === "ready") &&
        state.capabilities?.simulation === true,
      signOut: async () => {
        const authority = currentAuthority();
        // The personal sign-out closes both kinds of session at once.
        const personal = state.status === "ready" && state.personal;
        try {
          await api(personal ? "/personal/logout" : "/logout", {
            method: "POST",
          });
        } finally {
          if (authority === currentAuthority()) {
            appliedLocaleFor.current = null;
            await reset();
          }
        }
      },
      enterWorkspace: async (organizationId) => {
        const workspace = state.status === "ready" && state.workspace;
        await api(
          workspace ? "/account/workspace" : "/personal/workspace/select",
          {
            method: "POST",
            body: { organizationId },
          },
        );
        await reset();
      },
      createWorkspace: async (name) => {
        await api("/personal/workspace", { method: "POST", body: { name } });
        await reset();
      },
      developmentSignIn: async (identity) => {
        if (identity === "recipient")
          await api("/dev/personal-login", {
            method: "POST",
            body: { identity: "recipient", assurance: "strong" },
          });
        else
          await api("/dev/login", {
            method: "POST",
            body: { organization: identity },
          });
        await reset();
      },
    }),
    [read, reset, expired, state],
  );

  // Keep the request language aligned with what the reader sees.
  useEffect(() => {
    setRequestLocale(locale);
  }, [locale]);

  return (
    <SessionContext.Provider value={{ state, ...actions }}>
      <Fragment key={state.status === "ready" ? state.authority : state.status}>
        {children}
      </Fragment>
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

/** The signed-in state; pages below the shell can rely on it. */
export function useReadySession() {
  const session = useSession();
  if (session.state.status !== "ready")
    throw new Error("This view requires a signed-in session.");
  return { ...session, ...session.state };
}

/** A workspace page: membership and permissions are present. */
export function useWorkspace() {
  const session = useReadySession();
  if (!session.workspace)
    throw new Error("This view requires a workspace session.");
  return {
    ...session,
    workspace: session.workspace,
    permissions: session.workspace.permissions,
    simulation: session.workspace.simulation,
  };
}
