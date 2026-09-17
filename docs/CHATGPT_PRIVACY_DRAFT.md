# Données du connecteur — brouillon factuel de travail

**Document de travail du 17 septembre 2026, versionné pour révision et non adopté comme politique.** Il rassemble les observations du code et les points que l’éditeur doit préciser. Ce n’est ni une analyse juridique, ni une preuve de conformité, ni un inventaire contractuel des sous-traitants. Ne pas fournir son chemin GitHub comme URL de politique dans le portail.

## Éditeur et catégories

La page légale identifie Nicolas Pieper comme éditeur, avec **guteneo@pieper.fr**, et annonce une activité non immatriculée. Le responsable des traitements, les bases juridiques, coordonnées et conditions applicables doivent être confirmés avant adoption.

| Données observées                                                        | Usage                                                   | Source                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------- |
| Identité, nom/profil, e-mail vérifié, organisation, appartenance et rôle | Connexion et contrôle d’accès                           | `apps/api/src/auth.ts`, `account.ts`                                |
| Connexions OAuth, permissions, sessions et mandats limités               | Autorisation, révocation et limites de délégation       | `auth.ts`, `account.ts`, `expert-status.ts`                         |
| PDF original, nom, taille, empreinte, pages, source et analyse           | Conservation exacte, antivirus, lecture et préparation  | `apps/api/src/documents.ts`, `mcp.ts`                               |
| HTML explicitement fourni et images de pages                             | Génération demandée d’un PDF et revue du document exact | `documents.ts`, `expert-review-pages.ts`                            |
| Destinataire, expéditeur, canal, options, devis, plafond et approbation  | Préparation, transmission autorisée et suivi            | `packages/domain/src/index.ts`, `apps/api/src/live-providers.ts`    |
| Solde, réservation, consommation, événements et références d’envoi       | Dépense, rapprochement et preuve                        | `packages/domain/src/live-fax-usage.ts`, `apps/api/src/webhooks.ts` |
| Audit et données techniques de sécurité                                  | Diagnostic, limitation d’abus et fonctionnement         | `maintenance.ts`, `auth.ts`, `packages/observability/src/index.ts`  |

Le MCP utilise les fichiers/paramètres explicitement transmis à ses outils, pas l’historique complet de conversation. Les lectures peuvent retourner au client les métadonnées, pages demandées et informations pertinentes d’envoi. Ces transferts doivent être expliqués avant connexion et collecte.

Les mots de passe sont saisis chez le fournisseur d’identité ; les outils ne les demandent pas au modèle. Les règles du projet interdisent les logs de secrets, jetons, contenus, destinataires et URLs signées. Ce principe ne prouve pas à lui seul l’absence de conservation technique par les services externes.

## Services techniques à décrire

- **Cloudflare** héberge application, D1, R2, files et services privés d’analyse/rendu. D1/R2 sont configurés en juridiction UE ; cela ne prouve pas la localisation de tous les traitements, logs et sauvegardes.
- **Auth0**, autorité `https://pieper.eu.auth0.com`, traite authentification/OAuth. Le nom d’hôte ne remplace pas l’examen de ses contrats, transferts et durées.
- **Client connecté, dont ChatGPT/OpenAI** : transmet les éléments choisis et reçoit les résultats autorisés. Ses propres conditions/pratiques doivent être distinguées.
- **Telnyx** reçoit les éléments nécessaires au fax autorisé. Seul le fax était actif lors de l’observation.
- **Pingen** peut recevoir un PDF et paramètres pour un brouillon postal sous autorité séparée. Envoi postal désactivé ne signifie pas absence de transfert de préparation.
- **Amazon SES** est configuré, mais l’envoi e-mail observé est inactif. Décrire exactement les fonctions ouvertes à la date de publication.

Rôles juridiques, contrats, sous-traitants ultérieurs, transferts et garanties restent à établir. Cette liste technique n’atteste pas leur qualification contractuelle. Stripe n’était pas configuré pour facturer ; une future activation exigerait une description adaptée.

## Durées constatées dans le code

| Données                                      | Mécanisme                                                                                                                                           | Limite                                                                                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Octets PDF                                   | Sélection après 90 jours ou statut `purged`, lots bornés ; suppression R2 et remplacement du nom si aucun envoi non terminal ne retient le document | Pas de garantie au 90e jour exact. Historique/métadonnées et audit restent ; les envois non terminés et la maintenance peuvent prolonger la conservation. |
| Objets R2 orphelins                          | Inspection bornée des objets âgés de plus de 24 h                                                                                                   | Seuls les objets sans document correspondant sont supprimés.                                                                                              |
| Compteurs `content_usage`                    | Nettoyage des journées antérieures au seuil de 31 jours                                                                                             | Ne couvre ni PDF ni tous les journaux.                                                                                                                    |
| Sessions navigateur                          | Session créée pour une heure, nettoyage après expiration                                                                                            | Déconnexion/révocation n’efface pas le métier.                                                                                                            |
| Transactions auth et jetons de développement | Suppression à expiration                                                                                                                            | Les jetons de développement ne constituent pas une authentification de production.                                                                        |
| `auth_flow_limits`                           | Nettoyage borné au-delà de 48 fenêtres horaires                                                                                                     | Ne couvre pas les logs externes.                                                                                                                          |
| Autorisations temporaires de document        | Expiration contrôlée et nettoyage borné                                                                                                             | Expiration du lien n’efface pas le PDF.                                                                                                                   |

Sources : `apps/api/src/maintenance.ts`, `auth.ts`, `live-providers.ts`. Ces seuils ne démontrent pas une exécution effective sur toutes les données réelles.

**Durées non établies ici :** comptes/profils, organisations, destinataires conservés dans les envois, historique des mandats et approbations, audit, comptabilité, callbacks, sauvegardes et journaux externes. Aucune purge automatique générale de ces ensembles n’a été qualifiée. L’éditeur doit fixer des durées ou critères justifiés et un processus ; ne pas inventer de durée légale ou contractuelle.

## Contrôles et demandes

Le compte permet de consulter/modifier certains éléments du profil, révoquer sessions/connexions et désactiver un mandat. La révocation bloque de nouvelles actions selon les contrôles serveur ; elle n’annule pas un fax accepté ni n’efface ses preuves. Aucun bouton de suppression intégrale du compte n’a été qualifié. Les demandes peuvent être adressées au contact publié ; procédure, contrôle d’identité, délais et recours restent à préciser par l’éditeur.

## Conditions de la soumission

Les [règles OpenAI](https://developers.openai.com/plugins/app-guidelines#privacy) interdisent notamment le traitement de données PCI DSS, données de santé protégées (PHI), identifiants gouvernementaux et secrets d’authentification. Un import PDF générique ne prouve pas le contrôle de ces catégories. Définir et présenter les restrictions avant import sans revendiquer de filtrage non implémenté. Les données sensibles permises par la politique nécessitent finalité, consentement adéquat et information explicite ; ce brouillon ne les établit pas.

Une politique finale doit couvrir catégories, finalités, destinataires, durées et contrôles réels, et remplacer la description de « démonstration seulement en mémoire » sur le domaine canonique. La prévisualisation fictive indépendante reste une surface distincte.
