# Compte connecté et responsables de l’atelier

Candidat du 9 octobre 2026. Cette page décrit l’implémentation ; la fusion,
la configuration Auth0 et la publication se qualifient séparément.

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
par ce bloc ainsi que par l’entrée Compte. Le dashboard décrit les droits effectifs,
y compris les options indépendantes d’approbation et de rapports du superviseur.
Le rôle dépend de l’atelier actif ; il ne se modifie pas dans le profil personnel.
Au retour dans un onglet, la session est relue pour réconcilier un changement de
compte ou d’atelier effectué ailleurs. Une langue choisie dans l’interface reste
conservée quand la même personne revient avec une préférence serveur inchangée.

Le nom d’affichage et la langue restent modifiables par la personne. L’adresse
est en lecture seule : elle provient de l’identité de connexion et ne se change
pas par `PATCH /api/account`. Une nouvelle connexion vérifiée actualise l’adresse
sans écraser le nom personnel ni la langue. En simulation, l’identité affichée
reste une donnée locale fictive, explicitement marquée comme telle.

L’action Changer de compte ouvre Auth0 avec une demande de réauthentification
explicite. La connexion normale conserve le SSO. Auth0 ou un fournisseur social
peut conserver son propre choix de compte ; l’interface affiche donc toujours
l’identité réellement revenue du callback, sans promettre un sélecteur universel.
L’état, le PKCE, la politique de vérification et le retour local restent vérifiés.

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

La liste administrative des membres inclut l’adresse pour distinguer les
homonymes. Seul l’administrateur peut modifier les rôles, inviter ou déconnecter les accès d’un
membre. La protection du dernier administrateur et la révocation des sessions,
connexions et mandats lors d’un changement de droits restent applicables.

## Surfaces et confidentialité

Web en français, anglais, allemand et luxembourgeois. Les endpoints d’identité
existants restent des endpoints navigateur : aucun annuaire MCP, privilège OAuth
ou mandat expert n’est ajouté. Le natif conserve ses contrats et réglages existants ;
le nouveau panneau de contacts est une évolution web. Les emails ne sont ni
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
