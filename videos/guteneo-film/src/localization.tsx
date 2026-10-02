import React, { createContext, useContext } from "react";

export const FILM_LOCALES = ["fr", "en", "de", "lb"] as const;
export type FilmLocale = (typeof FILM_LOCALES)[number];
export type FilmProps = { locale?: FilmLocale };

/** Explicit V5 copy in every product locale. French remains the original source. */
export const filmCopy = {
  fr: {
    "La suite de vos mots": "La suite de vos mots",
    "Tout part": "Tout part",
    "d’un": "d’un",
    "document.": "document.",
    "De 1 à 10 000+ documents": "De 1 à 10 000+ documents",
    Changez: "Changez",
    "d’échelle.": "d’échelle.",
    "documents par campagne": "documents par campagne",
    "Un envoi unique.": "Un envoi unique.",
    "Ou des milliers d’attentions.": "Ou des milliers d’attentions.",
    "Votre campagne. Votre style.": "Votre campagne. Votre style.",
    "Du simple.": "Du simple.",
    "Au personnel.": "Au personnel.",
    "Simple ou ultra-personnalisée.": "Simple ou ultra-personnalisée.",
    Bonjour: "Bonjour",
    "Une même campagne.": "Une même campagne.",
    "À chacun sa version.": "À chacun sa version.",
    "Votre contenu, votre choix": "Votre contenu, votre choix",
    "Votre PDF.": "Votre PDF.",
    "Votre modèle.": "Votre modèle.",
    "Importez votre original.": "Importez votre original.",
    "Le document exact, conservé.": "Le document exact, conservé.",
    "Votre mise en page. Vos données.": "Votre mise en page. Vos données.",
    "Un modèle, des milliers de versions.":
      "Un modèle, des milliers de versions.",
    "Ou faites créer votre mise en page.":
      "Ou faites créer votre mise en page.",
    "Votre assistant, votre façon": "Votre assistant, votre façon",
    "Dites-le": "Dites-le",
    "à votre IA.": "à votre IA.",
    "Créez. Personnalisez. Envoyez, avec votre IA.":
      "Créez. Personnalisez. Envoyez, avec votre IA.",
    "Créez. Personnalisez.": "Créez. Personnalisez.",
    "Envoyez, avec votre IA.": "Envoyez, avec votre IA.",
    "De l’idée au document": "De l’idée au document",
    "Crée une lettre en PDF, puis prépare son envoi avec Guteneo.":
      "Crée une lettre en PDF, puis prépare son envoi avec Guteneo.",
    "« Crée mon PDF.": "« Crée mon PDF.",
    Prépare: "Prépare",
    "l’envoi. »": "l’envoi. »",
    "Prépare l’envoi. »": "Prépare l’envoi. »",
    "Le PDF est créé.": "Le PDF est créé.",
    "Vous pouvez le relire avant l’envoi.":
      "Vous pouvez le relire avant l’envoi.",
    "Votre-lettre.pdf": "Votre-lettre.pdf",
    "1 page · prêt à être relu": "1 page · prêt à être relu",
    "Préparer ce document ↗": "Préparer ce document ↗",
    "Le dernier mot vous appartient": "Le dernier mot vous appartient",
    "Le bon PDF.": "Le bon PDF.",
    "Le bon devis.": "Le bon devis.",
    "Relisez.": "Relisez.",
    "Puis validez.": "Puis validez.",
    "Document & destinataire": "Document & destinataire",
    "Tarif & plafond": "Tarif & plafond",
    "Votre accord avant l’envoi": "Votre accord avant l’envoi",
    "BON À TIRER": "BON À TIRER",
    "Votre campagne.": "Votre campagne.",
    "Original vérifié.": "Original vérifié.",
    "Destinataires relus.": "Destinataires relus.",
    "Devis confirmé.": "Devis confirmé.",
    "Tout est clair avant l’envoi.": "Tout est clair avant l’envoi.",
    Fax: "Fax",
    "Le PDF à sa destination.": "Le PDF à sa destination.",
    "Courrier postal": "Courrier postal",
    "Imprimé. Mis sous pli. Posté.": "Imprimé. Mis sous pli. Posté.",
    "E-mail classique": "E-mail classique",
    "Simple. Direct. Personnalisé.": "Simple. Direct. Personnalisé.",
    "E-mail chiffré": "E-mail chiffré",
    "Une transmission confidentielle.": "Une transmission confidentielle.",
    "Une seule intention": "Une seule intention",
    Plusieurs: "Plusieurs",
    "chemins.": "chemins.",
    "Imprimé. Affranchi. Distribué.": "Imprimé. Affranchi. Distribué.",
    "L’Europe.": "L’Europe.",
    "Tout entière.": "Tout entière.",
    "Vos documents, livrés par les postes.":
      "Vos documents, livrés par les postes.",
    "Depuis votre atelier numérique": "Depuis votre atelier numérique",
    "Jusqu’à leur boîte aux lettres.": "Jusqu’à leur boîte aux lettres.",
    "Du numérique.": "Du numérique.",
    Au: "Au",
    "réel.": "réel.",
    Avec: "Avec",
    "L’atelier où vous êtes": "L’atelier où vous êtes",
    "L’atelier dans votre poche": "L’atelier dans votre poche",
    "Sur le web.": "Sur le web.",
    "Sur iPhone.": "Sur iPhone.",
    "Vos documents et vos campagnes,": "Vos documents et vos campagnes,",
    "sur le site ou l’application iOS.": "sur le site ou l’application iOS.",
    "La suite": "La suite",
    "de vos mots.": "de vos mots.",
    "{{prénom}}": "{{prénom}}",
    "Une attention pour vous.": "Une attention pour vous.",
    "Vos campagnes.": "Vos campagnes.",
    "Au clair.": "Au clair.",
    Tout: "Tout",
    "À valider": "À valider",
    Envoyé: "Envoyé",
    "CAMPAGNE PERSONNALISÉE": "CAMPAGNE PERSONNALISÉE",
    "Une attention pour chacun": "Une attention pour chacun",
    documents: "documents",
    "Fax · E-mail · Courrier": "Fax · E-mail · Courrier",
    "Bon à tirer": "Bon à tirer",
    "Document et devis à vérifier": "Document et devis à vérifier",
    "Ouvrir la relecture": "Ouvrir la relecture",
    "◫ Atelier": "◫ Atelier",
    "▤ Documents": "▤ Documents",
    "↗ Envois": "↗ Envois",
    "Le principe": "Le principe",
    Assistants: "Assistants",
    Tarifs: "Tarifs",
    "Mon espace": "Mon espace",
    Menu: "Menu",
    "Votre assistant prépare.": "Votre assistant prépare.",
    "Guteneo transmet.": "Guteneo transmet.",
    "Envoyez vos documents par fax, e-mail ou courrier postal depuis votre conversation. Vérifiez le destinataire et le prix dans Guteneo, puis confirmez l’envoi.":
      "Envoyez vos documents par fax, e-mail ou courrier postal depuis votre conversation. Vérifiez le destinataire et le prix dans Guteneo, puis confirmez l’envoi.",
    "Préparer mon premier envoi": "Préparer mon premier envoi",
    "Voir un exemple": "Voir un exemple",
    "Fax · E-mail · Courrier postal": "Fax · E-mail · Courrier postal",
    "Bon d’envoi": "Bon d’envoi",
    Exemple: "Exemple",
    "Correspondance.pdf": "Correspondance.pdf",
    "2 pages": "2 pages",
    Pour: "Pour",
    Canal: "Canal",
    Plafond: "Plafond",
    "Maison Exemple (fictif)": "Maison Exemple (fictif)",
    "0,20 € (exemple)": "0,20 € (exemple)",
    "À vérifier avant l’envoi": "À vérifier avant l’envoi",
    "L’esprit d’une imprimerie. La simplicité d’une conversation.":
      "L’esprit d’une imprimerie. La simplicité d’une conversation.",
  },
  en: {
    "La suite de vos mots": "Your words go further",
    "Tout part": "It starts",
    "d’un": "with a",
    "document.": "document.",
    "De 1 à 10 000+ documents": "From 1 to 10 000+ documents",
    Changez: "Think",
    "d’échelle.": "bigger.",
    "documents par campagne": "documents per campaign",
    "Un envoi unique.": "One delivery.",
    "Ou des milliers d’attentions.": "Or thousands of personal touches.",
    "Votre campagne. Votre style.": "Your campaign. Your style.",
    "Du simple.": "From simple.",
    "Au personnel.": "To personal.",
    "Simple ou ultra-personnalisée.": "Simple or deeply personalised.",
    Bonjour: "Hello",
    "Une même campagne.": "One campaign.",
    "À chacun sa version.": "A version for everyone.",
    "Votre contenu, votre choix": "Your content, your choice",
    "Votre PDF.": "Your PDF.",
    "Votre modèle.": "Your template.",
    "Importez votre original.": "Upload your original.",
    "Le document exact, conservé.": "Your exact document, preserved.",
    "Votre mise en page. Vos données.": "Your layout. Your data.",
    "Un modèle, des milliers de versions.":
      "One template, thousands of versions.",
    "Ou faites créer votre mise en page.": "Or have your layout created.",
    "Votre assistant, votre façon": "Your assistant, your way",
    "Dites-le": "Tell",
    "à votre IA.": "your AI.",
    "Créez. Personnalisez. Envoyez, avec votre IA.":
      "Create. Personalise. Send, with your AI.",
    "Créez. Personnalisez.": "Create. Personalise.",
    "Envoyez, avec votre IA.": "Send, with your AI.",
    "De l’idée au document": "From idea to document",
    "Crée une lettre en PDF, puis prépare son envoi avec Guteneo.":
      "Create a PDF letter, then prepare its delivery with Guteneo.",
    "« Crée mon PDF.": "“Create my PDF.",
    Prépare: "Prepare",
    "l’envoi. »": "delivery.”",
    "Prépare l’envoi. »": "Prepare delivery.”",
    "Le PDF est créé.": "Your PDF is ready.",
    "Vous pouvez le relire avant l’envoi.": "You can review it before sending.",
    "Votre-lettre.pdf": "Your-letter.pdf",
    "1 page · prêt à être relu": "1 page · ready to review",
    "Préparer ce document ↗": "Prepare this document ↗",
    "Le dernier mot vous appartient": "You have the final say",
    "Le bon PDF.": "The right PDF.",
    "Le bon devis.": "The right quote.",
    "Relisez.": "Review.",
    "Puis validez.": "Then approve.",
    "Document & destinataire": "Document & recipient",
    "Tarif & plafond": "Price & limit",
    "Votre accord avant l’envoi": "Your approval before sending",
    "BON À TIRER": "FINAL PROOF",
    "Votre campagne.": "Your campaign.",
    "Original vérifié.": "Original checked.",
    "Destinataires relus.": "Recipients reviewed.",
    "Devis confirmé.": "Quote confirmed.",
    "Tout est clair avant l’envoi.": "Everything is clear before sending.",
    Fax: "Fax",
    "Le PDF à sa destination.": "Your PDF, delivered.",
    "Courrier postal": "Postal mail",
    "Imprimé. Mis sous pli. Posté.": "Printed. Sealed. Posted.",
    "E-mail classique": "Standard email",
    "Simple. Direct. Personnalisé.": "Simple. Direct. Personal.",
    "E-mail chiffré": "Encrypted email",
    "Une transmission confidentielle.": "A confidential delivery.",
    "Une seule intention": "One intention",
    Plusieurs: "Many",
    "chemins.": "ways.",
    "Imprimé. Affranchi. Distribué.": "Printed. Stamped. Delivered.",
    "L’Europe.": "Europe.",
    "Tout entière.": "All of it.",
    "Vos documents, livrés par les postes.":
      "Your documents, delivered by postal services.",
    "Depuis votre atelier numérique": "From your digital workspace",
    "Jusqu’à leur boîte aux lettres.": "To their letterbox.",
    "Du numérique.": "From digital.",
    Au: "To the",
    "réel.": "real world.",
    Avec: "With",
    "L’atelier où vous êtes": "Your workspace, wherever you are",
    "L’atelier dans votre poche": "Your workspace in your pocket",
    "Sur le web.": "On the web.",
    "Sur iPhone.": "On iPhone.",
    "Vos documents et vos campagnes,": "Your documents and campaigns,",
    "sur le site ou l’application iOS.": "on the website or the iOS app.",
    "La suite": "Your words",
    "de vos mots.": "go further.",
    "{{prénom}}": "{{firstName}}",
    "Une attention pour vous.": "A personal touch for you.",
    "Vos campagnes.": "Your campaigns.",
    "Au clair.": "At a glance.",
    Tout: "All",
    "À valider": "To approve",
    Envoyé: "Sent",
    "CAMPAGNE PERSONNALISÉE": "PERSONALISED CAMPAIGN",
    "Une attention pour chacun": "A personal touch for everyone",
    documents: "documents",
    "Fax · E-mail · Courrier": "Fax · Email · Post",
    "Bon à tirer": "Final proof",
    "Document et devis à vérifier": "Review the document and quote",
    "Ouvrir la relecture": "Open review",
    "◫ Atelier": "◫ Workspace",
    "▤ Documents": "▤ Documents",
    "↗ Envois": "↗ Deliveries",
    "Le principe": "How it works",
    Assistants: "Assistants",
    Tarifs: "Pricing",
    "Mon espace": "My workspace",
    Menu: "Menu",
    "Votre assistant prépare.": "Your assistant prepares.",
    "Guteneo transmet.": "Guteneo delivers.",
    "Envoyez vos documents par fax, e-mail ou courrier postal depuis votre conversation. Vérifiez le destinataire et le prix dans Guteneo, puis confirmez l’envoi.":
      "Send documents by fax, email or post from your conversation. Check the recipient and price in Guteneo, then confirm delivery.",
    "Préparer mon premier envoi": "Prepare my first delivery",
    "Voir un exemple": "See an example",
    "Fax · E-mail · Courrier postal": "Fax · Email · Postal mail",
    "Bon d’envoi": "Delivery summary",
    Exemple: "Example",
    "Correspondance.pdf": "Letter.pdf",
    "2 pages": "2 pages",
    Pour: "To",
    Canal: "Channel",
    Plafond: "Limit",
    "Maison Exemple (fictif)": "Example House (fictional)",
    "0,20 € (exemple)": "€0.20 (example)",
    "À vérifier avant l’envoi": "Review before sending",
    "L’esprit d’une imprimerie. La simplicité d’une conversation.":
      "The spirit of a print shop. The ease of a conversation.",
  },
  de: {
    "La suite de vos mots": "Ihre Worte gehen weiter",
    "Tout part": "Alles beginnt",
    "d’un": "mit einem",
    "document.": "Dokument.",
    "De 1 à 10 000+ documents": "Von 1 bis 10 000+ Dokumenten",
    Changez: "Denken Sie",
    "d’échelle.": "größer.",
    "documents par campagne": "Dokumente pro Kampagne",
    "Un envoi unique.": "Eine Sendung.",
    "Ou des milliers d’attentions.": "Oder tausende persönliche Gesten.",
    "Votre campagne. Votre style.": "Ihre Kampagne. Ihr Stil.",
    "Du simple.": "Ganz einfach.",
    "Au personnel.": "Ganz persönlich.",
    "Simple ou ultra-personnalisée.": "Einfach oder individuell gestaltet.",
    Bonjour: "Hallo",
    "Une même campagne.": "Eine Kampagne.",
    "À chacun sa version.": "Für jeden eine eigene Version.",
    "Votre contenu, votre choix": "Ihr Inhalt, Ihre Wahl",
    "Votre PDF.": "Ihr PDF.",
    "Votre modèle.": "Ihre Vorlage.",
    "Importez votre original.": "Original hochladen.",
    "Le document exact, conservé.": "Ihr Dokument bleibt unverändert.",
    "Votre mise en page. Vos données.": "Ihr Layout. Ihre Daten.",
    "Un modèle, des milliers de versions.": "Eine Vorlage, tausende Versionen.",
    "Ou faites créer votre mise en page.":
      "Oder lassen Sie ein Layout erstellen.",
    "Votre assistant, votre façon": "Ihr Assistent, Ihr Weg",
    "Dites-le": "Sagen Sie es",
    "à votre IA.": "Ihrer KI.",
    "Créez. Personnalisez. Envoyez, avec votre IA.":
      "Erstellen. Anpassen. Senden, mit Ihrer KI.",
    "Créez. Personnalisez.": "Erstellen. Anpassen.",
    "Envoyez, avec votre IA.": "Senden, mit Ihrer KI.",
    "De l’idée au document": "Von der Idee zum Dokument",
    "Crée une lettre en PDF, puis prépare son envoi avec Guteneo.":
      "Erstelle einen PDF-Brief und bereite den Versand mit Guteneo vor.",
    "« Crée mon PDF.": "„Erstelle mein PDF.",
    Prépare: "Bereite",
    "l’envoi. »": "den Versand vor.“",
    "Prépare l’envoi. »": "Bereite den Versand vor.“",
    "Le PDF est créé.": "Das PDF ist erstellt.",
    "Vous pouvez le relire avant l’envoi.":
      "Sie können es vor dem Versand prüfen.",
    "Votre-lettre.pdf": "Ihr-Brief.pdf",
    "1 page · prêt à être relu": "1 Seite · bereit zur Prüfung",
    "Préparer ce document ↗": "Dokument vorbereiten ↗",
    "Le dernier mot vous appartient": "Sie haben das letzte Wort",
    "Le bon PDF.": "Das richtige PDF.",
    "Le bon devis.": "Der richtige Preis.",
    "Relisez.": "Prüfen.",
    "Puis validez.": "Dann freigeben.",
    "Document & destinataire": "Dokument & Empfänger",
    "Tarif & plafond": "Preis & Limit",
    "Votre accord avant l’envoi": "Ihre Freigabe vor dem Versand",
    "BON À TIRER": "DRUCKFREIGABE",
    "Votre campagne.": "Ihre Kampagne.",
    "Original vérifié.": "Original geprüft.",
    "Destinataires relus.": "Empfänger geprüft.",
    "Devis confirmé.": "Preis bestätigt.",
    "Tout est clair avant l’envoi.": "Alles klar vor dem Versand.",
    Fax: "Fax",
    "Le PDF à sa destination.": "Ihr PDF am Ziel.",
    "Courrier postal": "Postversand",
    "Imprimé. Mis sous pli. Posté.": "Gedruckt. Kuvertiert. Verschickt.",
    "E-mail classique": "Klassische E-Mail",
    "Simple. Direct. Personnalisé.": "Einfach. Direkt. Persönlich.",
    "E-mail chiffré": "Verschlüsselte E-Mail",
    "Une transmission confidentielle.": "Eine vertrauliche Übermittlung.",
    "Une seule intention": "Ein Anliegen",
    Plusieurs: "Viele",
    "chemins.": "Wege.",
    "Imprimé. Affranchi. Distribué.": "Gedruckt. Frankiert. Zugestellt.",
    "L’Europe.": "Europa.",
    "Tout entière.": "Überall.",
    "Vos documents, livrés par les postes.":
      "Ihre Dokumente, von der Post zugestellt.",
    "Depuis votre atelier numérique": "Aus Ihrem digitalen Atelier",
    "Jusqu’à leur boîte aux lettres.": "Bis in ihren Briefkasten.",
    "Du numérique.": "Vom Digitalen.",
    Au: "In die",
    "réel.": "reale Welt.",
    Avec: "Mit",
    "L’atelier où vous êtes": "Ihr Atelier, überall dabei",
    "L’atelier dans votre poche": "Ihr Atelier in der Tasche",
    "Sur le web.": "Im Web.",
    "Sur iPhone.": "Auf dem iPhone.",
    "Vos documents et vos campagnes,": "Ihre Dokumente und Kampagnen,",
    "sur le site ou l’application iOS.": "auf der Website oder in der iOS-App.",
    "La suite": "Ihre Worte",
    "de vos mots.": "gehen weiter.",
    "{{prénom}}": "{{Vorname}}",
    "Une attention pour vous.": "Eine persönliche Geste für Sie.",
    "Vos campagnes.": "Ihre Kampagnen.",
    "Au clair.": "Im Überblick.",
    Tout: "Alle",
    "À valider": "Freizugeben",
    Envoyé: "Gesendet",
    "CAMPAGNE PERSONNALISÉE": "PERSONALISIERTE KAMPAGNE",
    "Une attention pour chacun": "Eine persönliche Geste für jeden",
    documents: "Dokumente",
    "Fax · E-mail · Courrier": "Fax · E-Mail · Post",
    "Bon à tirer": "Druckfreigabe",
    "Document et devis à vérifier": "Dokument und Preis prüfen",
    "Ouvrir la relecture": "Prüfung öffnen",
    "◫ Atelier": "◫ Atelier",
    "▤ Documents": "▤ Dokumente",
    "↗ Envois": "↗ Sendungen",
    "Le principe": "So funktioniert es",
    Assistants: "Assistenten",
    Tarifs: "Preise",
    "Mon espace": "Mein Bereich",
    Menu: "Menü",
    "Votre assistant prépare.": "Ihr Assistent bereitet vor.",
    "Guteneo transmet.": "Guteneo übermittelt.",
    "Envoyez vos documents par fax, e-mail ou courrier postal depuis votre conversation. Vérifiez le destinataire et le prix dans Guteneo, puis confirmez l’envoi.":
      "Senden Sie Dokumente per Fax, E-Mail oder Post aus Ihrem Gespräch. Prüfen Sie Empfänger und Preis in Guteneo, dann bestätigen Sie den Versand.",
    "Préparer mon premier envoi": "Erste Sendung vorbereiten",
    "Voir un exemple": "Beispiel ansehen",
    "Fax · E-mail · Courrier postal": "Fax · E-Mail · Postversand",
    "Bon d’envoi": "Versandübersicht",
    Exemple: "Beispiel",
    "Correspondance.pdf": "Brief.pdf",
    "2 pages": "2 Seiten",
    Pour: "An",
    Canal: "Kanal",
    Plafond: "Limit",
    "Maison Exemple (fictif)": "Beispielhaus (fiktiv)",
    "0,20 € (exemple)": "0,20 € (Beispiel)",
    "À vérifier avant l’envoi": "Vor dem Versand prüfen",
    "L’esprit d’une imprimerie. La simplicité d’une conversation.":
      "Der Geist einer Druckerei. So einfach wie ein Gespräch.",
  },
  lb: {
    "La suite de vos mots": "Är Wierder ginn weider",
    "Tout part": "Et fänkt un",
    "d’un": "mat engem",
    "document.": "Dokument.",
    "De 1 à 10 000+ documents": "Vun 1 bis 10 000+ Dokumenter",
    Changez: "Denkt",
    "d’échelle.": "méi grouss.",
    "documents par campagne": "Dokumenter pro Campagne",
    "Un envoi unique.": "Eng eenzel Sendung.",
    "Ou des milliers d’attentions.": "Oder dausende perséinlech Gesten.",
    "Votre campagne. Votre style.": "Är Campagne. Äre Stil.",
    "Du simple.": "Ganz einfach.",
    "Au personnel.": "Ganz perséinlech.",
    "Simple ou ultra-personnalisée.": "Einfach oder ganz personaliséiert.",
    Bonjour: "Moien",
    "Une même campagne.": "Eng Campagne.",
    "À chacun sa version.": "Fir jiddereen eng eege Versioun.",
    "Votre contenu, votre choix": "Ären Inhalt, Är Wiel",
    "Votre PDF.": "Äre PDF.",
    "Votre modèle.": "Är Virlag.",
    "Importez votre original.": "Äert Original eroplueden.",
    "Le document exact, conservé.": "Äert Dokument bleift onverännert.",
    "Votre mise en page. Vos données.": "Äre Layout. Är Donnéeën.",
    "Un modèle, des milliers de versions.": "Eng Virlag, dausende Versiounen.",
    "Ou faites créer votre mise en page.": "Oder loosst Äre Layout erstellen.",
    "Votre assistant, votre façon": "Ären Assistent, Äre Wee",
    "Dites-le": "Sot et",
    "à votre IA.": "Ärer KI.",
    "Créez. Personnalisez. Envoyez, avec votre IA.":
      "Erstellen. Personaliséieren. Schécken, mat Ärer KI.",
    "Créez. Personnalisez.": "Erstellen. Personaliséieren.",
    "Envoyez, avec votre IA.": "Schécken, mat Ärer KI.",
    "De l’idée au document": "Vun der Iddi zum Dokument",
    "Crée une lettre en PDF, puis prépare son envoi avec Guteneo.":
      "Erstell e Bréif als PDF a preparéier seng Sendung mat Guteneo.",
    "« Crée mon PDF.": "„Erstell mäi PDF.",
    Prépare: "Preparéier",
    "l’envoi. »": "d’Sendung.“",
    "Prépare l’envoi. »": "Preparéier d’Sendung.“",
    "Le PDF est créé.": "De PDF ass erstallt.",
    "Vous pouvez le relire avant l’envoi.":
      "Dir kënnt en virum Schécke préiwen.",
    "Votre-lettre.pdf": "Äre-Bréif.pdf",
    "1 page · prêt à être relu": "1 Säit · prett fir ze préiwen",
    "Préparer ce document ↗": "Dokument preparéieren ↗",
    "Le dernier mot vous appartient": "Dir hutt dat lescht Wuert",
    "Le bon PDF.": "De richtege PDF.",
    "Le bon devis.": "De richtege Präis.",
    "Relisez.": "Noliesen.",
    "Puis validez.": "Dann fräiginn.",
    "Document & destinataire": "Dokument & Empfänger",
    "Tarif & plafond": "Präis & Limit",
    "Votre accord avant l’envoi": "Är Zoustëmmung virum Schécken",
    "BON À TIRER": "DRÉCKFREIGAB",
    "Votre campagne.": "Är Campagne.",
    "Original vérifié.": "Original gepréift.",
    "Destinataires relus.": "Empfänger gepréift.",
    "Devis confirmé.": "Präis bestätegt.",
    "Tout est clair avant l’envoi.": "Alles ass kloer virum Schécken.",
    Fax: "Fax",
    "Le PDF à sa destination.": "Äre PDF op senger Destinatioun.",
    "Courrier postal": "Bréifpost",
    "Imprimé. Mis sous pli. Posté.": "Gedréckt. An d’Enveloppe. Verschéckt.",
    "E-mail classique": "Klassesch E-Mail",
    "Simple. Direct. Personnalisé.": "Einfach. Direkt. Perséinlech.",
    "E-mail chiffré": "Verschlësselt E-Mail",
    "Une transmission confidentielle.": "Eng vertraulech Iwwermëttlung.",
    "Une seule intention": "Eng Absicht",
    Plusieurs: "Vill",
    "chemins.": "Weeër.",
    "Imprimé. Affranchi. Distribué.": "Gedréckt. Frankéiert. Zougeliwwert.",
    "L’Europe.": "Europa.",
    "Tout entière.": "Iwwerall.",
    "Vos documents, livrés par les postes.":
      "Är Dokumenter, vun der Post geliwwert.",
    "Depuis votre atelier numérique": "Aus Ärem digitalen Atelier",
    "Jusqu’à leur boîte aux lettres.": "Bis an hir Bréifboîte.",
    "Du numérique.": "Vun digital.",
    Au: "An déi",
    "réel.": "real Welt.",
    Avec: "Mat",
    "L’atelier où vous êtes": "Ären Atelier, iwwerall dobäi",
    "L’atelier dans votre poche": "Ären Atelier an der Täsch",
    "Sur le web.": "Am Web.",
    "Sur iPhone.": "Um iPhone.",
    "Vos documents et vos campagnes,": "Är Dokumenter a Campagnen,",
    "sur le site ou l’application iOS.": "op der Websäit oder an der iOS-App.",
    "La suite": "Är Wierder",
    "de vos mots.": "ginn weider.",
    "{{prénom}}": "{{Virnumm}}",
    "Une attention pour vous.": "Eng perséinlech Gest fir Iech.",
    "Vos campagnes.": "Är Campagnen.",
    "Au clair.": "Am Iwwerbléck.",
    Tout: "Alles",
    "À valider": "Fir fräizeginn",
    Envoyé: "Verschéckt",
    "CAMPAGNE PERSONNALISÉE": "PERSONALISÉIERT CAMPAGNE",
    "Une attention pour chacun": "Eng perséinlech Gest fir jiddereen",
    documents: "Dokumenter",
    "Fax · E-mail · Courrier": "Fax · E-Mail · Bréifpost",
    "Bon à tirer": "Dréckfreigab",
    "Document et devis à vérifier": "Dokument a Präis préiwen",
    "Ouvrir la relecture": "Noliese starten",
    "◫ Atelier": "◫ Atelier",
    "▤ Documents": "▤ Dokumenter",
    "↗ Envois": "↗ Sendungen",
    "Le principe": "Sou geet et",
    Assistants: "Assistenten",
    Tarifs: "Präisser",
    "Mon espace": "Mäin Atelier",
    Menu: "Menü",
    "Votre assistant prépare.": "Ären Assistent preparéiert.",
    "Guteneo transmet.": "Guteneo iwwermëttelt.",
    "Envoyez vos documents par fax, e-mail ou courrier postal depuis votre conversation. Vérifiez le destinataire et le prix dans Guteneo, puis confirmez l’envoi.":
      "Schéckt Är Dokumenter per Fax, E-Mail oder Bréifpost aus Ärem Gespréich. Préift den Empfänger an de Präis a Guteneo a bestätegt dann d’Sendung.",
    "Préparer mon premier envoi": "Éischt Sendung preparéieren",
    "Voir un exemple": "E Beispill kucken",
    "Fax · E-mail · Courrier postal": "Fax · E-Mail · Bréifpost",
    "Bon d’envoi": "Sendungsiwwerbléck",
    Exemple: "Beispill",
    "Correspondance.pdf": "Bréif.pdf",
    "2 pages": "2 Säiten",
    Pour: "Fir",
    Canal: "Kanal",
    Plafond: "Limit",
    "Maison Exemple (fictif)": "Beispillhaus (fiktiv)",
    "0,20 € (exemple)": "0,20 € (Beispill)",
    "À vérifier avant l’envoi": "Virum Schécke préiwen",
    "L’esprit d’une imprimerie. La simplicité d’une conversation.":
      "De Geescht vun enger Dréckerei. Esou einfach wéi e Gespréich.",
  },
} as const;

