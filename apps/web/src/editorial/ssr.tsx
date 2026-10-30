import { renderToString } from "react-dom/server";
import { Landing } from "../App";
import { LegalPage } from "../legal-page";
import { InformationPage, getInformationPages } from "../information-page";
import { DeveloperPage } from "../developer-page";
import { getArticles, articlePath } from "./articles";
import { ArticlePage, JournalPage } from "./pages";
import { AssistantsPage } from "../assistants-page";
import { PublicSitePage } from "../public-site-pages";
import { isPublicSitePage } from "../public-site-metadata";
import { getLocale, getLocaleSource, setLocale } from "../locale";
import { getPublicSocialCopy } from "./social-copy";
import {
  isSupportedLocale,
  type SupportedLocale,
} from "../../../../packages/contracts/src/locale";
import { localizePublicSchema } from "../public-sharing";
import { getPublicPageMetadata } from "../public-page-metadata";

function renderPublicContent(pathname: string) {
  if (isPublicSitePage(pathname)) return <PublicSitePage path={pathname} />;
  const information = getInformationPages()[pathname];
  if (information) return <InformationPage content={information} />;
  if (pathname.startsWith("/assistants/"))
    return <AssistantsPage assistantId={pathname.split("/")[2] || undefined} />;
  if (pathname === "/") return <Landing />;
  if (pathname === "/developers/") return <DeveloperPage />;
  if (pathname === "/journal/") return <JournalPage />;
  if (pathname === "/legal/") return <LegalPage />;
  const article = getArticles().find(
    (item) => articlePath(item.slug) === pathname,
  );
  return article ? <ArticlePage article={article} /> : null;
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
    const page = getPublicPageMetadata(pathname);
    const content = page ? renderPublicContent(pathname) : null;
    const copy = getPublicSocialCopy(pathname, language);
    if (!page || !copy || !content) return null;
    const canonical = page.canonical + (locale ? `?lang=${locale}` : "");
    return {
      ...page,
      html: renderToString(content),
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
