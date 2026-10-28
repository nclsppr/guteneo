import { copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import icons from "../packages/contracts/src/brand-icons.json" with { type: "json" };

// The product site's approved simple emblem is the source for every surface.
export const brandIconFiles = Object.freeze(icons.files);
export const brandIconSourcePaths = Object.freeze(
  brandIconFiles.map((name) => `apps/web/public/${name}`),
);
export const publicFaviconUrl = icons.faviconUrl;

export async function copyBrandIcons(root, output) {
  await mkdir(output, { recursive: true });
  for (const name of brandIconFiles)
    await copyFile(join(root, "apps/web/public", name), join(output, name));
}

export async function assertBrandIcons(root, directory) {
  for (const name of brandIconFiles) {
    const source = await readFile(join(root, "apps/web/public", name));
    const candidate = await readFile(join(directory, name));
    if (!source.equals(candidate))
      throw new Error(`Brand icon differs from guteneo.com: ${name}`);
  }
}