export type FilmText = keyof typeof filmCopy.fr;
const FilmLocaleContext = createContext<FilmLocale>("fr");
export const FilmLocaleProvider: React.FC<
  React.PropsWithChildren<FilmProps>
> = ({ locale = "fr", children }) => (
  <FilmLocaleContext.Provider value={locale}>
    {children}
  </FilmLocaleContext.Provider>
);
export const useFilmLocale = () => useContext(FilmLocaleContext);
export const useFilmCopy = () => {
  const locale = useFilmLocale();
  return (key: FilmText): string => filmCopy[locale][key];
};
/** Preserve FR pixel-for-pixel; leave room for wider translated headlines. */
export const useFilmHeadlineScale = () =>
  ({ fr: 1, en: 0.92, de: 0.8, lb: 0.84 })[useFilmLocale()];

import { C, sans, serif } from "./design";

type CopyPatchProps = {
  text: FilmText;
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  style?: React.CSSProperties;
};

/** Replace only captured text; the approved engraving and frame stay intact. */
const CopyPatch: React.FC<CopyPatchProps> = ({
  text,
  x,
  y,
  width,
  height,
  size,
  style,
}) => {
  const t = useFilmCopy();
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        background: C.paper,
        color: C.ink,
        fontFamily: sans,
        fontSize: size,
        lineHeight: 1.5,
        ...style,
      }}
    >
      {t(text)}
    </div>
  );
};

