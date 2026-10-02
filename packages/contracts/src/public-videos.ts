import catalog from "./public-videos.json" with { type: "json" };
import type { SupportedLocale } from "./locale";

export type FilmFormat = "horizontal" | "vertical";
export type PublicFilm = "introduction" | "roles";
type FilmAsset = { movie: string; poster: string };

/** Every supported language has an explicit asset; never substitute another film language. */
export const publicVideoCatalog = catalog satisfies {
  introduction: Record<SupportedLocale, Record<FilmFormat, FilmAsset>>;
  roles: Record<SupportedLocale, FilmAsset>;
};

export function publicFilmAsset(
  film: PublicFilm,
  locale: SupportedLocale,
  format: FilmFormat = "horizontal",
): FilmAsset {
  return film === "roles"
    ? publicVideoCatalog.roles[locale]
    : publicVideoCatalog.introduction[locale][format];
}

/** Exact immutable public films only; private document routes never enter this catalog. */
export const publicVideoPaths = [
  ...Object.values(publicVideoCatalog.introduction).flatMap((formats) =>
    Object.values(formats).map((asset) => asset.movie),
  ),
  ...Object.values(publicVideoCatalog.roles).map((asset) => asset.movie),
];
