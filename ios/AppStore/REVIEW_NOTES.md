# Notes de préparation à App Review

Document interne — 22 septembre 2026 — non soumis.

Le backend mobile est en développement local et n'est pas déployé. Ces notes
doivent être actualisées après validation du binaire et du service. Elles ne
doivent pas être copiées comme attestation de disponibilité actuelle.

## Informations à transmettre avec le binaire qualifié

Guteneo est une application iOS gratuite, compagnon du service web Guteneo. Son
interface est native. Elle permet de consulter le suivi, de travailler avec les
PDF du compte et de préparer les opérations prises en charge. Les fonctionnalités
visibles et les canaux réellement disponibles doivent correspondre au compte
fourni à App Review.

La connexion utilise `ASWebAuthenticationSession`, avec une fenêtre sécurisée
présentée par iOS depuis l'application et un retour contrôlé vers celle-ci.
Elle ne lance pas le navigateur par défaut avec `openURL` pour demander de se
connecter. Ce mécanisme système est décrit dans la
[documentation d'authentification Apple](https://developer.apple.com/documentation/authenticationservices/authenticating-a-user-through-a-web-service).
L'ouverture du navigateur pour la validation humaine d'un envoi est un parcours
distinct de cette connexion.

L'application ne vend rien. Elle ne contient ni achat intégré, ni ajout de
crédits, ni lien ou invitation à un achat externe. Le solde déjà disponible et
les devis servent à informer l'utilisateur du coût d'une opération. La règle
3.1.3(f) relative aux compagnons gratuits d'outils web payants est le fondement
proposé de ce modèle. Nous ne présumons pas qu'Apple a déjà confirmé la
classification du fax. Le courrier physique ne sert pas à revendiquer une
exemption globale pour un portefeuille partagé avec d'autres services.

La préparation dans l'application ne déclenche pas l'envoi. L'utilisateur ouvre
le navigateur système pour relire et approuver l'opération dans son espace
Guteneo. Cette approbation porte sur le document immuable, le destinataire, les
options et le coût. Le navigateur ne contient pas une WebView embarquée dans
l'application. Les contrôles de sécurité et de disponibilité du service restent
applicables.

Un devis de référence, limité à la préparation par le serveur, ne donne pas
accès à une validation ou à une expédition. Il doit être présenté comme tel,
y compris lorsqu’un fournisseur ou un mandat ne permet pas la suite du parcours.
Ce cas doit faire partie des vérifications du compte reviewer.

La démonstration éventuelle doit être clairement identifiée et ne produit aucune
communication réelle. Elle ne remplace pas une preuve de fonctionnement du
backend mobile. Les notes finales doivent identifier précisément le parcours
offert au reviewer et distinguer ses résultats simulés des résultats réels.

Référence : [App Review Guidelines, notamment 3.1.3(f)](https://developer.apple.com/app-store/review/guidelines/).

## Canal annoncé pour cette première fiche

Le service de production observé le 22 septembre 2026 n’active pas l’envoi
par email. La description et les mots-clés de cette version annoncent la
préparation des fax, la consultation des PDF et le suivi des opérations.
La capacité technique du client à gérer ultérieurement l’email ne constitue
pas une disponibilité du service. La préparation du courrier postal n’est
pas annoncée dans cette première fiche.

## Accès du reviewer — non fourni

Aucun compte, mot de passe ou code d'accès App Review n'a été créé ni inventé.
Un responsable autorisé doit fournir un compte dédié, utilisable pendant
l'examen, dans les champs protégés d'App Store Connect. Ne pas placer ces secrets
dans ce dépôt.

Avant soumission, vérifier avec ce compte :

1. La connexion réelle, les exigences de vérification et tout second facteur.
2. La présence de PDF fictifs autorisés à être examinés et des états de suivi
   nécessaires à une review complète.
3. La préparation d’un fax vers une destination disponible, et l’explication
   claire des canaux qui ne le sont pas.
4. L'ouverture de l'approbation humaine dans le navigateur système, puis le retour
   au suivi. L'app ne peut pas présenter l'approbation comme déjà donnée.
5. Le comportement en cas de solde insuffisant, devis expiré, document encore en
   analyse, panne réseau et session expirée.
6. L'accès à la confidentialité, à l'assistance et à la suppression effective du
   compte selon le parcours retenu.

L'examen ne doit pas nécessiter un envoi à une personne non consentante. Le
responsable doit fournir des destinataires de test autorisés et préciser ce qui
serait réellement transmis avant toute utilisation d'un canal réel. Si un mode
review isolé est retenu, documenter ses limites et obtenir l'accord d'Apple
lorsqu'il remplace l'accès demandé au service.

## Bloquants de soumission

- Backend mobile non déployé et intégration de production non qualifiée.
- Parcours d'authentification natif, retours, cycle de session et suppression de
  compte à vérifier de bout en bout.
- Compte reviewer, données fictives et destinataires d'essai autorisés non
  fournis dans ce dossier.
- Preuves appareil physique, accessibilité, archive signée, validation Apple et
  installation TestFlight à joindre pour le build final.
- Métadonnées à comparer aux fonctions effectivement livrées ; captures réelles
  et fiche de confidentialité à terminer après cette vérification.
- Toute soumission, activation de production ou publication reste une action
  externe distincte ; aucune n'est attestée par ce document.

Les limites de commerce, les sources et le détail des conditions de soumission
figurent dans [REVIEW_POLICY.md](REVIEW_POLICY.md).
