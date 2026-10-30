import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const mirrorPath = "/etc/apt/apt-mirrors.txt";
const mirrorUri = `mirror+file:${mirrorPath}`;
const sourcePaths = [
  "/etc/apt/sources.list",
  "/etc/apt/sources.list.d/ubuntu.sources",
];

function usesMirrorSource({ path, content }) {
  const active = content
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
  if (path.endsWith(".list")) {
    return active.split("\n").some((line) => {
      const match = line.match(
        /^\s*deb(?:-src)?\s+(?:\[[^\]\n]*\]\s+)?(\S+)\s/,
      );
      return match?.[1] === mirrorUri;
    });
  }
  return active.split(/\n\s*\n/).some((block) => {
    const enabled = [...block.matchAll(/^Enabled:[ \t]*(.*)$/gim)];
    if (
      enabled.length > 1 ||
      (enabled.length === 1 && enabled[0][1].trim().toLowerCase() !== "yes")
    ) {
      return false;
    }
    if (!/^Types:\s*(?:deb|deb-src)(?:\s|$)/im.test(block)) return false;
    const uris = block.match(/^URIs:\s*(.+)$/im)?.[1].split(/\s+/);
    return uris?.includes(mirrorUri) ?? false;
  });
}

// GitHub already supplies both Canonical HTTPS archives as fallbacks. Change
// only Azure's priority, leaving the source suites, signatures and URIs intact.
// https://github.com/actions/runner-images/blob/c74a28e5f8943ae6a39cac7c3701dd6bd0a2ea51/images/ubuntu/scripts/build/configure-apt-sources.sh
export function preferUbuntuArchives(sources, mirrors) {
  if (!sources.some(usesMirrorSource)) return mirrors;
  const entries = mirrors
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const azure = entries.filter((line) =>
    /^http:\/\/azure\.archive\.ubuntu\.com\/ubuntu\/\tpriority:[14]$/.test(
      line,
    ),
  );
  if (
    entries.length !== 3 ||
    azure.length !== 1 ||
    !entries.includes("https://archive.ubuntu.com/ubuntu/\tpriority:2") ||
    !entries.includes("https://security.ubuntu.com/ubuntu/\tpriority:3")
  ) {
    throw new Error("Unexpected Ubuntu mirror configuration; no changes made.");
  }
  return mirrors.replace(
    /^([ \t]*http:\/\/azure\.archive\.ubuntu\.com\/ubuntu\/\tpriority:)1(?=[ \t]*\r?$)/m,
    (_, prefix) => `${prefix}4`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!existsSync(mirrorPath)) {
    console.log("No GitHub Ubuntu mirror list; retaining runner defaults.");
  } else {
    const sources = sourcePaths
      .filter(existsSync)
      .map((path) => ({ path, content: readFileSync(path, "utf8") }));
    const current = readFileSync(mirrorPath, "utf8");
    const preferred = preferUbuntuArchives(sources, current);
    if (preferred !== current) {
      execFileSync("sudo", ["-n", "tee", mirrorPath], {
        input: preferred,
        stdio: ["pipe", "ignore", "inherit"],
      });
      console.log(
        "Preferring official Ubuntu HTTPS archives; Azure remains a fallback.",
      );
    } else {
      console.log("Ubuntu mirror configuration requires no change.");
    }
  }
}
