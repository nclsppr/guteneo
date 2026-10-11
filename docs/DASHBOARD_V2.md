# Atelier V2 et préférence personnelle d’apparence

État au 11 octobre 2026 : **contrats et parcours ciblés validés localement, publication en attente**. La V2 est une version complète de l’Atelier web, sélectionnable dans le compte à côté de la langue. Elle ne porte pas de mention « à l’essai ». Les comptes existants et nouveaux conservent `classic` par défaut ; choisir V2 reste une décision personnelle.

Ce document et l’atlas des fonctionnalités sont réservés au dépôt. Ils ne doivent pas être importés, copiés, publiés ou reliés au site officiel. La présence du code, des tests et des illustrations ne constitue pas une preuve de migration distante, de déploiement ou d’usage authentifié hébergé.

## Périmètre et entrée

La V2 utilise le compte connecté, l’atelier courant, les données réelles accessibles à cette personne et les opérations existantes. Elle ne crée ni copie fictive ni environnement métier parallèle. La session, la membership courante, les droits sur chaque ressource et les capacités serveur restent nécessaires.

La présentation couvre la navigation, l’accueil, les documents, la préparation, la revue et le suivi des envois, les assistants, le compte, le Studio, Horizon, les crédits, les tableaux et les formulaires. Belvédère conserve sa présentation et son autorité plateforme distinctes. Les contrats métier de ces surfaces restent inchangés.

Le portrait officiel est conservé et le mot-symbole `guteneo` reste en minuscules, en encre noire `#181b22`. Les gravures bleues sont limitées à l’accueil, à l’état vide des documents et à l’espace assistants. Elles n’accompagnent pas chaque formulaire ou tableau. Pour un atelier ayant déjà des envois, les alertes puis l’activité récente précèdent l’introduction ; les indicateurs restent soumis au droit de rapports. Le bloc assistants devient un raccourci compact. L’atelier sans historique conserve l’accueil complet. Dans la revue, le contenu précède les actions d’approbation dans l’ordre de lecture et de clavier.

## Choisir la version depuis le compte

Le bloc de compte se trouve au bas de la navigation de gauche sur ordinateur. Il conserve l’identité réellement connectée, le rôle courant, le lien vers le profil et l’action de changement de compte. Il reste accessible dans la navigation adaptée au mobile.

1. Ouvrir **Mon compte** depuis ce bloc ou l’entrée Compte.
2. Dans **Mon profil**, choisir **Classique** ou **V2** dans **Version de l’atelier**, à côté de la langue.
3. Cliquer sur **Enregistrer les modifications**.
4. Après succès serveur, appliquer la version et afficher **Votre profil a été enregistré.**

La sélection seule prépare une modification du profil ; elle ne la persiste pas et ne déclenche aucune opération d’envoi. L’application de la préférence durable intervient après le succès de `PATCH /api/account`. Un échec garde un état explicite et ne doit jamais être présenté comme une sauvegarde réussie. Le changement n’accorde aucun consentement métier et ne réinitialise pas les documents ou envois.

Le choix suit la même personne entre ses ateliers, sessions et appareils lorsqu’ils relisent sa session authentifiée. Il ne suit pas un autre utilisateur partageant l’appareil. Il ne change pas la préférence de langue ; les deux réglages peuvent être enregistrés ensemble. Les libellés sont traduits en français, anglais, allemand et luxembourgeois.

Les points d’entrée canoniques de présentation prévus après publication restent :

- `https://guteneo.com/?atelier=v2#/app` ;
- `https://guteneo.com/?atelier=classic#/app`.

Le paramètre `atelier` est un **forçage temporaire de présentation**, pas une écriture du profil. Pour rendre ce choix durable, l’utilisateur l’enregistre depuis Mon compte. Seule une sauvegarde réussie après sélection explicite de l’apparence supprime le paramètre ; une sauvegarde du nom ou de la langue seulement ne persiste pas le forçage et ne le retire pas. Le sélecteur présente la préférence enregistrée du compte, pas l’apparence temporairement forcée. Un changement d’identité détecté dans l’application supprime aussi l’ancien forçage. Les autres paramètres et la route restent conservés.

