import type { SupportedLocale } from "../../../../packages/contracts/src/locale";
import editorial from "../locales/messages-editorial.json" with { type: "json" };
import information from "../locales/messages-information.json" with { type: "json" };
import roles from "../locales/messages-roles.json" with { type: "json" };
import shell from "../locales/messages-shell.json" with { type: "json" };

export type PublicSocialLocale = SupportedLocale;
export type PublicSocialCopy = Readonly<{
  title: string;
  description: string;
}>;
type LocalizedCopy = Readonly<Record<PublicSocialLocale, PublicSocialCopy>>;

// Keep metadata independent of the browser's current locale and React state.
const messages = { ...shell, ...editorial, ...information, ...roles };
type Message = keyof typeof messages;

function sourceCopy(title: Message, description: Message): LocalizedCopy {
  const titles = messages[title];
  const descriptions = messages[description];
  return {
    fr: { title: `${title} | Guteneo`, description },
    en: { title: `${titles[0]} | Guteneo`, description: descriptions[0] },
    de: { title: `${titles[1]} | Guteneo`, description: descriptions[1] },
    lb: { title: `${titles[2]} | Guteneo`, description: descriptions[2] },
  };
}

function assistantCopy(name: string): LocalizedCopy {
  return {
    fr: {
      title: `Connecter ${name} à Guteneo | Guteneo`,
      description: `Suivez le guide pour ajouter Guteneo à ${name} : prérequis, configuration, autorisation et première demande de vérification.`,
    },
    en: {
      title: `Connect ${name} to Guteneo | Guteneo`,
      description: `Follow the guide to add Guteneo to ${name}: prerequisites, setup, authorisation and your first verification request.`,
    },
    de: {
      title: `${name} mit Guteneo verbinden | Guteneo`,
      description: `So fügen Sie Guteneo zu ${name} hinzu: Voraussetzungen, Einrichtung, Autorisierung und Ihre erste Prüfanfrage.`,
    },
    lb: {
      title: `${name} mat Guteneo verbannen | Guteneo`,
      description: `Follegt dem Guide, fir Guteneo bei ${name} dobäizesetzen: Viraussetzungen, Ariichtung, Autorisatioun an Är éischt Ufro fir d’Verbindung ze iwwerpréiwen.`,
    },
  };
}

/** The brand's established headlines from the four interface catalogs. */
export const publicSocialTaglines = {
  fr: "La suite de vos mots.",
  en: "Where your words go next.",
  de: "Damit Ihre Worte weiterkommen.",
  lb: "Är Wierder ginn op d’Rees.",
} as const satisfies Record<PublicSocialLocale, string>;

