# Guteneo pour iOS et iPadOS

Application SwiftUI native, Swift 6, iOS/iPadOS 17 minimum. Le projet partagé
`Guteneo.xcodeproj` contient l'app, les tests unitaires `GuteneoTests` et les tests
d'interface `GuteneoUITests`. Il n'ajoute aucune dépendance tierce. Le bundle est
`com.guteneo.ios`, version `1.0`, build `1`.

Il s'agit d'un candidat local. La présence du projet, d'un build ou d'une archive
ne prouve ni une intégration de production, ni une publication App Store. Le
contrat mobile doit être déployé et qualifié avant une soumission. Les conditions
détaillées se trouvent dans [AppStore/REVIEW_POLICY.md](AppStore/REVIEW_POLICY.md).

## Ouvrir et compiler

Ouvrir `ios/Guteneo.xcodeproj`, choisir le scheme partagé **Guteneo**, puis un
simulateur iPhone ou iPad. Les groupes suivent les dossiers `Guteneo`,
`GuteneoTests` et `GuteneoUITests` : les nouveaux fichiers Swift y sont inclus
automatiquement. `Info.plist` est exclu des ressources copiées et utilisé comme
fichier de configuration de l'app.

Depuis la racine du dépôt :

```sh
bash ios/scripts/doctor.sh
bash ios/scripts/build.sh
bash ios/scripts/build.sh --release --device
```

Les scripts utilisent explicitement
`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` par défaut et ne
modifient pas la sélection globale des outils. Définir `DEVELOPER_DIR` si Xcode
est installé ailleurs. Ils conservent leurs sorties dans `ios/.build/` ;
`GUTENEO_BUILD_ROOT` permet de choisir un autre dossier.

`build.sh` compile pour un simulateur avec une signature ad hoc locale, sans
certificat de distribution. Cette signature permet notamment de tester le
trousseau dans les conditions du simulateur. `--device` compile pour
un appareil physique, également sans signature ; cela ne permet pas son
installation. `--release` utilise la configuration distribuable, sans les
fixtures réservées à Debug.

## Tests et démonstration locale

```sh
bash ios/scripts/test.sh
bash ios/scripts/test.sh --unit
bash ios/scripts/test.sh --ui
```

Le simulateur par défaut est **iPhone 17 Pro**, sur le dernier runtime installé.
Choisir explicitement un autre appareil avec `--destination`, par exemple en
reprenant son identifiant dans la liste affichée par `doctor.sh` :

```sh
bash ios/scripts/test.sh --destination 'platform=iOS Simulator,id=IDENTIFIANT_DU_SIMULATEUR'
```

Les tests utilisent une exécution séquentielle et créent un nouveau résultat
`.xcresult` à chaque passage. Ils ne suppriment pas les résultats précédents.

Deux arguments de lancement sont réservés à la configuration Debug :

- `--uitesting-preview` ouvre les données fictives locales. La mention
  « Simulation · aucun envoi réel. » doit rester visible. Cette démonstration ne
  qualifie pas le serveur, les fournisseurs ni une livraison.
- `--uitesting-signed-out` ouvre le parcours de connexion pour le contrôle de
  l'écran d'accueil.

Les tests d'interface vérifient le parcours de connexion, la navigation entre
Atelier, Documents, Envois et Compte, la lecture du PDF synthétique, l'ouverture
et la fermeture de la préparation sans envoi, la navigation en taille de texte
d'accessibilité et l'absence d'invitation à recharger sur ces écrans. Ils joignent
des captures au résultat de test. Un scénario dédié vérifie aussi qu’un devis
de référence limité à la préparation n’offre pas de validation ou d’envoi.
Cela ne remplace pas
une revue de toutes les erreurs et pages web ouvertes par l'app, ni les essais
sur appareil physique et avec VoiceOver.

`bash ios/scripts/export-screenshots.sh` suivi du chemin d'un résultat
`.xcresult` exporte ses captures et leur manifeste dans un nouveau dossier de
`ios/.build/Screenshots/`. Les images ne sont ni recadrées ni retouchées.

## Archives et signature

```sh
bash ios/scripts/archive.sh --unsigned
```

Cette commande produit une archive Release locale et contrôle la présence du
fichier de configuration, du catalogue d'assets et du manifeste de
confidentialité. Une archive non signée sert uniquement à l'inspection. Elle
n'est pas un paquet App Store.

Pour produire une archive signée, définir `GUTENEO_TEAM_ID` avec l'équipe Apple
Developer réellement autorisée, configurer la signature du bundle dans Xcode,
puis lancer `bash ios/scripts/archive.sh --signed`. Le script n'ajoute pas
`-allowProvisioningUpdates` et ne crée pas de certificat ni de profil distant.

