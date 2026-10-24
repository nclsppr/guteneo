# Compte Guteneo unique et responsables de l’atelier

## Compte unique et documents reçus — candidat du 24 octobre 2026

Le compte Guteneo est personnel et indépendant des ateliers. La même identité
sert à recevoir des documents, conserver les copies autorisées, explorer les
services et travailler dans ses ateliers. La réception n’ajoute aucune
membership chez l’expéditeur. Il n’existe ni « compte destinataire » distinct à
fusionner ensuite, ni atelier artificiel pour porter les documents personnels.

Les nouvelles inscriptions ordinaires créent une identité sans atelier. Les
identités et memberships existantes sont conservées. L’espace **Mes documents**
présente **Partagés avec moi** et **Copies conservées** ; **Utiliser Guteneo**
donne accès aux services avec le même compte. Le choix ou la création d’un
atelier intervient lors d’un usage d’envoi explicite. La création initiale est
idempotente pour cette personne ; l’entrée dans un atelier recontrôle la
membership et fait tourner la session. Aucun canal réel n’est ouvert par la
création d’un atelier.

`GET /api/personal/session` expose le principal personnel, ses préférences et
ses ateliers accessibles. Il ne remplace pas `GET /api/session`, qui garde son
contrat d’atelier obligatoire. Les routes personnelles utilisent leur propre
garde, le cookie navigateur et un CSRF lié à leur session ; un jeton Bearer
d’atelier ne donne pas d’accès au coffre personnel. `POST /api/personal/workspace`
crée l’atelier demandé ; `/api/personal/workspace/select` entre dans une
membership courante. Le serveur déduit les droits et n’accepte aucun tenant
affirmé par le navigateur.

L’identité continue d’être liée par issuer/sujet signés. Une égalité d’adresse
e-mail ne fusionne jamais deux comptes et ne transfère pas les anciens documents
à une adresse recyclée. La langue et le nom de profil sont communs aux contextes.
Le profil personnel utilise `PATCH /api/personal/account` ; l’adresse reste en
lecture seule. Ses sessions sont consultables et révocables sans disposer d’un
atelier. La déconnexion personnelle révoque aussi la session d’atelier liée.

Le contenu du nouveau parcours sensible exige une authentification récente
attestée par le serveur. La preuve signée
`https://guteneo.com/document_authentication` doit porter la politique
`guteneo-sensitive-v1`, la méthode qualifiée et la même date `auth_time`.
Une simple valeur `mfa`, un facteur enregistré ou le contrôle d’une boîte email
ne suffit pas. Lecture et affichage sont bornés à quinze minutes depuis la
preuve ; téléchargement original et remise personnelle demandent cinq minutes.
La qualification de l’Action Auth0, des passkeys avec vérification utilisateur,
de la fédération et des chemins de récupération demeure un jalon d’activation.
Les preuves fortes de simulation locale sont explicitement fictives.

L’invitation documentaire revient au parcours attendu après Auth0. Le token est
retiré du fragment avant toute navigation de connexion : il n’entre jamais dans
le `returnTo` d’une requête HTTP. Un transfert temporaire de dix minutes dans le
`sessionStorage` du même onglet permet la reprise après callback. Il est nettoyé
après rattachement, abandon ou déconnexion. Si ce stockage est indisponible,
l’interface explique comment se connecter puis rouvrir l’invitation ; le token
peut rester seulement en mémoire tant que cet onglet n’est pas quitté.

L’invitation ne livre pas le contenu : l’adresse vérifiée doit correspondre,
puis l’atelier confirme l’association au compte sur une relation connue ou une
preuve indépendante. L’attente n’affiche ni titre sensible ni pages. Le token
n’est échangé que dans le corps de la demande de rattachement. Il n’apparaît
jamais dans un journal d’atelier, une réponse MCP ou une preuve publique.

Une réponse 401 d’un service documentaire ferme son accès et propose une reprise
explicite ; elle ne relance pas automatiquement le bootstrap de session. La
coque personnelle garde ses autres entrées. Le retour dans un onglet recontrôle
la session ; un nouveau principal remonte ses pages sans l’état du précédent.
Une erreur Auth0 affiche une reprise explicite et ne crée pas de boucle.

La découverte des services reste volontaire. Aucune obligation d’achat, création
automatique d’atelier, analyse du contenu à des fins commerciales ou inscription
marketing n’est ajoutée. Les lectures d’une copie personnelle acquise ne sont
plus communiquées à l’atelier d’origine. Les conditions détaillées et la matrice
des surfaces figurent dans
[les parcours de distribution et réception](SECURE_DISTRIBUTION_JOURNEYS.md).

Ce candidat exige les migrations 0055–0058 et ses configurations privées ; il
n’établit ni activation Auth0, ni migration distante, ni publication, ni
qualification d’un navigateur humain en production. Les descriptions datées
ci-dessous conservent la preuve des parcours antérieurs et ne signifient plus
qu’un compte doit posséder un atelier.

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

## Déconnexion explicite — correctif local du 24 octobre