## Contrat serveur et réconciliation

| Point | Contrat |
| --- | --- |
| Valeurs | `classic` ou `v2`, définies dans `packages/contracts/src/dashboard-appearance.ts` |
| Stockage durable | `users.preferred_dashboard_appearance`, préférence de personne, pas d’organisation |
| Migration | `0053_user_dashboard_appearance.sql` ; colonne `TEXT NOT NULL DEFAULT 'classic'` avec contrainte `CHECK` sur les deux valeurs |
| Lecture navigateur | `user.preferredDashboardAppearance` dans `GET /api/session` et `GET /api/account` |
| Écriture | Champ facultatif `preferredDashboardAppearance` dans le corps strict existant de `PATCH /api/account` |
| Autorité | Session navigateur authentifiée courante, Origin et CSRF ; tous les rôles peuvent modifier leur propre préférence |
| Ciblage | Identité et atelier issus de la session ; aucun `userId` ou `organizationId` de ciblage accepté dans le corps |
| Champ omis | Préférence conservée, notamment lors d’une modification du nom ou de la langue par un ancien client |
| Audit | Événement `account.updated` ; noms des champs modifiés, sans journaliser leurs valeurs ou des données documentaires |
| Refus | Valeur invalide ou champ inconnu : `INVALID_INPUT` ; CSRF invalide : `CSRF_REJECTED` ; autorité révoquée avant mutation : `ACCESS_CHANGED`, aucune mise à jour partielle |
| Compte authentifié | Préférence relue avec la session ; même utilisateur conservé lors d’un changement d’atelier, identité différente réconciliée |
| URL | `atelier=v2` ou `atelier=classic` valide prime temporairement pour cette entrée ; ne persiste pas côté serveur |
| Cache navigateur | `guteneo.dashboard.appearance` en `localStorage`, amorçage et cache best-effort uniquement ; la session authentifiée demeure l’autorité hors forçage explicite |
| Cache indisponible | Lecture/écriture protégées ; la préférence de compte continue de fonctionner après lecture de session |
| Historique indisponible | Une restriction de `history.replaceState` ne doit pas bloquer l’application de la préférence sauvegardée |

Le cache local contient uniquement la valeur d’apparence. Il n’enregistre ni contenu, ni destinataire, ni jeton, ni URL signée. Une ancienne valeur du même navigateur ne doit pas remplacer la préférence d’une personne authentifiée. Le mécanisme utilise les lectures de session existantes ; il n’ajoute ni polling ni synchronisation en temps réel entre onglets. La prise en compte à distance dépend d’une nouvelle lecture de session, notamment au retour dans l’onglet.

Les réponses de compte restent privées, `Cache-Control: no-store`. La préférence personnelle traverse les memberships de la même personne, mais aucun contenu, droit d’organisation ou document privé n’est partagé par ce choix. La mutation et l’audit recontrôlent l’autorité dans la transaction existante.

## Droits, consentement et autres clients

Les quatre rôles humains restent ceux de `packages/contracts/src/roles.ts`. L’assistant connecté est un acteur OAuth distinct, sans cinquième rôle de membership.

| Capacité | Administrateur | Superviseur | Opérateur | Observateur | Assistant connecté |
| --- | --- | --- | --- | --- | --- |
| Sauvegarder son apparence | Navigateur, son compte | Navigateur, son compte | Navigateur, son compte | Navigateur, son compte | Non |
| Lire des contenus | Accès courant | Accès courant | Accès courant | Accès courant | Membre, scopes et ressource |
| Importer et préparer | Oui | Oui | Oui | Non | Contrat existant selon membre et scopes |
| Approuver, confirmer, annuler | Oui | Option Approbation | Non | Non | Mandat expert existant distinct uniquement |
| Rapports agrégés | Oui | Option Rapports | Non | Non | Contrat existant selon membre et scopes |
| Administrer atelier et membres | Oui | Non | Non | Non | Non |

