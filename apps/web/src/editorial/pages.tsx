import { formatLocale } from "../locale";
import { msg } from "../messages";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "@phosphor-icons/react";
import { PublicFooter } from "../public-chrome";
import { PublicHeader } from "../public-chrome";
import { getArticles, articlePath } from "./articles";
import { ArticlePicture } from "./article-picture";
import type { EditorialArticle } from "./types";
import "./editorial.css";

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat(formatLocale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

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
            {msg("Issue ")}
            {String(index + 1).padStart(2, "0")}{" "}
            <span aria-hidden="true">/</span> {article.readingMinutes}{" "}
            {msg(" min read")}
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
            {msg("Words travel.")} <br />
            <em>{msg("So does their history.")}</em>
          </h2>
          <p>
            {msg(
              "The Guteneo journal tells the story of printing and document transmission, from Gutenberg to PDF.",
            )}
          </p>
        </div>
        <a className="text-link" href="/journal/">
          {msg("Open the journal ")}
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
                  {article.readingMinutes} {msg(" min read")}
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
    <div className="landing public-site editorial-page">
      <a className="skip-link" href="#journal-main">
        {msg("Skip to content")}
      </a>
      <PublicHeader activePage="journal" />
      <main id="journal-main" tabIndex={-1}>
        <div className="journal-intro">
          <p className="editorial-kicker">
            {msg("The Guteneo journal · Two issues to begin")}
          </p>
          <h1>
            {msg("A history")}
            <br />
            <em>{msg("of transmission.")}</em>
          </h1>
          <p>
            {msg(
              "A letter composed, a page printed, a message received. We trace the techniques and places that allowed words to travel.",
            )}
          </p>
        </div>
        <h2 className="sr-only">{msg("Stories from the workspace")}</h2>
        <ArticleList />
        <aside className="journal-note">
          <p>{msg("Documented stories, contemporary images.")}</p>
          <span>
            {msg(
              "Each issue cites its sources. The illustrations created for Guteneo interpret this history; they are not archival documents.",
            )}
          </span>
        </aside>
      </main>
      <PublicFooter />
    </div>
  );
}

export function ArticlePage({ article }: { article: EditorialArticle }) {
  const index = getArticles().findIndex((item) => item.slug === article.slug);
  const next = getArticles().find((item) => item.slug !== article.slug)!;
  return (
    <div className="landing public-site editorial-page">
      <a className="skip-link" href="#article-main">
        {msg("Skip to content")}
      </a>
      <PublicHeader activePage="journal" />
      <main id="article-main" tabIndex={-1}>
        <nav className="editorial-breadcrumb" aria-label={msg("Breadcrumb")}>
          <a href="/">{msg("Home")}</a>
          <span aria-hidden="true">/</span>
          <a href="/journal/">{msg("The journal")}</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">
            {msg("Issue ")}
            {String(index + 1).padStart(2, "0")}
          </span>
        </nav>
        <article>
          <header className="article-intro">
            <p className="editorial-kicker">
              {msg("The history of printing · Issue")}{" "}
              {String(index + 1).padStart(2, "0")}
            </p>
            <h1>{article.title}</h1>
            <p className="article-dek">{article.dek}</p>
            <p className="article-byline">
              <span>{msg("Guteneo editorial team")}</span>
              <span>
                {msg("Published on")}{" "}
                <time dateTime={article.published}>
                  {dateLabel(article.published)}
                </time>
              </span>
              <span>
                {article.readingMinutes} {msg(" min read")}
              </span>
            </p>
          </header>
          <figure className="article-hero">
            <ArticlePicture article={article} eager />
            <figcaption>
              {article.hero.caption}{" "}
              {msg(
                " An imaginative interpretation, not a historical reconstruction.",
              )}
            </figcaption>
          </figure>
          <div className="article-layout">
            <nav
              className="article-contents"
              aria-label={msg("Article contents")}
            >
              <p className="editorial-kicker">{msg("Through the pages")}</p>
              <ol>
                {article.chapters.map((chapter) => (
                  <li key={chapter.id}>
                    <a href={`#${chapter.id}`}>{chapter.title}</a>
                  </li>
                ))}
              </ol>
              <a className="article-source-link" href="#sources">
                {msg("Sources & further reading")}
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
                      {msg("Sources:")}{" "}
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
              <p className="editorial-kicker">{msg("Explore further")}</p>
              <h2 id="sources-title">{msg("Sources & further reading.")}</h2>
              <p>
                {msg(
                  "The links below lead to the dates, objects and collections discussed in this story.",
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
            <p className="editorial-kicker">{msg("The story continues")}</p>
            <h2>
              <a href={articlePath(next.slug)}>
                {next.title} <ArrowRight size={26} aria-hidden="true" />
              </a>
            </h2>
          </div>
          <a className="text-link" href="/journal/">
            <ArrowLeft size={17} aria-hidden="true" /> {msg(" All issues")}
          </a>
        </aside>
      </main>
      <PublicFooter />
    </div>
  );
}
