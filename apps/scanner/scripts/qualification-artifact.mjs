import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const MAX_ARCHIVE = 2_000_000;
const CODE = "SCANNER_QUALIFICATION_ARTIFACT_INVALID";
const demand = (ok) => {
  if (!ok) throw new Error(CODE);
};

// Standard-library ZIP parsing verifies CRC, bounds the one requested entry and
// never extracts any path from the archive to the runner's filesystem.
export function resultFromZip(archive) {
  demand(
    Buffer.isBuffer(archive) &&
      archive.length > 0 &&
      archive.length <= MAX_ARCHIVE,
  );
  try {
    const output = execFileSync(
      "python3",
      [
        "-c",
        `
import io, sys, zipfile
data = sys.stdin.buffer.read(2000001)
assert 0 < len(data) <= 2000000
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    entries = archive.infolist()
    assert len(entries) <= 30
    matches = [item for item in entries if item.filename == 'result.json']
    assert len(matches) == 1
    item = matches[0]
    assert 0 < item.file_size <= 65536 and item.compress_size <= 2000000
    assert not item.flag_bits & 1
    assert item.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
    sys.stdout.buffer.write(archive.read(item))
`,
      ],
      {
        input: archive,
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: 65536,
        stdio: ["pipe", "pipe", "ignore"],
      },
    );
    return JSON.parse(output);
  } catch {
    throw new Error(CODE);
  }
}

export async function downloadQualification(artifact, token, fetcher = fetch) {
  demand(
    Number.isSafeInteger(artifact?.id) &&
      artifact.id > 0 &&
      artifact.size_in_bytes > 0 &&
      artifact.size_in_bytes <= MAX_ARCHIVE &&
      /^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? ""),
  );
  const response = await fetcher(
    `https://api.github.com/repos/nclsppr/guteneo/actions/artifacts/${artifact.id}/zip`,
    {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  demand(response.status === 302);
  let location;
  try {
    location = new URL(response.headers.get("location"));
  } catch {
    throw new Error(CODE);
  }
  demand(
    location.protocol === "https:" &&
      !location.username &&
      !location.password &&
      !location.port &&
      !location.hash &&
      (location.hostname.endsWith(".blob.core.windows.net") ||
        location.hostname.endsWith(".actions.githubusercontent.com")),
  );
  await response.body?.cancel();
  // Never forward the GitHub bearer token to the signed artifact-storage URL.
  const download = await fetcher(location.href, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  demand(download.status === 200);
  const declared = download.headers.get("content-length");
  demand(
    declared === null ||
      (/^\d+$/.test(declared) && Number(declared) <= MAX_ARCHIVE),
  );
  const reader = download.body?.getReader();
  demand(reader);
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      demand(size <= MAX_ARCHIVE);
      parts.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  const archive = Buffer.concat(parts);
  demand(
    `sha256:${createHash("sha256").update(archive).digest("hex")}` ===
      artifact.digest,
  );
  return resultFromZip(archive);
}
