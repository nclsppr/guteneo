import type {
  PersonalDocumentItem,
  PersonalDocumentView,
} from "../../../packages/contracts/src/secure-distribution";
import type { DocumentRecord, Page, Session } from "./api";
import type { PersonalSession } from "./personal-api";
import { getLocale } from "./locale";
import { PreviewError, type createPreviewApi } from "./preview";

type Preview = ReturnType<typeof createPreviewApi>;
type Options = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  csrfToken?: string;
};
const unavailable = (
  message = "This operation is unavailable in the read-only fictional personal area.",
): never => {
  throw new PreviewError("PREVIEW_PERSONAL_READ_ONLY", message, 409);
};
const missing = (): never => {
  throw new PreviewError(
    "DOCUMENT_NOT_FOUND",
    "Fictional personal document not found for this account and scenario.",
    404,
  );
};
const scope = (session: Session) =>
  `${session.organization.id}:${session.user.id}`;
const token = (session: Session) => `${session.csrfToken}:${scope(session)}`;
const encode = (value: unknown) =>
  btoa(
    Array.from(new TextEncoder().encode(JSON.stringify(value)), (byte) =>
      String.fromCharCode(byte),
    ).join(""),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const decodeValue = (value: string): unknown =>
  JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(
        atob(value.replaceAll("-", "+").replaceAll("_", "/")),
        (character) => character.charCodeAt(0),
      ),
    ),
  );
const text = (title: string) =>
  `${title}\n\nFictional browser preview.\nNo document has been delivered, received or deposited.\nThis page demonstrates the personal reader using synthetic metadata.\nNo provider, identity service or private storage is contacted.`;

