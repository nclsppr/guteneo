import type { EditorialArticle } from "./types";

export const gutenbergArticle: EditorialArticle = {
  slug: "de-gutenberg-au-numerique",
  title: "De Gutenberg au numérique, la longue vie d’une page",
  dek: "Imprimer, adresser, transmettre : du livre composé à la main au document envoyé en quelques secondes, une histoire de gestes qui changent et de besoins qui demeurent.",
  description:
    "De l’impression asiatique à Gutenberg, du courrier au fax et à l’e-mail : comment les pages ont appris à se multiplier, voyager et traverser les réseaux.",
  published: "2026-09-17",
  readingMinutes: 6,
  hero: {
    src: "/editorial/gutenberg-to-digital.webp",
    width: 1536,
    height: 1024,
    alt: "Composition illustrée réunissant une presse ancienne, des lettres, un fax et un ordinateur autour de pages imprimées.",
    caption: "Illustration contemporaine générée pour Guteneo.",
  },
  chapters: [
    {
      id: "avant-gutenberg",
      title: "Avant Mayence, des siècles d’impression",
      paragraphs: [
        "Une page paraît immobile. Pourtant, son histoire est celle d’un mouvement : multiplier un texte, le porter ailleurs, permettre à quelqu’un de le retrouver. Cette histoire commence bien avant les presses européennes. En Chine, le Sūtra du Diamant conservé à la British Library porte la date du 11 mai 868. Imprimé à partir de planches de bois gravées, ce rouleau témoigne d’un savoir-faire déjà élaboré. Il est le plus ancien livre imprimé daté conservé, pas le premier texte jamais imprimé.",
        "Autre repère décisif : en juillet 1377, le Jikji est imprimé en Corée avec des caractères métalliques mobiles. Son second volume constitue, selon l’UNESCO, le plus ancien témoignage conservé de cette technique. Gutenberg n’invente donc ni l’impression dans le monde, ni son principe de caractères mobiles. Sa place dans cette histoire est celle d’une transformation européenne, dont l’ampleur ne doit pas effacer les précédents asiatiques.",
      ],
      sourceIds: ["diamond-sutra", "jikji"],
    },
    {
      id: "atelier-de-mayence",
      title: "Une révolution qui ressemble encore à un manuscrit",
      paragraphs: [
        "À Mayence, entre 1452 et 1455, Johannes Gutenberg et ses collaborateurs réalisent une Bible en deux volumes. Les caractères mobiles permettent de composer les lignes, d’imprimer plusieurs exemplaires, puis de réemployer les lettres. Le travail change d’échelle : une composition sert à produire une série de pages. Le Gutenberg-Museum estime le tirage à environ 180 exemplaires, majoritairement sur papier, avec une partie sur parchemin.",
        "L’objet ne rompt pourtant pas avec tous les usages du livre manuscrit. Son texte imprimé attend encore les couleurs et les ornements que chaque acheteur fait ajouter par des artisans. Les exemplaires portent ainsi des différences bien visibles. Ce voisinage de la reproduction mécanique et du travail manuel raconte mieux le changement qu’une soudaine disparition de l’ancien monde. La nouveauté s’installe dans des gestes, des métiers et des attentes qui existaient déjà. Elle transforme la fabrication du livre tout en conservant une part de sa familiarité.",
      ],
      sourceIds: ["gutenberg-bibles"],
    },
    {
      id: "courrier-en-reseau",
      title: "Faire voyager ce que l’on écrit",
      paragraphs: [
        "Multiplier les pages ne suffit pas à les faire parvenir à leurs lecteurs. Le courrier possède sa propre histoire, bien antérieure à Gutenberg : messagers, relais et services organisés relient des lieux et des personnes. Au XIXe siècle, les réformes postales rendent ces échanges plus simples. En Angleterre, en 1840, la réforme portée par Rowland Hill associe paiement préalable et tarif intérieur uniforme pour un poids donné, indépendamment de la distance. Le timbre matérialise cette nouvelle organisation.",
        "Les frontières restent une difficulté. Les accords entre pays se multiplient, avec leurs conditions et leurs tarifs. Le 9 octobre 1874, vingt-deux pays signent le traité de Berne, qui fonde l’Union générale des postes, devenue Union postale universelle en 1878. L’enjeu est très concret : permettre à des services différents d’échanger le courrier selon des règles communes. Derrière une lettre qui arrive se trouve désormais une coopération internationale, aussi essentielle que le papier et l’encre.",
      ],
      sourceIds: ["postal-history"],
    },
    {
      id: "image-avant-voix",
      title: "Le fax a des ancêtres plus anciens que le téléphone",
      paragraphs: [
        "Le fax semble appartenir aux bureaux de la fin du XXe siècle. Son ascendance remonte pourtant à la télégraphie. En 1843, Alexander Bain fait breveter au Royaume-Uni un dispositif précurseur de la télécopie, destiné à transmettre des images. Le brevet du téléphone de Bell date de 1876 : le projet de reproduire une trace à distance précède donc ce jalon de la transmission de la voix.",
        "Il serait trompeur d’imaginer dès 1843 l’appareil de bureau que nous connaissons. Entre un principe breveté et un service quotidien, il reste des machines à perfectionner, des réseaux à organiser et des correspondants à équiper. La rupture est néanmoins considérable : on peut envisager de transporter une représentation du document par un signal, sans faire voyager sa feuille. L’original demeure au départ ; sa reproduction apparaît à l’arrivée.",
      ],
      sourceIds: ["telecommunications-history"],
    },
    {
      id: "langue-commune-du-fax",
      title: "Pour transmettre, les machines doivent s’entendre",
      paragraphs: [
        "L’histoire technique ne se joue pas seulement dans les ateliers d’inventeurs. Elle avance aussi lorsque plusieurs appareils deviennent capables de communiquer. La recommandation T.4 du CCITT, organisme de normalisation de l’Union internationale des télécommunications, offre un repère précis : sa version approuvée en novembre 1980 porte sur les télécopieurs du groupe 3 et la transmission de documents. Elle formalise notamment la manière de représenter et de coder une page.",
        "Cette dimension collective mérite autant d’attention que la machine elle-même. Pour l’expéditeur, le geste paraît simple : placer une feuille, composer un numéro, attendre. Pour que la page soit reconstituée ailleurs, les équipements doivent partager des conventions. On retrouve ici une question déjà rencontrée par les postes : comment faire fonctionner ensemble des systèmes distincts ? La rapidité devient utile quand elle s’accompagne de compatibilité.",
      ],
      sourceIds: ["fax-standard"],
    },
    {
      id: "courrier-electronique",
      title: "L’e-mail franchit la frontière entre les ordinateurs",
      paragraphs: [
        "Le courrier électronique ne naît pas non plus en une seule fois. Avant son passage en réseau, des utilisateurs de systèmes informatiques partagés peuvent déjà s’y laisser des messages. En 1971, Ray Tomlinson développe l’échange de courrier entre ordinateurs sur ARPANET. Il choisit le signe @ pour séparer le nom de l’utilisateur de celui de la machine. Ce jalon concerne le courrier en réseau ; le présenter comme l’invention absolue de toute messagerie électronique effacerait les travaux antérieurs.",
        "Le Computer History Museum décrit cette transition comme l’ouverture d’un espace jusque-là limité aux utilisateurs d’un même système. Puis des règles communes consolident les échanges. En août 1982, la RFC 821 décrit SMTP, un protocole de transfert du courrier. L’adresse, l’acheminement et la boîte de réception reprennent un vocabulaire familier, mais le trajet s’effectue entre machines. L’e-mail précède le Web et n’a pas besoin d’une page web pour exister.",
      ],
      sourceIds: ["network-email", "smtp"],
    },
    {
      id: "page-numerique",
      title: "Le PDF emporte la mise en page",
      paragraphs: [
        "Transmettre un message et conserver l’apparence d’un document sont deux problèmes différents. En 1990, John Warnock, cofondateur d’Adobe, expose avec le projet Camelot une ambition : échanger des documents fidèles à leur présentation, malgré la diversité des logiciels et des ordinateurs. Adobe lance Acrobat et le format PDF le 15 juin 1993.",
        "La page trouve ainsi une nouvelle manière de voyager. Ses marges, ses images et sa composition peuvent être décrites dans un fichier destiné à être affiché ou imprimé sur différents systèmes. Le PDF ne transporte pas, à lui seul, le courrier : il lui fournit un contenu que l’on peut joindre, déposer ou transmettre. Cette séparation entre le document et son moyen d’acheminement éclaire notre quotidien. Un même dossier peut être consulté à l’écran, imprimé pour une enveloppe ou converti pour une télécopie.",
      ],
      sourceIds: ["pdf-history"],
    },
    {
      id: "une-page-plusieurs-chemins",
      title: "Une page, plusieurs chemins",
      paragraphs: [
        "On peut lire cette histoire comme une accumulation de possibilités. L’imprimerie multiplie les exemplaires ; les postes organisent leur circulation ; les télécommunications déplacent des signaux ; les formats numériques décrivent les documents indépendamment de leur feuille. Chaque étape rend certaines opérations plus faciles, sans résoudre à elle seule toutes les autres.",
        "Cette lecture explique pourquoi nos gestes restent reconnaissables. Nous préparons un contenu, choisissons un destinataire, décidons d’un moyen d’envoi et cherchons à comprendre ce qui est arrivé. Une lettre, un fax et un e-mail ne donnent pas exactement la même expérience. Leur point commun tient à cette attention portée à l’autre bout du trajet. Du caractère assemblé dans l’atelier au fichier prêt à partir, une page devient communication lorsqu’elle peut être reçue, retrouvée et comprise.",
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
