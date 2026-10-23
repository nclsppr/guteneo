# Compte connecté et responsables de l’atelier

Le candidat 1.0.0 ignore les réponses d’une lecture web annulée, y compris un
401 reçu pendant le changement de compte ou d’atelier. Elles ne doivent ni
remplacer le contenu courant ni expirer la nouvelle session. Le hook partagé
masque immédiatement les données d’un ancien chemin, et conserve seulement la
ressource identique pendant son rafraîchissement. Les régressions observées sur
fixtures couvrent le suivi de campagnes et le changement de compte ; les
éditeurs déjà remontés par identifiant conservent leurs protections existantes.

Contrat de compte enrichi les 9 et 11 octobre 2026 ; simplification de la coque V2
du 14 octobre en cours de qualification. Cette page décrit l’implémentation ;
la CI, la configuration Auth0 et la publication se qualifient séparément. Les
preuves historiques et celles du candidat courant figurent dans
[DASHBOARD_V2.md](DASHBOARD_V2.md).

Le contrat courant de production réserve l’application et sa connexion navigateur
à `https://guteneo.com`. L’ancien hôte applicatif `workers.dev` et les URL de
preview applicatives sont fermés ; ils ne sont pas des chemins de connexion de
secours. Le callback, la déconnexion et les origines autorisées du client Auth0
navigateur doivent être canoniques. La maquette fictive séparée reste hors scope.
Voir [MAIN_RELEASE.md](MAIN_RELEASE.md). Aucune connexion, identité de retour ou
reconnexion Auth0 avec un compte humain n’est déduite de ce contrat ni des tests
sur fixtures.

## Parcours et autorité

Tout membre navigateur retrouve son nom, son adresse de connexion et son rôle
courant dans la navigation, même sur mobile. Le profil personnel est accessible
par ce bloc ; Classique conserve également son entrée Compte. Le dashboard décrit les droits effectifs,
y compris les options indépendantes d’approbation et de rapports du superviseur.
Le rôle dépend de l’atelier actif ; il ne se modifie pas dans le profil personnel.
Au retour dans un onglet, la session est relue pour réconcilier un changement de
compte ou d’atelier effectué ailleurs. La langue enregistrée dans le compte est
relue au même moment. Depuis le 10 octobre, son seul contrôle dans les vues
connectées est celui de la configuration du compte ; il s’applique aussi au
Belvédère. Un compte sans préférence utilise la langue du navigateur.

Le nom d’affichage, la langue et la version de l’Atelier restent modifiables par la personne. L’adresse
est en lecture seule : elle provient de l’identité de connexion et ne se change
pas par `PATCH /api/account`. Une nouvelle connexion vérifiée actualise l’adresse
sans écraser le nom personnel, la langue ni l’apparence enregistrée. En simulation, l’identité affichée
reste une donnée locale fictive, explicitement marquée comme telle.

L’action Changer de compte ouvre Auth0 avec une demande de réauthentification
explicite. La connexion normale conserve le SSO. Auth0 ou un fournisseur social
peut conserver son propre choix de compte ; l’interface affiche donc toujours
l’identité réellement revenue du callback, sans promettre un sélecteur universel.
L’état, le PKCE, la politique de vérification et le retour local restent vérifiés.

## Apparence personnelle de l’Atelier

Le compte est ancré en bas de la navigation de gauche sur ordinateur, avec nom,
adresse, rôle, accès au profil et changement de compte. Dans Mon profil,
**Version de l’atelier** est placée à côté de la langue et propose **Classique**
ou **V2**. Le choix n’est appliqué durablement qu’après **Enregistrer les
modifications** et réussite du `PATCH /api/account` existant. Les libellés sont
disponibles en français, anglais, allemand et luxembourgeois. La V2 réelle ne
porte pas de mention expérimentale ; les sessions simulées conservent leur
bandeau de simulation.

