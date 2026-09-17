import { renderToString } from "react-dom/server";
import { Landing } from "../App";
import { LegalPage } from "../legal-page";
import { DeveloperPage } from "../developer-page";
import { articles, articlePath } from "./articles";
import { ArticlePage, JournalPage } from "./pages";

const origin = "https://guteneo.com";
const publisher = {
  "@type": "Organization",
  name: "Guteneo",
  url: origin,
  logo: {
    "@type": "ImageObject",
    url: `${origin}/brand/guteneo-stamp.png`,
    width: 512,
    height: 512,
  },
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
  if (pathname === "/")
    return {
      html: renderToString(<Landing />),
      title: "Guteneo · Vos documents, du numérique au papier",
      description:
        "Découvrez Guteneo, l’atelier de correspondance pour préparer vos documents par fax, e-mail et courrier depuis vos assistants IA. Explorez la démo.",
      canonical: origin + "/",
      image: "/press-halftone.webp",
      structuredData: [
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Guteneo",
          url: origin + "/",
          inLanguage: "fr",
          publisher,
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
      image: "/press-halftone.webp",
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
  const article = articles.find((item) => articlePath(item.slug) === pathname);
  if (!article) return null;
  return {
    html: renderToString(<ArticlePage article={article} />),
    title: `${article.title} | Guteneo`,
    description: article.description,
    canonical: origin + pathname,
    image: article.hero.src,
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
