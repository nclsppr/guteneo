# Politique de publication iOS — Guteneo

État au 22 septembre 2026. Sources Apple consultées à cette date.

Ce dossier prépare une première application iOS native, gratuite et compagnon du
service Guteneo. Il ne constitue ni une approbation Apple, ni une preuve que
l'application est prête à être soumise. Le backend mobile est en développement
local et n'est pas déployé. Les textes `fr-FR` sont des candidats à confronter au
binaire et aux capacités réellement disponibles avant publication.

## Choix retenu pour toutes les boutiques

L'application ne propose aucun achat, ajout de crédits, tarif de recharge,
bouton de paiement, écran de facturation ou lien vers une recharge. Elle
n'affiche pas non plus « ajout de crédits non disponible, voir sur guteneo.com ».
Ce choix vaut aussi dans les erreurs, l'aide, les captures et les métadonnées.

Le solde existant et le coût exact ou plafonné d'une opération restent visibles
lorsqu'ils permettent de comprendre si l'envoi est possible et ce qui sera
consommé. Message conseillé en cas d'insuffisance :

> Le solde disponible ne permet pas cet envoi.

Ne pas compléter ce message par une adresse, une invitation à acheter, un QR
code, une consigne de recherche ou une notification promotionnelle. Ne pas
réafficher sans adaptation un message serveur qui contient une telle invitation.

Les liens utiles doivent mener à leur destination précise : assistance,
confidentialité, conditions et suppression du compte. Ils ne servent pas de
parcours indirect vers un achat. Les écrans web ouverts pour la connexion ou
l'approbation doivent être vérifiés eux aussi, notamment lorsque le solde est
insuffisant.

## Fondement et limites de l'analyse