const DeliveryTicket: React.FC<{ mobile?: boolean }> = ({ mobile = false }) => {
  const t = useFilmCopy();
  return (
    <div
      style={{
        position: "absolute",
        left: mobile ? 112 : 1302,
        top: mobile ? 641 : 566,
        width: mobile ? 260 : 291,
        height: mobile ? 188 : 194,
        rotate: "-2deg",
        padding: mobile ? "13px 15px" : "12px 15px",
        background: "#fffefa",
        color: C.ink,
        fontFamily: sans,
        fontSize: mobile ? 12 : 12,
        boxShadow: "0 0 0 1px #deded4",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderBottom: `1px solid ${C.blue}`,
          paddingBottom: 11,
          marginBottom: 11,
        }}
      >
        <span>{t("Bon d’envoi")}</span>
        <span style={{ color: "#777971" }}>{t("Exemple")}</span>
      </div>
      <div style={{ marginBottom: 12 }}>
        ▤ {t("Correspondance.pdf")}{" "}
        <span style={{ color: "#777971" }}>{t("2 pages")}</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 5,
          fontSize: 11,
        }}
      >
        <span style={{ color: "#777971" }}>{t("Pour")}</span>
        <span>{t("Maison Exemple (fictif)")}</span>
        <span style={{ color: "#777971" }}>{t("Canal")}</span>
        <span style={{ textAlign: "right" }}>Fax</span>
        <span style={{ color: "#777971" }}>{t("Plafond")}</span>
        <span>{t("0,20 € (exemple)")}</span>
      </div>
      <div style={{ color: C.blue, marginTop: 15, fontSize: 11 }}>
        ✓ {t("À vérifier avant l’envoi")}
      </div>
    </div>
  );
};

