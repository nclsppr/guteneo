import { renderToString } from "react-dom/server";
import { Landing } from "../App";
import { LegalPage } from "../legal-page";
import { InformationPage, getInformationPages } from "../information-page";
import { DeveloperPage } from "../developer-page";
import { getArticles, articlePath } from "./articles";
import { ArticlePage, JournalPage } from "./pages";
import { AssistantsPage } from "../assistants-page";
import { getAssistant } from "../assistant-catalog";

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
  name: "Rédaction Guteneo",
  url: `${origin}/journal/`,
};

function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: origin + item.path,
    })),
  };
}

export function renderPublicPage(pathname: string) {
  const information = getInformationPages()[pathname];
  if (information)
    return {
      html: renderToString(<InformationPage content={information} />),
      title: `${information.label} | Guteneo`,
      description: information.description,
      canonical: origin + pathname,
      structuredData: [
        breadcrumbs([
          { name: "Accueil", path: "/" },
          { name: information.label, path: pathname },
        ]),
      ],
    };
  if (pathname.startsWith("/assistants/")) {
    const id = pathname.split("/")[2];
    const assistant = getAssistant(id);
    if (id && !assistant) return null;
    const title = assistant
      ? `Connecter ${assistant.name} à Guteneo`
      : "Vos assistants, votre correspondance";
    return {
      html: renderToString(<AssistantsPage assistantId={id || undefined} />),
      title: `${title} | Guteneo`,
      description: assistant
        ? `Suivez le guide pour ajouter Guteneo à ${assistant.name} : prérequis, configuration, autorisation et première demande de vérification.`
        : "Choisissez votre assistant et découvrez comment le connecter à Guteneo. Guides ChatGPT, Claude, Grok, GitHub Copilot, Microsoft 365 Copilot et Cursor.",
      canonical: origin + pathname,
      structuredData: [
        breadcrumbs([
          { name: "Accueil", path: "/" },
          { name: "Assistants", path: "/assistants/" },
          ...(assistant ? [{ name: assistant.name, path: pathname }] : []),
        ]),
      ],
    };
  }
  if (pathname === "/")
    return {
      html: renderToString(<Landing />),
      title: "Guteneo · La suite de vos mots.",
      description:
        "De la conversation à la correspondance. Préparez, approuvez et suivez vos documents par fax, e-mail ou courrier avec Guteneo.",
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
  if (pathname === "/developpeurs/")
    return {
      html: renderToString(<DeveloperPage />),
      title: "Développeurs · API, OAuth et référence OpenAPI | Guteneo",
      description:
        "Intégrez vos PDF à Guteneo : guide REST et MCP, permissions OAuth, approbation humaine, limites et référence OpenAPI en lecture seule. Bêta en préparation.",
      canonical: origin + pathname,
      structuredData: [
        {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Documentation développeurs Guteneo",
          url: origin + pathname,
          inLanguage: "fr",
          publisher,
        },
        breadcrumbs([
          { name: "Accueil", path: "/" },
          { name: "Développeurs", path: pathname },
        ]),
      ],
    };
  if (pathname === "/journal/")
    return {
      html: renderToString(<JournalPage />),
      title: "Le journal · Histoire de l’imprimerie et des échanges | Guteneo",
      description:
        "De Gutenberg au fax et à l’e-mail, jusqu’aux ateliers luxembourgeois : deux récits documentés et illustrés sur l’histoire de l’imprimerie.",
      canonical: origin + pathname,
      image: "/editorial/gutenberg-to-digital.webp",
      imageWidth: 1536,
      imageHeight: 1024,
      imageType: "image/webp",
      imageAlt:
        "Composition illustrée réunissant une presse ancienne, des lettres, un fax et un ordinateur autour de pages imprimées.",
      structuredData: [
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Le journal de Guteneo",
          url: origin + pathname,
          inLanguage: "fr",
          publisher,
        },
        breadcrumbs([
          { name: "Accueil", path: "/" },
          { name: "Le journal", path: pathname },
        ]),
      ],
    };
  if (pathname === "/mentions-legales/")
    return {
      html: renderToString(<LegalPage />),
      title: "Mentions légales | Guteneo",
      description:
        "Informations sur Nicolas Pieper, éditeur de Guteneo, l’hébergement Cloudflare, les contenus et les données personnelles du site.",
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
        { name: "Accueil", path: "/" },
        { name: "Le journal", path: "/journal/" },
        { name: article.title, path: pathname },
      ]),
    ],
  };
}