Approbation et Rapports restent deux options indépendantes du superviseur. L’accès aux données dépend toujours de la membership et de la propriété des ressources. La revue reste liée au contenu, au destinataire, aux options, au coût et à l’empreinte immuables ; un choix de présentation ne constitue pas un consentement. L’acceptation, la réservation et l’outbox restent atomiques. Une issue fournisseur inconnue reste à rapprocher, sans nouvelle tentative automatique.

Les requêtes de préparation et d’envoi ne reçoivent aucun champ d’apparence. L’extension de schéma concerne seulement le profil et ses lectures de session. REST métier, scopes, outils MCP et mandats ne sont pas modifiés. Un jeton OAuth ne devient pas une session navigateur et aucun outil assistant ne permet de régler cette préférence.

Les lectures natives de session et de compte exposent également `preferredDashboardAppearance`. Le client natif n’offre aucun réglage V2 et son `PATCH /api/mobile/v1/account` refuse ce champ ; son PATCH de langue existant conserve la préférence. Le retour vers la revue navigateur utilise la préférence de la personne après authentification. Aucun droit natif d’approuver ou d’envoyer n’est ajouté.

Cette livraison n’autorise pas l’assistant qui la prépare à effectuer une communication réelle, à activer un canal, à accorder ou prolonger un mandat ou à contourner un contrôle serveur. Voir [les rôles](WORKSPACE_ROLES.md), [le contrat API](API_CONTRACT.md) et [l’identité du compte](ACCOUNT_IDENTITY.md).

## Parcours et reprise

| Parcours | Résultat attendu | Erreur ou reprise |
| --- | --- | --- |
| Connexion et retour d’onglet | Identité réelle, atelier courant et apparence personnelle réconciliés | Échec de session : parcours Auth0 habituel ; pas de données privées d’un autre utilisateur |
| Compte → langue et version → sauvegarde | Même personne, préférence durable appliquée après succès | Échec réseau, CSRF ou autorité modifiée : état explicite ; aucune réussite inventée |
| Lien `atelier=v2` ou `atelier=classic` | Forçage temporaire sans PATCH de profil | Paramètre inconnu ignoré ; enregistrer dans Mon compte pour rendre le choix durable |
| Changer d’atelier | Même préférence personnelle, nouveaux droits et données selon la membership | Aucun maintien de privilège de l’ancien atelier |
| Changer de compte | Préférence du compte revenu, ancien forçage abandonné | Ne pas présenter le cache local de l’ancien compte comme préférence du nouveau |
| Documents → préparation → revue → suivi | Mêmes ressources, demandes et gardes, nouvelle présentation | Quarantaine, devis expiré, canal fermé, droits insuffisants et issue inconnue gardent leur reprise actuelle |
| Studio, Horizon et crédits | Présentation cohérente, contrat et autorité inchangés | Aucun abonnement, quota, débit ou transfert créé par l’apparence |
| Assistant → revue navigateur | Mêmes scopes et consentements, préférence personnelle navigateur | Aucun outil, mandat ou consentement implicite ajouté |

Les parcours et la matrice sont également maintenus dans [feature-map.json](feature-map.json). La maquette publique demeure fictive et isolée du backend : ses réglages ne modifient aucun compte serveur. Elle conserve son bandeau de simulation, comme toute session réellement simulée. Supprimer la mention expérimentale de la V2 réelle ne supprime pas ces indications de simulation.

## Illustrations et ressources

Les trois illustrations ont été générées avec le véritable outil `image_gen`, puis redimensionnées et encodées en WebP. Les masters, prompts et empreintes sont conservés dans `assets/brand/dashboard-v2/`. Le portrait officiel n’a pas été régénéré.

| Asset servi | Dimensions | Octets | Vérification de l’export |
| --- | --- | --- | --- |
| `apps/web/public/brand/dashboard-v2/atelier.webp` | 1280 × 853 | 158 328 | Original et largeur d’usage 440 px examinés |
| `apps/web/public/brand/dashboard-v2/documents.webp` | 1280 × 960 | 75 294 | Original et largeur d’usage 320 px examinés |
| `apps/web/public/brand/dashboard-v2/horizon.webp` | 1280 × 427 | 105 592 | Original et largeur d’usage 600 px examinés |

