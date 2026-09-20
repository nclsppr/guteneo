import type { ReactNode } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { Brand } from "./brand";
import { LegalLinks } from "./legal-links";
import "./legal-page.css";

type InformationPageContent = {
  label: string;
  title: ReactNode;
  description: string;
  sections: { id: string; label: string; content: ReactNode }[];
};

const contact = <a href="mailto:guteneo@pieper.fr">guteneo@pieper.fr</a>;

export const informationPages: Record<string, InformationPageContent> = {
  "/confidentialite/": {
    label: "Confidentialité",
    title: (
      <>
        Vos données, <em>vos droits.</em>
      </>
    ),
    description:
      "Les données utilisées par Guteneo, leurs destinataires, leur conservation et les moyens d’exercer vos droits.",
    sections: [
      {
        id: "responsable",
        label: "Qui vous répond",
        content: (
          <>
            <h2>Qui vous répond</h2>
            <p>
              Nicolas Pieper est responsable des traitements nécessaires au
              fonctionnement de Guteneo : comptes, accès, préparation et suivi
              des envois, sécurité et assistance. Vous pouvez le joindre à{" "}
              {contact}, ou par courrier au 59 rue du général de Gaulle, 57330
              Hettange-Grande, France.
            </p>
            <p>
              Cette politique couvre le site et le service Guteneo, y compris
              ses connexions aux assistants. Si une organisation vous donne
              accès à son compte ou fournit vos coordonnées dans un document,
              elle demeure responsable des finalités de cette utilisation. Elle
              est votre premier interlocuteur pour le contenu qu’elle confie au
              service ; nous pouvons vous aider à identifier la demande
              concernée.
            </p>
          </>
        ),
      },
      {
        id: "donnees",
        label: "Les données utilisées",
        content: (
          <>
            <h2>Les données utilisées</h2>
            <ul>
              <li>
                <strong>Compte et connexions :</strong> identité et adresse
                électronique, appartenance au compte, rôle, connexions à des
                assistants, permissions, sessions et éventuels mandats de
                délégation.
              </li>
              <li>
                <strong>Documents :</strong> PDF transmis ou importés à votre
                demande, nom, taille, nombre de pages, empreinte du fichier et
                résultat des contrôles. Un contenu fourni pour créer un PDF, ses
                rendus et les images de pages demandées peuvent aussi être
                traités.
              </li>
              <li>
                <strong>Envois :</strong> expéditeur, destinataire, canal,
                options, devis, plafond, approbation ou délégation utilisée,
                statut, événements et référence du prestataire.
              </li>
              <li>
                <strong>Fonctionnement :</strong> crédit et réservations,
                consommation, traces d’accès et de sécurité, données techniques
                de connexion et échanges avec l’assistance.
              </li>
            </ul>
            <p>
              Ces données proviennent de vous, des membres autorisés du compte,
              de l’assistant que vous connectez ou du prestataire qui retourne
              un statut. Guteneo reçoit les paramètres et fichiers transmis à
              ses outils ; connecter un assistant ne lui donne pas accès à toute
              votre conversation. Les informations retournées à cet assistant
              deviennent néanmoins accessibles à ce service selon ses propres
              règles.
            </p>
            <p>
              Les données de compte nécessaires à l’authentification et les
              informations exigées pour l’envoi sont indispensables à ces
              fonctions. Sans elles, la connexion ou l’envoi ne peut pas
              aboutir. Fournissez seulement les données utiles et assurez-vous
              de pouvoir utiliser les documents et coordonnées de tiers.
            </p>
            <p>
              Dans le connecteur ChatGPT, ne transmettez pas de données de carte
              de paiement soumises à PCI DSS, de données de santé protégées,
              d’identifiants gouvernementaux ni de secrets d’authentification.
              Les données personnelles sensibles ne sont pas admises dans ce
              parcours de la bêta. Un contrôle antivirus ne constitue pas un
              filtre de ces catégories.
            </p>
          </>
        ),
      },
      {
        id: "finalites",
        label: "Pourquoi et sur quelle base",
        content: (
          <>
            <h2>Pourquoi et sur quelle base</h2>
            <p>
              La création du compte et l’exécution des fonctions que vous
              demandez reposent sur l’exécution du service : importer un
              document, le contrôler, établir un devis, recueillir
              l’autorisation, transmettre l’envoi et en restituer le suivi.
            </p>
            <p>
              La prévention des abus, la protection des accès, le diagnostic des
              incidents et la conservation des éléments nécessaires à une
              contestation reposent sur l’intérêt légitime à exploiter un
              service sûr et à défendre les droits des personnes concernées.
              Pour les coordonnées de destinataires fournies par un utilisateur,
              cet intérêt comprend l’acheminement de sa correspondance
              autorisée. Vous pouvez vous opposer à ces traitements dans les
              conditions prévues par la réglementation.
            </p>
            <p>
              Les demandes d’exercice de droits et les obligations légales
              applicables sont traitées pour respecter ces obligations. Une
              approbation d’envoi ou un mandat technique n’est pas un
              consentement général à réutiliser vos données pour d’autres
              finalités.
            </p>
            <p>
              Les contrôles de document, de droits, de crédit et de destination
              peuvent bloquer automatiquement une opération. Vous pouvez
              demander une explication à l’assistance. Guteneo n’utilise pas ces
              contrôles pour établir un profil publicitaire.
            </p>
          </>
        ),
      },
      {
        id: "destinataires",
        label: "Avec qui elles sont partagées",
        content: (
          <>
            <h2>Avec qui elles sont partagées</h2>
            <p>
              Les membres autorisés de votre compte accèdent aux informations
              selon leurs droits. L’éditeur peut traiter les informations
              nécessaires à l’assistance, à la sécurité et à l’exploitation. Les
              prestataires interviennent uniquement pour les fonctions
              concernées :
            </p>
            <ul>
              <li>
                <strong>Cloudflare :</strong> hébergement du site et du service,
                base de données, stockage de fichiers, traitements techniques et
                sécurité.
              </li>
              <li>
                <strong>Auth0 :</strong> authentification et gestion de la
                connexion.
              </li>
              <li>
                <strong>Telnyx :</strong> document et informations nécessaires à
                un fax lorsque ce canal est disponible et l’envoi autorisé.
              </li>
              <li>
                <strong>Pingen et les opérateurs postaux concernés :</strong>{" "}
                préparation, impression et acheminement du courrier. Le
                transfert d’un brouillon chez Pingen peut précéder l’ordre
                d’envoi ; il exige son autorisation distincte.
              </li>
              <li>
                <strong>Votre assistant connecté, par exemple ChatGPT :</strong>{" "}
                résultats des outils, métadonnées, contenu ou pages de document
                demandés, selon les permissions accordées.
              </li>
            </ul>
            <p>
              Le destinataire final reçoit naturellement la correspondance
              autorisée. L’envoi d’e-mails par Guteneo et les achats de crédit
              ne sont pas ouverts dans cette version de la bêta.
            </p>
            <p>
              Les bases et le stockage de documents Guteneo utilisent les
              options de juridiction européenne de Cloudflare. Cela ne garantit
              pas que tous les traitements de Cloudflare, Auth0, des
              prestataires d’envoi ou de l’assistant restent dans l’Union
              européenne. Leur intervention peut impliquer d’autres pays,
              notamment les États-Unis. Pour connaître les lieux et garanties de
              transfert applicables à votre utilisation et obtenir les
              informations disponibles sur ces garanties, contactez {contact}.
              Aucune localisation européenne intégrale n’est annoncée.
            </p>
          </>
        ),
      },
      {
        id: "conservation",
        label: "Combien de temps",
        content: (
          <>
            <h2>Combien de temps</h2>
            <p>
              <strong>PDF stockés par Guteneo :</strong> leur suppression
              automatique devient possible 90 jours après leur création. Elle
              intervient lors d’un passage de maintenance, lorsque plus aucun
              envoi associé n’est en cours ou dans un état encore non résolu. Un
              envoi ouvert peut donc prolonger cette conservation. Ce mécanisme
              n’est pas une garantie de suppression à la minute ou au jour près
              ; conservez votre propre original.
            </p>
            <p>
              La suppression du fichier n’efface pas automatiquement toutes ses
              métadonnées ni l’historique de l’envoi. Les références, statuts,
              approbations, mouvements de crédit et éléments d’audit sont
              conservés pour gérer les opérations, répondre aux demandes et
              établir ce qui s’est passé en cas de contestation. Leur nécessité
              est examinée lors d’une demande de suppression ou de clôture : les
              éléments devenus inutiles sont supprimés ou anonymisés ; une
              obligation applicable, une opération non résolue ou un litige peut
              justifier une conservation limitée aux éléments concernés et à sa
              durée nécessaire.
            </p>
            <p>
              Les données de compte sont conservées pendant son utilisation,
              puis selon ces mêmes besoins résiduels à sa clôture. Les demandes
              d’assistance sont conservées jusqu’à leur résolution, puis
              seulement si leur suivi ou une contestation le nécessite. Il
              n’existe pas actuellement de suppression complète du compte en
              libre-service : adressez votre demande à {contact}.
            </p>
            <p>
              Les sessions et autorisations temporaires ont une date
              d’expiration ; la maintenance nettoie les entrées expirées. Les
              compteurs journaliers de consultation de contenu sont nettoyés
              au-delà de 31 jours. Une copie déjà transmise à un destinataire, à
              un assistant ou à un prestataire suit aussi ses propres règles de
              conservation ; supprimer le fichier chez Guteneo ne rappelle pas
              un envoi.
            </p>
          </>
        ),
      },
      {
        id: "cookies",
        label: "Cookies et sécurité",
        content: (
          <>
            <h2>Cookies et sécurité</h2>
            <p>
              La connexion utilise des cookies de session et de protection du
              parcours d’authentification. Le navigateur peut aussi mémoriser
              votre préférence de connexion à un assistant. L’application
              n’intègre pas de traceur publicitaire. Les fournisseurs
              d’authentification et de sécurité peuvent traiter les informations
              techniques nécessaires à leurs fonctions.
            </p>
            <p>
              L’accès au service est contrôlé par le compte, les rôles et les
              permissions. Les accès temporaires aux documents expirent et les
              PDF sont soumis aux contrôles configurés avant leur utilisation.
              Ces mesures réduisent les risques sans rendre tout incident
              impossible. N’envoyez pas de mot de passe, de jeton d’accès ni de
              secret à l’assistance.
            </p>
            <p>
              L’aperçu public de démonstration utilise des données fictives dans
              la mémoire de l’onglet ; il ne transmet aucun courrier. Il est
              distinct du compte connecté et de ses documents persistants.
            </p>
          </>
        ),
      },
      {
        id: "droits",
        label: "Exercer vos droits",
        content: (
          <>
            <h2>Exercer vos droits</h2>
            <p>
              Vous pouvez demander l’accès, la rectification, l’effacement ou la
              limitation du traitement de vos données, ainsi que leur
              portabilité lorsqu’elle s’applique. Vous pouvez vous opposer à un
              traitement fondé sur l’intérêt légitime pour des raisons tenant à
              votre situation. Ces droits peuvent être limités par les droits
              d’autres personnes, une obligation légale ou la nécessité de
              régler une opération ou une contestation.
            </p>
            <p>
              Écrivez à {contact} en précisant votre demande et le compte
              concerné. Une information complémentaire d’identité ne sera
              demandée qu’en cas de doute raisonnable, de manière proportionnée.
              Une réponse est apportée dans un délai d’un mois ; en cas de
              demande complexe ou de demandes nombreuses, une prolongation
              maximale de deux mois peut être nécessaire et vous sera expliquée
              durant le premier mois.
            </p>
            <p>
              Vous pouvez consulter les{" "}
              <a href="https://www.cnil.fr/fr/les-droits-pour-maitriser-vos-donnees-personnelles">
                explications de la CNIL sur vos droits
              </a>{" "}
              et{" "}
              <a href="https://www.cnil.fr/fr/adresser-une-plainte">
                adresser une réclamation à la CNIL
              </a>
              . Cette politique sera actualisée si le service ou ses traitements
              évoluent.
            </p>
          </>
        ),
      },
    ],
  },
  "/conditions/": {
    label: "Conditions d’utilisation",
    title: (
      <>
        Un cadre <em>pour vos envois.</em>
      </>
    ),
    description:
      "Conditions d’utilisation de la bêta Guteneo : accès, documents, autorisations, crédit d’essai et limites des envois.",
    sections: [
      {
        id: "service",
        label: "La bêta",
        content: (
          <>
            <h2>Le service et sa bêta</h2>
            <p>
              Guteneo est un service indépendant édité par Nicolas Pieper pour
              préparer, autoriser et suivre des envois de documents depuis son
              atelier ou un assistant connecté. Ses coordonnées figurent dans
              les <a href="/mentions-legales/">mentions légales</a>. Les
              présentes conditions décrivent la bêta accessible actuellement.
            </p>
            <p>
              Le fax et le courrier postal sont disponibles selon les droits du
              compte, les destinations, les limites et les prestataires
              configurés. Une fonction visible n’est pas une garantie que toute
              destination est ouverte. L’envoi d’e-mails et l’achat de crédit
              sont désactivés. Les démonstrations et simulations utilisent des
              résultats fictifs et n’établissent aucune preuve d’acheminement
              réel.
            </p>
            <p>
              La bêta peut évoluer, être interrompue pour maintenance ou être
              limitée pour traiter un incident. Aucun délai de disponibilité,
              d’assistance ou d’acheminement n’est garanti. Une modification
              importante de ces conditions sera indiquée sur cette page et,
              lorsqu’elle affecte l’utilisation du compte, portée à votre
              attention dans le service ou par un moyen adapté.
            </p>
          </>
        ),
      },
      {
        id: "compte",
        label: "Votre compte",
        content: (
          <>
            <h2>Votre compte et vos documents</h2>
            <p>
              Utilisez une identité et des coordonnées exactes. Protégez vos
              accès, accordez seulement les permissions utiles et signalez un
              accès non autorisé à {contact}. Les administrateurs gèrent les
              membres et les connexions de leur compte.
            </p>
            <p>
              Vous devez disposer du droit de transmettre le document et
              d’utiliser les coordonnées du destinataire. Vérifiez le contenu,
              les pages, l’expéditeur, le destinataire et les options avant
              approbation. Il est interdit d’utiliser Guteneo pour des contenus
              illicites, la fraude, le harcèlement, l’usurpation d’identité, des
              envois non autorisés ou pour contourner les contrôles du service.
            </p>
            <p>
              Le parcours ChatGPT exclut les données personnelles sensibles, les
              données de santé protégées, les identifiants gouvernementaux, les
              données de carte de paiement soumises à PCI DSS et les secrets
              d’authentification. N’importez pas de document qui en contient
              dans ce connecteur.
            </p>
            <p>
              La déclaration d’un expéditeur postal atteste que vous êtes
              autorisé à utiliser cette identité et cette adresse ; elle ne
              constitue pas une vérification physique de l’adresse. Les
              contrôles techniques d’un PDF ne certifient ni l’exactitude, ni la
              légalité, ni l’authenticité de son contenu.
            </p>
            <p>
              Conservez vos originaux et les éléments dont vous avez besoin.
              Guteneo n’est pas un service d’archivage permanent. Les règles de
              traitement et de conservation figurent dans la{" "}
              <a href="/confidentialite/">politique de confidentialité</a>.
            </p>
          </>
        ),
      },
      {
        id: "autorisation",
        label: "Autoriser un envoi",
        content: (
          <>
            <h2>Autoriser un envoi</h2>
            <p>
              La préparation d’un document ou d’un devis ne vaut pas ordre
              d’envoi. L’autorisation porte sur le document exact, son
              destinataire, les options et le coût ou plafond présenté. Une
              modification de ces éléments ou l’expiration du devis peut
              nécessiter une nouvelle autorisation. Vérifiez également les
              indications de taxe et de devise du devis.
            </p>
            <p>
              Par défaut, la validation se fait par une personne dans le
              parcours prévu. Un administrateur authentifié peut, dans le
              navigateur, donner à un assistant un mandat distinct, limité et
              temporaire. Les opérations effectuées dans ses limites sont
              enregistrées comme une approbation déléguée, pas comme une
              nouvelle validation humaine. L’assistant ne peut pas activer ni
              prolonger lui-même ce mandat. Les confirmations demandées par
              votre assistant et les limites du service continuent de
              s’appliquer.
            </p>
            <p>
              Le transfert d’un brouillon postal au prestataire demande son
              autorisation propre, même avant l’impression ou l’acheminement.
              Connecter un assistant ou lui donner accès à vos documents ne
              l’autorise pas à lui seul à envoyer une correspondance.
            </p>
          </>
        ),
      },
      {
        id: "credit",
        label: "Crédit et coûts",
        content: (
          <>
            <h2>Crédit et coûts</h2>
            <p>
              La bêta peut attribuer un crédit d’essai selon les conditions
              affichées dans votre compte. Ce crédit sert aux opérations
              éligibles ; il ne constitue pas une somme déposée, un moyen de
              paiement général ou une somme remboursable en espèces. Aucun
              rechargement payant n’est proposé dans cette version.
            </p>
            <p>
              Le devis et le plafond applicables sont présentés avant
              l’autorisation. Une réservation de crédit peut être créée au
              moment de l’acceptation, puis régularisée selon le résultat de
              l’opération. Un état en attente ou incertain peut retarder cette
              régularisation ; contactez l’assistance pour une différence ou une
              réservation qui vous paraît anormale.
            </p>
          </>
        ),
      },
      {
        id: "suivi",
        label: "Suivi et annulation",
        content: (
          <>
            <h2>Suivi, annulation et limites</h2>
            <p>
              L’acceptation par Guteneo, l’acceptation par un prestataire et la
              remise au destinataire sont des étapes distinctes. Les statuts
              dépendent des informations du prestataire et peuvent arriver avec
              retard. La remise d’une lettre à l’opérateur postal n’atteste pas
              à elle seule sa réception par le destinataire.
            </p>
            <p>
              Une annulation n’est possible que tant que l’état de l’envoi le
              permet. Une correspondance déjà transmise peut ne plus être
              rappelable. Si le résultat est inconnu, ne recommencez pas l’envoi
              : vérifiez le suivi ou contactez l’assistance afin d’éviter un
              doublon.
            </p>
            <p>
              Le service ne garantit pas qu’un fax ou un courrier soit admis
              pour une démarche particulière, reçu avant une échéance, lu, ou
              doté d’une valeur de recommandé ou de signature électronique.
              Vérifiez les exigences du destinataire et choisissez une solution
              adaptée aux délais ou formalités de votre démarche.
            </p>
          </>
        ),
      },
      {
        id: "assistance",
        label: "Assistance et clôture",
        content: (
          <>
            <h2>Assistance, suspension et clôture</h2>
            <p>
              Pour un incident, une contestation ou une demande de clôture,
              écrivez à {contact}. La page <a href="/support/">assistance</a>{" "}
              précise les informations utiles. Les données encore nécessaires au
              règlement d’une opération ou d’un litige suivent les règles de
              conservation expliquées dans la politique de confidentialité.
            </p>
            <p>
              Un accès ou une opération peut être suspendu en cas de risque de
              sécurité, d’abus, d’utilisation illicite ou de non-respect de ces
              conditions. Lorsque cela est possible sans compromettre la
              sécurité ou une obligation applicable, le motif vous est expliqué
              et vous pouvez le contester auprès de l’assistance.
            </p>
            <p>
              Ces conditions ne retirent aucun droit impératif que vous
              reconnaît la loi et n’excluent pas une responsabilité qui ne peut
              légalement l’être. Pour toute difficulté, nous vous invitons à
              nous contacter afin de rechercher une solution.
            </p>
          </>
        ),
      },
    ],
  },
  "/support/": {
    label: "Assistance",
    title: (
      <>
        Besoin <em>d’un coup de main ?</em>
      </>
    ),
    description:
      "Contactez l’assistance Guteneo pour un document, un envoi, une connexion ou une demande relative à vos données.",
    sections: [
      {
        id: "contact",
        label: "Nous écrire",
        content: (
          <>
            <h2>Nous écrire</h2>
            <p>
              Pour une question, un incident ou une demande sur votre compte,
              écrivez à <a href="mailto:guteneo@pieper.fr">guteneo@pieper.fr</a>
              . Votre interlocuteur est Nicolas Pieper, éditeur de Guteneo.
            </p>
            <p>
              Indiquez l’adresse du compte concerné, la référence du document ou
              de l’envoi, la date approximative, l’action tentée et le message
              d’erreur. Une capture masquant les données personnelles peut
              aider. Ne joignez pas le PDF original, les coordonnées complètes
              du destinataire ou d’autres données sensibles au premier message
              si ces éléments ne sont pas nécessaires. N’envoyez jamais de mot
              de passe, de code de connexion ou de jeton d’accès.
            </p>
            <p>
              La bêta ne propose pas d’assistance d’urgence ni de délai de
              réponse garanti pour les demandes techniques. Si votre démarche
              comporte une échéance impérative, prévoyez un autre moyen adapté.
            </p>
          </>
        ),
      },
      {
        id: "document",
        label: "Un PDF refusé",
        content: (
          <>
            <h2>Un PDF refusé ou indisponible</h2>
            <p>
              Vérifiez que le fichier est un PDF lisible et que sa taille et son
              nombre de pages respectent les limites indiquées par le service.
              Pour une importation par lien, le document doit être accessible
              par une adresse HTTPS publique autorisée ; un lien vers un fichier
              local ou nécessitant une connexion ne convient pas.
            </p>
            <p>
              Attendez la fin des contrôles avant de préparer l’envoi. Si un
              document est bloqué ou n’est plus conservé, le suivi peut rester
              visible sans que son fichier soit disponible. Conservez toujours
              votre original et signalez le code d’erreur à l’assistance si le
              blocage persiste.
            </p>
          </>
        ),
      },
      {
        id: "envoi",
        label: "Un envoi en attente",
        content: (
          <>
            <h2>Un envoi en attente ou un crédit réservé</h2>
            <p>
              Consultez d’abord le détail de l’envoi dans votre compte ou
              demandez son suivi à votre assistant. Un devis ou un brouillon
              n’est pas un envoi ; une acceptation n’est pas encore une remise
              au destinataire.
            </p>
            <p>
              Si le résultat est inconnu, ne relancez pas une seconde fois.
              Transmettez la référence à l’assistance pour éviter les doublons.
              Indiquez aussi cette référence si une réservation de crédit reste
              ouverte ou si le montant ne correspond pas au devis approuvé. Les
              achats et rechargements payants ne sont pas ouverts.
            </p>
          </>
        ),
      },
      {
        id: "connexion",
        label: "Assistant et permissions",
        content: (
          <>
            <h2>Assistant et permissions</h2>
            <p>
              Les <a href="/assistants/">guides de connexion</a> présentent les
              étapes propres à chaque assistant. Vérifiez le compte Guteneo
              utilisé et les permissions accordées. Une connexion réussie ne
              rend pas automatiquement tous les canaux ou toutes les
              destinations disponibles.
            </p>
            <p>
              Un administrateur peut examiner les connexions et les mandats dans
              les réglages du compte. Révoquez une connexion ou une délégation
              devenue inutile. Si vous soupçonnez un accès non autorisé,
              indiquez-le explicitement à l’assistance et protégez également le
              compte de votre fournisseur d’identité.
            </p>
          </>
        ),
      },
      {
        id: "donnees",
        label: "Vos données et vos droits",
        content: (
          <>
            <h2>Vos données et vos droits</h2>
            <p>
              Pour consulter, corriger ou supprimer vos données, demander la
              clôture du compte ou signaler un incident de confidentialité,
              écrivez à {contact}. Précisez votre demande ; une pièce d’identité
              n’est pas demandée systématiquement.
            </p>
            <p>
              La{" "}
              <a href="/confidentialite/#droits">
                politique de confidentialité
              </a>{" "}
              explique les droits, les délais de réponse applicables et la
              conservation des documents. Les{" "}
              <a href="/conditions/">conditions d’utilisation</a> décrivent les
              autorisations, le crédit d’essai et les limites du service.
            </p>
          </>
        ),
      },
    ],
  },
};

export function InformationPage({
  content,
}: {
  content: InformationPageContent;
}) {
  return (
    <div className="legal-page">
      <a className="skip-link" href="#information-content">
        Aller au contenu
      </a>
      <header className="site-header">
        <Brand />
        <a className="legal-back" href="/">
          <ArrowLeft size={18} aria-hidden="true" /> Retour à l’accueil
        </a>
      </header>
      <main id="information-content" className="legal-document" tabIndex={-1}>
        <div className="legal-intro">
          <p className="legal-label">{content.label}</p>
          <h1>{content.title}</h1>
          <p>{content.description}</p>
          <p className="legal-date">Mise à jour le 21 septembre 2026</p>
        </div>
        <div className="legal-layout">
          <nav aria-label="Sur cette page" className="legal-index">
            {content.sections.map((section) => (
              <a href={`#${section.id}`} key={section.id}>
                {section.label}
              </a>
            ))}
          </nav>
          <div className="legal-copy">
            {content.sections.map((section) => (
              <section id={section.id} tabIndex={-1} key={section.id}>
                {section.content}
              </section>
            ))}
          </div>
        </div>
      </main>
      <footer className="legal-colophon">
        <Brand variant="simple" compact />
        <LegalLinks />
      </footer>
    </div>
  );
}
