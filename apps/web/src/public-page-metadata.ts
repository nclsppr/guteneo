import { getInformationPages } from "./information-page";
import { getArticles, articlePath } from "./editorial/articles";
import { getAssistant } from "./assistant-catalog";
import {
  isPublicSitePage,
  getPublicSitePageMetadata,
} from "./public-site-metadata";
import { msg } from "./messages";

const origin = "https://guteneo.com";
const publisher = {
  "@type": "Organization",
  "@id": `${origin}/#organization`,
  name: "Guteneo",
  url: origin,
  email: "guteneo@pieper.fr",
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "guteneo@pieper.fr",
    url: `${origin}/support/`,
  },
  logo: {
    "@type": "ImageObject",
    url: `${origin}/brand/guteneo-stamp.png`,
    width: 512,
    height: 512,
  },
};
const editor = {
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": `${origin}/#editor`,
  name: "Nicolas Pieper",
  url: "https://nicolaspieper.com",
  sameAs: [
    "https://www.linkedin.com/in/nicolaspieper",
    "https://github.com/nclsppr",
    "https://twitter.com/NicolasPieper",
  ],
};
const author = {
  "@type": "Organization",
  name: "Guteneo",
  url: `${origin}/journal/`,
};

function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: msg(item.name),
      item: origin + item.path,
    })),
  };
}

export function getPublicPageMetadata(pathname: string) {
  if (isPublicSitePage(pathname)) {
    const metadata = getPublicSitePageMetadata(pathname)!;
    return {
      title: `${metadata.title} | Guteneo`,
      description: metadata.description,
      canonical: origin + pathname,
      structuredData: [
        breadcrumbs([
          { name: "Home", path: "/" },
          { name: metadata.label, path: pathname },
        ]),
      ],
    };
  }
  const information = getInformationPages()[pathname];
  if (information)
    return {
      title: `${information.label} | Guteneo`,
      description: information.description,
      canonical: origin + pathname,
      structuredData: [
        breadcrumbs([
          { name: "Home", path: "/" },
          { name: information.label, path: pathname },
        ]),
      ],
    };
  if (pathname.startsWith("/assistants/")) {
    const id = pathname.split("/")[2];
    const assistant = getAssistant(id);
    if (id && !assistant) return null;
    const title = assistant
      ? `Connect ${assistant.name} to Guteneo`
      : "Your assistants, your correspondence";
    return {
      title: `${title} | Guteneo`,
      description: assistant
        ? `Follow the guide to add Guteneo to ${assistant.name}: prerequisites, setup, authorization and your first verification request.`
        : "Choose your assistant and learn how to connect it to Guteneo. Guides for ChatGPT, Claude, Grok, GitHub Copilot, Microsoft 365 Copilot and Cursor.",
      canonical: origin + pathname,
      structuredData: [
        breadcrumbs([
          { name: "Home", path: "/" },
          { name: "Assistants", path: "/assistants/" },
          ...(assistant ? [{ name: assistant.name, path: pathname }] : []),
        ]),
      ],
    };
  }
  if (pathname === "/")
    return {
      title: "Guteneo · Where your words go next.",
      description:
        "From conversation to correspondence. Prepare, approve and track your documents by fax, email or post with Guteneo.",
      canonical: origin + "/",
      structuredData: [
        { "@context": "https://schema.org", ...publisher },
        editor,
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Guteneo",
          url: origin + "/",
          inLanguage: "fr",
          publisher,
          creator: { "@id": editor["@id"] },
        },
      ],
    };
  if (pathname === "/developers/")
    return {
      title: "Developers · API, OAuth and OpenAPI reference | Guteneo",
      description:
        "Integrate PDFs with Guteneo: REST and MCP guide, OAuth permissions, human approval, limits and read-only OpenAPI reference. Beta in preparation.",
      canonical: origin + pathname,
      structuredData: [
        {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Guteneo developer documentation",
          url: origin + pathname,
          inLanguage: "fr",
          publisher,
        },
        breadcrumbs([
          { name: "Home", path: "/" },
          { name: "Developers", path: pathname },
        ]),
      ],
    };
  if (pathname === "/journal/")
    return {
      title: "The journal · Printing and correspondence history | Guteneo",
      description:
        "From Gutenberg to fax and email, including Luxembourg workshops: two sourced and illustrated stories about printing history.",
      canonical: origin + pathname,
      image: "/editorial/gutenberg-to-digital.webp",
      imageWidth: 1536,
      imageHeight: 1024,
      imageType: "image/webp",
      imageAlt: getArticles().find(
        (article) => article.slug === "from-gutenberg-to-digital",
      )!.hero.alt,
      structuredData: [
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "The Guteneo journal",
          url: origin + pathname,
          inLanguage: "fr",
          publisher,
        },
        breadcrumbs([
          { name: "Home", path: "/" },
          { name: "The journal", path: pathname },
        ]),
      ],
    };
  if (pathname === "/legal/")
    return {
      title: "Legal notice | Guteneo",
      description:
        "Information about Nicolas Pieper, Guteneo publisher, Cloudflare hosting, website content and personal data.",
      canonical: origin + pathname,
    };
  const article = getArticles().find(
    (item) => articlePath(item.slug) === pathname,
  );
  if (!article) return null;
  return {
    title: `${article.title} | Guteneo`,
    description: article.description,
    canonical: origin + pathname,
    image: article.hero.src,
    imageWidth: article.hero.width,
    imageHeight: article.hero.height,
    imageType: "image/webp",
    imageAlt: article.hero.alt,
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: article.title,
        description: article.description,
        url: origin + pathname,
        mainEntityOfPage: origin + pathname,
        image: origin + article.hero.src,
        datePublished: article.published,
        dateModified: article.published,
        inLanguage: "fr",
        author,
        publisher,
        isAccessibleForFree: true,
        citation: article.sources.map((source) => source.url),
      },
      breadcrumbs([
        { name: "Home", path: "/" },
        { name: "The journal", path: "/journal/" },
        { name: article.title, path: pathname },
      ]),
    ],
  };
}
