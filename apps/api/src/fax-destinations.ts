import type { Env } from "./env";

/** A worldwide profile accepts an international number. Telnyx enforces its
 * outbound profile, carrier restrictions and the destination's capabilities. */
export function faxDestinationPrefixes(
  env: Pick<Env, "TELNYX_FAX_DESTINATIONS" | "TELNYX_ALLOWED_PREFIXES">,
) {
  if (env.TELNYX_FAX_DESTINATIONS === "worldwide") return ["+"];
  if (env.TELNYX_FAX_DESTINATIONS !== undefined) return null;
  const prefixes = env.TELNYX_ALLOWED_PREFIXES?.split(",").map((value) =>
    value.trim(),
  );
  return prefixes?.length &&
    prefixes.every((value) => ["+33", "+352", "+49"].includes(value))
    ? prefixes
    : null;
}

export function liveFaxIdentity(env: Env) {
  if (!env.TELNYX_ACCOUNT_ID || !env.TELNYX_CONNECTION_ID) return undefined;
  return {
    accountId: env.TELNYX_ACCOUNT_ID,
    connectionId: env.TELNYX_CONNECTION_ID,
    outboundProfileId: env.TELNYX_OUTBOUND_VOICE_PROFILE_ID,
    ...(env.TELNYX_FAX_DESTINATIONS === "worldwide"
      ? { worldwide: true as const, senderAddress: env.TELNYX_FROM }
      : {}),
  };
}
