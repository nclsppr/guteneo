import { ArrowLeft, ArrowRight, ArrowUpRight } from "@phosphor-icons/react";
import { LuxembourgFooter } from "../landing-sections";
import { articles, articlePath } from "./articles";
import type { EditorialArticle } from "./types";
import "./editorial.css";

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

function EditorialHeader() {
  return (
    <header className="site-header editorial-header">
      <a className="brand" href="/" aria-label="guteneo, accueil">
        <span className="brand-mark" aria-hidden="true">
          g
        </span>
        <span>guteneo</span>
      </a>
      <nav aria-label="Navigation principale">
        <a href="/journal/">Le journal</a>
        <a className="button small" href="/#/app">
          Découvrir l’atelier <ArrowUpRight size={16} aria-hidden="true" />
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
      {articles.map((article, index) => (
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
            Cahier {String(index + 1).padStart(2, "0")}{" "}
            <span aria-hidden="true">/</span> {article.readingMinutes} min de
            lecture
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
          <p className="editorial-kicker">Le journal de l’atelier</p>
          <h2 id="journal-teaser-title">
            Les mots voyagent.
            <br />
            <em>Leur histoire aussi.</em>
          </h2>
        </div>
        <a className="text-link" href="/journal/">
          Ouvrir le journal <ArrowRight size={18} aria-hidden="true" />
        </a>
      </div>
      <ArticleList />
    </section>
  );
}

export function JournalPage() {
  return (
    <div className="landing editorial-page">
      <a className="skip-link" href="#journal-main">
        Aller au contenu
      </a>
      <EditorialHeader />
      <main id="journal-main" tabIndex={-1}>
        <div className="journal-intro">
          <p className="editorial-kicker">
            Le journal de Guteneo · Deux cahiers pour commencer
          </p>
          <h1>
            Une histoire
            <br />
            <em>de transmission.</em>
          </h1>
          <p>
            Une lettre composée, une page imprimée, un message reçu. Nous
            remontons le fil des techniques et des lieux qui ont permis aux mots
            de voyager.
          </p>
        </div>
        <h2 className="sr-only">Les histoires de l’atelier</h2>
        <ArticleList />
        <aside className="journal-note">
          <p>Des récits documentés, des images d’aujourd’hui.</p>
          <span>
            Chaque cahier cite ses sources. Les illustrations créées pour
            Guteneo interprètent cette histoire ; elles ne sont pas des
            documents d’archives.
          </span>
        </aside>
      </main>
      <LuxembourgFooter />
    </div>
  );
}

export function ArticlePage({ article }: { article: EditorialArticle }) {
  const index = articles.indexOf(article);
  const next = articles.find((item) => item.slug !== article.slug)!;
  return (
    <div className="landing editorial-page">
      <a className="skip-link" href="#article-main">
        Aller au contenu
      </a>
      <EditorialHeader />
      <main id="article-main" tabIndex={-1}>
        <nav className="editorial-breadcrumb" aria-label="Fil d’Ariane">
          <a href="/">Accueil</a>
          <span aria-hidden="true">/</span>
          <a href="/journal/">Le journal</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">
            Cahier {String(index + 1).padStart(2, "0")}
          </span>
        </nav>
        <article>
          <header className="article-intro">
            <p className="editorial-kicker">
              L’histoire de l’imprimerie · Cahier{" "}
              {String(index + 1).padStart(2, "0")}
            </p>
            <h1>{article.title}</h1>
            <p className="article-dek">{article.dek}</p>
            <p className="article-byline">
              <span>Rédaction Guteneo</span>
              <span>
                Publié le{" "}
                <time dateTime={article.published}>
                  {dateLabel(article.published)}
                </time>
              </span>
              <span>{article.readingMinutes} min de lecture</span>
            </p>
          </header>
          <figure className="article-hero">
            <ArticlePicture article={article} eager />
            <figcaption>
              {article.hero.caption} Une évocation libre, sans valeur de
              reconstitution historique.
            </figcaption>
          </figure>
          <div className="article-layout">
            <nav
              className="article-contents"
              aria-label="Sommaire de l’article"
            >
              <p className="editorial-kicker">Au fil des pages</p>
              <ol>
                {article.chapters.map((chapter) => (
                  <li key={chapter.id}>
                    <a href={`#${chapter.id}`}>{chapter.title}</a>
                  </li>
                ))}
              </ol>
              <a className="article-source-link" href="#sources">
                Sources & lectures
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
                      Sources :{" "}
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
              <p className="editorial-kicker">Pour aller plus loin</p>
              <h2 id="sources-title">Sources & lectures.</h2>
              <p>
                Les liens ci-dessous permettent de retrouver les dates, les
                objets et les collections évoqués dans ce récit.
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
            <p className="editorial-kicker">Le fil continue</p>
            <h2>
              <a href={articlePath(next.slug)}>
                {next.title} <ArrowRight size={26} aria-hidden="true" />
              </a>
            </h2>
          </div>
          <a className="text-link" href="/journal/">
            <ArrowLeft size={17} aria-hidden="true" /> Tous les cahiers
          </a>
        </aside>
      </main>
      <LuxembourgFooter />
    </div>
  );
}
