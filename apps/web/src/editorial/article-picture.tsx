import { useDarkImageMedia } from "../theme-media";
import type { EditorialArticle } from "./types";

export function ArticlePicture({
  article,
  eager = false,
  decorative = false,
  sizes: imageSizes,
}: {
  article: EditorialArticle;
  eager?: boolean;
  decorative?: boolean;
  sizes?: string;
}) {
  const darkMedia = useDarkImageMedia();
  const sizes =
    imageSizes ??
    (eager
      ? "(max-width: 700px) 100vw, 88vw"
      : "(max-width: 700px) 90vw, 42vw");
  return (
    <picture>
      <source
        data-theme-source="dark"
        media={darkMedia}
        srcSet={`${article.hero.src.replace(".webp", "-dark-small.webp")} 720w, ${article.hero.src.replace(".webp", "-dark.webp")} 1536w`}
        sizes={sizes}
      />
      <img
        src={article.hero.src}
        srcSet={`${article.hero.src.replace(".webp", "-small.webp")} 720w, ${article.hero.src} 1536w`}
        sizes={sizes}
        alt={decorative ? "" : article.hero.alt}
        width={article.hero.width}
        height={article.hero.height}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        decoding="async"
      />
    </picture>
  );
}
