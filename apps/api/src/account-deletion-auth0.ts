/** Fixed-origin processor operations. No caller-supplied URL or token is logged. */
export type DeletionIdentity = { issuer: string; subject: string };
export type DeletionProcessorEnv = {
  AUTH0_DOMAIN?: string;
  AUTH0_DELETION_MANAGEMENT_TOKEN?: string;
  RESEND_READINESS_API_KEY?: string;
};

export class DeletionProcessorError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new DeletionProcessorError("PROCESSOR_READ_FAILED");
  const reader = response.body?.getReader();
  if (!reader) throw new DeletionProcessorError("PROCESSOR_RESPONSE_INVALID");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 131072 || chunks.length >= 256)
        throw new DeletionProcessorError("PROCESSOR_RESPONSE_INVALID");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new DeletionProcessorError("PROCESSOR_RESPONSE_INVALID");
  }
}

export function accountDeletionProcessors(
  env: DeletionProcessorEnv,
  fetcher: typeof fetch = fetch,
) {
  function management(
    identity: DeletionIdentity,
    assertCurrent?: () => Promise<void>,
  ) {
    const domain = env.AUTH0_DOMAIN;
    if (
      !domain ||
      !/^[a-z0-9][a-z0-9.-]+\.auth0\.com$/.test(domain) ||
      identity.issuer !== `https://${domain}/` ||
      !identity.subject ||
      identity.subject.length > 256 ||
      !env.AUTH0_DELETION_MANAGEMENT_TOKEN
    )
      throw new DeletionProcessorError("AUTH0_DELETION_UNCONFIGURED");
    return async (path: string, method = "GET") => {
      await assertCurrent?.();
      try {
        return await fetcher(`https://${domain}/api/v2/${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${env.AUTH0_DELETION_MANAGEMENT_TOKEN}`,
          },
          redirect: "manual",
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        throw new DeletionProcessorError("AUTH0_OUTCOME_UNKNOWN");
      }
    };
  }
  async function credentialIds(
    request: ReturnType<typeof management>,
    identity: DeletionIdentity,
    kind: "grants" | "device-credentials",
  ) {
    const all: string[] = [];
    for (let page = 0; page < 5; page++) {
      const params = new URLSearchParams({
        user_id: identity.subject,
        page: String(page),
        per_page: "100",
      });
      if (kind === "device-credentials") params.set("type", "refresh_token");
      const data = await readJson(await request(`${kind}?${params}`));
      if (
        !Array.isArray(data) ||
        data.some(
          (item) =>
            !item ||
            typeof item.id !== "string" ||
            !/^[\w|-]{1,256}$/.test(item.id),
        )
      )
        throw new DeletionProcessorError("AUTH0_RESPONSE_INVALID");
      all.push(...data.map((item: { id: string }) => item.id));
      if (all.length > 20)
        throw new DeletionProcessorError("AUTH0_RESOURCE_LIMIT");
      if (data.length < 100) return all;
    }
    throw new DeletionProcessorError("AUTH0_RESOURCE_LIMIT");
  }
  async function verifyIdentityAbsent(
    identity: DeletionIdentity,
    assertCurrent?: () => Promise<void>,
  ) {
    const request = management(identity, assertCurrent),
      user = await request(
        `users/${encodeURIComponent(identity.subject)}?fields=user_id&include_fields=true`,
      );
    if (user.status !== 404) {
      await user.body?.cancel().catch(() => {});
      throw new DeletionProcessorError("AUTH0_ERASURE_UNVERIFIED");
    }
    if (
      (await credentialIds(request, identity, "grants")).length ||
      (await credentialIds(request, identity, "device-credentials")).length
    )
      throw new DeletionProcessorError("AUTH0_ERASURE_UNVERIFIED");
  }
  return {
    async eraseIdentity(
      identity: DeletionIdentity,
      assertCurrent?: () => Promise<void>,
    ) {
      const request = management(identity, assertCurrent),
        response = await request(
          `users/${encodeURIComponent(identity.subject)}?fields=user_id&include_fields=true`,
        );
      if (response.status !== 404) {
        const data = (await readJson(response)) as { user_id?: unknown };
        if (data.user_id !== identity.subject)
          throw new DeletionProcessorError("AUTH0_IDENTITY_MISMATCH");
      }
      for (const kind of ["grants", "device-credentials"] as const) {
        const ids = await credentialIds(request, identity, kind);
        for (const id of ids) {
          const removed = await request(
            `${kind}/${encodeURIComponent(id)}`,
            "DELETE",
          );
          if (removed.status !== 204 && removed.status !== 404)
            throw new DeletionProcessorError("AUTH0_OUTCOME_UNKNOWN");
        }
      }
      if (response.status !== 404) {
        const removed = await request(
          `users/${encodeURIComponent(identity.subject)}`,
          "DELETE",
        );
        if (removed.status !== 204 && removed.status !== 404)
          throw new DeletionProcessorError("AUTH0_OUTCOME_UNKNOWN");
      }
      await verifyIdentityAbsent(identity, assertCurrent);
    },
    verifyIdentityAbsent,
    async verifyNotification(input: {
      id: string;
      recipient: string;
      subject: string;
      text: string;
      earliest: string;
    }) {
      if (!env.RESEND_READINESS_API_KEY || !/^[\w-]{1,100}$/.test(input.id))
        throw new DeletionProcessorError("NOTICE_VERIFICATION_UNCONFIGURED");
      let response: Response;
      try {
        response = await fetcher(
          `https://api.resend.com/emails/${encodeURIComponent(input.id)}`,
          {
            headers: {
              Authorization: `Bearer ${env.RESEND_READINESS_API_KEY}`,
            },
            redirect: "manual",
            signal: AbortSignal.timeout(10000),
          },
        );
      } catch {
        throw new DeletionProcessorError("NOTICE_OUTCOME_UNKNOWN");
      }
      const data = (await readJson(response)) as Record<string, unknown>;
      const created =
        typeof data.created_at === "string"
          ? Date.parse(data.created_at.replace(" ", "T").replace(/\+00$/, "Z"))
          : NaN;
      if (
        data.object !== "email" ||
        data.id !== input.id ||
        data.last_event !== "delivered" ||
        !Array.isArray(data.to) ||
        data.to.length !== 1 ||
        data.to[0] !== input.recipient ||
        (data.cc !== null &&
          (!Array.isArray(data.cc) || data.cc.length !== 0)) ||
        (data.bcc !== null &&
          (!Array.isArray(data.bcc) || data.bcc.length !== 0)) ||
        data.subject !== input.subject ||
        data.text !== input.text ||
        (data.html !== null && data.html !== "") ||
        !Number.isFinite(created) ||
        created < Date.parse(input.earliest) ||
        created > Date.now() + 60000
      )
        throw new DeletionProcessorError("NOTICE_DELIVERY_UNVERIFIED");
    },
  };
}
