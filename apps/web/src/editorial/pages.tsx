import { formatLocale } from "../locale";
import { msg } from "../messages";
import { LanguageSelect } from "../language-select";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "@phosphor-icons/react";
import { LuxembourgFooter } from "../landing-sections";
import { Brand } from "../brand";
import { getArticles, articlePath } from "./articles";
import type { EditorialArticle } from "./types";
import "./editorial.css";

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat(formatLocale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

function EditorialHeader() {
  return (
    <header className="site-header editorial-header">
      <Brand />
      <LanguageSelect />
      <nav aria-label={msg("Navigation principale")}>
        <a href="/journal/">{msg("Le journal")}</a>
        <a className="button small" href="/#/app">
          {msg("Découvrir l’atelier ")}
          <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </nav>
    </header>
  );
}

function ArticlePicture({
  article,
  eager = false,
}: {
  article: EditorialArticle;
  eager?: boolean;
}) {
  return (
    <img
      src={article.hero.src}
      srcSet={`${article.hero.src.replace(".webp", "-small.webp")} 720w, ${article.hero.src} 1536w`}
      sizes={
        eager
          ? "(max-width: 700px) 100vw, 88vw"
          : "(max-width: 700px) 90vw, 42vw"
      }
      alt={article.hero.alt}
      width={article.hero.width}
      height={article.hero.height}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
    />
  );
}

function ArticleList() {
  return (
    <div className="journal-stories">
      {getArticles().map((article, index) => (
        <article className="journal-story" key={article.slug}>
          <a
            className="journal-story-art"
            href={articlePath(article.slug)}
            tabIndex={-1}
            aria-hidden="true"
          >
            <ArticlePicture article={article} />
          </a>
          <p className="editorial-kicker">
            {msg("Cahier ")}
            {String(index + 1).padStart(2, "0")}{" "}
            <span aria-hidden="true">/</span> {article.readingMinutes}{" "}
            {msg(" min de lecture")}
          </p>
          <h3>
            <a href={articlePath(article.slug)}>
              {article.title}
              <ArrowUpRight size={23} aria-hidden="true" />
            </a>
          </h3>
          <p>{article.dek}</p>
        </article>
      ))}
    </div>
  );
}

export function JournalTeaser() {
  return (
    <section className="journal-teaser" aria-labelledby="journal-teaser-title">
      <div className="journal-section-heading">
        <div>
          <h2 id="journal-teaser-title">
            {msg("Les mots voyagent.")} <br />
            <em>{msg("Leur histoire aussi.")}</em>
          </h2>
          <p>
            {msg(
              "Le journal de Guteneo raconte l’histoire de l’imprimerie et de la transmission des documents, de Gutenberg au PDF.",
            )}
          </p>
        </div>
        <a className="text-link" href="/journal/">
          {msg("Ouvrir le journal ")}
          <ArrowRight size={18} aria-hidden="true" />
        </a>
      </div>
      <div className="journal-compact-stories">
        {getArticles()
          .slice(0, 2)
          .map((article) => (
            <article key={article.slug}>
              <a
                className="journal-compact-image"
                href={articlePath(article.slug)}
                tabIndex={-1}
                aria-hidden="true"
              >
                <ArticlePicture article={article} />
              </a>
              <div>
                <p className="journal-reading-time">
                  {article.readingMinutes} {msg(" min de lecture")}
                </p>
                <h3>
                  <a href={articlePath(article.slug)}>
                    {article.title}
                    <ArrowUpRight size={19} aria-hidden="true" />
                  </a>
                </h3>
                <p className="journal-compact-intro">{article.dek}</p>
              </div>
            </article>
          ))}
      </div>
    </section>
  );
}

export function JournalPage() {
  return (
    <div className="landing editorial-page">
      <a className="skip-link" href="#journal-main">
        {msg("Aller au contenu")}
      </a>
      <EditorialHeader />
      <main id="journal-main" tabIndex={-1}>
        <div className="journal-intro">
          <p className="editorial-kicker">
            {msg("Le journal de Guteneo · Deux cahiers pour commencer")}
          </p>
          <h1>
            {msg("Une histoire")}
            <br />
            <em>{msg("de transmission.")}</em>
          </h1>
          <p>
            {msg(
              "Une lettre composée, une page imprimée, un message reçu. Nous remontons le fil des techniques et des lieux qui ont permis aux mots de voyager.",
            )}
          </p>
        </div>
        <h2 className="sr-only">{msg("Les histoires de l’atelier")}</h2>
        <ArticleList />
        <aside className="journal-note">
          <p>{msg("Des récits documentés, des images d’aujourd’hui.")}</p>
          <span>
            {msg(
              "Chaque cahier cite ses sources. Les illustrations créées pour Guteneo interprètent cette histoire ; elles ne sont pas des documents d’archives.",
            )}
          </span>
        </aside>
      </main>
      <LuxembourgFooter />
    </div>
  );
}

export function ArticlePage({ article }: { article: EditorialArticle }) {
  const index = getArticles().findIndex((item) => item.slug === article.slug);
  const next = getArticles().find((item) => item.slug !== article.slug)!;
  return (
    <div className="landing editorial-page">
      <a className="skip-link" href="#article-main">
        {msg("Aller au contenu")}
      </a>
      <EditorialHeader />
      <main id="article-main" tabIndex={-1}>
        <nav className="editorial-breadcrumb" aria-label={msg("Fil d’Ariane")}>
          <a href="/">{msg("Accueil")}</a>
          <span aria-hidden="true">/</span>
          <a href="/journal/">{msg("Le journal")}</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">
            {msg("Cahier ")}
            {String(index + 1).padStart(2, "0")}
          </span>
        </nav>
        <article>
          <header className="article-intro">
            <p className="editorial-kicker">
              {msg("L’histoire de l’imprimerie · Cahier")}{" "}
              {String(index + 1).padStart(2, "0")}
            </p>
            <h1>{article.title}</h1>
            <p className="article-dek">{article.dek}</p>
            <p className="article-byline">
              <span>{msg("Rédaction Guteneo")}</span>
              <span>
                {msg("Publié le")}{" "}
                <time dateTime={article.published}>
                  {dateLabel(article.published)}
                </time>
              </span>
              <span>
                {article.readingMinutes} {msg(" min de lecture")}
              </span>
            </p>
          </header>
          <figure className="article-hero">
            <ArticlePicture article={article} eager />
            <figcaption>
              {article.hero.caption}{" "}
              {msg(
                " Une évocation libre, sans valeur de reconstitution historique.",
              )}
            </figcaption>
          </figure>
          <div className="article-layout">
            <nav
              className="article-contents"
              aria-label={msg("Sommaire de l’article")}
            >
              <p className="editorial-kicker">{msg("Au fil des pages")}</p>
              <ol>
                {article.chapters.map((chapter) => (
                  <li key={chapter.id}>
                    <a href={`#${chapter.id}`}>{chapter.title}</a>
                  </li>
                ))}
              </ol>
              <a className="article-source-link" href="#sources">
                {msg("Sources & lectures")}
              </a>
            </nav>
            <div className="article-copy">
              {article.chapters.map((chapter, chapterIndex) => (
                <section id={chapter.id} key={chapter.id}>
                  <span className="chapter-number" aria-hidden="true">
                    {String(chapterIndex + 1).padStart(2, "0")}
                  </span>
                  <h2>{chapter.title}</h2>
                  {chapter.paragraphs.map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex}>{paragraph}</p>
                  ))}
                  {chapter.sourceIds.length > 0 && (
                    <p className="chapter-sources">
                      {msg("Sources :")}{" "}
                      {chapter.sourceIds.map((id, sourceIndex) => {
                        const source = article.sources.find(
                          (item) => item.id === id,
                        )!;
                        return (
                          <span key={id}>
                            {sourceIndex > 0 ? " · " : ""}
                            <a href={`#source-${id}`}>{source.publisher}</a>
                          </span>
                        );
                      })}
                    </p>
                  )}
                </section>
              ))}
            </div>
          </div>
          <section
            className="article-sources"
            id="sources"
            aria-labelledby="sources-title"
          >
            <div>
              <p className="editorial-kicker">{msg("Pour aller plus loin")}</p>
              <h2 id="sources-title">{msg("Sources & lectures.")}</h2>
              <p>
                {msg(
                  "Les liens ci-dessous permettent de retrouver les dates, les objets et les collections évoqués dans ce récit.",
                )}
              </p>
            </div>
            <ol>
              {article.sources.map((source) => (
                <li key={source.id} id={`source-${source.id}`}>
                  <a href={source.url}>
                    {source.title} <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                  <span>{source.publisher}</span>
                </li>
              ))}
            </ol>
          </section>
        </article>
        <aside className="article-next">
          <div>
            <p className="editorial-kicker">{msg("Le fil continue")}</p>
            <h2>
              <a href={articlePath(next.slug)}>
                {next.title} <ArrowRight size={26} aria-hidden="true" />
              </a>
            </h2>
          </div>
          <a className="text-link" href="/journal/">
            <ArrowLeft size={17} aria-hidden="true" />{" "}
            {msg(" Tous les cahiers")}
          </a>
        </aside>
      </main>
      <LuxembourgFooter />
    </div>
  );
}
