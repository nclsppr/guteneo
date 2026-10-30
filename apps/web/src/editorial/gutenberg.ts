import { msg } from "../messages";
import type { EditorialArticle } from "./types";

export function getGutenbergArticle(): EditorialArticle {
  return {
    slug: "from-gutenberg-to-digital",
    title: msg("From Gutenberg to digital, the long life of a page"),
    dek: msg(
      "Print, address, transmit: from hand-set books to documents sent in seconds, a history of changing practices and enduring needs.",
    ),
    description: msg(
      "From Asian printing to Gutenberg, from post to fax and email: how pages learned to multiply, travel and cross networks.",
    ),
    published: "2026-09-17",
    readingMinutes: 6,
    hero: {
      src: "/editorial/gutenberg-to-digital.webp",
      width: 1536,
      height: 1024,
      alt: msg(
        "Illustration bringing together an old printing press, letters, a fax machine and a computer around printed pages.",
      ),
      caption: msg("Contemporary illustration generated for Guteneo."),
    },
    chapters: [
      {
        id: "avant-gutenberg",
        title: msg("Centuries of printing before Mainz"),
        paragraphs: [
          msg(
            "A page seems motionless. Yet its history is one of movement: reproducing a text, taking it elsewhere, allowing someone to find it again. This history begins long before European presses. In China, the Diamond Sutra held by the British Library bears the date 11 May 868. Printed from carved wooden blocks, this scroll reveals an already sophisticated craft. It is the oldest surviving dated printed book, not the first text ever printed.",
          ),
          msg(
            "Another decisive landmark came in July 1377, when the Jikji was printed in Korea using movable metal type. According to UNESCO, its second volume is the oldest surviving evidence of this technique. Gutenberg therefore invented neither printing worldwide nor the principle of movable type. His place in this history is that of a European transformation whose scale should not obscure its Asian predecessors.",
          ),
        ],
        sourceIds: ["diamond-sutra", "jikji"],
      },
      {
        id: "atelier-de-mayence",
        title: msg("A revolution that still resembles a manuscript"),
        paragraphs: [
          msg(
            "In Mainz, between 1452 and 1455, Johannes Gutenberg and his collaborators produced a two-volume Bible. Movable type allowed them to compose lines, print several copies and then reuse the letters. The work changed scale: one setting could produce a series of pages. The Gutenberg Museum estimates the print run at around 180 copies, mostly on paper, with some on parchment.",
          ),
          msg(
            "The object did not break with every tradition of the handwritten book, however. Its printed text still awaited the colours and ornaments that each buyer commissioned from artisans. The copies therefore display clearly visible differences. This coexistence of mechanical reproduction and handwork explains the change better than a sudden disappearance of the old world. Innovation took hold within existing practices, trades and expectations. It transformed book production while preserving something familiar.",
          ),
        ],
        sourceIds: ["gutenberg-bibles"],
      },
      {
        id: "courrier-en-reseau",
        title: msg("Sending what we write on its way"),
        paragraphs: [
          msg(
            "Reproducing pages is not enough to get them to their readers. Post has its own history, long predating Gutenberg: messengers, relay stations and organised services connected places and people. Postal reforms made these exchanges simpler in the nineteenth century. In England in 1840, Rowland Hill’s reform combined prepayment with a uniform domestic rate for a given weight, regardless of distance. The postage stamp embodied this new arrangement.",
          ),
          msg(
            "Borders remained a challenge. Agreements between countries multiplied, each with its own conditions and rates. On 9 October 1874, twenty-two countries signed the Treaty of Bern, founding the General Postal Union, which became the Universal Postal Union in 1878. The aim was very practical: enabling different services to exchange mail under common rules. Behind a delivered letter now stood international cooperation, as essential as paper and ink.",
          ),
        ],
        sourceIds: ["postal-history"],
      },
      {
        id: "image-avant-voix",
        title: msg("The fax has ancestors older than the telephone"),
        paragraphs: [
          msg(
            "The fax seems to belong to late twentieth-century offices. Yet its origins lie in telegraphy. In 1843, Alexander Bain patented a precursor to the fax in the United Kingdom, designed to transmit images. Bell’s telephone patent dates from 1876: the idea of reproducing a mark at a distance therefore preceded this milestone in voice transmission.",
          ),
          msg(
            "It would be misleading to imagine the familiar office machine already existing in 1843. Between a patented principle and an everyday service, machines still had to be improved, networks organised and correspondents equipped. Even so, the break was considerable: a representation of a document could now be envisaged travelling as a signal, without its sheet making the journey. The original stayed at the point of departure; its reproduction appeared at the destination.",
          ),
        ],
        sourceIds: ["telecommunications-history"],
      },
      {
        id: "langue-commune-du-fax",
        title: msg("To transmit, machines must understand each other"),
        paragraphs: [
          msg(
            "Technical history does not unfold only in inventors’ workshops. It also advances when different devices become able to communicate. Recommendation T.4 from the CCITT, the International Telecommunication Union’s standardisation body, provides a precise landmark: the version approved in November 1980 concerns Group 3 fax machines and document transmission. Among other things, it formalises how a page is represented and encoded.",
          ),
          msg(
            "This collective dimension deserves as much attention as the machine itself. For the sender, the action seems simple: insert a sheet, dial a number, wait. To reconstruct the page elsewhere, the equipment must share conventions. Here we meet a question already faced by postal services: how can separate systems work together? Speed becomes useful when it comes with compatibility.",
          ),
        ],
        sourceIds: ["fax-standard"],
      },
      {
        id: "courrier-electronique",
        title: msg("Email crosses the boundary between computers"),
        paragraphs: [
          msg(
            "Email, too, did not emerge all at once. Before it became networked, users of shared computer systems could already leave messages for one another. In 1971, Ray Tomlinson developed mail exchange between computers on ARPANET. He chose the @ sign to separate the user’s name from the machine’s name. This milestone concerns networked mail; presenting it as the absolute invention of all electronic messaging would erase earlier work.",
          ),
          msg(
            "The Computer History Museum describes this transition as opening up a space previously limited to users of a single system. Common rules then strengthened these exchanges. In August 1982, RFC 821 described SMTP, a mail transfer protocol. Addresses, routing and inboxes use familiar vocabulary, but the journey takes place between machines. Email predates the Web and does not need a web page to exist.",
          ),
        ],
        sourceIds: ["network-email", "smtp"],
      },
      {
        id: "page-numerique",
        title: msg("The PDF carries the layout with it"),
        paragraphs: [
          msg(
            "Sending a message and preserving a document’s appearance are two different problems. In 1990, Adobe co-founder John Warnock set out an ambition in the Camelot project: exchanging documents faithful to their presentation, despite the variety of software and computers. Adobe launched Acrobat and the PDF format on 15 June 1993.",
          ),
          msg(
            "The page thus found a new way to travel. Its margins, images and composition could be described in a file intended for display or printing on different systems. The PDF does not, by itself, transport mail: it supplies content that can be attached, uploaded or transmitted. This separation between a document and its delivery method helps explain everyday practice. The same dossier can be viewed on screen, printed for an envelope or converted for fax transmission.",
          ),
        ],
        sourceIds: ["pdf-history"],
      },
      {
        id: "une-page-plusieurs-chemins",
        title: msg("One page, many routes"),
        paragraphs: [
          msg(
            "This history can be read as an accumulation of possibilities. Printing multiplies copies; postal services organise their circulation; telecommunications move signals; digital formats describe documents independently of their physical sheets. Each stage makes some operations easier without solving all the others on its own.",
          ),
          msg(
            "This reading explains why our actions remain recognisable. We prepare content, choose a recipient, decide on a delivery method and try to understand what happened. A letter, a fax and an email do not provide exactly the same experience. What they share is attention to the other end of the journey. From type assembled in a workshop to a file ready to go, a page becomes communication when it can be received, found again and understood.",
          ),
        ],
        sourceIds: ["postal-history", "fax-standard", "smtp", "pdf-history"],
      },
    ],
    sources: [
      {
        id: "diamond-sutra",
        title: "What was stored in Cave 17? — The Diamond Sutra",
        publisher: "British Library · International Dunhuang Programme",
        url: "https://idp.bl.uk/discover/learning/dunhuang/dunhuang-articles/cave-17-the-library-cave/what-was-stored-in-cave-17/",
      },
      {
        id: "jikji",
        title: "Jikji, volume II — Mémoire du monde",
        publisher: "UNESCO",
        url: "https://www.unesco.org/en/memory-world/baegun-hwasang-chorok-buljo-jikji-simche-yojeol-volii-second-volume-anthology-great-buddhist-priests?hub=915",
      },
      {
        id: "gutenberg-bibles",
        title: "Die Gutenberg-Bibeln",
        publisher: "Gutenberg-Museum · Ville de Mayence",
        url: "https://www.mainz.de/microsite/gutenberg-museum/Forschung_Sammlung_/Gutenberg_Bibeln",
      },
      {
        id: "postal-history",
        title: "History of the Universal Postal Union",
        publisher: "Union postale universelle",
        url: "https://www.upu.int/en/universal-postal-union/about-upu/history",
      },
      {
        id: "telecommunications-history",
        title: "Panorama historique de l’UIT",
        publisher: "Union internationale des télécommunications",
        url: "https://search.itu.int/history/HistoryDigitalCollectionDocLibrary/12.28.71.fr.pdf",
      },
      {
        id: "fax-standard",
        title:
          "T.4 (11/1980) — Standardization of Group 3 facsimile apparatus for document transmission",
        publisher: "Union internationale des télécommunications",
        url: "https://www.itu.int/ITU-T/recommendations/rec.aspx?lang=en&rec=6326",
      },
      {
        id: "network-email",
        title: "1971 — Networked Email as an Early “Killer App”",
        publisher: "Computer History Museum",
        url: "https://www.computerhistory.org/timeline/1971/",
      },
      {
        id: "smtp",
        title: "RFC 821 — Simple Mail Transfer Protocol, août 1982",
        publisher: "Jon Postel · RFC Editor",
        url: "https://www.rfc-editor.org/info/rfc821/",
      },
      {
        id: "pdf-history",
        title:
          "Evolution of the Digital Document: Celebrating Adobe Acrobat’s 25th Anniversary",
        publisher: "Adobe",
        url: "https://blog.adobe.com/en/publish/2018/06/14/evolution-digital-document-celebrating-adobe-acrobats-25th-anniversary",
      },
    ],
  };
}