Après succès de `POST /api/logout`, le navigateur quitte complètement la route
privée pour l’accueil public. Il ne remonte pas l’entrée de connexion, qui poursuit
automatiquement vers Auth0 quand une route privée n’a plus de session. Ce départ
évite qu’un SSO encore valide recrée immédiatement une session après le clic.
Une erreur serveur conserve la vue et affiche l’échec, sans prétendre que la
session a été fermée. Le contexte CSRF client est effacé après succès.

Cette action termine la seule session Guteneo courante par le contrat existant ;
elle ne révoque ni le SSO Auth0 ni les connexions OAuth. Une nouvelle entrée privée
volontaire garde son passage direct vers Auth0 ; **Changer de compte** conserve
sa demande explicite de réauthentification. Le correctif ne change aucun client,
scope, rôle ou réglage fournisseur. Le test navigateur de l’entrée hébergée couvre
le refus, le succès, le rechargement public et une nouvelle entrée privée sur un
hôte réservé entièrement intercepté. Ces fixtures restent distinctes de la CI,
de la publication et d’une déconnexion réellement observée après publication.

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

## Entrée navigateur et continuité Auth0 — candidat du 24 octobre 2026

Les liens publics « Se connecter » ouvrent directement Auth0, avec la langue
active et la destination demandée. Le helper `auth-navigation.ts` sert aussi le
rendu statique : accueil, journal, guides assistants, préparation directe et
Horizon partagent la même construction d’URL. Auth0 conserve son formulaire
natif de connexion, inscription et récupération du mot de passe. Aucun écran
Guteneo de choix ne précède cette authentification. Une route privée ouverte
sans session poursuit automatiquement vers Auth0 après le contrôle initial de
session ; le démarrage est borné à une navigation et remplace l’entrée dans
l’historique. Les liens normaux restent utilisables dans un nouvel onglet.

Les repères suivent la hiérarchie observée sur le formulaire public Stripe :
une seule action de connexion, le mot de passe oublié près du champ natif et
l’inscription en lien secondaire. Les textes préparés nomment Guteneo dès le
titre et précisent « Retrouvez vos documents et suivez vos envois. ».
« Première visite ? Créer un accès » et « Déjà inscrit ? Se connecter » guident
le changement de formulaire. L’étape mot de passe annonce le retour vers la
page demandée. Ces textes n’ajoutent pas de connexion sociale, de champ,
d’étape ou de droit. Référence : https://dashboard.stripe.com/login.

L’écran Guteneo est réservé à une erreur de connexion. Il propose une reprise
explicite, avec un titre unique, une description courte, l’annonce du passage
vers Auth0 et les liens de confidentialité, conditions et assistance. Un retour
au site reste accessible. Le portrait officiel et le mot-symbole noir sont
conservés. Aucun grand visuel ni répétition de promesse. Une erreur ne relance
jamais automatiquement le fournisseur. Un retour depuis le cache de navigation
rétablit les liens. L’inscription secondaire n’est proposée sur cet écran que si
les capacités serveur annoncent sa disponibilité. La démonstration locale et la
maquette gardent leurs organisations fictives et leur signal de simulation.

Le contrôle initial de session n’écrase pas la langue visiteur en cas d’échec,
ni une sélection effectuée pendant sa lecture. Une session valide applique
toujours la langue enregistrée du compte. La récupération reprend la route et
la langue de la transaction seulement après validation et consommation du state
lié au navigateur. Les paramètres de callback ne fournissent aucun contexte.
La reprise ne recopie pas tokens, invitations, destinataires ou URL privées ;
seuls les paramètres de navigation autorisés sont conservés. Un state expiré ou
invalide revient à l’entrée générique sûre. PKCE, nonce, Origin/CSRF, membership,
MFA, consentement et mandats sont inchangés. Les surfaces natives, REST métier
et MCP ne reçoivent aucun droit supplémentaire.

Le script `scripts/setup-auth0-branding.mjs` prépare une présentation compacte
ivoire/cobalt avec le portrait officiel et des textes français, anglais et
allemands. Auth0 ne prend pas en charge le luxembourgeois : Guteneo conserve
`lb`, tandis que `ui_locales` demande `de`. Le script ne modifie pas
`enabled_locales` ; si `de` n’est pas activé, Auth0 peut utiliser la langue par
défaut du tenant. Le thème préserve les champs optionnels existants, les
dictionnaires de texte et les politiques d’identité.

La préparation et les tests locaux ne publient pas cette expérience. La fusion,
la publication web, l’application du thème Auth0 et sa vérification hébergée
restent distinctes et soumises à autorisation. Aucun identifiant n’a été saisi
et aucun réglage Auth0 n’a été écrit pendant l’inspection visuelle.

La bascule vers `auth.guteneo.com` est un chantier distinct. Les liens publics
utilisent `/auth/login` et les endpoints serveur suivent l’issuer configuré ;
aucun nouveau domaine n’est codé en dur dans ce parcours. Cette bascule doit
qualifier séparément la continuité des identités et connexions, dont les clés
incluent l’issuer exact. Le tenant Management du script de branding reste le
tenant Auth0 d’origine, même lorsque l’interface utilise le domaine personnalisé.
