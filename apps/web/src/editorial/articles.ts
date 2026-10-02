import { getGutenbergArticle } from "./gutenberg";
import { getLuxembourgArticle } from "./luxembourg";

export const getArticles = () => [
  getGutenbergArticle(),
  getLuxembourgArticle(),
];
export const articlePath = (slug: string) => `/journal/${slug}/`;