Les preuves d’affichage sont hors dépôt dans `/tmp/guteneo-v2-qa/artwork/`. Images décoratives avec texte alternatif vide, sur fond ivoire opaque ; aucune information de consentement ou de livraison n’est incorporée. L’horizon évoque le Luxembourg sans prétendre à une fidélité géographique. Les informations métier et les aperçus documentaires restent des éléments accessibles distincts.

Les assets totalisent 339 214 octets s’ils sont tous téléchargés, avec chargement différé dans les emplacements prévus. Le choix d’apparence utilise le `PATCH` de profil et les lectures de session existants, plus une colonne D1 ; aucun nouveau service, container, polling ou réveil n’est ajouté. Les coûts effectifs dépendent du trafic et de la mise en cache. Aucune économie mesurée, gratuité ou facture fixe n’est déduite de ces caractéristiques.

## Sources et preuves

| Source | Rôle |
| --- | --- |
| `packages/contracts/src/dashboard-appearance.ts` | Valeurs partagées et défaut |
| `migrations/0053_user_dashboard_appearance.sql` | Colonne utilisateur et contraintes |
| `apps/api/src/account.ts`, `auth.ts`, `mobile.ts` | Sauvegarde navigateur, lecture compte/session et limite native |
| `apps/web/src/App.tsx`, `dashboard-appearance.tsx`, `account-page.tsx` | Réconciliation, compte, sauvegarde et forçage temporaire |
| `apps/web/src/workspace-identity.tsx` | Identité et accès au compte en bas de navigation |
| `apps/web/src/dashboard-v2.css`, `dashboard-artwork.tsx` | Style cohérent et illustrations limitées |
| `apps/web/src/dispatch-pages.tsx`, `assistant-workspace.tsx` | Hiérarchie quotidienne, revue et assistants |
| `apps/web/src/locales/messages-dashboard-v2.json` | Traductions FR, EN, DE et LB |

Les preuves antérieures sont conservées sans les étendre à la préférence serveur :

- avant ce dernier changement de périmètre, la suite Vitest complète comptait 2 052 tests réussis dans 108 fichiers ;
- l’ancienne commande de version directement dans la navigation avait 14 cas preview et 9 cas application réussis ; elle a été remplacée par le réglage de compte, donc ces 23 cas ne qualifient pas le parcours final ;
- les 7 tests unitaires d’amorçage et les 62 tests de sécurité de publication antérieurs ne démontrent pas à eux seuls la sauvegarde personnelle.

| Validation finale du présent périmètre | État |
| --- | --- |
| Compte/session, migration, rôles, refus OAuth/CSRF, révocation et lecture native | 91 tests locaux ciblés réussis : 27 dans `tests/unit/account.test.ts`, 47 dans `tests/unit/auth.test.ts`, 17 dans `tests/integration/mobile.test.ts` |
| Amorçage, URL temporaire, stockage indisponible et traductions | 7/7 tests de `tests/unit/dashboard-appearance.test.ts` réussis |
| Maquette isolée : contrôle de compte, proximité de la langue, 4 langues, ordre de lecture et mobile | 14/14 cas réussis, dont 8 V2 et 6 baseline ; desktop et iPhone WebKit, sans backend métier |
| Application locale : sauvegarde personnelle, navigateur vierge, nom seul avec URL forcée, brouillon, consentement, rôles et compte en bas de navigation | 15/15 cas réussis, 5 scénarios sur Chromium, mobile Chromium et iPhone WebKit ; API locale de simulation et sessions interceptées selon le scénario |
| Présentation de 15 routes d’Atelier à 320 px, dont Studio, Horizon et crédits | Incluse dans la suite navigateur application en Classique et V2 ; absence de débordement et accès au compte contrôlés, sans qualification d’appareil physique |
| Régressions de navigation étroite, identité longue, devis fax, contrôle PDF et fermeture des interceptions de test | 122/122 cas réussis après correction : 105 sur les trois navigateurs, puis 17 supplémentaires sur iPhone WebKit ; captures de devis et PDF relues |
| Migration de devis historiques avec le nouveau schéma utilisateur | 16/16 tests réussis ; la fixture copie les quatre colonnes du schéma historique, sans modifier les assertions métier |
| Builds preview et live | Réussis après les corrections de navigation et de sauvegarde nom seul ; journaux locaux `release-build-preview.log` et `release-build-live.log` |
| Typecheck et lint | Dernière exécution réussie après les changements finaux ; journal `/tmp/guteneo-v2-qa/release-lint.log` |
| Atlas développeur | Génération puis contrôle de synchronisation réussis ; 20 domaines, 164 fonctionnalités, 21 parcours |
| Suite Vitest complète | 2 052/2 052 dans 108 fichiers avant les derniers changements ; validation ciblée de 91 tests après extension du profil, pas de nouvelle preuve complète sur cette version |
| Sécurité de publication | 62 tests `main-only-release` et `preview-release-assets` réussis avant l’extension compte ; code de publication inchangé, preuve bornée |
| Parcours manuel de compte local | Français et V2 sélectionnés puis enregistrés avec succès ; paramètre `atelier` retiré, route conservée et pages suivantes en V2 depuis la préférence serveur ; API locale en simulation uniquement |
| CI du commit exact, migration D1 distante et déploiement canonique | Non prouvés pour ce candidat |
| Usage humain authentifié sur données réelles et autres appareils | Non qualifié par les tests locaux |
| Communication réelle ou livraison fournisseur pour cette qualification | Aucune réalisée |

