import type { SupportedLocale } from "../../../packages/contracts/src/locale";

// Reviewed interface copy only: document names, messages, recipient fields and
// immutable approval data are never passed through this catalogue.
const copy: Record<string, readonly [string, string, string]> = {
  "Actualiser le suivi": [
    "Refresh tracking",
    "Sendungsverfolgung aktualisieren",
    "De Status aktualiséieren",
  ],
  "Annuler cet envoi": [
    "Cancel this dispatch",
    "Diese Sendung stornieren",
    "Dës Sendung annuléieren",
  ],
  Annulé: ["Cancelled", "Storniert", "Annuléiert"],
  Canal: ["Channel", "Kanal", "Kanal"],
  Destinataire: ["Recipient", "Empfänger", "Empfänger"],
  "Devis valable jusqu’au": [
    "Quote valid until",
    "Angebot gültig bis",
    "Devis gülteg bis",
  ],
  "E-mail": ["Email", "E-Mail", "E-Mail"],
  Expéditeur: ["Sender", "Absender", "Ofsender"],
  Fax: ["Fax", "Fax", "Fax"],
  Guteneo: ["Guteneo", "Guteneo", "Guteneo"],
  Imprimé: ["Printed", "Gedruckt", "Gedréckt"],
  Objet: ["Subject", "Betreff", "Betreff"],
  "Réclamation reçue": [
    "Complaint received",
    "Beschwerde eingegangen",
    "Reklamatioun kritt",
  ],
  "Suivi en cours": [
    "Tracking in progress",
    "Sendungsverfolgung läuft",
    "De Status gëtt verfollegt",
  ],
  "Transmission en cours": [
    "Transmission in progress",
    "Übertragung läuft",
    "Iwwerdroung leeft",
  ],
  "Votre validation": ["Your approval", "Ihre Freigabe", "Är Bestätegung"],
  "À vérifier": [
    "Needs verification",
    "Prüfung erforderlich",
    "Muss gepréift ginn",
  ],
  Échec: ["Failed", "Fehlgeschlagen", "Feelgeschloen"],
  "Vérifier l’envoi": [
    "Review dispatch",
    "Sendung prüfen",
    "D’Sendung préiwen",
  ],
  "Cette page sert uniquement à vérifier cet envoi. Fermez-la pour revenir à l’application.":
    [
      "This page is only for reviewing this dispatch. Close it to return to the app.",
      "Diese Seite dient ausschließlich zur Prüfung dieser Sendung. Schließen Sie sie, um zur App zurückzukehren.",
      "Dës Säit déngt nëmmen der Kontroll vun dëser Sendung. Maacht se zou, fir an d’App zeréckzegoen.",
    ],
  "Opération indisponible": [
    "Operation unavailable",
    "Vorgang nicht verfügbar",
    "Aktioun net disponibel",
  ],
  "Connexion navigateur requise": [
    "Browser sign-in required",
    "Browser-Anmeldung erforderlich",
    "Umeldung am Browser néideg",
  ],
  "Utilisez la connexion sécurisée dans votre navigateur pour vérifier cet envoi.":
    [
      "Use secure sign-in in your browser to review this dispatch.",
      "Melden Sie sich sicher in Ihrem Browser an, um diese Sendung zu prüfen.",
      "Mellt Iech sécher an Ärem Browser un, fir dës Sendung ze préiwen.",
    ],
  "Reconnectez-vous pour continuer": [
    "Sign in again to continue",
    "Erneut anmelden, um fortzufahren",
    "Mellt Iech nach eng Kéier un, fir weiderzefueren",
  ],
  "Votre session ou sa confirmation de sécurité n’est plus valide. L’opération n’a pas été effectuée.":
    [
      "Your session or its security confirmation is no longer valid. The operation was not performed.",
      "Ihre Sitzung oder deren Sicherheitsbestätigung ist nicht mehr gültig. Der Vorgang wurde nicht ausgeführt.",
      "Är Sessioun oder hir Sécherheetsbestätegung ass net méi gülteg. D’Aktioun gouf net ausgeféiert.",
    ],
  "Connexion sécurisée": [
    "Secure sign-in",
    "Sichere Anmeldung",
    "Sécher Umeldung",
  ],
  "Envoi indisponible": [
    "Dispatch unavailable",
    "Sendung nicht verfügbar",
    "Sendung net disponibel",
  ],
  "Vous ne pouvez pas consulter cet envoi depuis cet espace.": [
    "You cannot view this dispatch from this workspace.",
    "Sie können diese Sendung in diesem Arbeitsbereich nicht einsehen.",
    "Dir kënnt dës Sendung net an dësem Aarbechtsberäich kucken.",
  ],
  "En attente de traitement": [
    "Awaiting processing",
    "Verarbeitung ausstehend",
    "Waart op d’Bearbechtung",
  ],
  "Résultat à vérifier : ne renvoyez pas cet envoi": [
    "Outcome unconfirmed: do not send this dispatch again",
    "Ergebnis unbestätigt: diese Sendung nicht erneut versenden",
    "Resultat net bestätegt: schéckt dës Sendung net nach eng Kéier",
  ],
  "Accepté par le fournisseur": [
    "Accepted by provider",
    "Vom Anbieter angenommen",
    "Vum Fournisseur ugeholl",
  ],
  Livré: ["Delivered", "Zugestellt", "Zougestallt"],
  "Non distribué": ["Not delivered", "Nicht zugestellt", "Net zougestallt"],
  "Remis au réseau postal": [
    "Handed to the postal network",
    "An das Postnetz übergeben",
    "Un d’Postnetz iwwerreecht",
  ],
  "Cet envoi ne peut pas être confirmé actuellement. Aucun nouvel envoi n’a été déclenché. Vous pouvez conserver votre préparation et contacter l’assistance si nécessaire.":
    [
      "This dispatch cannot be confirmed right now. No new dispatch was triggered. You can keep your preparation and contact support if needed.",
      "Diese Sendung kann derzeit nicht bestätigt werden. Es wurde keine neue Sendung ausgelöst. Ihre Vorbereitung bleibt erhalten; wenden Sie sich bei Bedarf an den Support.",
      "Dës Sendung kann am Moment net bestätegt ginn. Keng nei Sendung gouf ausgeléist. Dir kënnt Är Virbereedung behalen a bei Bedarf d’Hëllef kontaktéieren.",
    ],
  "Le devis n’est plus valable. Actualisez cette page pour consulter les possibilités de renouvellement, puis vérifiez la nouvelle proposition.":
    [
      "The quote is no longer valid. Refresh this page to check renewal options, then review the new quote.",
      "Das Angebot ist nicht mehr gültig. Aktualisieren Sie diese Seite, um Erneuerungsmöglichkeiten anzuzeigen, und prüfen Sie dann das neue Angebot.",
      "Den Devis ass net méi gülteg. Aktualiséiert dës Säit, fir d’Erneierungsoptiounen ze kucken, a préift duerno den neien Devis.",
    ],
  "La version affichée a changé. Actualisez cette page et relisez l’envoi avant de continuer.":
    [
      "The displayed version has changed. Refresh this page and review the dispatch before continuing.",
      "Die angezeigte Version hat sich geändert. Aktualisieren Sie die Seite und prüfen Sie die Sendung, bevor Sie fortfahren.",
      "Déi ugewisen Versioun huet sech geännert. Aktualiséiert dës Säit a préift d’Sendung, ier Dir weiderfuert.",
    ],
  "La confirmation de sécurité n’est plus valide. Actualisez la page avant de continuer.":
    [
      "The security confirmation is no longer valid. Refresh the page before continuing.",
      "Die Sicherheitsbestätigung ist nicht mehr gültig. Aktualisieren Sie die Seite, bevor Sie fortfahren.",
      "D’Sécherheetsbestätegung ass net méi gülteg. Aktualiséiert d’Säit, ier Dir weiderfuert.",
    ],
  "Confirmez que le destinataire a demandé cet e-mail avant de l’approuver.": [
    "Confirm that the recipient requested this email before approving it.",
    "Bestätigen Sie vor der Freigabe, dass der Empfänger diese E-Mail angefordert hat.",
    "Bestätegt virun der Freigab, datt den Empfänger dës E-Mail ugefrot huet.",
  ],
  "L’opération n’a pas pu être confirmée. Actualisez le suivi avant de recommencer ; ne préparez pas un nouvel envoi pour remplacer un résultat incertain.":
    [
      "The operation could not be confirmed. Refresh tracking before trying again; do not prepare a new dispatch to replace an uncertain outcome.",
      "Der Vorgang konnte nicht bestätigt werden. Aktualisieren Sie die Sendungsverfolgung vor einem neuen Versuch; bereiten Sie bei ungewissem Ergebnis keine Ersatzsendung vor.",
      "D’Aktioun konnt net bestätegt ginn. Aktualiséiert de Status virun engem neie Versuch; bereet bei engem onséchere Resultat keng Ersatzsendung vir.",
    ],
  Impression: ["Printing", "Druck", "Drock"],
  Couleur: ["Colour", "Farbe", "Faarf"],
  Acheminement: ["Delivery service", "Versanddienst", "Versanddéngscht"],
  "Position de l’adresse": [
    "Address position",
    "Adressposition",
    "Positioun vun der Adress",
  ],
  "Type de message": ["Message type", "Nachrichtentyp", "Typ vum Message"],
  Papier: ["Paper", "Papier", "Pabeier"],
  Recto: ["Single-sided", "Einseitig", "Eensäiteg"],
  "Recto verso": ["Double-sided", "Beidseitig", "Bäidsäiteg"],
  "Noir et blanc": ["Black and white", "Schwarzweiß", "Schwaarz-wäiss"],
  Économique: ["Economy", "Economy", "Ekonomesch"],
  Rapide: ["Fast", "Schnell", "Séier"],
  "À gauche": ["Left", "Links", "Lénks"],
  "À droite": ["Right", "Rechts", "Riets"],
  Transactionnel: ["Transactional", "Transaktional", "Transaktionell"],
  Standard: ["Standard", "Standard", "Standard"],
  Oui: ["Yes", "Ja", "Jo"],
  Non: ["No", "Nein", "Nee"],
  "Non défini": ["Not set", "Nicht festgelegt", "Net festgeluecht"],
  "{low} à {high}": ["{low} to {high}", "{low} bis {high}", "{low} bis {high}"],
  "Contenu final de l’e-mail": [
    "Final email content",
    "Endgültiger E-Mail-Inhalt",
    "Finalen Inhalt vun der E-Mail",
  ],
  "Simulation : aucune communication réelle.": [
    "Simulation: no real communication.",
    "Simulation: keine echte Kommunikation.",
    "Simulatioun: keng reell Kommunikatioun.",
  ],
  "Destinataire et coût": [
    "Recipient and cost",
    "Empfänger und Kosten",
    "Empfänger a Käschten",
  ],
  "Courrier postal": ["Postal letter", "Briefpost", "Postbréif"],
  Estimation: ["Estimate", "Schätzung", "Schätzung"],
  " HT": [" excl. tax", " ohne Steuern", " ouni Steieren"],
  "Plafond ferme": ["Firm limit", "Verbindliche Obergrenze", "Fest Limitt"],
  "Le coût de ce fax entier dépend de la durée de transmission. Le plafond est réservé à la confirmation. Le coût définitif est déterminé après vérification de l’usage et reste limité au plafond. Les fractions de centime sont cumulées entre les envois.":
    [
      "The cost of this entire fax depends on transmission duration. The limit is reserved when you confirm. The final cost is determined after usage verification and cannot exceed the limit. Fractions of a cent are accumulated across dispatches.",
      "Die Kosten dieses gesamten Faxes hängen von der Übertragungsdauer ab. Die Obergrenze wird bei der Bestätigung reserviert. Die endgültigen Kosten werden nach Prüfung der Nutzung bestimmt und überschreiten die Obergrenze nicht. Bruchteile eines Cents werden über mehrere Sendungen angesammelt.",
      "D’Käschte vun dësem ganze Fax hänke vun der Iwwerdroungsdauer of. D’Limitt gëtt bei der Bestätegung reservéiert. Déi definitiv Käschte ginn no der Kontroll vum Verbrauch ermëttelt a bleiwen ënner der Limitt. Brochdeeler vun engem Cent gi fir verschidde Sendungen zesummegerechent.",
    ],
  "Test Luxembourg autorisé par l’opérateur. La capacité Local Calling n’est pas confirmée ; le fournisseur peut refuser la transmission.":
    [
      "Luxembourg test authorised by the operator. Local Calling capability is unconfirmed; the provider may reject transmission.",
      "Vom Betreiber autorisierter Luxemburg-Test. Die Funktion Local Calling ist nicht bestätigt; der Anbieter kann die Übertragung ablehnen.",
      "Lëtzebuerg-Test vum Bedreiwer autoriséiert. D’Funktioun Local Calling ass net bestätegt; de Fournisseur kann d’Iwwerdroung refuséieren.",
    ],
  "Les fractions de centime sont cumulées entre les envois avant arrondi. Le plafond reste réservé jusqu’au résultat.":
    [
      "Fractions of a cent are accumulated across dispatches before rounding. The limit remains reserved until the outcome is known.",
      "Bruchteile eines Cents werden vor der Rundung über mehrere Sendungen angesammelt. Die Obergrenze bleibt bis zum Ergebnis reserviert.",
      "Brochdeeler vun engem Cent gi virum Ronnen iwwer verschidde Sendungen zesummegerechent. D’Limitt bleift bis zum Resultat reservéiert.",
    ],
  "Contenu exact": ["Exact content", "Exakter Inhalt", "Exakten Inhalt"],
  "PDF original exact": [
    "Exact original PDF",
    "Exakte Original-PDF",
    "Exakten originale PDF",
  ],
  "Ouvrir le PDF original": [
    "Open original PDF",
    "Original-PDF öffnen",
    "Den originale PDF opmaachen",
  ],
  "Le PDF doit terminer sa vérification avant approbation.": [
    "PDF verification must finish before approval.",
    "Die PDF-Prüfung muss vor der Freigabe abgeschlossen sein.",
    "De PDF muss virun der Bestätegung fäerdeg gepréift sinn.",
  ],
  "Empreinte SHA-256": [
    "SHA-256 fingerprint",
    "SHA-256-Prüfsumme",
    "SHA-256-Fangerofdrock",
  ],
  "Le devis a expiré.": [
    "The quote has expired.",
    "Das Angebot ist abgelaufen.",
    "Den Devis ass ofgelaf.",
  ],
  "Renouvelez-le ci-dessous, puis vérifiez sa nouvelle version.": [
    "Renew it below, then review the new version.",
    "Erneuern Sie es unten und prüfen Sie dann die neue Version.",
    "Erneiert en hei drënner a préift duerno déi nei Versioun.",
  ],
  "Cet envoi ne peut pas être confirmé avec ce devis.": [
    "This dispatch cannot be confirmed using this quote.",
    "Diese Sendung kann mit diesem Angebot nicht bestätigt werden.",
    "Dës Sendung kann net mat dësem Devis bestätegt ginn.",
  ],
  "Renouveler le devis": ["Renew quote", "Angebot erneuern", "Devis erneieren"],
  "J’ai vérifié le contenu exact, le destinataire et les options. J’accepte le coût dans la limite de {amount} pour cette version.":
    [
      "I have reviewed the exact content, recipient and options. I accept the cost up to {amount} for this version.",
      "Ich habe den exakten Inhalt, den Empfänger und die Optionen geprüft. Ich akzeptiere die Kosten bis zur Obergrenze von {amount} für diese Version.",
      "Ech hunn den exakten Inhalt, den Empfänger an d’Optioune gepréift. Ech akzeptéieren d’Käschte bis zu {amount} fir dës Versioun.",
    ],
  "Ce destinataire a demandé cet e-mail et son contenu.": [
    "This recipient requested this email and its content.",
    "Dieser Empfänger hat diese E-Mail und ihren Inhalt angefordert.",
    "Dësen Empfänger huet dës E-Mail an hiren Inhalt ugefrot.",
  ],
  "Valider cette version": [
    "Approve this version",
    "Diese Version freigeben",
    "Dës Versioun bestätegen",
  ],
  "Version validée": [
    "Version approved",
    "Version freigegeben",
    "Versioun bestätegt",
  ],
  "La validation est enregistrée. Confirmez maintenant l’expédition de cette version au destinataire affiché.":
    [
      "Your approval is recorded. Now confirm sending this version to the displayed recipient.",
      "Ihre Freigabe ist gespeichert. Bestätigen Sie jetzt den Versand dieser Version an den angezeigten Empfänger.",
      "Är Bestätegung ass gespäichert. Bestätegt elo de Versand vun dëser Versioun un den ugewisenen Empfänger.",
    ],
  "Je confirme l’envoi réel de cette version.": [
    "I confirm the real sending of this version.",
    "Ich bestätige den tatsächlichen Versand dieser Version.",
    "Ech bestätegen de reelle Versand vun dëser Versioun.",
  ],
  "Je confirme la simulation de cette version.": [
    "I confirm the simulation of this version.",
    "Ich bestätige die Simulation dieser Version.",
    "Ech bestätegen d’Simulatioun vun dëser Versioun.",
  ],
  "Confirmer l’envoi": [
    "Confirm sending",
    "Versand bestätigen",
    "Versand bestätegen",
  ],
  "Lancer la simulation": [
    "Run simulation",
    "Simulation starten",
    "Simulatioun starten",
  ],
  page: ["page", "Seite", "Säit"],
  pages: ["pages", "Seiten", "Säiten"],
};

export function mobileText(key: string, locale: SupportedLocale): string {
  if (locale === "fr") return key;
  const index = { en: 0, de: 1, lb: 2 }[locale];
  return copy[key]?.[index] ?? key;
}
