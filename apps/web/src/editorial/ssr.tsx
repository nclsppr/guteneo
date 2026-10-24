import { renderToString } from "react-dom/server";
import { Landing } from "../App";
import { LegalPage } from "../legal-page";
import { InformationPage, getInformationPages } from "../information-page";
import { DeveloperPage } from "../developer-page";
import { getArticles, articlePath } from "./articles";
import { ArticlePage, JournalPage } from "./pages";
import { AssistantsPage } from "../assistants-page";
import { getAssistant } from "../assistant-catalog";
import { getLocale, getLocaleSource, setLocale } from "../locale";
import { msg } from "../messages";
import { getPublicSocialCopy } from "./social-copy";
import {
  isSupportedLocale,
  type SupportedLocale,
} from "../../../../packages/contracts/src/locale";
import { localizePublicSchema } from "../public-sharing";

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

function renderPublicContent(pathname: string) {
  const information = getInformationPages()[pathname];
  if (information)
    return {
      html: renderToString(<InformationPage content={information} />),
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
      html: renderToString(<AssistantsPage assistantId={id || undefined} />),
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
      html: renderToString(<Landing />),
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
      html: renderToString(<DeveloperPage />),
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
      html: renderToString(<JournalPage />),
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
      html: renderToString(<LegalPage />),
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
    html: renderToString(<ArticlePage article={article} />),
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

/** Build-time only: scope the existing catalogs to one synchronous render. */
export function renderPublicPage(
  pathname: string,
  locale: SupportedLocale | null = null,
) {
  if (locale !== null && !isSupportedLocale(locale))
    throw new Error("Unsupported public locale");
  const previous = getLocale();
  const previousSource = getLocaleSource();
  const language = locale ?? "fr";
  setLocale(language, false, locale ? "selection" : "browser");
  try {
    const page = renderPublicContent(pathname);
    const copy = getPublicSocialCopy(pathname, language);
    if (!page || !copy) return null;
    const canonical = origin + pathname + (locale ? `?lang=${locale}` : "");
    return {
      ...page,
      ...copy,
      canonical,
      structuredData: ("structuredData" in page
        ? (page.structuredData ?? [])
        : []
      ).map((item) => localizePublicSchema(item, pathname, locale)),
    };
  } finally {
    setLocale(previous, false, previousSource);
  }
}
