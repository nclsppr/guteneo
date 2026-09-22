# Confidentialité : données du candidat iOS

État du code local au 22 septembre 2026. Ce relevé prépare la fiche App Store
Connect ; il ne remplace pas la politique publique du service ni une déclaration
déjà soumise à Apple.

## Déclarations du manifeste

`Guteneo/Resources/PrivacyInfo.xcprivacy` indique une finalité de fonctionnement
du service pour les catégories suivantes, liées au compte et sans suivi
publicitaire :

| Catégorie Apple | Flux correspondant |
| --- | --- |
| Nom | Profil du compte, organisation et identité des expéditeurs ou destinataires. |
| Adresse e-mail | Connexion dans le navigateur système et préparation ou suivi d'un email. |
| Numéro de téléphone | Destinataire et expéditeur d'un fax. |
| Adresse physique | Consultation des destinataires des courriers déjà présents dans le compte. |
| Identifiant utilisateur | Session et rattachement à l'organisation authentifiée. |
| Emails ou messages texte | Objet et corps des emails préparés ou consultés. |
| Autre contenu utilisateur | PDF importés, noms de fichiers et contenu des documents. |
| Historique des achats | Opérations de service, devis et coûts associés aux envois. L'app ne collecte pas de carte bancaire. |

La consultation des courriers existants justifie de considérer les données
postales même si cette version ne prépare pas de courrier. Le contenu libre des
PDF n'est pas utilisé pour inférer des catégories sensibles ou un profil
publicitaire. Le relevé ne prétend pas que les documents ne peuvent pas contenir
de données personnelles.

Le projet n'intègre aucun SDK tiers, outil publicitaire ou outil d'analyse.
Le manifeste ne déclare aucun domaine de tracking et aucune API nécessitant
une raison parmi les catégories utilisées actuellement. Refaire l'inventaire
si des dépendances ou des APIs de cette liste sont ajoutées.

## Stockage et accès sur l'appareil

Le jeton natif est conservé dans le trousseau, avec accès uniquement lorsque
l'appareil est déverrouillé et sans synchronisation entre appareils. Le client
réseau utilise une session éphémère, sans cache sur disque, cookies ni stockage
d'identifiants HTTP. Il refuse les redirections des requêtes authentifiées.

Les PDF sont lus en mémoire par PDFKit. L'app utilise le sélecteur système de
Fichiers ; elle ne demande pas les contacts, les photos, la caméra, le microphone
ou la position. Un masque couvre les vues et les présentations de l'app lorsque
la scène devient inactive. Il ne prétend pas empêcher une capture volontaire de
l'écran, contrôler le navigateur système ou effacer les fichiers d'origine
dans Fichiers.

## Points à finaliser avant soumission

- Valider cette fiche sur l'archive finale et les flux du service effectivement
  déployé, y compris les journaux et sous-traitants. Le manifeste embarqué et la
  fiche App Store Connect sont deux déclarations distinctes.
- La politique publique du 21 septembre, vérifiée à
  `https://guteneo.com/confidentialite/`, couvre déjà le service, les comptes,
  l'authentification et les fournisseurs. Y intégrer les particularités du
  client natif lors de sa mise en service et qualifier ses flux déployés.
- Appliquer les critères de conservation déjà publiés, définir le traitement
  opérationnel des comptes partagés et qualifier la suppression effective dans
  [ACCOUNT_DELETION.md](../../docs/ACCOUNT_DELETION.md).
- Renseigner les coordonnées et réponses réglementaires avec les informations
  du responsable du service ; aucune durée légale ou identité n'est inventée.

Références Apple : [fiche de confidentialité](https://developer.apple.com/app-store/app-privacy-details/),
[manifestes de confidentialité](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files),
[suppression de compte](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