Les rapports du parcours de compte sont conservés hors du dépôt dans
`/tmp/guteneo-v2-qa/account-preview-results.json` (14 cas, 9,1 s) et
`/tmp/guteneo-v2-qa/account-app-results.json` (15 cas, 51,6 s), avec zéro échec,
zéro cas ignoré et zéro cas instable. Le rapport HTML applicatif est dans
`/tmp/guteneo-v2-qa/account-app-html/`. Les journaux de builds sont sous le même
répertoire de preuves ; ils ne sont pas des preuves de publication.

Les contrôles complémentaires après les premiers résultats CI sont conservés
dans `/tmp/guteneo-v2-qa/ci-fix/focused-results.json`,
`/tmp/guteneo-v2-qa/ci-fix/iphone-regressions.json` et
`/tmp/guteneo-v2-qa/trusted-fax-quotes-v2.json`. Le build web, le typecheck et le
lint complet ont également réussi après ces corrections ; cette preuve locale
ne remplace pas la nouvelle CI du commit final.

Le test de navigateur vierge qualifie la relecture locale de la préférence
serveur avec la même identité ; il ne représente pas deux appareils humains
connectés au service hébergé. Les scénarios distinguent API D1/queue en
simulation et sessions interceptées pour les projections de droits et de
surfaces. Ils vérifient aussi que changer seulement le nom depuis un lien V2
ne sauvegarde pas l’apparence temporaire, et que préparation, consentement,
empreinte et idempotence gardent leurs contrats existants. La simulation et
les projections ne valent ni communication réelle, ni preuve fournisseur, ni
qualification physique iPhone.

## Publication et retour

La publication exige la revue du candidat et une autorisation explicite de fusion, non obtenue à la rédaction de ce document. Appliquer et vérifier la migration distante `0053_user_dashboard_appearance.sql` avant de publier le code qui lit la nouvelle colonne, puis suivre [MAIN_RELEASE.md](MAIN_RELEASE.md) depuis `main` propre et synchronisé, avec le commit exact vérifié. L’ancien hôte applicatif `workers.dev` et les URL de preview applicatives restent fermés ; aucune publication parallèle sur ces hôtes ne remplace le parcours canonique.

Vérifier séparément migration D1, CI, manifeste et assets servis sur `guteneo.com`, puis le parcours humain authentifié et la persistance du compte. La publication n’active pas V2 par défaut. **Classique** enregistré dans Mon compte restaure durablement l’ancienne présentation ; `?atelier=classic#/app` permet un retour temporaire sans modifier la préférence serveur. Aucun retour d’apparence ne supprime des données ou des envois.
