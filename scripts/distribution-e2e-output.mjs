const MAX_LINE = 65536;

/** Stream boundaries must not reveal half an invitation before its full value
 * can be recognized. Console evidence has no need to expose 256-bit hex values;
 * exact source hashes remain available in the independently checked report. */
export function forwardPrivateTestOutput(source, destination) {
  let pending = "", dropping = false;
  const write = (line) => destination.write(line.replaceAll(/[a-f0-9]{64}/giu, "[REDACTED_64_HEX]"));
  source.setEncoding("utf8");
  source.on("data", (chunk) => {
    if (dropping) {
      const newline = chunk.indexOf("\n");
      if (newline < 0) return;
      dropping = false;
      chunk = chunk.slice(newline + 1);
    }
    pending += chunk;
    for (;;) {
      const newline = pending.indexOf("\n");
      if (newline < 0) break;
      const line = pending.slice(0, newline + 1);
      if (line.length <= MAX_LINE) write(line);
      else destination.write("[Oversized test output omitted]\n");
      pending = pending.slice(newline + 1);
    }
    if (pending.length > MAX_LINE) {
      destination.write("[Oversized test output omitted]\n");
      pending = "";
      dropping = true;
    }
  });
  source.on("end", () => { if (pending && !dropping) write(pending); });
}
