# Langues de l’interface

Candidat local du 22 septembre 2026. Le site et le client iOS prennent en charge
le français (`fr`), l’anglais (`en`), l’allemand (`de`) et le luxembourgeois (`lb`).
Cette note ne constitue pas une preuve de déploiement, de migration distante,
de connexion Auth0 réelle ou de publication sur l’App Store.

## Choix et conservation

Le sélecteur natif est accessible dès l’accueil, sur les pages publiques et dans
l’espace connecté. Les langues sont nommées dans leur propre langue, sans drapeau.
La langue de l’interface change immédiatement, sans recharger la page ni vider
les formulaires. L’attribut HTML `lang`, les libellés accessibles, les dates,
les nombres et les montants suivent ce choix.

Avant connexion, une indication publique `?lang=de` est prioritaire, puis le choix
explicite conservé dans ce navigateur, puis les langues du navigateur. Les variantes
régionales telles que `de-AT` sont reconnues. Sans langue prise en charge, le
français est utilisé. Un stockage navigateur indisponible ne bloque pas le choix.
Un changement de langue actualise un paramètre `lang` déjà présent dans l’URL.

Après connexion, `user.preferredLocale` fournit la préférence personnelle. Une
réponse de session tardive ne remplace pas un choix effectué entre-temps. La
préférence du compte n’écrase pas le choix du visiteur dans le stockage local ;
une déconnexion ou le passage à un autre compte sans préférence le restaure.

Le profil enregistre une préférence uniquement après une modification explicite
du sélecteur puis la sauvegarde du formulaire. Un compte sans préférence affiche
un choix vide explicite ; sélectionner la langue actuellement affichée permet
aussi de l’enregistrer pour les prochaines connexions. Une simple modification du nom
n’affecte pas une préférence encore absente. La langue active n’est modifiée
qu’après une sauvegarde réussie. La préférence est commune aux organisations de
la même personne, et ne devient pas une préférence de toute l’organisation.
Les deux clients la relisent depuis le compte ; aucune notification temps réel
entre deux appareils déjà ouverts n’est revendiquée.

## Contrat et migration

`packages/contracts/src/locale.ts` définit les quatre valeurs et la négociation
bornée des variantes et de `Accept-Language`. `GET /api/session` et
`GET /api/account` exposent `user.preferredLocale`, nullable pour les comptes
existants. `PATCH /api/account` accepte `preferredLocale` sans rendre obligatoires
les champs des anciens clients. Le serveur refuse les autres valeurs, les champs
inconnus et les requêtes sans session/CSRF valide. L’identité provient de la
session authentifiée ; la préférence ne donne aucun nouveau droit.

La migration additive `0038_user_locale.sql` ajoute les colonnes contraintes dans
`users` et `auth_transactions`. Le numéro 0037 est réservé au candidat natif.
Appliquer 0038 avant de publier le serveur qui lit ces colonnes. Aucun compte
existant n’est réécrit. Le parcours de création de compte conserve la langue dans
la transaction PKCE à usage unique ; une connexion ultérieure ne remplace pas
une préférence existante. Les anciens parcours de connexion restent acceptés.

La langue souhaitée est transmise à Auth0 par `ui_locales`. Sa prise en charge
réelle par l’écran hébergé et les messages d’Auth0 dépend de la configuration du
fournisseur ; elle n’est pas assimilée aux traductions de Guteneo. Les parcours
privés du navigateur restent distincts des opérations OAuth publiques de l’API.

## Catalogue et contenu

Le catalogue français définit 398 feuilles de texte obligatoires pour chaque
langue. Les catalogues complémentaires traduisent les écrans de compte, les guides,
les avis de prix, les validations et reprises, les pages publiques et le journal.
Les catalogues sont versionnés avec le code. Les libellés conservés en état sont
traduits au rendu, et les ensembles éditoriaux sont produits à la demande pour
éviter de figer la langue au chargement du module.

Les paramètres métier et les valeurs techniques ne sont jamais traduits : chemins,
identifiants, statuts internes, attributs ARIA normalisés, API, options de fournisseur,
contenu des PDF, noms et coordonnées saisis, montants et empreintes d’approbation.
Les noms propres, titres bibliographiques et inscriptions des timbres sont
conservés. Les variantes traduites des exemples fictifs ne modifient pas les
communications préparées par les utilisateurs.

Le format des montants conserve la précision entière/nano-EUR des devis. Les
navigateurs dont ICU ne connaît pas `lb-LU` utilisent les formats régionaux
`de-LU`, avec les textes luxembourgeois. Le rendu HTML public initial reste
français ; le client applique le choix à l’ouverture. Cette évolution n’ajoute
pas de routes SEO localisées ni de promesse d’indexation multilingue.

## Maintenir les traductions

Les textes communs sont définis dans `apps/web/src/i18n.ts`, avec leurs versions
complètes dans `apps/web/src/locales/{en,de,lb}.ts`. Les textes des parcours publics
et opérationnels utilisent les catalogues `messages-*.json` : une clé française,
puis les traductions anglaise, allemande et luxembourgeoise dans cet ordre.

