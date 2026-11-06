// A conservative BIMI diagnostic, not a receiver's complete DMARC evaluator.
// Parse only one unambiguous policy. Malformed/duplicate tags never prove
// enforcement; the DMARC1 version value is case-sensitive (RFC 7489, 6.4).
export function dmarcEnforcesAllMail(records) {
  if (!Array.isArray(records) || records.length !== 1) return false;
  const value = records[0];
  if (typeof value !== "string" || /[^\x20-\x7e\t]/.test(value)) return false;
  const parts = value.trim().split(";");
  if (!parts.at(-1)?.trim()) parts.pop();
  const tags = new Map();
  for (const part of parts) {
    const match = part
      .trim()
      .match(/^([a-z][a-z0-9_]*)[ \t]*=[ \t]*(\S(?:.*\S)?)$/i);
    if (!match) return false;
    const key = match[1].toLowerCase();
    if (tags.has(key)) return false;
    tags.set(key, match[2]);
  }
  const keys = [...tags.keys()];
  if (keys[0] !== "v" || keys[1] !== "p" || tags.get("v") !== "DMARC1")
    return false;
  const enforced = (policy) =>
    ["quarantine", "reject"].includes(policy?.toLowerCase());
  return (
    enforced(tags.get("p")) &&
    (!tags.has("sp") || enforced(tags.get("sp"))) &&
    (!tags.has("pct") || tags.get("pct") === "100") &&
    ["adkim", "aspf"].every(
      (key) =>
        !tags.has(key) || ["r", "s"].includes(tags.get(key).toLowerCase()),
    )
  );
}
