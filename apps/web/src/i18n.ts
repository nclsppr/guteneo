// All product copy lives here so an English dictionary can be added without editing views.
export const fr = {
  skip: "Aller au contenu",
  atelier: "L’ATELIER",
  yes: "Oui",
  no: "Non",
  brand: "guteneo",
  tagline: "La suite de vos mots.",
  loading: "Chargement…",
  retry: "Réessayer",
  refresh: "Actualiser",
  cancel: "Annuler",
  back: "Retour",
  close: "Fermer",
  save: "Enregistrer",
  open: "Ouvrir",
  preview: "Aperçu",
  download: "Ouvrir le PDF",
  unknown: "Non disponible",
  simulation: "Simulation",
  simulationBody:
    "Espace de démonstration. Aucun fax, e-mail ou courrier réel ne sera expédié.",
  scanDisabled:
    "Fichiers de test uniquement : analyse antivirus désactivée en local.",
  simulationCost: "Crédits de test uniquement. Aucun montant débité.",
  errorTitle: "L’opération n’a pas pu aboutir",
  empty: "Il n’y a encore rien ici.",
  identifier: "Identifiant",
  created: "Créé le",
  status: "État",
  channel: "Canal",
  recipient: "Destinataire",
  document: "Document",
  actions: "Actions",
  channels: { fax: "Fax", email: "E-mail", postal: "Courrier postal" },
  nav: {
    overview: "Vue d’ensemble",
    documents: "Documents",
    dispatches: "Envois",
    campaigns: "Campagnes",
    connection: "Assistants",
    senders: "Expéditeurs",
    usage: "Consommation",
    billing: "Facturation",
    account: "Mon compte",
    admin: "Administration",
  },
  landing: {
    navHow: "Le principe",
    navApp: "Mon espace",
    title: "Votre assistant prépare.",
    titleItalic: "Guteneo transmet.",
    intro:
      "Envoyez vos documents par fax, e-mail ou courrier postal depuis votre conversation. Vérifiez le destinataire et le prix dans Guteneo, puis confirmez l’envoi.",
    cta: "Préparer mon premier envoi",
    secondary: "Voir un exemple",
    imageAlt:
      "Presse typographique historique et feuilles imprimées, illustration tramée en bleu et ivoire",
    caption: "L’esprit d’une imprimerie. La simplicité d’une conversation.",
  },
  homepage: {
    navPricing: "Tarifs",
    pricing: {
      title: "De quoi commencer.",
      italic: "Et rien de caché.",
      intro:
        "Un crédit de bienvenue pour vos premiers envois. Ensuite, vous gardez la main sur votre budget, avant chaque validation.",
      welcomeTitle: "Offerts à l’ouverture de votre compte.",
      welcomeBody:
        "Votre organisation reçoit 50 € de crédit de bienvenue une seule fois à la création de son compte. Ce solde est partagé entre les canaux activés : fax, e-mail et courrier postal.",
      welcomeTerms:
        "Aucun renouvellement mensuel. Les envois s’arrêtent lorsque le solde disponible ne couvre plus leur coût.",
      rateLabel: "Tarifs clients indicatifs des trois canaux",
      channel: "Votre canal",
      price: "Votre tarif",
    },
    faq: {
      title: "Avant le premier envoi,",
      italic: "quelques réponses.",
      intro:
        "Le document, votre accord et le suivi : les mêmes repères, quel que soit le canal.",
      items: [
        {
          question: "Mon PDF original est-il modifié ?",
          answer:
            "Votre PDF importé est conservé à l’identique. Si vous composez une lettre avec votre assistant, un nouveau document est créé. Vous pouvez le relire avant de préparer son envoi.",
        },
        {
          question: "Puis-je partager un PDF protégé par mot de passe ?",
          answer:
            "Oui. Choisissez l’option de lien protégé : le destinataire reçoit un e-mail sans pièce jointe, puis saisit le mot de passe sur Guteneo sans créer de compte. L’hébergement coûte 1 € par document, en plus de l’e-mail. Transmettez le mot de passe par un autre canal. Le lien expire après la durée choisie et peut être révoqué ; les copies déjà téléchargées restent accessibles. Cette option protège l’accès et ne constitue pas un chiffrement de bout en bout.",
        },
        {
          question: "Mon assistant peut-il envoyer sans mon accord ?",
          answer:
            "Par défaut, votre assistant prépare l’envoi et vous validez dans Guteneo le document, le destinataire, le canal et le coût. Un accord donné dans la conversation ne remplace pas cette validation. Le mode expert est facultatif : seul un administrateur peut autoriser une délégation limitée, révocable et avec une date de fin.",
        },
        {
          question: "Comment connaître le prix de mon envoi ?",
          answer:
            "Le prix ou le plafond vous est présenté avant validation, avec les options et les taxes applicables. Les tarifs ci-dessus sont indicatifs. Le crédit de bienvenue de 50 € est attribué une seule fois, sans renouvellement mensuel. Si votre solde ne couvre pas l’envoi, celui-ci est bloqué : aucun débit automatique ni solde négatif.",
        },
        {
          question: "Comment savoir si mon envoi est arrivé ?",
          answer:
            "Retrouvez le suivi dans votre conversation et votre espace Guteneo. Un fax transmis, un e-mail accepté par le serveur destinataire et un courrier remis à la poste sont des résultats distincts ; ils ne prouvent pas que votre destinataire a lu le document. La livraison n’est affichée que lorsqu’elle est confirmée. Un résultat incertain reste visible et ne déclenche jamais une nouvelle expédition automatique.",
        },
      ],
    },
    footer: {
      title: "Les idées voyagent.",
      italic: "Les nôtres partent d’ici.",
      cta: "Préparer mon premier envoi",
      imageAlt:
        "Vue illustrée de Luxembourg : les toits du Grund, les falaises et les ponts de la vieille ville, gravure tramée en bleu et ivoire.",
      stampDescription:
        "Timbre Gutenberg et cachet décoratif Luxembourg, premier jour de guteneo :",
      foundingDate: "16 septembre 2026",
      made: "Fait au Luxembourg",
      created: "Créé par",
      nav: "Liens de bas de page",
      installation: "Installation",
      atelier: "L’atelier",
      legal: "Mentions légales",
    },
  },
  postalCutoff: {
    title: "Heure limite de traitement",
    timeZone: "heure de Paris",
    friday: "le vendredi",
    handover: {
      sameDay:
        "Remise à la poste prévue le même jour ouvré si le courrier est transmis au service d’impression avant cette heure.",
      nextDay:
        "Remise à la poste prévue le jour ouvré suivant si le courrier est transmis au service d’impression avant cette heure.",
      twoDays:
        "Remise à la poste prévue sous deux jours ouvrés si le courrier est transmis au service d’impression avant cette heure.",
    },
    nonWorkingDays:
      "Hors week-ends et jours fériés. Il ne s’agit pas du délai de livraison.",
    germanEconomy:
      "Vers l’Allemagne, la distribution économique peut demander un traitement supplémentaire.",
    swissBulk:
      "Vers la Suisse, le courrier B en nombre peut demander un traitement supplémentaire.",
    details: "Après cette heure ? Voir les horaires et exceptions",
    newTab: "(nouvel onglet)",
  },
  login: {
    title: "Bienvenue à l’atelier.",
    body: "Explorez un espace de démonstration isolé. Les documents et les envois appartiennent à l’organisation choisie.",
    local: "Démonstration locale",
    atelier: "Entrer dans l’Atelier",
    studio: "Entrer dans le Studio",
    separator: "Compte Guteneo",
    managed: "Se connecter",
    managedBody:
      "L’accès réel dépend du fournisseur d’identité configuré pour cet environnement.",
    switching: "Changer d’espace",
    logout: "Se déconnecter",
    noLocal:
      "La connexion locale est réservée à l’environnement de développement.",
  },
  overview: {
    title: "Votre correspondance, au clair.",
    intro: "Préparez un document, choisissez sa destination et gardez le fil.",
    new: "Préparer un envoi",
    recent: "Derniers envois",
    all: "Voir tous les envois",
    documents: "Documents affichés",
    waiting: "À approuver ici",
    tracked: "Envois affichés",
    emptyTitle: "Le premier envoi commence ici.",
    emptyBody:
      "Importez un PDF ou composez une lettre. Vous la relirez avant toute confirmation.",
    connectionTitle: "Votre assistant, votre atelier.",
    connectionBody:
      "Préparez vos envois depuis une conversation et retrouvez ici les mêmes documents et identifiants.",
    connect: "Configurer la connexion",
  },
  documents: {
    title: "La matière première.",
    intro: "Vos PDF originaux et les documents générés, conservés par version.",
    import: "Importer un PDF",
    render: "Composer une lettre",
    uploadTitle: "Importer le document exact",
    uploadBody:
      "Les octets de votre PDF sont conservés. Cet import ne reconstruit pas son contenu.",
    file: "Fichier PDF",
    fileHint:
      "PDF uniquement. La taille, le format et les pages seront contrôlés par le service.",
    upload: "Importer et contrôler",
    name: "Nom du document",
    namePlaceholder: "Lettre de présentation",
    html: "Contenu HTML autonome",
    htmlHint:
      "Sans script ni ressource externe. Le rendu produit un nouveau document PDF.",
    renderTitle: "Du texte au document",
    renderAction: "Générer le PDF",
    source: "Origine",
    pages: "Pages",
    size: "Taille",
    exact: "PDF importé",
    generated: "PDF généré",
    integrity: "Empreinte SHA-256",
    emptyTitle: "Votre bibliothèque attend sa première page.",
    emptyBody: "Importez un PDF existant ou générez-en un depuis votre lettre.",
    ready: "Utiliser pour un envoi",
    rescan: "Relancer la vérification",
    rescanning: "Vérification en cours…",
    chooseAnother: "Choisir un autre PDF",
    contactSupport: "Contacter l’assistance",
    refreshStatus: "Actualiser le suivi",
    followupAutomatic:
      "Cette page se met à jour automatiquement. Vous pourrez reprendre avec ce même PDF.",
    followupUnavailable: "Le suivi du PDF est momentanément indisponible",
    followupPaused: "Le suivi automatique est en pause",
    followupRecovery:
      "Votre PDF reste enregistré. Actualisez le suivi pour connaître le résultat de sa vérification.",
    followupLoadError:
      "Impossible d’afficher ce document pour le moment. Actualisez le suivi ; si le problème persiste, vérifiez que vous êtes connecté au bon compte.",
    pagesUnverified: "À vérifier",
    page: "Page",
    previousPage: "Page précédente",
    nextPage: "Page suivante",
    imageTooLarge:
      "Aperçu bloqué : une image dépasse 16 mégapixels. Aucun aperçu partiel n’est présenté. Vérifiez le PDF original ou fournissez une version adaptée.",
    previewUnavailable:
      "L’aperçu ne peut pas être affiché. Ouvrez le PDF original pour le vérifier.",
    pdfFallback:
      "Si votre navigateur n’affiche pas l’aperçu, ouvrez le PDF dans un nouvel onglet.",
    defaultHtml:
      "<h1>Bonjour,</h1>\n<p>Voici une lettre de démonstration préparée avec Guteneo.</p>\n<p>Ce document sert uniquement à tester un envoi simulé.</p>\n<p>Bien cordialement,<br>L’atelier Guteneo</p>",
  },
  dispatch: {
    title: "Préparer une correspondance.",
    intro:
      "Un document, un destinataire, un canal. L’envoi attendra votre approbation.",
    new: "Nouvel envoi",
    listTitle: "Le fil des envois.",
    listIntro: "Chaque ligne correspond à un destinataire et un canal.",
    chooseDocument: "Choisir un document",
    noDocument:
      "Aucun document disponible. Importez ou générez un PDF avant de préparer cet envoi.",
    sender: "Expéditeur",
    defaultSender: "Expéditeur de démonstration par défaut",
    phone: "Numéro de fax international",
    phonePlaceholder: "+…",
    email: "Adresse e-mail",
    emailPlaceholder: "destinataire@example.test",
    postalName: "Nom du destinataire",
    line1: "Adresse",
    postalCode: "Code postal",
    city: "Ville",
    country: "Pays",
    countries: { FR: "France", LU: "Luxembourg", DE: "Allemagne" },
    subject: "Objet",
    html: "Version HTML",
    text: "Version texte",
    textHelp: "La version texte fait partie du contenu approuvé.",
    attachment: "Pièce jointe PDF (facultative)",
    none: "Sans pièce jointe",
    ceiling: "Plafond de cet envoi (€)",
    ceilingHelp:
      "Votre envoi ne dépassera pas ce montant. Le prix applicable s’affiche avant votre validation.",
    prepare: "Vérifier et préparer",
    preparing: "Préparation…",
    reviewTitle: "Le bon à envoyer.",
    reviewIntro: "Vérifiez cette version avant de donner votre accord.",
    approvalCheck:
      "J’ai vérifié le contenu, le destinataire, le canal et le plafond de cette version.",
    approve: "Approuver cette version",
    confirm: "Confirmer l’envoi simulé",
    confirmReal: "Confirmer l’envoi",
    approved: "Cette version a été approuvée.",
    approvalExplain:
      "L’approbation porte sur cette version exacte. Une modification nécessite une nouvelle préparation.",
    cancelAction: "Demander l’annulation",
    refresh: "Actualiser le suivi",
    estimate: "Estimation",
    ceilingLabel: "Plafond autorisé",
    fingerprint: "Empreinte de la version",
    timeline: "Journal de l’envoi",
    noEvents: "Aucun événement enregistré pour le moment.",
    attempts: "Tentatives fournisseur",
    noAttempts: "Aucune soumission fournisseur pour le moment.",
    channelNotes: {
      fax: "Un fax transmis correspond au résultat de transmission communiqué par le prestataire.",
      email:
        "Remis au serveur destinataire ne signifie pas lu. Le suivi des ouvertures et des clics est désactivé.",
      postal:
        "Imprimé et remis à la poste sont des étapes distinctes. Aucune preuve de livraison n’est déduite de la remise à la poste.",
    },
    deliveryNote:
      "Une acceptation par le prestataire n’est pas une livraison. Le suivi indique uniquement les résultats disponibles.",
    uncertain:
      "Résultat de soumission incertain. Aucune nouvelle soumission automatique. Une vérification du prestataire est nécessaire.",
    documentPreview: "Aperçu du document approuvé",
    htmlPreview: "Aperçu de l’e-mail",
    textPreview: "Version texte",
    recipientDetails: "Adresse du destinataire",
    prepared:
      "La préparation est enregistrée. Aucun envoi n’a encore été accepté.",
    countEmpty: "Aucun envoi dans cet espace.",
    mode: "Mode",
    version: "Version approuvable",
    loadMore: "Afficher la suite",
    noChange: "Le contenu de cette préparation est figé.",
  },
  campaigns: {
    title: "Une lettre. Plusieurs destinations.",
    intro:
      "Vérifiez votre liste, puis préparez des envois individuels dans une campagne commune.",
    name: "Nom de la campagne",
    namePlaceholder: "Correspondance de septembre",
    csv: "Liste des destinataires au format CSV",
    csvHelp:
      "Utilisez les colonnes channel, email, phone, name, line1, postalCode, city, country. Seuls les champs du canal choisi sont nécessaires.",
    csvFile: "Importer un fichier CSV",
    validate: "Vérifier la liste",
    valid: "Lignes valides",
    errors: "Erreurs",
    duplicates: "Doublons détectés",
    noErrors: "Aucune erreur signalée.",
    validationTitle: "Résultat de la vérification",
    create: "Créer la campagne",
    list: "Vos campagnes",
    empty: "Aucune campagne pour le moment.",
    approvalNote:
      "Une campagne créée n’est pas une campagne expédiée. Chaque commande doit être approuvée avant acceptation.",
    detail: "Détail de campagne",
    manifest: "Manifeste de la campagne",
    raw: "Informations enregistrées",
    row: "Ligne",
    correction:
      "Corrigez les erreurs et doublons, puis vérifiez à nouveau la liste.",
    document: "Document commun",
    emailSubject: "Objet des e-mails",
    emailBody: "Contenu HTML des e-mails",
    sample:
      "channel,email,phone,name,line1,postalCode,city,country\nemail,destinataire@example.test,,,,,,\n",
    noValidated: "Vérifiez une liste valide avant de créer la campagne.",
    previewLimited:
      "Aperçu limité aux 25 premières lignes normalisées. Chaque destinataire sera relu avant approbation.",
    partial:
      "préparés. La campagne existe ; les autres lignes restent à préparer.",
    tooLarge: "Le fichier CSV dépasse 1 Mo.",
    duplicateOf: "doublon de la ligne",
    ceiling: "Plafond de démonstration",
    perRecipient: "par destinataire.",
    total: "Destinataires",
    inspect: "Consulter la campagne",
  },
  connection: {
    title: "La conversation continue ici.",
    intro:
      "Un seul atelier, accessible depuis votre assistant, l’API et cet espace.",
    endpoint: "Adresse du serveur MCP",
    copy: "Copier l’adresse",
    copied: "Adresse copiée",
    copyError:
      "La copie n’est pas disponible. Sélectionnez et copiez l’adresse.",
    scopeTitle: "Une autorisation, des limites explicites.",
    scopeBody:
      "Par défaut, vous approuvez chaque version dans Guteneo. Le mode expert, activé volontairement dans Mon compte pour un assistant, permet aussi la confirmation dans votre conversation, dans les limites de votre délégation.",
    clients: "Compatibilité des assistants",
    client: "Assistant",
    validation: "Validation dans un vrai client",
    file: "Transfert de fichier",
    notVerified: "Non vérifié dans un vrai client",
    chatgptFile:
      "Adaptateur de fichier ChatGPT ; essai en conversation requis.",
    claudeFile: "Rendu HTML commun ; transfert de PDF à valider.",
    cursorFile:
      "Adaptateur local limité au projet ; aucun accès distant aux chemins locaux.",
    steps: [
      "Ajoutez le serveur MCP dans votre assistant compatible.",
      "Connectez votre compte et autorisez uniquement les scopes nécessaires.",
      "Préparez une lettre, ouvrez son aperçu et approuvez la version.",
      "Demandez le suivi avec son identifiant Guteneo.",
    ],
    diagnostics: "État du service",
    localNote:
      "Une URL locale n’est pas accessible à un assistant distant. Les essais OAuth réels nécessitent un serveur HTTPS configuré.",
    permissions:
      "Documents : lecture et import · Envois : préparation, confirmation autorisée et suivi",
    credentials: "Configuration de l’environnement",
    authorized: "Connexions autorisées",
    noConnections: "Aucun assistant autorisé pour ce compte.",
    revoke: "Révoquer l’accès",
    clientId: "Identifiant du client OAuth",
    bind: "Associer cet assistant à mon organisation",
    bindHelp:
      "Utilisez l’identifiant exact du client communiqué par votre administrateur. Cette association exige une nouvelle connexion dans l’assistant.",
    rebound:
      "Association enregistrée. Reconnectez l’assistant pour obtenir une nouvelle autorisation.",
  },
  senders: {
    title: "Qui prend la plume ?",
    intro:
      "Chaque canal utilise un expéditeur autorisé, propre à votre organisation.",
    empty: "Aucun profil d’expéditeur configuré.",
    note: "Les profils de simulation ne permettent aucun envoi réel. Pour le courrier, un administrateur déclare l’expéditeur autorisé de l’organisation. Les autres canaux conservent leur vérification propre.",
    profile: "Profil",
    address: "Adresse d’émission",
    verified: "Vérifié",
    unverified: "À vérifier",
    unavailable: "Profil non activé",
  },
  postalSetup: {
    title: "Activer le courrier postal",
    intro:
      "Déclarez l’expéditeur de votre organisation pour préparer vos lettres.",
    name: "Nom de l’expéditeur",
    address: "Adresse postale de l’expéditeur",
    addressHint: "Indiquez la rue, le code postal, la ville et le pays.",
    declaration:
      "Je suis autorisé à utiliser ce nom et cette adresse pour les courriers de mon organisation.",
    declarationNote:
      "Cette déclaration est enregistrée sous votre responsabilité d’administrateur. Elle ne constitue pas une vérification physique de l’adresse.",
    documentNote:
      "L’adresse n’est pas ajoutée au PDF. Vérifiez les informations imprimées dans votre document avant chaque envoi.",
    submit: "Activer le courrier",
    submitting: "Activation du courrier…",
    renew: "Actualiser la configuration postale",
    noSend:
      "Cette activation ne transmet aucun document et n’expédie aucune lettre. Vous vérifierez le PDF, le destinataire et le devis avant l’envoi.",
    ready: "Votre expéditeur postal est prêt",
    readyBody:
      "Vous pouvez importer votre PDF puis préparer un courrier dans l’atelier.",
    prepare: "Préparer un courrier",
    declared: "Déclaré par l’administrateur",
    submittedInChat: "Renseigné dans la conversation",
    managed: "Expéditeur configuré",
    adminNeeded:
      "Un administrateur de votre organisation doit déclarer l’expéditeur pour activer le courrier.",
    stopped: "Le courrier est arrêté pour votre organisation.",
    stoppedBody:
      "Un administrateur peut consulter le contrôle du canal dans l’administration. Cette page ne réactive pas un canal arrêté.",
    administration: "Ouvrir l’administration",
    unavailable:
      "L’activation du courrier est temporairement indisponible. Réessayez plus tard.",
    restricted:
      "Cette configuration postale ne peut pas être activée ici. Contactez l’administrateur de votre organisation ; une nouvelle déclaration ne peut pas lever cette restriction.",
    saved: "Le courrier est activé pour votre organisation.",
    required: "Déclarez d’abord l’expéditeur postal de votre organisation.",
    setupLink: "Activer le courrier dans les expéditeurs",
    quote: "Prix du courrier HT",
    quoteNote:
      "Prix du courrier hors taxes, fixé en euros pour ce PDF, ce destinataire et les options du devis. Il sera déduit de vos crédits lors de l’acceptation par le prestataire.",
  },
  usage: {
    title: "Chaque envoi compte.",
    intro:
      "Réservations et consommations de votre organisation. Les crédits de simulation restent séparés.",
    reserved: "Réservé",
    consumed: "Confirmé",
    released: "Libéré",
    limit: "Plafond",
    empty: "Aucune consommation enregistrée.",
    quota: "Quotas et crédits",
    note: "Une soumission incertaine conserve sa réservation jusqu’à sa résolution. Les frais réels dépendent du prestataire et ne sont pas des prix commerciaux.",
  },
  admin: {
    title: "L’atelier sous surveillance.",
    intro:
      "Comprenez les incidents avant d’agir. Les soumissions incertaines ne sont jamais relancées à l’aveugle.",
    refresh: "Actualiser le diagnostic",
    state: "Diagnostic opérationnel",
    uncertain: "Envois à rapprocher",
    failed: "Échecs à examiner",
    outbox: "Publications en attente",
    health: "Connecteurs",
    noIncidents: "Aucun incident dans les envois affichés.",
    note: "Les actions de reprise d’un envoi potentiellement accepté exigent un rapprochement avec le prestataire.",
    restricted: "Cet écran nécessite un rôle d’administration.",
    deadLetters: "Messages en file d’échec",
    noDeadLetters: "Aucun message en file d’échec pour cette organisation.",
    queue: "File",
    inspectJob: "Examiner l’envoi",
    channelControls: "Interrupteurs des canaux",
    enabled: "Canal ouvert",
    paused: "Canal suspendu",
    pause: "Suspendre",
    resume: "Réactiver",
    controlsHelp:
      "Suspendre bloque les prochaines soumissions de votre organisation. Les envois déjà acceptés par un prestataire restent à rapprocher.",
  },
  statuses: {
    verified: "Vérifié",
    revoked: "Révoqué",
    prepared: "À approuver",
    draft: "Brouillon",
    approved: "Approuvé",
    accepted: "Accepté par le prestataire",
    queued: "En file",
    submitting: "Soumission en cours",
    submitted: "Accepté par le prestataire",
    sending: "Transmission en cours",
    delivered: "Livré",
    email_delivered: "Remis au serveur destinataire",
    fax_delivered: "Fax transmis",
    dispatched: "Remis à la poste",
    printed: "Imprimé",
    postal_dispatched: "Remis à la poste",
    handed_over: "Remis à la poste",
    handed_to_post: "Remis à la poste",
    frozen: "Liste figée",
    failed: "Échec",
    rejected: "Refusé",
    canceled: "Annulé",
    cancelled: "Annulé",
    cancellation_requested: "Annulation demandée",
    submission_unknown: "Soumission incertaine",
    reconciliation_required: "Rapprochement nécessaire",
    pending: "En attente",
    ready: "Disponible",
    clean: "Contrôlé",
    quarantined: "À vérifier",
    quarantine: "À vérifier",
    purged: "Indisponible",
    blocked: "Bloqué",
    bounced: "Rejeté par le destinataire",
    complained: "Plainte reçue",
    suppressed: "Destinataire exclu",
    materializing: "Préparation des destinataires",
    active: "Actif",
    simulation: "Simulation",
  } as Record<string, string>,
};
