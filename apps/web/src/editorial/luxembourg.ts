import { msg } from "../messages";
import type { EditorialArticle } from "./types";

export function getLuxembourgArticle(): EditorialArticle {
  return {
    slug: "printing-history-luxembourg",
    title: msg("Printing in Luxembourg, a history of circulation"),
    dek: msg(
      "From the first workshops to digitised newspapers, type tells the story of a country where books, languages and news cross borders.",
    ),
    description: msg(
      "A documented history of printing in Luxembourg: the 1598 patent, Dieudonné playing cards, newspapers, post and digital heritage.",
    ),
    published: "2026-09-17",
    readingMinutes: 6,
    hero: {
      src: "/editorial/luxembourg-printing.webp",
      width: 1536,
      height: 1024,
      alt: msg(
        "A printing press, movable type and books before an illustrated view of Luxembourg’s rooftops and valley, engraved in blue.",
      ),
      caption: msg("Contemporary illustration generated for Guteneo."),
    },
    chapters: [
      {
        id: "livres-et-frontieres",
        title: msg("Books from elsewhere"),
        paragraphs: [
          msg(
            "Luxembourg’s history of print begins with a distinction: owning a book and making one are two different stories. The National Library of Luxembourg holds around two hundred incunabula, books printed before 1501. Their presence in its collections does not demonstrate the existence of a local workshop in the fifteenth century. Instead, it opens an enquiry into where each copy was made, who owned it and the routes it travelled.",
          ),
          msg(
            "A volume described by the BnL offers a concrete clue: sermons printed in Strasbourg by Martin Flach in 1497 bear a handwritten ownership inscription from Echternach, dated to the late fifteenth or early sixteenth century. The object thus links outside production with evidence of local ownership. For works printed before 1800, the BnL also considers printers active in the former Duchy of Luxembourg. This historical framework is not the same as the country’s present borders.",
          ),
        ],
        sourceIds: ["bnl-fonds-rares", "bnl-incunables"],
      },
      {
        id: "brevet-et-reprises",
        title: msg("1598: a workshop and its successors"),
        paragraphs: [
          msg(
            "The first landmark in local printing is a patent granted on 10 April 1598 to Matthias Birthon, known as Mathias Birton at the Kulturhuef. The presentation of Luxembourg printed works by Ruhr University Bochum traces the workshop’s subsequent history. After the printer’s death six years later, his widow continued the business until 1618. She therefore belongs fully to this early history of the trade, even though the account does not give her first name.",
          ),
          msg(
            "On 18 July 1618, Hubert Reulandt, from Saint-Vith, in turn received permission to establish a printing shop. He took over the type and ornaments from Birthon’s workshop; researchers describe the transfer of the press itself as probable. His last known Luxembourg imprint dates from 1638. After a long interruption, Andreas Chevalier opened a new workshop in 1686, initially printing in Latin and French; the next German-language imprint noted in this corpus dates from 1703. The chronology thus reveals succession and breaks, rather than continuous growth from a single founding act.",
          ),
        ],
        sourceIds: ["rub-premiers-ateliers", "kulturhuef-expositions"],
      },
      {
        id: "cartes-de-grevenmacher",
        title: msg("In Grevenmacher, printing for play"),
        paragraphs: [
          msg(
            "Luxembourg’s printed output also took the form of objects held in a fan. In 1754, Jean Dieudonné settled in Grevenmacher and founded a playing-card factory. According to the Kulturhuef, his production was aimed chiefly at foreign markets. His descendants continued the trade until Jean-Paul Dieudonné ended production in 1880.",
          ),
          msg(
            "The surviving blocks, printed sheets and tools make this activity tangible. They remind us that printing history extends beyond books and newspapers: it also includes images repeated, cut out, distributed and used in everyday life. These cards offer another starting point for the story, at the gaming table and in export markets.",
          ),
        ],
        sourceIds: ["kulturhuef-expositions"],
      },
      {
        id: "visages-de-la-presse",
        title: msg("The press is also recognised by its letters"),
        paragraphs: [
          msg(
            "In the nineteenth century, newspapers provide a particularly rich view of print culture. The Luxemburger Wort, founded in Catholic circles in 1848 after freedom of the press was granted, is one example. Peter Gilles’s study, published on the university portal Infolux, traces its masthead from the issue of 23 March 1848. It compares the front-page nameplates over the period 1848–1980.",
          ),
          msg(
            "The result shifts our perspective: the newspaper’s name remains recognisable, but its letters change. In the nineteenth century, Fraktur alternated with a Didot, a sans-serif form and then a slab serif. An Antiqua appeared during the Nazi occupation, before the Fraktur masthead returned in 1944. Watching these changes invites us to read a page as a graphic object as well as a text. Typography helps shape its identity and can also bear traces of a political era.",
          ),
        ],
        sourceIds: ["infolux-typographie"],
      },
      {
        id: "papier-en-voyage",
        title: msg("After the press, the paper’s journey"),
        paragraphs: [
          msg(
            "Once a sheet has been produced, it still has to reach someone. Postal history adds another thread to this account. POST Luxembourg dates the creation of the Postal Administration to 1842, the issue of Luxembourg’s first postage stamp to 1852 and the country’s participation as a founding member of the Universal Postal Union to 1874. These dates concern specific institutions and services; they do not mean that all movement of mail began in 1842.",
          ),
          msg(
            "We can read these two histories together without confusing them: the workshop multiplies copies, while the postal network organises their movement. A stamp embodies a service on a small piece of paper that is itself printed. Letters and newspapers thus remind us that a document also acquires meaning through the relationship between its producer and its recipient.",
          ),
        ],
        sourceIds: ["post-histoire"],
      },
      {
        id: "gestes-conserves",
        title: msg("A heritage kept alive through practice"),
        paragraphs: [
          msg(
            "At the Kulturhuef in Grevenmacher, the collection of machines gives this history a physical presence. The Linotype and Heidelberg platen press are among the highlighted exhibits. Public workshops and artist residencies also allow people to work on historic presses. Heritage remains connected to action: inking, applying pressure, discovering the impression. A finished page hides the work that made it possible; the workshop brings that work back to the foreground.",
          ),
        ],
        sourceIds: ["kulturhuef-expositions"],
      },
      {
        id: "nouvelles-vies-numeriques",
        title: msg("Paper also becomes a searchable archive"),
        paragraphs: [
          msg(
            "Another form of transmission is developing at the BnL: the digitisation of historical newspapers with optical character recognition began in 2006. The page image is accompanied by searchable text. This transformation makes research easier, but retains the original document’s difficulties. Damaged paper or a misrecognised letter can make a word invisible to the search engine even though it remains legible on the page.",
          ),
          msg(
            "The BnL developed Nautilus-OCR to improve these transcriptions. It also offers sets of public-domain newspapers as images, texts and metadata. An issue can thus be examined as a whole or its articles studied separately. The document retains an appearance, a structure and a provenance beyond the automatically extracted words.",
          ),
          msg(
            "This digital memory meets a longstanding feature of the country: several languages can share a single page. In 2023, eluxemburgensia added a language filter, while explaining the limits of automatic detection, particularly for multilingual articles. Searching, reading and returning to the original remain complementary activities. From the copy marked in Echternach to the newspaper consulted remotely, the thread of this history is one of crossings: between languages, between readers, between media.",
          ),
        ],
        sourceIds: ["bnl-nautilus", "bnl-open-data", "bnl-langues"],
      },
    ],
    sources: [
      {
        id: "bnl-fonds-rares",
        title: "Fonds des imprimés rares et précieux",
        publisher: "Bibliothèque nationale du Luxembourg",
        url: "https://bnl.public.lu/fr/fonds/imprimes-rares-precieux.html",
      },
      {
        id: "bnl-incunables",
        title:
          "L’imprimé du XVe siècle à la BnL — Christophe Marinheiro, 10 juillet 2026",
        publisher: "Bibliothèque nationale du Luxembourg",
        url: "https://bnl.public.lu/en/a-la-une/a-la-loupe/2026/imprime-15-siecle.html",
      },
      {
        id: "rub-premiers-ateliers",
        title: "Korpus Luxemburger Drucke",
        publisher: "Ruhr-Universität Bochum",
        url: "https://www.ruhr-uni-bochum.de/wegera/Lux/index.htm",
      },
      {
        id: "kulturhuef-expositions",
        title: "Expositions permanentes : Gutenberg Revisited et Dieudonné",
        publisher:
          "Kulturhuef — Musée luxembourgeois de l’imprimerie et de la carte à jouer",
        url: "https://www.kulturhuef.lu/fr/the-place/expositions-permanentes/7/expositions-permanentes.html",
      },
      {
        id: "infolux-typographie",
        title:
          "Geschichte der Schriftwechsel im « Luxemburger Wort » (1848–1980) — Peter Gilles, 25 mai 2026",
        publisher: "Infolux — Université du Luxembourg",
        url: "https://infolux.uni.lu/geschichte-der-schriftwechsel-im-luxemburger-wort-1848-1980/",
      },
      {
        id: "post-histoire",
        title: "L’histoire de POST Luxembourg",
        publisher: "POST Luxembourg",
        url: "https://www.postgroup.lu/fr/home/le-groupe/notre-histoire",
      },
      {
        id: "bnl-nautilus",
        title:
          "Nouveau logiciel pour la reconnaissance optique de caractères — 26 juillet 2021",
        publisher: "Bibliothèque nationale du Luxembourg",
        url: "https://bnl.public.lu/en/a-la-une/actualites/articles-actualites/2021/nautilus-ocr.html",
      },
      {
        id: "bnl-open-data",
        title: "Historical Newspapers — jeux de données et documentation",
        publisher: "Bibliothèque nationale du Luxembourg — Open Data",
        url: "https://data.bnl.lu/data/historical-newspapers/",
      },
      {
        id: "bnl-langues",
        title:
          "La recherche par langue désormais disponible sur eluxemburgensia.lu — 27 avril 2023",
        publisher: "Bibliothèque nationale du Luxembourg",
        url: "https://bnl.public.lu/fr/a-la-une/actualites/communiques/2023/recherche-par-langue-eluxemburgensia.html",
      },
    ],
  };
}
