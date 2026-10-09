# Rôles et droits dans un atelier

Candidat local du 2 octobre 2026. Ce document décrit le contrat applicatif et sa
migration ; il ne constitue pas une preuve de publication en production. Le guide
public destiné aux clients est disponible dans l’application à `/roles/`, avec les
versions française, anglaise, allemande et luxembourgeoise. Le compte et la gestion
des membres renvoient vers ce guide.

## Choisir un rôle

Chaque personne reçoit un rôle **dans un atelier donné**. Son rôle dans un autre
atelier peut être différent. Quatre rôles suffisent à séparer le travail quotidien,
la validation et l’administration sans multiplier les profils difficiles à
comprendre.

| Droit                                                           | Administrateur          | Superviseur            | Opérateur | Observateur |
| --------------------------------------------------------------- | ----------------------- | ---------------------- | --------- | ----------- |
| Consulter les documents, destinataires et envois de l’atelier   | Oui                     | Oui                    | Oui       | Oui         |
| Importer des documents et préparer des envois ou campagnes      | Oui                     | Oui                    | Oui       | Non         |
| Approuver, confirmer, refuser ou annuler un envoi admissible    | Oui                     | Option « Approbation » | Non       | Non         |
| Autoriser le transfert d’un document postal pour sa revue       | Oui                     | Option « Approbation » | Non       | Non         |
| Consulter les rapports agrégés et la consommation               | Oui                     | Option « Rapports »    | Non       | Non         |
| Gérer l’atelier, ses membres et leurs droits                    | Oui                     | Non                    | Non       | Non         |
| Gérer la facturation et la configuration des expéditeurs/canaux | Oui                     | Non                    | Non       | Non         |
| Activer ou renouveler une délégation à un assistant             | Oui, dans le navigateur | Non                    | Non       | Non         |

- **Administrateur** : responsable de l’atelier et de ses accès. Il dispose de
  tous les droits applicatifs de l’atelier. Au moins un administrateur doit rester.
- **Superviseur** : prépare le travail et reçoit séparément les droits
  d’approbation et de reporting, selon les responsabilités confiées. Les deux
  options sont désactivées à sa première attribution, sauf choix explicite de
  l’administrateur.
- **Opérateur** : prépare les documents et les demandes d’envoi ; un administrateur
  ou superviseur habilité doit les examiner et les valider. L’opérateur ne peut
  pas confirmer un envoi déjà approuvé, ni le refuser ou l’annuler.
- **Observateur** : suit le travail sans le modifier. C’est un rôle de lecture des
  contenus de l’atelier, pas un accès limité à des statistiques anonymes.

Exemples : une responsable de validation peut recevoir « Approbation » sans
« Rapports » ; une responsable de suivi peut recevoir « Rapports » sans
« Approbation » ; une cheffe d’équipe peut recevoir les deux. Aucun de ces choix
ne donne accès à la gestion des membres, à la facturation ou aux délégations.

Le prix et le statut d’un envoi restent visibles dans sa fiche pour tous les
membres qui peuvent la lire. L’option « Rapports » contrôle les synthèses agrégées
et la consommation de l’atelier ; elle ne masque pas tous les montants ni les
contenus individuels.

## Attribuer et expliquer les accès

La personne qui crée un atelier en devient automatiquement administrateur.
Un administrateur ouvre **Membres**, choisit le rôle et, pour un superviseur,
règle séparément les options d’approbation et de rapports. Le formulaire explique
chaque rôle et indique qu’un changement de droits déconnecte le membre. La fiche
de compte affiche les droits effectifs de la personne connectée.

Le changement est limité à cet atelier. Il est journalisé et révoque les sessions
web, les sessions et codes natifs, les accès de développement et les connexions
OAuth concernés. Les délégations de l’ancien accès sont désactivées. La personne
se reconnecte avec ses nouveaux droits. Les accès de cette même personne dans
un autre atelier sont conservés.

Une personne membre de plusieurs ateliers peut utiliser **Compte → Changer
d’atelier** pour choisir son atelier actif. Le serveur ne propose que ses
appartenances actuelles ; le changement crée une nouvelle session et invalide
l’ancienne. Les documents et les droits affichés deviennent ceux du nouvel
atelier. Une connexion d’assistant reste attachée à son atelier d’autorisation.

Un rôle ne remplace pas la revue d’envoi : l’approbation porte toujours sur le
contenu, les destinataires, les options et le coût exacts. Retirer le droit
d’approbation invalide les approbations encore en attente ; le rétablir ne les
réactive pas. Une nouvelle revue est nécessaire. Les envois déjà acceptés
conservent leur historique et continuent selon leur état : un changement de rôle
n’annule pas une communication déjà confiée à un fournisseur.

La fonction de refus utilise l’annulation d’une demande préparée. L’annulation
après acceptation reste soumise aux limites existantes ; une issue fournisseur
inconnue ne déclenche jamais une nouvelle tentative automatique. Un motif de refus
structuré ou un circuit à plusieurs approbateurs ne sont pas implémentés.

