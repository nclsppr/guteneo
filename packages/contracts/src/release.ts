import release from "../../../package.json" with { type: "json" };

/** Application identity; MCP protocol and immutable release hashes remain separate. */
export const GUTENEO_VERSION = release.version;