Dans le candidat V2 du 14 octobre, le nom d’atelier reste dans la navigation et
l’identité personnelle dans le bloc de compte ; le tableau de bord conserve les
droits effectifs sans recopier ces deux identités. Le pied de page redondant est
retiré et le lien public **État du service** rejoint **Changer de compte** dans
la ligne d’utilitaires du bloc d’identité.
Ce bloc et ce lien restent accessibles sur mobile quand le menu est fermé.
Le fuseau horaire du navigateur accompagne les dates concernées, sans nouveau
réglage de profil ni changement de leur formatage. Classique garde sa coque.
Ces déplacements ne changent ni l’adresse de connexion, ni les contacts, ni le
rôle, ni la sauvegarde du profil et n’ajoutent aucune lecture métier.

Le champ facultatif strict `preferredDashboardAppearance: "classic" | "v2"`
est personnel. Tout rôle navigateur peut le modifier pour sa propre identité,
sans changer ses droits ou les réglages d’un autre membre. Il est stocké dans
`users.preferred_dashboard_appearance`, ajouté par la migration `0053` avec
défaut `classic`, contraintes `NOT NULL` et `CHECK`. Il suit la même personne
entre sessions, appareils et memberships après relecture de session. La
préférence n’appartient pas à l’atelier ; les contenus et autorisations métier
restent soumis à l’atelier courant.

`GET /api/session` et `GET /api/account` exposent
`user.preferredDashboardAppearance`. Les anciens PATCH de nom/langue qui
omettent ce champ le préservent. La mutation utilise l’Origin, le CSRF et la
revalidation transactionnelle d’autorité existants. Un ciblage étranger ou une
valeur inconnue est refusé ; une membership révoquée avant écriture n’entraîne
aucune modification partielle. L’audit `account.updated` enregistre les noms de
champs, sans leurs valeurs.

Le paramètre `?atelier=v2` ou `?atelier=classic` force seulement la présentation
pour cette entrée ; aucune écriture serveur n’est effectuée par le lien.
Un enregistrement réussi après sélection explicite de l’apparence et le changement
d’identité détecté abandonnent un ancien forçage. Une sauvegarde du nom ou de la
langue seulement ne persiste ni ne retire le forçage. Le sélecteur expose le
choix enregistré dans le compte, pas la présentation temporaire. Le cache navigateur est un amorçage best-effort,
pas la source d’autorité du compte authentifié. Une erreur de sauvegarde doit
rester visible et ne vaut pas confirmation de la préférence.

## Qui contacter

`GET /api/account/contacts` est réservé aux sessions navigateur. Le serveur déduit
l’atelier de la membership authentifiée. Il expose au plus 50 administrateurs et
superviseurs courants, hors demandeur : identifiant, nom, adresse et permissions.
`hasMore` signale la limite ; aucune liste d’autres ateliers, session ou connexion
n’est incluse. L’adresse permet un lien mailto choisi par l’utilisateur ; aucune
communication n’est envoyée par Guteneo ou par un assistant.

Les administrateurs sont les contacts pour les accès et la facturation. Les
superviseurs ne sont présentés comme approbateurs que si leur option d’approbation
est réellement active. Un superviseur sans cette option reste identifiable sans
lui attribuer ce pouvoir. L’absence de contact, l’adresse manquante et les erreurs
réseau ont un état explicite et une reprise manuelle ; les lectures sont rafraîchies
au retour dans l’onglet. Les refus de permissions orientent vers le profil et les
contacts. Le profil ne permet jamais une auto-promotion.

Une erreur de lecture de cet annuaire conserve le focus dans le contrôle déjà utilisé. Elle reste annoncée par `role=alert` et propose **Réessayer**, sans détourner la saisie du profil ni accorder de droits. Ce choix concerne seulement l’annuaire chargé en arrière-plan ; les erreurs d’action conservent leur comportement de focalisation habituel. Aucun endpoint, contenu, destinataire ou règle de membership n’est modifié.

La liste administrative des membres inclut l’adresse pour distinguer les
homonymes. Seul l’administrateur peut modifier les rôles, inviter ou déconnecter les accès d’un
membre. La protection du dernier administrateur et la révocation des sessions,
connexions et mandats lors d’un changement de droits restent applicables.

## Surfaces et confidentialité