## Inviter un collaborateur ou importer un groupe

Dans **Membres**, l’administrateur peut saisir une adresse e-mail ou importer un
CSV contenant une colonne `email`. La virgule et le point-virgule sont acceptés.
Le fichier est limité à 1 Mo et à 100 adresses distinctes par lot. L’aperçu retire
les doublons, affiche toutes les adresses et rappelle le rôle et les deux options
éventuelles du superviseur. Le même rôle s’applique à tout le lot. Le bouton
**Envoyer les invitations** confirme ce lot précis ; la lecture du CSV seule
n’envoie rien.

Chaque lien est personnel, valable sept jours et utilisable une seule fois. La
personne invitée peut créer son compte ou se connecter à un compte existant, avec
l’adresse vérifiée correspondante. Elle
rejoint l’atelier avec les droits choisis au moment de l’invitation ; aucun atelier
personnel supplémentaire n’est créé dans ce parcours. Un utilisateur existant peut
ainsi rejoindre un autre atelier tout en conservant ses autres appartenances.
Un lien seul ne permet pas de se connecter et ne prouve pas la possession de
l’adresse e-mail.

Les invitations en attente sont visibles et révocables par un administrateur de
l’atelier. Pour changer le rôle d’une invitation, révoquer le lien puis créer une
nouvelle invitation. Un changement du rôle administrateur de l’émetteur révoque
ses invitations encore en attente ; le rétablir ne réactive pas ces liens. Les
invitations acceptées restent dans l’historique.

Le serveur refuse le lot complet si une adresse appartient déjà à un membre de
cet atelier ou possède déjà une invitation en attente. La limite quotidienne est
de 500 invitations par atelier. Une invitation expirée peut être remplacée par une
nouvelle action explicite. Un résultat d’envoi « non confirmé » ne fait l’objet
d’aucune relance automatique, même lors d’un rafraîchissement de la liste.

En simulation locale, aucun e-mail n’est envoyé et le résultat est marqué
« Envoi simulé ». En production, l’envoi reste fermé tant que sa configuration
dédiée n’est pas explicitement activée. « Accepté par le service d’e-mail » signifie que le
fournisseur a accusé réception de la demande ; cela ne prouve pas la réception
dans la boîte du destinataire ni l’acceptation de l’invitation.

## Portée et limites

Les documents ordinaires, les destinataires et leur historique sont partagés dans
l’atelier. Les PDF générés par le studio restent privés à leur créateur. Après
préparation d’une demande, un administrateur ou un superviseur actuellement
habilité à approuver peut lire le PDF exact dans le contexte de cette demande.
Cette exception ne rend pas le PDF visible dans la bibliothèque générale ; les
autres opérateurs et les observateurs n’y gagnent aucun accès. Le retrait du droit
d’approbation coupe cet accès de revue, y compris pour une demande historique.
Il n’existe pas de cloisonnement général par dossier ou par équipe, ni de rôle
invité à accès documentaire restreint. Ne pas présenter « Observateur » comme une
restriction de confidentialité des documents ordinaires de l’atelier.

Le superviseur avec approbation peut approuver ses propres demandes. La séparation
obligatoire entre préparateur et approbateur, les doubles validations, les plafonds
individuels et les rôles personnalisés restent des évolutions distinctes. Un rôle
« Comptable » pourrait devenir utile avec un espace financier distinct ; l’option
« Rapports » suffit au besoin actuel sans lui attribuer de facturation.

Les assistants conservent l’intersection des scopes OAuth et des droits actuels
du membre. Un assistant ne peut pas déclarer une approbation humaine. Le mode
expert reste désactivé par défaut et réservé à une délégation explicite d’un
administrateur, bornée et expirante ; aucun superviseur ne peut la créer. Les
clients natifs peuvent préparer selon le rôle, mais la validation reste dans une
page web authentifiée. L’application native affiche le rôle, masque les actions
de préparation et de validation non autorisées, et utilise les droits effectifs
retournés par le serveur. Elle n’embarque pas la gestion des membres ni les
invitations ; ces actions restent dans le navigateur. Un changement de session
web peut nécessiter de reconnecter sa session native associée. Les autorisations
de fournisseur, les contrôles de fichier
et les limites financières continuent à s’appliquer à chaque rôle.

## Contrat technique et migration

Les identifiants API sont `admin`, `supervisor`, `member`, `viewer`. Les deux noms
historiques `member` et `viewer` sont conservés pour la compatibilité ; leurs
libellés destinés aux personnes sont désormais « Opérateur » et « Observateur ».
Le contrat partagé se trouve dans `packages/contracts/src/roles.ts`.

`PATCH /api/admin/members/:userId` accepte :

```json
{
  "role": "supervisor",
  "supervisorCanApprove": true,
  "supervisorCanReport": false
}
```