/** Text coordinates use the original 1920 × 1080 homepage capture. */
export const WebCopyOverlay = () => {
  const locale = useFilmLocale();
  if (locale === "fr") return null;
  return (
    <div
      style={{
        position: "absolute",
        left: -130,
        top: 0,
        width: 1920,
        height: 1080,
        scale: 1260 / 1920,
        transformOrigin: "top left",
        pointerEvents: "none",
      }}
    >
      <CopyPatch
        text="Le principe"
        x={1224}
        y={35}
        width={85}
        height={29}
        size={12}
      />
      <CopyPatch
        text="Assistants"
        x={1322}
        y={35}
        width={86}
        height={29}
        size={12}
      />
      <CopyPatch
        text="Tarifs"
        x={1414}
        y={35}
        width={51}
        height={29}
        size={12}
      />
      <CopyPatch
        text="Mon espace"
        x={1484}
        y={35}
        width={112}
        height={27}
        size={12}
        style={{ textAlign: "center" }}
      />
      <CopyPatch
        text="Votre assistant prépare."
        x={320}
        y={255}
        width={650}
        height={81}
        size={locale === "en" ? 62 : 57}
        style={{ fontFamily: serif, lineHeight: 1.15 }}
      />
      <CopyPatch
        text="Guteneo transmet."
        x={320}
        y={333}
        width={650}
        height={83}
        size={62}
        style={{
          fontFamily: serif,
          fontStyle: "italic",
          color: C.blue,
          lineHeight: 1.15,
        }}
      />
      <CopyPatch
        text="Envoyez vos documents par fax, e-mail ou courrier postal depuis votre conversation. Vérifiez le destinataire et le prix dans Guteneo, puis confirmez l’envoi."
        x={320}
        y={428}
        width={605}
        height={96}
        size={17}
        style={{ paddingRight: 44, lineHeight: 1.6 }}
      />
      <CopyPatch
        text="Préparer mon premier envoi"
        x={321}
        y={543}
        width={250}
        height={44}
        size={13}
        style={{
          background: C.blue,
          color: "white",
          textAlign: "center",
          paddingTop: 11,
        }}
      />
      <CopyPatch
        text="Voir un exemple"
        x={595}
        y={546}
        width={155}
        height={43}
        size={14}
        style={{ color: C.blue, paddingTop: 9, textDecoration: "underline" }}
      />
      <CopyPatch
        text="Fax · E-mail · Courrier postal"
        x={320}
        y={611}
        width={500}
        height={28}
        size={14}
        style={{ color: "#777971" }}
      />
      <DeliveryTicket />
      <CopyPatch
        text="L’esprit d’une imprimerie. La simplicité d’une conversation."
        x={1220}
        y={793}
        width={394}
        height={39}
        size={13}
        style={{ color: "#777971", textAlign: "right", lineHeight: 1.3 }}
      />
    </div>
  );
};

