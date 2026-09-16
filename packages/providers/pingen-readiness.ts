import { z } from "zod";
import { boundedText, request } from "./transport";
import type { Fetcher } from "./types";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const credential = z.string().regex(/^[\x21-\x7e]{1,4096}$/);
const configSchema = z.object({
  clientId: credential,
  clientSecret: credential,
  organisationId: id,
  sandbox: z.boolean(),
});
const tokenSchema = z.object({
  access_token: z.string().regex(/^[\x21-\x7e]{1,16384}$/),
  token_type: z.string().regex(/^Bearer$/i),
  expires_in: z.number().int().positive().max(86_400),
  scope: z.string().optional(),
});
const organisationSchema = z.object({
  data: z.object({
    id,
    type: z.literal("organisations"),
    attributes: z.object({
      billing_currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .nullable()
        .optional(),
      default_country: z
        .string()
        .regex(/^[A-Z]{2}$/)
        .nullable()
        .optional(),
      default_address_position: z.enum(["left", "right"]).nullable().optional(),
    }),
  }),
});
const uploadSchema = z.object({
  data: z.object({
    type: z.literal("file_uploads"),
    attributes: z.object({ url: z.string().min(1).max(65_535) }),
  }),
});

type Stage =
  "configuration" | "authentication" | "organisation" | "upload_origin";
type ErrorCode =
  | "configuration_invalid"
  | "request_failed"
  | "request_timeout"
  | "http_error"
  | "invalid_response"
  | "response_scope_mismatch";
class InspectionFailure extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly httpStatus?: number,
  ) {
    super(code);
  }
}

async function readJson(
  fetcher: Fetcher,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await request(fetcher, url, {
      ...init,
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    throw new InspectionFailure(
      error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name)
        ? "request_timeout"
        : "request_failed",
    );
  }
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => undefined);
    throw new InspectionFailure("http_error", response.status);
  }
  try {
    return JSON.parse(await boundedText(response, 64 * 1024));
  } catch {
    throw new InspectionFailure("invalid_response");
  }
}

export type PingenReadiness = {
  provider: "pingen";
  mode: "read_only";
  environment: "production" | "sandbox";
  status: "ok" | "error";
  authenticated: boolean;
  organisation: {
    configuredIdMatches: true;
    billingCurrency: string | null;
    defaultCountry: string | null;
    defaultAddressPosition: "left" | "right" | null;
  } | null;
  errors: { stage: Stage; code: ErrorCode; httpStatus?: number }[];
  liveSendingVerified: false;
};

/** Private account inspection: one read-scoped OAuth exchange, one organisation GET.
 * No token cache, provider links, upload, letter, webhook or send operation.
 * A successful result verifies only access to the configured organisation.
 */
export async function inspectPingenReadiness(
  config: {
    clientId: string;
    clientSecret: string;
    organisationId: string;
    sandbox: boolean;
  },
  fetcher: Fetcher = fetch,
): Promise<PingenReadiness> {
  const result: PingenReadiness = {
    provider: "pingen",
    mode: "read_only",
    environment: config.sandbox === true ? "sandbox" : "production",
    status: "error",
    authenticated: false,
    organisation: null,
    errors: [],
    liveSendingVerified: false,
  };
  let stage: Stage = "configuration";
  const parsedConfig = configSchema.safeParse(config);
  if (!parsedConfig.success) {
    result.errors.push({ stage, code: "configuration_invalid" });
    return result;
  }
  const identity = config.sandbox
    ? "https://identity-staging.pingen.com"
    : "https://identity.pingen.com";
  // OpenAPI and current SDK origins; older Postman documentation has stale v2 aliases.
  const api = config.sandbox
    ? "https://api-staging.pingen.com"
    : "https://api.pingen.com";

  try {
    stage = "authentication";
    const token = tokenSchema.safeParse(
      await readJson(fetcher, `${identity}/auth/access-tokens`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: config.clientId,
          client_secret: config.clientSecret,
          scope: "organisation_read",
        }),
      }),
    );
    if (!token.success) throw new InspectionFailure("invalid_response");
    // A server may omit the optional OAuth scope field when it matches the request.
    if (
      token.data.scope !== undefined &&
      token.data.scope.trim() !== "organisation_read"
    )
      throw new InspectionFailure("response_scope_mismatch");
    result.authenticated = true;
    stage = "organisation";
    const organisation = organisationSchema.safeParse(
      await readJson(fetcher, `${api}/organisations/${config.organisationId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token.data.access_token}`,
          Accept: "application/vnd.api+json",
        },
      }),
    );
    if (!organisation.success) throw new InspectionFailure("invalid_response");
    if (organisation.data.data.id !== config.organisationId)
      throw new InspectionFailure("response_scope_mismatch");
    const attributes = organisation.data.data.attributes;
    result.organisation = {
      configuredIdMatches: true,
      billingCurrency: attributes.billing_currency ?? null,
      defaultCountry: attributes.default_country ?? null,
      defaultAddressPosition: attributes.default_address_position ?? null,
    };
    result.status = "ok";
  } catch (error) {
    const safe = error instanceof InspectionFailure ? error : null;
    result.errors.push({
      stage,
      code: safe?.code ?? "request_failed",
      ...(safe?.httpStatus === undefined
        ? {}
        : { httpStatus: safe.httpStatus }),
    });
  }
  return result;
}