Seul un administrateur authentifié de cet atelier peut modifier ce membre. Les
options ne peuvent être activées pour les autres rôles. Les réponses de session et
de compte exposent les droits effectifs dans `permissions` ; les clients doivent
les utiliser pour présenter les actions, tandis que les contrôles serveur restent
autoritaires. Les changements de droits sont revérifiés dans la transaction D1.
`GET /api/account/workspaces` liste les appartenances actuelles de la personne ;
`POST /api/account/workspace` sélectionne une de ces appartenances dans une session
navigateur avec CSRF. L’identifiant demandé ne constitue jamais à lui seul une
preuve d’accès à un atelier.

La migration additive `0042_workspace_roles.sql` reconstruit la table de membres
avec le nouveau rôle et les colonnes `supervisor_can_approve` et
`supervisor_can_report`. Elle préserve les membres et les relations existantes,
notamment les sessions et codes natifs malgré leurs cascades, et étend le rôle
mémorisé par la reprise d’analyse documentaire. Les contraintes empêchent les
options hors superviseur et la suppression du dernier administrateur.

**Changement volontaire pour les ateliers existants** : les anciens `member`
deviennent des opérateurs sans approbation ni rapports ; les anciens `viewer`
conservent la lecture opérationnelle sans rapports. Les administrateurs doivent
attribuer « Superviseur » et les options adéquates aux personnes qui en ont besoin.
Aucun droit supplémentaire n’est attribué automatiquement. Les anciennes
approbations d’un `member` ne permettent plus de faire accepter une demande en
attente ; un approbateur habilité doit la revoir. L’historique déjà accepté reste
conservé.

Les gardes SQL contrôlent l’autorité courante lors de l’écriture d’une approbation
et lors du passage atomique à la file d’envoi. Le domaine revérifie aussi le rôle
et ses options à chaque accès ; un contexte client ou une session conservant
d’anciens droits ne suffit pas. Les rapports passent par les contrôles du domaine
sur `usage` et `dispatchOverview`. Les routes administratives gardent leurs
restrictions propres.

La migration `0043_workspace_invitations.sql` ajoute les invitations, la preuve
d’acceptation et le rattachement de leur hash à la transaction de connexion PKCE.
Le jeton brut n’est jamais enregistré en base ; le lien le porte dans son fragment.
La transaction d’acceptation installe ensemble l’identité éventuelle, le rôle, les
options et la preuve d’acceptation, après vérification Auth0 de l’adresse. Le
serveur revérifie l’expiration, l’état du lien et l’autorité de l’émetteur lors de
cette même transaction.

L’API d’invitation utilise `GET/POST /api/admin/invitations`,
`POST /api/admin/invitations/:id/revoke` et
`POST /api/invitations/preview`. L’aperçu public masque l’adresse et requiert le
jeton personnel. La création est réservée aux sessions navigateur administrateur
avec protection CSRF ; elle accepte les adresses déjà extraites du CSV dans
`emails`, avec `role`, `supervisorCanApprove` et `supervisorCanReport`.

L’expédition dédiée requiert `INVITATION_EMAILS_ENABLED=true`, une adresse
`INVITATION_EMAIL_FROM` sur le domaine vérifié `guteneo.com` et les paramètres
Resend existants. Ces paramètres ne sont pas activés par cette migration. Un lot
est enregistré puis revendiqué avant l’appel au fournisseur ; une interruption
conserve un résultat inconnu sans répétition automatique. Aucun jeton persistant
ne sert à une relance.

## Preuve et publication

`tests/integration/workspace-roles.test.ts` exerce les droits distincts sur D1
local, les transports navigateur/MCP/natif, les options indépendantes, les accès
inter-ateliers, les droits forgés ou périmés, les courses pendant l’approbation
et la confirmation, et la révocation des accès.

`tests/integration/workspace-roles-migration.test.ts` applique la migration à une
base D1 peuplée. Il compare les sessions, connexions, documents en reprise,
approbations et preuves d’envoi avant/après, vérifie les clés étrangères et
l’intégrité, puis contrôle la perte d’autorité des anciennes approbations.

`tests/integration/workspace-invitations.test.ts` vérifie la création individuelle
et groupée, les limites, les doublons, les droits courants, les courses et
révocations, la prévisualisation, l’acceptation unique et atomique, la correspondance
de l’adresse, ainsi que les issues du transport Resend simulé.

Ces preuves utilisent uniquement une simulation déterministe et des données
fictives. Le déploiement du code et de la migration distante nécessite une
autorisation explicite, une sauvegarde et les contrôles habituels de publication.
Aucun envoi réel ni activation de fournisseur n’est nécessaire à cette évolution.

## Identité et contacts — candidat du 9 octobre 2026

La navigation et le profil affichent nom, adresse de connexion et rôle courant.
Tous les membres navigateur peuvent consulter les administrateurs et superviseurs
de leur atelier via une projection bornée sans sessions ni connexions. Les options
réelles du superviseur déterminent sa capacité à approuver. Les adresses dans la
liste administrative distinguent les homonymes ; le nom personnel ne modifie aucun
droit. Les refus orientent vers les contacts. Aucun annuaire ni nouveau droit MCP
n’est ajouté. Voir [ACCOUNT_IDENTITY.md](ACCOUNT_IDENTITY.md) et ses preuves.