Les [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
encadrent les achats numériques en 3.1.1. La règle 3.1.3(f) autorise un compagnon
gratuit d'un outil web payant, sans achat ni incitation externe. C'est la position
proposée pour Guteneo, à expliquer à App Review ; elle n'est pas préapprouvée.

La règle 3.1.3(e) traite des biens et services consommés hors de l'app. Son
application au courrier physique paraît justifiée. Apple ne classe pas
explicitement le fax dans cette règle. Un portefeuille partagé avec des services
numériques ne permet pas de présumer une exemption globale. Guteneo n'est pas
présenté comme une app « reader ».

Les CTA externes sont permis dans la boutique américaine sans entitlement.
Ailleurs, un simple texte peut également constituer une incitation. La formulation
« voir sur guteneo.com » associée au crédit présente donc un risque ; retirer le
lien cliquable ne résout pas ce risque. La politique internationale retenue
évite ces différences régionales.

Cette analyse est une interprétation opérationnelle. La classification finale
du service reste soumise à l'examen d'Apple. Une demande d'Apple doit être traitée
explicitement, sans masquer le modèle économique ni changer les comportements
pour le seul compte reviewer.

## Union européenne : transition du 1er octobre 2026

Apple a publié le 18 août 2026 des conditions unifiées dont la prise d'effet est
annoncée au 1er octobre 2026. Jusqu'alors, les conditions précédentes restent
utilisables. Leur remplacement nécessite l'acceptation de l'accord actualisé
par l'Account Holder. Vérifier à nouveau la règle applicable au jour de la
soumission. [Transition officielle](https://developer.apple.com/support/apps-in-the-eu/)

Le régime annoncé prévoit un entitlement pour les offres externes, même sans
lien actionnable. Les parcours actionnables requièrent les APIs StoreKit et leur
information système. Des conditions concernant les mineurs, les commissions,
le reporting et le maintien des options de paiement pendant douze mois
s'appliquent. Aucun entitlement de ce type n'est demandé par cette version de
Guteneo ; aucune permission régionale n'est présumée acquise.
[Options de paiement UE](https://developer.apple.com/support/payment-options-on-the-app-store-in-the-eu/)

## Parcours présenté à l'utilisateur et à App Review

La cible est une interface SwiftUI native pour le suivi, les PDF et la
préparation des opérations prises en charge par le compte. Le lecteur de PDF
doit afficher le document réellement concerné. Les états indisponibles,
d'analyse, d'échec et d'expiration doivent rester compréhensibles.

L'approbation humaine demeure dans le navigateur système. Elle lie le contenu
immuable, le destinataire, les options et le coût. La préparation dans l'app ne
vaut ni accord humain ni envoi. Ne pas intégrer le tableau de bord HTML dans une
WebView, activer une délégation experte ou contourner les contrôles existants
pour rendre ce parcours plus court. Un devis limité à la préparation reste
un devis de référence : l’interface ne doit pas inviter à le valider ou à
l’expédier lorsque le serveur ne l’autorise pas.

Les fonctions fax et email doivent respecter les capacités du compte et les
blocages de production. Une option visible en démonstration ne prouve pas sa
disponibilité réelle. Les notes de review doivent expliquer tout canal fermé.
Ne pas promettre l'envoi postal depuis cette première version sans preuve de ce
parcours dans le binaire soumis.

La démonstration utilise des données fictives identifiées, sans communication
réelle. Les captures proviennent du binaire testé. Elles ne doivent ni exposer
de vrais documents, ni faire passer un résultat simulé pour une livraison.

## Compte et confidentialité

La connexion prévue repose sur les comptes Guteneo. Vérifier les options
effectivement affichées par Auth0 : l'utilisation d'une infrastructure Auth0
n'établit pas, à elle seule, qu'un login social est proposé. La règle 4.8 doit
être réévaluée si une connexion sociale est ajoutée. La confidentialité doit
rester facilement accessible, conformément à 5.1.1.
[Règles de connexion et de confidentialité](https://developer.apple.com/app-store/review/guidelines/)

Le client utilise `ASWebAuthenticationSession`, présenté par iOS depuis l'app,
avec retour contrôlé vers l'app. Il ne renvoie pas vers le navigateur par défaut
avec `openURL` pour se connecter. Apple documente ce mécanisme système pour
l'authentification web ; la critique du renvoi au navigateur par défaut dans
sa FAQ sur la suppression de compte ne décrit pas ce parcours.
[Authentification système](https://developer.apple.com/documentation/authenticationservices/authenticating-a-user-through-a-web-service)

Si l'app permet la création d'un compte, y compris via le navigateur, elle doit
permettre d'en lancer la suppression. Une désactivation, une déconnexion ou un
mail obligatoire au support ne suffit pas pour une app ordinaire. Une
confirmation et une réauthentification sont possibles. Si la suppression se
termine sur le web, fournir un lien direct vers le véritable parcours. Expliquer
les données conservées pour obligation légale et la durée de traitement.
[Suppression de compte](https://developer.apple.com/support/offering-account-deletion-in-your-app/)

La fiche de confidentialité doit être fondée sur les flux observés : identité,
coordonnées, destinataires, documents, demandes d'assistance et historique
éventuel. Déclarer les destinataires techniques et usages réels ; ne pas cocher
« aucune donnée collectée » au seul motif que le code iOS n'intègre aucun outil
publicitaire. Le contenu libre des documents ne justifie pas d'inventer toutes
les catégories de données qu'un utilisateur pourrait saisir.
[Déclarations de confidentialité](https://developer.apple.com/app-store/app-privacy-details/)

Vérifier le manifeste de confidentialité, les APIs exigeant une justification
et chaque SDK réellement inclus dans l'archive. Les exigences des SDK listés
par Apple doivent être satisfaites, avec signature lorsqu'elle est applicable.
[Exigences des SDK tiers](https://developer.apple.com/support/third-party-SDK-requirements/)

## Conditions de soumission encore à démontrer

Ce tableau est un point de départ, pas une attestation de réussite. Chaque
condition doit recevoir une preuve datée correspondant au binaire final.

| Condition | Preuve attendue avant soumission |
| --- | --- |
| Backend mobile | Version déployée et accessible ; contrat compatible avec le binaire ; séparation des comptes et refus d'accès vérifiés. Aucun déploiement n'est attesté par ce dossier. |
| Authentification | Connexion système, consentement du navigateur et retour exact, connexion/déconnexion et expiration testées sur un vrai compte autorisé. Le client réutilise l'authentification du service ; aucun secret embarqué. |
| Suppression du compte | Parcours complet et suppression effective des données prévues, révocation des accès, conservation légale documentée. |
| Parcours métier | Import PDF, consultation, préparation, approbation dans le navigateur et retour vers le suivi vérifiés ; erreurs et canaux indisponibles expliqués. Aucun envoi réel sans autorisation distincte. |
| Crédits | Absence de recharge et d'incitation d'achat vérifiée dans l'app, ses erreurs, ses liens, les pages d'approbation et les captures. |
| Appareil et accessibilité | Essais sur appareil physique, petit/grand écran, iPad si pris en charge, texte agrandi, VoiceOver, clavier, contraste et réduction des animations. |
| Compilation | Xcode 26 ou ultérieur avec SDK iOS 26 ou ultérieur, exigés depuis le 28 avril 2026. Le SDK ne fixe pas à lui seul la version minimale d'iOS prise en charge. |
| Distribution | Bundle ID et équipe confirmés, archive de distribution signée, validation d'archive et installation TestFlight correspondant au même build. |
| Accès App Review | Compte dédié autorisé et utilisable, instructions testées, backend joignable pendant l'examen. Aucun identifiant n'est inventé. |
| Fiche App Store | Textes conformes au binaire, captures de l'app en usage avec données fictives, icône finale, catégorie, disponibilité, questionnaire d'âge, contact et liens légaux actifs. |
| Déclarations | Confidentialité et chiffrement évalués sur l'archive finale ; justificatifs fournis si nécessaires. |
| Publication | Accord explicite de l'utilisateur avant soumission/publication ou changement externe qui le requiert ; décision finale d'App Review distincte de la préparation locale. |

Sources pratiques : [SDK minimum](https://developer.apple.com/news/upcoming-requirements/),
[captures App Store](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots),
[chiffrement](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance),
[TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

Ne pas déclarer « prête à publier » tant qu'une condition obligatoire reste sans
preuve. Un build simulateur, une archive locale, une installation TestFlight et
une validation App Review sont des niveaux de preuve différents.