L'export local App Store utilise `bash ios/scripts/export.sh` suivi du chemin
de l'archive signée. Il exige :

- `GUTENEO_TEAM_ID` : l'équipe propriétaire du bundle ;
- `GUTENEO_PROFILE_NAME` : le nom ou UUID du profil App Store installé pour
  `com.guteneo.ios` ;
- une identité **Apple Distribution** utilisable avec sa clé privée.

`GUTENEO_DISTRIBUTION_CERTIFICATE` peut préciser l'empreinte SHA-1 du certificat
de distribution choisi. Un certificat Apple Development ne satisfait pas ce
prérequis. Xcode contrôle la compatibilité réelle du profil, de l'équipe et du
certificat au moment de l'export.

Le fichier d'options force `destination=export`. Aucun script ne téléverse un
build, n'envoie de communication, ne soumet une app à review ou ne la publie.
Signature, validation du paquet, installation TestFlight et décision d'App
Review doivent recevoir leurs propres preuves.

## Diagnostic de l'environnement du 22 septembre 2026

Xcode `27.0` (`27A266a`) est présent. La lecture du projet et des paramètres de
compilation réussit. La sélection système des outils peut encore pointer sur
CommandLineTools : les scripts évitent cette ambiguïté avec `DEVELOPER_DIR`.

Le contrôle initial signalait un CoreSimulator installé (`1171.6.0`) plus ancien
que la version attendue (`1171.7.0`). L'installation proposée par l'interface
officielle de Xcode a été lancée et s'est terminée. Le contrôle
`-checkFirstLaunchStatus` renvoie désormais un succès. La compilation Release
pour appareil physique a également réussi, sans signature.

Ne pas modifier un numéro de version, remplacer manuellement un framework,
neutraliser une vérification de signature ou tuer un installateur système pour
faire disparaître un tel état. Terminer l'installation officielle dans Xcode ;
si macOS exige une authentification ou la fin d'une mise à jour déjà engagée,
l'utilisateur doit la compléter. Relancer ensuite `doctor.sh` puis les tests.
La liste d'appareils fournie par un outil CoreSimulator existant ne prouve pas
que Xcode peut exécuter les tests avec son propre SDK.

Après mise à jour des composants, dix-neuf tests unitaires ont réussi sur
iPhone 17 Pro Max, iOS 26.5. Le lot final de vingt tests, incluant la portée des
devis de référence, a réussi sur iPad Pro 13 pouces M5, iPadOS 27.0. Ces tests
utilisent une signature ad hoc et un véritable cycle d’écriture, lecture et
suppression dans le trousseau.
Les premiers builds de simulateur sans signature empêchaient la suppression de
la session et affichaient une erreur ; la signature des builds et tests de
simulateur a été corrigée, sans masquer l'erreur dans l'interface.

Quatre scénarios d’interface distincts ont réussi sur iPhone ; cinq sur iPad,
avec le mode sombre, le texte XXXL, la lecture PDF et le passage en arrière-plan,
la préparation sans envoi et le devis de référence sans validation. Les reprises
ont été ciblées sur les assertions corrigées. Le détail des lots, les limites et
les captures sont dans [QA/Screenshots/README.md](QA/Screenshots/README.md).

L’archive Release non signée contient l’app universelle iPhone/iPad, le manifeste,
les assets et les symboles de diagnostic. Aucune identité Apple Distribution utilisable
n'était présente dans le trousseau lors du contrôle ; une identité Apple
Development était présente. Cela laisse l'export de distribution à qualifier.

Les résultats de compilation, d'exécution, de capture et de distribution doivent
être rapportés séparément, avec le build concerné. Le succès de la réparation
des outils ne vaut pas validation de l'application.

## Dernière archive inspectée

Le 22 septembre 2026, l’archive locale
`ios/.build/Archives/run-ekw9rF/Guteneo-unsigned.xcarchive` a été produite après
la correction du contraste sombre, à partir des sources applicatives du commit
`24bbe2a`. Le contrôle confirme le bundle `com.guteneo.ios`, la version `1.0`
(build `1`), iOS 17 minimum, les familles iPhone/iPad, les assets, le manifeste
de confidentialité et les symboles. Elle est explicitement non signée.

Les marqueurs `Atelier Horizon`, `Dossier de souscription` et
`--uitesting-preview` sont absents du binaire Release. Le script d’archive
contrôle également cette exclusion lors des prochains passages. Ce contrôle
ne constitue ni une installation sur appareil ni une validation App Store.