/** Page-specific SEO copy. A language-neutral sharing fallback belongs to the builder. */
export const publicSocialCopy = {
  "/": {
    fr: {
      title: `Guteneo · ${publicSocialTaglines.fr}`,
      description:
        "De la conversation à la correspondance. Préparez, approuvez et suivez vos documents par fax, e-mail ou courrier avec Guteneo.",
    },
    en: {
      title: `Guteneo · ${publicSocialTaglines.en}`,
      description:
        "From conversation to correspondence. Prepare, approve and track your documents by fax, email or post with Guteneo.",
    },
    de: {
      title: `Guteneo · ${publicSocialTaglines.de}`,
      description:
        "Vom Gespräch zur Korrespondenz. Bereiten Sie Ihre Dokumente für Fax, E-Mail oder Post mit Guteneo vor, genehmigen Sie den Versand und verfolgen Sie den Status.",
    },
    lb: {
      title: `Guteneo · ${publicSocialTaglines.lb}`,
      description:
        "Vum Gespréich zur Korrespondenz. Bereet Är Dokumenter fir Fax, E-Mail oder Post mat Guteneo vir, geneemegt de Versand a verfollegt de Status.",
    },
  },
  "/a-propos/": sourceCopy(
    "À propos de Guteneo",
    "Guteneo est un service indépendant édité par Nicolas Pieper pour préparer, autoriser et suivre des envois de documents depuis son atelier ou un assistant connecté.",
  ),
  "/journal/": {
    fr: {
      title: "Le journal · Histoire de l’imprimerie et des échanges | Guteneo",
      description:
        "De Gutenberg au fax et à l’e-mail, jusqu’aux ateliers luxembourgeois : deux récits documentés et illustrés sur l’histoire de l’imprimerie.",
    },
    en: {
      title: "The journal · A history of printing and communication | Guteneo",
      description:
        "From Gutenberg to fax and email, and the printing workshops of Luxembourg: two documented, illustrated stories from the history of printing.",
    },
    de: {
      title:
        "Das Journal · Geschichte des Druckens und des Austauschs | Guteneo",
      description:
        "Von Gutenberg über Fax und E-Mail bis zu den Luxemburger Druckwerkstätten: zwei belegte und illustrierte Geschichten aus der Geschichte des Druckens.",
    },
    lb: {
      title:
        "De Journal · Geschicht vun der Dréckerei an dem Austausch | Guteneo",
      description:
        "Vum Gutenberg iwwer Fax an E-Mail bis bei déi lëtzebuergesch Dréckereien: zwee dokumentéiert an illustréiert Texter iwwer d’Geschicht vum Drécken.",
    },
  },
  "/journal/de-gutenberg-au-numerique/": sourceCopy(
    "De Gutenberg au numérique, la longue vie d’une page",
    "De l’impression asiatique à Gutenberg, du courrier au fax et à l’e-mail : comment les pages ont appris à se multiplier, voyager et traverser les réseaux.",
  ),
  "/journal/histoire-imprimerie-luxembourg/": sourceCopy(
    "L’imprimerie au Luxembourg, une histoire de circulation",
    "Une histoire documentée de l’imprimerie au Luxembourg : le brevet de 1598, les cartes Dieudonné, la presse, la poste et le patrimoine numérique.",
  ),
  "/mentions-legales/": {
    fr: {
      title: "Mentions légales | Guteneo",
      description:
        "Informations sur Nicolas Pieper, éditeur de Guteneo, l’hébergement Cloudflare, les contenus et les données personnelles du site.",
    },
    en: {
      title: "Legal notice | Guteneo",
      description:
        "Information about Nicolas Pieper, publisher of Guteneo, Cloudflare hosting, the website’s content and personal data.",
    },
    de: {
      title: "Impressum | Guteneo",
      description:
        "Informationen zu Nicolas Pieper, dem Herausgeber von Guteneo, zum Hosting bei Cloudflare sowie zu den Inhalten und personenbezogenen Daten der Website.",
    },
    lb: {
      title: "Rechtlech Informatiounen | Guteneo",
      description:
        "Informatiounen iwwer den Nicolas Pieper, den Editeur vu Guteneo, den Hosting bei Cloudflare, d’Inhalter an d’perséinlech Donnéeë vun der Websäit.",
    },
  },
  "/confidentialite/": sourceCopy(
    "Confidentialité",
    "Les données utilisées par Guteneo, leurs destinataires, leur conservation et les moyens d’exercer vos droits.",
  ),
  "/conditions/": sourceCopy(
    "Conditions d’utilisation",
    "Conditions d’utilisation de la bêta Guteneo : accès, documents, autorisations, crédit d’essai et limites des envois.",
  ),
  "/support/": sourceCopy(
    "Assistance",
    "Contactez l’assistance Guteneo pour un document, un envoi, une connexion ou une demande relative à vos données.",
  ),
  "/roles/": sourceCopy(
    "Rôles et droits",
    "Choisissez qui prépare la correspondance, qui autorise les envois et qui consulte les rapports de votre atelier.",
  ),
  "/developpeurs/": {
    fr: {
      title: "Développeurs · API, OAuth et référence OpenAPI | Guteneo",
      description:
        "Intégrez vos PDF à Guteneo : guide REST et MCP, permissions OAuth, approbation humaine, limites et référence OpenAPI en lecture seule. Bêta en préparation.",
    },
    en: {
      title: "Developers · API, OAuth and OpenAPI reference | Guteneo",
      description:
        "Integrate your PDFs with Guteneo: REST and MCP guide, OAuth permissions, human approval, limits and a read-only OpenAPI reference. Beta in preparation.",
    },
    de: {
      title: "Entwickler · API, OAuth und OpenAPI-Referenz | Guteneo",
      description:
        "Binden Sie Ihre PDFs in Guteneo ein: REST- und MCP-Leitfaden, OAuth-Berechtigungen, menschliche Freigabe, Grenzen und OpenAPI-Referenz mit Lesezugriff. Beta in Vorbereitung.",
    },
    lb: {
      title: "Entwéckler · API, OAuth an OpenAPI-Referenz | Guteneo",
      description:
        "Integréiert Är PDFen a Guteneo: Guide fir REST a MCP, OAuth-Berechtegungen, mënschlech Geneemegung, Grenzen an eng OpenAPI-Referenz nëmme fir ze liesen. Beta a Virbereedung.",
    },
  },
  "/assistants/": {
    fr: {
      title: "Vos assistants, votre correspondance | Guteneo",
      description:
        "Choisissez votre assistant et découvrez comment le connecter à Guteneo. Guides ChatGPT, Claude, Grok, GitHub Copilot, Microsoft 365 Copilot et Cursor.",
    },
    en: {
      title: "Your assistants, your correspondence | Guteneo",
      description:
        "Choose your assistant and learn how to connect it to Guteneo. Guides for ChatGPT, Claude, Grok, GitHub Copilot, Microsoft 365 Copilot and Cursor.",
    },
    de: {
      title: "Ihre Assistenten, Ihre Korrespondenz | Guteneo",
      description:
        "Wählen Sie Ihren Assistenten und erfahren Sie, wie Sie ihn mit Guteneo verbinden. Anleitungen für ChatGPT, Claude, Grok, GitHub Copilot, Microsoft 365 Copilot und Cursor.",
    },
    lb: {
      title: "Är Assistenten, Är Korrespondenz | Guteneo",
      description:
        "Wielt Ären Assistent an entdeckt, wéi Dir en mat Guteneo verbënnt. Guidë fir ChatGPT, Claude, Grok, GitHub Copilot, Microsoft 365 Copilot a Cursor.",
    },
  },
  "/assistants/chatgpt/": assistantCopy("ChatGPT"),
  "/assistants/claude/": assistantCopy("Claude"),
  "/assistants/grok/": assistantCopy("Grok"),
  "/assistants/copilot/": assistantCopy("GitHub Copilot"),
  "/assistants/microsoft365/": assistantCopy("Microsoft 365 Copilot"),
  "/assistants/cursor/": assistantCopy("Cursor"),
} satisfies Record<string, LocalizedCopy>;

export function getPublicSocialCopy(
  pathname: string,
  locale: PublicSocialLocale,
): PublicSocialCopy | null {
  if (!Object.hasOwn(publicSocialCopy, pathname)) return null;
  return publicSocialCopy[pathname as keyof typeof publicSocialCopy][locale];
}
