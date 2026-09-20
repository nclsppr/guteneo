import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function evidencePath(relativePath: string) {
  const path = join(
    process.env.GUTENEO_SCREENSHOT_DIR ?? "reports/screenshots/assistant-hub",
    relativePath,
  );
  await mkdir(dirname(path), { recursive: true });
  return path;
}