/** Text coordinates use the original mobile screenshot's 390 × 844 CSS viewport. */
export const MobileWebCopyOverlay = () => {
  const locale = useFilmLocale();
  if (locale === "fr") return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 390,
        height: 844,
        scale: 404 / 390,
        transformOrigin: "top left",
        pointerEvents: "none",
      }}
    >
      <CopyPatch text="Menu" x={315} y={28} width={45} height={19} size={14} />
      <CopyPatch
        text="Votre assistant prépare."
        x={22}
        y={110}
        width={346}
        height={50}
        size={locale === "en" ? 36 : 32}
        style={{ fontFamily: serif, lineHeight: 1.2 }}
      />
      <CopyPatch
        text="Guteneo transmet."
        x={22}
        y={160}
        width={346}
        height={43}
        size={35}
        style={{
          fontFamily: serif,
          fontStyle: "italic",
          color: C.blue,
          lineHeight: 1.2,
        }}
      />
      <CopyPatch
        text="Envoyez vos documents par fax, e-mail ou courrier postal depuis votre conversation. Vérifiez le destinataire et le prix dans Guteneo, puis confirmez l’envoi."
        x={22}
        y={223}
        width={346}
        height={103}
        size={15}
        style={{ lineHeight: 1.65 }}
      />
      <CopyPatch
        text="Préparer mon premier envoi"
        x={23}
        y={351}
        width={208}
        height={45}
        size={11}
        style={{
          background: C.blue,
          color: "white",
          textAlign: "center",
          paddingTop: 13,
        }}
      />
      <CopyPatch
        text="Voir un exemple"
        x={252}
        y={351}
        width={107}
        height={45}
        size={12}
        style={{ color: C.blue, paddingTop: 13, textDecoration: "underline" }}
      />
      <CopyPatch
        text="Fax · E-mail · Courrier postal"
        x={22}
        y={417}
        width={346}
        height={24}
        size={13}
        style={{ color: "#777971" }}
      />
      <DeliveryTicket mobile />
    </div>
  );
};
