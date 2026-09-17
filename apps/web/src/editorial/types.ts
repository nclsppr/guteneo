export interface EditorialArticle {
  slug: string;
  title: string;
  dek: string;
  description: string;
  published: string;
  readingMinutes: number;
  hero: {
    src: string;
    width: number;
    height: number;
    alt: string;
    caption: string;
  };
  chapters: {
    id: string;
    title: string;
    paragraphs: string[];
    sourceIds: string[];
  }[];
  sources: { id: string; title: string; publisher: string; url: string }[];
}
