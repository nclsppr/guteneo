import { gutenbergArticle } from "./gutenberg";
import { luxembourgArticle } from "./luxembourg";

export const articles = [gutenbergArticle, luxembourgArticle];
export const articlePath = (slug: string) => `/journal/${slug}/`;