export type PingenUploadOriginInspection = {
  provider: "pingen";
  mode: "read_only";
  environment: "production" | "sandbox";
  status: "ok" | "error";
  uploadOrigin: string | null;
  errors: { stage: Stage; code: ErrorCode; httpStatus?: number }[];
  liveSendingVerified: false;
};

/** Qualify only the origin offered by Pingen. Never fetch the signed upload URL.
 * GET /file-upload requires OAuth but no additional scope in Pingen's OpenAPI.
 * Explicit organisation_read avoids Pingen's default of granting all client scopes.
 */
export async function inspectPingenUploadOrigin(
  config: { clientId: string; clientSecret: string; sandbox: boolean },
  fetcher: Fetcher = fetch,
): Promise<PingenUploadOriginInspection> {
  const result: PingenUploadOriginInspection = {
    provider: "pingen",
    mode: "read_only",
    environment: config.sandbox === true ? "sandbox" : "production",
    status: "error",
    uploadOrigin: null,
    errors: [],
    liveSendingVerified: false,
  };
  let stage: Stage = "configuration";
  if (!configSchema.omit({ organisationId: true }).safeParse(config).success) {
    result.errors.push({ stage, code: "configuration_invalid" });
    return result;
  }
  const identity = config.sandbox
    ? "https://identity-staging.pingen.com"
    : "https://identity.pingen.com";
  const api = config.sandbox
    ? "https://api-staging.pingen.com"
    : "https://api.pingen.com";
  try {
    stage = "authentication";
    const token = tokenSchema.safeParse(
      await readJson(fetcher, `${identity}/auth/access-tokens`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: config.clientId,
          client_secret: config.clientSecret,
          scope: "organisation_read",
        }),
      }),
    );
    if (!token.success) throw new InspectionFailure("invalid_response");
    if (
      token.data.scope !== undefined &&
      token.data.scope.trim() !== "organisation_read"
    )
      throw new InspectionFailure("response_scope_mismatch");
    stage = "upload_origin";
    const upload = uploadSchema.safeParse(
      await readJson(fetcher, `${api}/file-upload`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token.data.access_token}`,
          Accept: "application/vnd.api+json",
        },
      }),
    );
    if (!upload.success) throw new InspectionFailure("invalid_response");
    const raw = upload.data.data.attributes.url;
    // No parser normalization of whitespace, controls, backslashes or Unicode hosts.
    if (!/^https:\/\/[\x21-\x7e]+$/.test(raw) || raw.includes("\\"))
      throw new InspectionFailure("invalid_response");
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new InspectionFailure("invalid_response");
    }
    const publicDnsName =
      /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !publicDnsName.test(url.hostname) ||
      /(?:^|\.)(?:localhost|local|internal|invalid|test|example)$/.test(
        url.hostname,
      )
    )
      throw new InspectionFailure("invalid_response");
    // The returned path, query, signature, expiry and provider links never leave this call.
    result.uploadOrigin = url.origin;
    result.status = "ok";
  } catch (error) {
    const safe = error instanceof InspectionFailure ? error : null;
    result.errors.push({
      stage,
      code: safe?.code ?? "request_failed",
      ...(safe?.httpStatus === undefined
        ? {}
        : { httpStatus: safe.httpStatus }),
    });
  }
  return result;
}
