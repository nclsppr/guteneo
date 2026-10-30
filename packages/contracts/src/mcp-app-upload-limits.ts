/** Fixed, reviewed App protocol bounds. No browser schema/runtime dependencies. */
export const MCP_APP_UPLOAD_PART_BYTES = 256 * 1024;
export const MCP_APP_UPLOAD_MAX_PARTS = 40;
export const MCP_APP_UPLOAD_MAX_BYTES =
  MCP_APP_UPLOAD_PART_BYTES * MCP_APP_UPLOAD_MAX_PARTS;
export const MCP_APP_UPLOAD_MAX_CALLS = 64;
export const MCP_APP_UPLOAD_PART_MS = 10_000;
export const MCP_APP_UPLOAD_TTL_SECONDS = 300;