Web en français, anglais, allemand et luxembourgeois. Les endpoints d’identité
existants restent des endpoints navigateur : aucun annuaire MCP, privilège OAuth
ou mandat expert n’est ajouté. Le natif conserve ses réglages existants ; ses
lectures de session et de compte ajoutent `preferredDashboardAppearance`, sans
nouveau contrôle ni mutation native de ce champ. Le panneau de contacts reste
une évolution web. Les emails ne sont ni
indexés publiquement, ni ajoutés aux logs ou preuves publiques. Les réponses
privées portent `Cache-Control: no-store`.

Belvédère demeure une autorité plateforme distincte et en lecture seule. Un
administrateur d’atelier ne devient pas Veilleur. Sa migration additive est
`0052_belvedere.sql`, après les migrations déjà publiées 0044–0051 ; la configuration
privée et la qualification hébergée restent nécessaires avant activation.

## Preuves

Les commandes exécutées, résultats et limites du candidat sont consignés dans
[DASHBOARD_IDENTITY_PROOF.md](DASHBOARD_IDENTITY_PROOF.md). Les anciennes preuves
Belvédère restent historiques et ne qualifient pas cette intégration.

### Simplification V2 — candidat du 14 octobre 2026

Les vérifications du compte visible sur ordinateur et mobile, du menu fermé,
du lien de statut et des actions soumises aux permissions passent dans les
18 cas navigateur du candidat, avec persistance et consentement conservés.
Quinze routes racines sont parcourues en Classique/V2 au viewport de chacun
des trois projets puis à 320 px ; aucune qualification d’appareil physique
n’est déduite. Typecheck, lint, build web, atlas et 40 tests de locale/apparence
réussissent. CI du commit exact et contrôle authentifié après publication restent
distincts et à qualifier ; preuves dans [DASHBOARD_V2.md](DASHBOARD_V2.md).
Aucune modification du contrat compte/session, migration, identité Auth0, droit
ou surface native/REST/MCP n’est requise par cette simplification.

### Préférence d’apparence — qualification locale du 11 octobre 2026

L’extension de compte a 91 tests backend ciblés réussis : 27 compte, 47
authentification et 17 mobile. Le parcours final ajoute 7 tests d’apparence et
29 cas navigateur locaux réussis, dont 14 sur la maquette isolée et 15 sur
l’application locale. Cette dernière distingue simulation D1/queue et sessions
interceptées selon le scénario. Un passage manuel par Mon compte a également
vérifié la sauvegarde du français et de V2, la confirmation affichée, le retrait
du paramètre temporaire et la conservation de la route.

Le typecheck, le lint final, les builds preview/live et le contrôle de l’atlas
ont réussi. Les rapports, périmètres et résultats antérieurs sont détaillés dans
[DASHBOARD_V2.md](DASHBOARD_V2.md). Ces preuves ne qualifient pas la CI du commit,
la migration 0053 distante, la publication ou la persistance entre appareils
humains sur le service hébergé. Aucune communication réelle n’a été effectuée.

### Session humaine en production — 10 octobre 2026

Une connexion Auth0 humaine sur `https://guteneo.com` a été vérifiée avec le
compte de l’opérateur, sur la version publique issue de
`4ce1bdd467f9aa35f98e525986db888eff3bf977`. Le profil affiche l’identité, l’adresse
de connexion et le rôle Administrateur ; les quatre droits effectifs et les
réglages de nom, d’atelier et de langue sont visibles. L’identité et les valeurs
existantes restent présentes après rechargement. Le dashboard affiche également
l’identité, le rôle et l’accès administratif ; les contacts se chargent sans
erreur, avec un état explicite lorsqu’aucun autre responsable n’est disponible.
Les résultats bornés et la capture privée sont conservés hors dépôt, sans publier
les coordonnées du compte. Aucun profil, rôle, mandat ou envoi n’a été modifié.
Cette preuve qualifie ce compte Administrateur et cette session ; elle ne
remplace pas les fixtures des autres rôles ou une qualification iOS réelle.
Elle précède la préférence d’apparence du 11 octobre et ne prouve ni sa migration
distante, ni sa sauvegarde sur le service hébergé.