/** Personal-reader fixtures only. No identity qualification, receipt, deposit or audit write. */
export function createPreviewPersonal(preview: Preview) {
  async function actor(options: Options): Promise<Session> {
    options.signal?.throwIfAborted();
    if (!preview.advancedLocal)
      throw new PreviewError(
        "PREVIEW_LOCAL_ONLY",
        "The fictional personal area is available only in the local browser simulation.",
        403,
      );
    const current = (await preview.request("/session", {
      signal: options.signal,
    })) as Session;
    if (options.csrfToken !== undefined && options.csrfToken !== token(current))
      throw new PreviewError(
        "PREVIEW_SCENARIO_CHANGED",
        "The fictional account or scenario changed. Reopen this view.",
        409,
      );
    return current;
  }
  async function unchanged(initial: Session, options: Options) {
    options.signal?.throwIfAborted();
    const current = await actor(options);
    if (scope(current) !== scope(initial))
      throw new PreviewError(
        "PREVIEW_SCENARIO_CHANGED",
        "The fictional account or scenario changed. Reopen this view.",
        409,
      );
  }
  function identifier(
    session: Session,
    documentId: string,
    kind: PersonalDocumentItem["kind"],
  ) {
    return `preview_personal_${encode([scope(session), kind, documentId])}`;
  }
  function decode(
    session: Session,
    id: string,
  ): { documentId: string; kind: PersonalDocumentItem["kind"] } {
    try {
      const prefix = "preview_personal_";
      if (!id.startsWith(prefix)) return missing();
      const decoded = decodeValue(id.slice(prefix.length));
      if (
        !Array.isArray(decoded) ||
        decoded.length !== 3 ||
        decoded[0] !== scope(session) ||
        !["shared", "personal"].includes(decoded[1]) ||
        typeof decoded[2] !== "string"
      )
        return missing();
      return { documentId: decoded[2], kind: decoded[1] };
    } catch {
      return missing();
    }
  }
  function item(
    session: Session,
    document: DocumentRecord,
    kind: PersonalDocumentItem["kind"],
  ): PersonalDocumentItem {
    return {
      id: identifier(session, document.id, kind),
      kind,
      title: `Fictional ${kind === "shared" ? "received preview" : "saved-copy preview"} · ${document.name}`,
      sender: "Fictional browser scenario · no delivery",
      status: document.status === "ready" ? "active" : "pending",
      expiresAt: "2099-12-31T23:59:59.000Z",
      createdAt: document.created_at,
      allowOriginalDownload: false,
      allowVaultDeposit: false,
    };
  }
  async function record(session: Session, id: string, options: Options) {
    const decoded = decode(session, id);
    const document = (await preview.request(
      `/documents/${encodeURIComponent(decoded.documentId)}`,
      { signal: options.signal },
    )) as DocumentRecord;
    await unchanged(session, options);
    return item(session, document, decoded.kind);
  }
  async function request(
    path: string,
    options: Options = {},
  ): Promise<unknown> {
    const [route, parameters] = path.split("?");
    const method = options.method ?? "GET";
    if (route === "/dev/personal-login" && method === "POST") {
      if (!preview.advancedLocal)
        throw new PreviewError(
          "PREVIEW_LOCAL_ONLY",
          "The fictional personal area is local only.",
          403,
        );
      await preview.request("/dev/login", {
        method: "POST",
        body: { organization: "atelier" },
        signal: options.signal,
      });
      return request("/personal/session", { signal: options.signal });
    }
    const current = await actor(options);
    if (route === "/personal/logout" && method === "POST")
      return preview.request("/logout", {
        method: "POST",
        signal: options.signal,
      });
    if (method !== "GET") return unavailable();
    if (route === "/personal/session") {
      const workspaces = (await preview.request("/account/workspaces", {
        signal: options.signal,
      })) as { items: PersonalSession["workspaces"] };
      await unchanged(current, options);
      return {
        user: {
          ...current.user,
          email: current.user.email ?? "fictional@example.invalid",
          preferredLocale: current.user.preferredLocale ?? getLocale(),
        },
        csrfToken: token(current),
        simulation: true,
        ...(current.canAccessBelvedere ? { canAccessBelvedere: true } : {}),
        mfa: false,
        strongAuthentication: false,
        verifiedAccount: false,
        documentAccessAllowed: true,
        documentAccessMode: "verified_account",
        authenticationPolicyVersion:
          "fictional-browser-preview-no-authentication",
        amr: [],
        acr: null,
        authenticatedAt: null,
        workspaces: workspaces.items,
      } satisfies PersonalSession;
    }
    if (route === "/personal/account/sessions") return { items: [] };
    if (route === "/personal/documents") {
      const query = new URLSearchParams(parameters);
      const kind = query.get("kind") ?? "shared";
      if (kind !== "shared" && kind !== "personal")
        throw new PreviewError(
          "INVALID_INPUT",
          "Unknown fictional document category.",
        );
      const rawSearch = (query.get("q") ?? "").trim();
      const search = rawSearch.toLocaleLowerCase();
      if (search.length > 200)
        throw new PreviewError(
          "INVALID_INPUT",
          "The fictional document search is limited to 200 characters.",
        );
      const forwarded = new URLSearchParams();
      const suppliedCursor = query.get("cursor");
      if (suppliedCursor !== null) {
        try {
          const prefix = "preview_personal_page_";
          if (
            !suppliedCursor.startsWith(prefix) ||
            suppliedCursor.length > 4096
          )
            throw new Error("Invalid cursor");
          const decoded = decodeValue(suppliedCursor.slice(prefix.length));
          if (
            !Array.isArray(decoded) ||
            decoded.length !== 4 ||
            decoded[0] !== scope(current) ||
            decoded[1] !== kind ||
            decoded[2] !== search ||
            typeof decoded[3] !== "string"
          )
            throw new Error("Foreign cursor");
          forwarded.set("cursor", decoded[3]);
        } catch {
          throw new PreviewError(
            "INVALID_PREVIEW_CURSOR",
            "This fictional page cursor belongs to another personal account or query.",
          );
        }
      }
      let result: Page<DocumentRecord>;
      let exactIdentifier = false;
      if (
        search &&
        (preview.configuration().counts !== null ||
          rawSearch.startsWith("preview_"))
      ) {
        if (suppliedCursor !== null)
          throw new PreviewError(
            "INVALID_PREVIEW_CURSOR",
            "Indexed fictional searches have one result page.",
          );
        if (rawSearch.startsWith("preview_")) {
          const documentId = rawSearch.startsWith("preview_personal_")
            ? decode(current, rawSearch).documentId
            : rawSearch;
          exactIdentifier = true;
          try {
            const document = (await preview.request(
              `/documents/${encodeURIComponent(documentId)}`,
              { signal: options.signal },
            )) as DocumentRecord;
            result = { items: [document], nextCursor: null };
          } catch (error) {
            if (
              !(error instanceof PreviewError) ||
              error.code !== "DOCUMENT_NOT_FOUND"
            )
              throw error;
            result = { items: [], nextCursor: null };
          }
        } else {
          const numbers = rawSearch.match(/\d+/g);
          if (!numbers || numbers.length !== 1 || numbers[0].length > 10)
            throw new PreviewError(
              "PREVIEW_SEARCH_INDEXED_ONLY",
              "In fictional volume scenarios, search by the exact document number or identifier.",
              409,
            );
          const ordinal = Number(numbers[0]);
          exactIdentifier = /^\d+$/.test(rawSearch);
          result =
            ordinal > 0 && ordinal <= 1_000_000_000
              ? ((await preview.request(`/documents?recordNumber=${ordinal}`, {
                  signal: options.signal,
                })) as Page<DocumentRecord>)
              : { items: [], nextCursor: null };
        }
      } else {
        result = (await preview.request(
          `/documents${forwarded.size ? `?${forwarded}` : ""}`,
          { signal: options.signal },
        )) as Page<DocumentRecord>;
      }
      await unchanged(current, options);
      return {
        items: result.items
          .map((document) => item(current, document, kind))
          .filter(
            (document) =>
              !search ||
              exactIdentifier ||
              document.title.toLocaleLowerCase().includes(search),
          ),
        nextCursor: result.nextCursor
          ? `preview_personal_page_${encode([scope(current), kind, search, result.nextCursor])}`
          : null,
      };
    }
    const match = route.match(
      /^\/personal\/documents\/([^/]+)(?:\/(audit|pages\/([1-9]\d*)(\/text)?))?$/,
    );
    if (!match) return unavailable();
    const document = await record(
      current,
      decodeURIComponent(match[1]),
      options,
    );
    if (match[2] === "audit") return { items: [], nextCursor: null };
    if (match[3]) {
      if (match[3] !== "1" || document.status !== "active") return missing();
      if (match[4]) return { text: text(document.title) };
      return unavailable(
        "Fictional page images are available through the local binary reader.",
      );
    }
    return {
      ...document,
      pages:
        document.status === "active"
          ? [
              {
                number: 1,
                width: 595,
                height: 842,
                url: "",
                accessibleText: "",
                textUrl: "",
              },
            ]
          : [],
      audit: [],
      auditNextCursor: null,
      policy: {
        retentionDays: 365,
        allowOriginalDownload: false,
        allowVaultDeposit: false,
        personalRetentionDays: 365,
      },
    } satisfies PersonalDocumentView;
  }
  async function blob(path: string, options: Options = {}): Promise<Blob> {
    const current = await actor(options);
    if ((options.method ?? "GET") !== "GET") return unavailable();
    const match = path
      .split("?")[0]
      .match(/^\/personal\/documents\/([^/]+)\/pages\/1$/);
    if (!match) return unavailable();
    const item = await record(current, decodeURIComponent(match[1]), options);
    if (item.status !== "active") return missing();
    if (typeof document === "undefined")
      return unavailable(
        "The fictional page renderer requires a local browser.",
      );
    const canvas = document.createElement("canvas");
    canvas.width = 1190;
    canvas.height = 1684;
    const context = canvas.getContext("2d");
    if (!context)
      return unavailable(
        "The local browser cannot render this fictional page.",
      );
    context.scale(2, 2);
    context.fillStyle = "white";
    context.fillRect(0, 0, 595, 842);
    context.fillStyle = "black";
    context.font = "26px serif";
    context.fillText("guteneo · fictional document", 44, 75);
    context.font = "15px sans-serif";
    const lines = text(item.title)
      .split("\n")
      .flatMap((line) => line.match(/.{1,60}(?:\s|$)|.{1,60}/g) ?? [""]);
    lines.forEach((line, index) =>
      context.fillText(line.trim(), 44, 140 + index * 27),
    );
    const result = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(
                new PreviewError(
                  "PREVIEW_PAGE_UNAVAILABLE",
                  "The local fictional page could not be rendered.",
                  409,
                ),
              ),
        "image/png",
      ),
    );
    await unchanged(current, options);
    return result;
  }
  return { request, blob };
}