Utiliser `t` pour le catalogue commun ou `msg(texteSource, ...paramètres)` au rendu.
Conserver les mêmes paramètres `{0}`, `{1}` dans toutes les langues. Ne pas appeler
`msg` sur des identifiants, des valeurs de formulaire, des noms ou le contenu des
utilisateurs. Les tableaux contenant des libellés doivent être construits au rendu
ou par un getter, pour réagir au changement de langue sans rechargement.

`tests/unit/web-locale.test.ts` vérifie la parité et les paramètres des catalogues.
Les tests navigateur `locale.spec.ts` et `locale-boundaries.spec.ts` vérifient les
choix du visiteur et du compte. Les traductions natives sont embarquées dans le
catalogue `ios/Guteneo/Resources/Localizable.xcstrings` du candidat iOS.

## Client iOS

Le candidat natif est isolé sur `codex/multilingual-ios`, issu du travail natif
existant. Il dispose d’un sélecteur sur l’accueil et dans le compte, de catalogues
embarqués complets, du formatage localisé et de la même préférence serveur.
L’environnement SwiftUI change de langue sans recréer la navigation ou les
brouillons. Le navigateur de validation mobile et le parcours d’autorisation
conservent aussi cette langue. Les liens publics transmettent `?lang=…`.

Les contrôles natifs et leur contrat de profil sont décrits dans le document
`ios/README.md` du candidat iOS et dans son `docs/IOS_API.md`. Le code
natif n’est pas encore présent sur la branche principale web ; les deux candidats
restent séparés pour préserver le travail natif en cours.

## Vérification

- Tests du serveur : persistance, séparation des utilisateurs, lecture entre
  organisations, validation stricte, CSRF, révocation concurrente, anciens clients
  et négociation à la création du compte.
- Tests des catalogues : parité récursive, entrées non vides et paramètres
  d’interpolation présents dans les trois traductions.
- Tests navigateur : choix sur l’accueil, rechargement, sauvegarde et échec,
  maintien des formulaires, réponse de session tardive, déconnexion, absence de
  modification implicite, noms utilisateur inchangés et valeurs ARIA.
- Tests natifs : compilation simulateur et appareil sans signature, XCTest et
  parcours UI du choix initial et du profil. Aucun appareil physique, TestFlight
  ou App Store n’est déclaré qualifié par ces contrôles.

### Résultats web du 22 septembre 2026

- `npm run typecheck`, `npm run lint`, `npm run build` et
  `npm run build:preview` : réussis. La compilation Worker utilise uniquement le
  mode `--dry-run` local.
- Vitest : 68 suites / 1 343 cas exercés. Le passage complet a validé 1 324 cas ;
  les 19 échecs concernaient trois fixtures de schémas historiques. Ces fixtures
  ont été corrigées sans changer leurs assertions métier, puis leurs trois
  suites ont été relancées : 35/35 réussis. Les tests de catalogue et de précision
  monétaire ont également été relancés après les derniers textes : 13/13.
- `node --test tests/security/*.test.mjs` : 162/162 réussis.
- `npm run test:e2e` : 324 réussis, 3 exclusions conditionnelles prévues par les
  scénarios. Après l’ajustement de l’en-tête mobile et du choix explicite des anciens profils, les deux suites
  de langue ont été relancées : 33/33 sur Chromium, Chromium mobile et WebKit iPhone.
- `npm run test:preview -- --workers=2` sur la compilation finale : 59 réussis,
  5 exclusions conditionnelles desktop/mobile prévues par les scénarios.
- Inspection visuelle de l’accueil sur ordinateur et iPhone ; contrôle des pages
  accueil, assistance et développeurs à 320 px : aucun débordement horizontal,
  sélecteur contenu dans son en-tête.

Captures locales en luxembourgeois :
[ordinateur](screenshots/multilingual/web-desktop-lb.png),
[iPhone WebKit](screenshots/multilingual/web-iphone-lb.png),
[écran de 320 px](screenshots/multilingual/web-320-lb.png).
Les données affichées sont des exemples, et non une preuve d’envoi réel.


### Résultats iOS du 22 septembre 2026

Le candidat natif est enregistré à `384d0d0` ; les derniers changements de code
natif ont été testés à `ec8fe77`, avant le commit de preuves et de documentation.
Le candidat multilingue a été réconcilié avec les trois évolutions natives
postérieures à son point de départ, jusqu’au commit `fea555d`. Les restrictions
fax, les devis de référence sans envoi et les précisions de confidentialité et de
revue ont été conservés. Le catalogue natif contient 234 entrées en quatre langues.

- Nouvelle exécution sur simulateur iPhone 17 Pro Max / iOS 27.0 : 23 tests
  unitaires et 7 parcours UI réussis (`run-QUTBZd`).
- Serveur du candidat iOS : 82 tests réussis ; contrôle explicite des protections
  des devis de référence dans les quatre langues, avec les 16 tests de l’API
  native réussis. Vérification des types et lint ciblé réussis.
- Nouvelle archive Release pour appareil, sans signature : réussie (`run-b967tj`),
  avec contrôle d’exclusion des marqueurs Debug. Une archive non signée n’est ni
  une installation physique qualifiée, ni une publication TestFlight ou App Store.

Les branches de livraison restent `codex/multilingual` (web et préférence partagée)
et `codex/multilingual-ios` (client/API natifs avec la même préférence). Aucune
migration distante, fusion dans la branche principale ni publication n’a été
réalisée dans cette tâche.
