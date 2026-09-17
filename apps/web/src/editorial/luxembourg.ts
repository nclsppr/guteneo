import type { EditorialArticle } from "./types";

export const luxembourgArticle: EditorialArticle = {
  slug: "histoire-imprimerie-luxembourg",
  title: "L’imprimerie au Luxembourg, une histoire de circulation",
  dek: "Des premiers ateliers aux journaux numérisés, les caractères racontent un pays où les livres, les langues et les nouvelles passent les frontières.",
  description:
    "Une histoire documentée de l’imprimerie au Luxembourg : le brevet de 1598, les cartes Dieudonné, la presse, la poste et le patrimoine numérique.",
  published: "2026-09-17",
  readingMinutes: 6,
  hero: {
    src: "/editorial/luxembourg-printing.webp",
    width: 1536,
    height: 1024,
    alt: "Presse, caractères mobiles et livres devant une vue illustrée des toits et de la vallée de Luxembourg, gravés en bleu.",
    caption: "Illustration contemporaine générée pour Guteneo.",
  },
  chapters: [
    {
      id: "livres-et-frontieres",
      title: "Des livres venus d’ailleurs",
      paragraphs: [
        "L’histoire luxembourgeoise de l’imprimé commence par une distinction : posséder un livre et le fabriquer sont deux histoires différentes. La Bibliothèque nationale du Luxembourg conserve environ deux cents incunables, ces livres imprimés avant 1501. Leur présence dans ses collections ne démontre pas l’existence d’un atelier local au XVe siècle. Elle ouvre plutôt une enquête sur les lieux de fabrication, les propriétaires et les chemins parcourus par chaque exemplaire.",
        "Un volume décrit par la BnL en donne un indice concret : des sermons imprimés à Strasbourg par Martin Flach en 1497 portent un ex-libris manuscrit d’Echternach, daté de la fin du XVe ou du début du XVIe siècle. L’objet associe ainsi une production extérieure à une trace de possession locale. Pour les impressions antérieures à 1800, la BnL retient par ailleurs les imprimeurs actifs dans l’ancien duché de Luxembourg. Ce cadre historique ne se confond pas avec les frontières du pays actuel.",
      ],
      sourceIds: ["bnl-fonds-rares", "bnl-incunables"],
    },
    {
      id: "brevet-et-reprises",
      title: "1598 : un atelier, puis des reprises",
      paragraphs: [
        "Le premier jalon de l’imprimerie locale est un brevet accordé le 10 avril 1598 à Matthias Birthon, appelé Mathias Birton au Kulturhuef. La présentation du corpus des imprimés luxembourgeois par la Ruhr-Universität Bochum permet de suivre la suite de l’atelier. Après la mort de l’imprimeur, six ans plus tard, sa veuve poursuit l’activité jusqu’en 1618. Elle appartient donc pleinement à cette première histoire du métier, même si cette notice ne donne pas son prénom.",
        "Le 18 juillet 1618, Hubert Reulandt, venu de Saint-Vith, reçoit à son tour l’autorisation d’établir une imprimerie. Il reprend les caractères et les vignettes de l’atelier Birthon ; la reprise de la presse elle-même reste présentée comme probable par les chercheurs. Son dernier imprimé luxembourgeois connu date de 1638. Après une longue interruption, Andreas Chevalier ouvre un nouvel atelier en 1686, imprimant d’abord en latin et en français ; le prochain imprimé en allemand signalé par ce corpus date de 1703. La chronologie montre ainsi des transmissions et des ruptures, loin d’une croissance continue depuis un unique acte fondateur.",
      ],
      sourceIds: ["rub-premiers-ateliers", "kulturhuef-expositions"],
    },
    {
      id: "cartes-de-grevenmacher",
      title: "À Grevenmacher, imprimer pour jouer",
      paragraphs: [
        "L’imprimé luxembourgeois prend aussi la forme d’objets que l’on tient en éventail. En 1754, Jean Dieudonné s’installe à Grevenmacher et y fonde une manufacture de cartes à jouer. Selon le Kulturhuef, sa production vise surtout les marchés étrangers. Les descendants poursuivent ce métier jusqu’à l’arrêt de la fabrication par Jean-Paul Dieudonné en 1880.",
        "Les planches, feuilles imprimées et outils conservés rendent cette activité tangible. Ils rappellent que l’histoire de l’impression dépasse le livre et le journal : elle comprend aussi les images répétées, découpées, distribuées et utilisées au quotidien. Ces cartes donnent au récit un autre point de départ, celui de la table de jeu et de l’exportation.",
      ],
      sourceIds: ["kulturhuef-expositions"],
    },
    {
      id: "visages-de-la-presse",
      title: "La presse se reconnaît aussi à ses lettres",
      paragraphs: [
        "Au XIXe siècle, les journaux offrent un observatoire particulièrement riche de l’imprimé. Le Luxemburger Wort, fondé en 1848 dans les milieux catholiques après l’octroi de la liberté de la presse, en est un exemple. L’étude de Peter Gilles, publiée sur le portail universitaire Infolux, suit son titre depuis le numéro du 23 mars 1848. Elle compare les bandeaux de première page sur la période 1848–1980.",
        "Le résultat déplace le regard : le nom du journal reste reconnaissable, mais ses lettres changent. La Fraktur alterne au XIXe siècle avec une Didot, une forme sans empattements puis une égyptienne. Une Antiqua apparaît pendant l’occupation nazie, avant le retour du titre en Fraktur en 1944. Observer ces transformations invite à lire une page comme un objet graphique autant que comme un texte. La typographie contribue à son identité et peut aussi porter les traces d’une époque politique.",
      ],
      sourceIds: ["infolux-typographie"],
    },
    {
      id: "papier-en-voyage",
      title: "Après la presse, le trajet du papier",
      paragraphs: [
        "Une fois la feuille produite, il reste à la faire parvenir à quelqu’un. L’histoire de la poste apporte un autre fil à ce récit. POST Luxembourg situe la création de l’Administration des Postes en 1842, l’émission du premier timbre-poste luxembourgeois en 1852 et la participation du pays comme membre fondateur de l’Union postale universelle en 1874. Ces dates concernent des institutions et des services précis ; elles ne signifient pas que toute circulation du courrier commence en 1842.",
        "On peut lire ensemble ces deux histoires sans les confondre : l’atelier multiplie les exemplaires, tandis que le réseau postal organise des déplacements. Le timbre matérialise un service sur un petit morceau de papier lui-même imprimé. La lettre et le journal rappellent ainsi qu’un document prend aussi son sens dans la relation entre celui qui le produit et celui qui le reçoit.",
      ],
      sourceIds: ["post-histoire"],
    },
    {
      id: "gestes-conserves",
      title: "Un patrimoine qui se pratique",
      paragraphs: [
        "Au Kulturhuef de Grevenmacher, la collection de machines donne une présence matérielle à cette histoire. La Linotype et la presse à platine Heidelberg figurent parmi les pièces mises en valeur. Les ateliers ouverts au public et les résidences d’artistes permettent aussi de travailler sur des presses historiques. Le patrimoine y reste associé au geste : encrer, exercer une pression, découvrir l’empreinte. Une page terminée cache le travail qui l’a rendue possible ; l’atelier le remet au premier plan.",
      ],
      sourceIds: ["kulturhuef-expositions"],
    },
    {
      id: "nouvelles-vies-numeriques",
      title: "Le papier devient aussi une archive consultable",
      paragraphs: [
        "Une autre forme de transmission se développe à la BnL : la numérisation des journaux historiques avec reconnaissance optique des caractères commence en 2006. L’image de la page est accompagnée d’un texte que l’on peut interroger. Cette transformation facilite les recherches, mais garde les difficultés du document d’origine. Un papier dégradé ou une lettre mal reconnue peut rendre un mot invisible au moteur de recherche, alors qu’il reste lisible sur la page.",
        "La BnL a développé Nautilus-OCR pour améliorer ces transcriptions. Elle propose également des ensembles de journaux du domaine public sous forme d’images, de textes et de métadonnées. On peut ainsi examiner un numéro comme un tout ou étudier ses articles séparément. Le document conserve une apparence, une structure et une provenance, au-delà des mots extraits automatiquement.",
        "Cette mémoire numérique rencontre une caractéristique ancienne du pays : plusieurs langues peuvent cohabiter sur une même page. En 2023, eluxemburgensia a ajouté un filtre par langue, tout en précisant les limites de la détection automatique, notamment pour les articles multilingues. Chercher, lire et revenir à l’original restent des opérations complémentaires. De l’exemplaire marqué à Echternach au journal consulté à distance, le fil de cette histoire est celui des passages : entre langues, entre lecteurs, entre supports.",
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
