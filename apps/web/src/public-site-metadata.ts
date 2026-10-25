import { msg } from "./messages";
import { getLocale } from "./locale";
import publicFooter from "../../../packages/contracts/src/public-footer.json";

export function publicSiteLabel(path: string): string {
  const link = publicFooter.groups
    .flatMap((group) => group.links)
    .find((link) => link.href === path);
  return link?.labels[getLocale()] ?? path;
}

export type PublicSitePath =
  "/pricing/" | "/how-it-works/" | "/getting-started/" | "/pdf-checks/";

export function isPublicSitePage(path: string): path is PublicSitePath {
  return [
    "/pricing/",
    "/how-it-works/",
    "/getting-started/",
    "/pdf-checks/",
  ].includes(path);
}

export function getPublicSitePageMetadata(
  path: string,
): { title: string; description: string; label: string } | null {
  const pages = {
    "/pricing/": {
      label: publicSiteLabel("/pricing/"),
      title: msg("Pricing for email, fax, post and PDF checks"),
      description: msg(
        "Customer rates, welcome credit and the quote shown before approval. Compare email, fax, postal mail and individual PDF checks.",
      ),
    },
    "/how-it-works/": {
      label: publicSiteLabel("/how-it-works/"),
      title: msg("Prepare, review and track a document dispatch"),
      description: msg(
        "Follow a fictional email, fax or postal dispatch: prepare the request, review its exact details and understand its tracking events.",
      ),
    },
    "/getting-started/": {
      label: publicSiteLabel("/getting-started/"),
      title: msg("Get started with Guteneo or your assistant"),
      description: msg(
        "Start with your document in Guteneo or follow the setup guide for your assistant. Review the recipient, options and cost before approval.",
      ),
    },
    "/pdf-checks/": {
      label: publicSiteLabel("/pdf-checks/"),
      title: msg("PDF accessibility and archiving checks"),
      description: msg(
        "Understand individual PDF/UA and PDF/A checks, their price, file limits and the human review still needed after an automated report.",
      ),
    },
  };
  return isPublicSitePage(path) ? pages[path] : null;
}
