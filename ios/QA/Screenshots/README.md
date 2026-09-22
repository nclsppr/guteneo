# Preuves visuelles locales — 22 septembre 2026

Ces captures proviennent de l’application SwiftUI exécutée par XCTest dans des
simulateurs Apple. Elles sont copiées sans retouche, recadrage ou montage.
Les écrans connectés utilisent exclusivement les fixtures Debug locales : nom,
organisation, documents, destinataires et états de livraison sont fictifs.
Aucune communication réelle n’a été envoyée.

Ce dossier sert à la revue du candidat local. Ce ne sont pas les captures finales
d’une fiche App Store : la configuration Release ne contient pas le mode de
simulation Debug. Les captures de soumission devront correspondre au binaire
qualifié et à un compte reviewer autorisé, avec des données fictives identifiées.

## iPhone

Simulateur iPhone 17 Pro Max, iOS 26.5, portrait, français, mode clair, signature
ad hoc locale. Les captures ont été inspectées : accueil sans erreur de stockage,
marque lisible, écran Atelier sans chevauchement gênant, PDF natif synthétique et
navigation Compte disponible en taille d’accessibilité XXXL. Les contenus longs
restent dans des vues défilantes ; une capture ne remplace pas la revue complète
des écrans.

Les dix-neuf tests unitaires, dont le véritable cycle trousseau
écriture/lecture/suppression, ont réussi dans
`ios/.build/TestResults/run-o9RUfn/Tests.xcresult`.
Ce lot a aussi réussi trois tests d’interface ; le quatrième a rencontré une
limite XCTest sur les identifiants textuels de plus de 128 caractères. La requête
est désormais un prédicat exact, sans masquer une erreur de l’application.
L’accueil et la lecture PDF avec passage en arrière-plan puis retour ont été
rejoués avec succès dans `ios/.build/TestResults/run-zTuPJq/Tests.xcresult`.
Cela qualifie quatre scénarios d’interface distincts, sans compter les reprises
comme de nouveaux tests.

Les premiers builds de simulateur non signés affichaient une erreur de retrait
du trousseau. Les scripts signent désormais localement les builds de simulateur ;
l’assertion vérifiant l’absence de cette erreur et le test réel du trousseau
restent présents. Les anciennes captures de cet échec ne font pas partie de
cette sélection.

## iPad et contrôle final

Simulateur iPad Pro 13 pouces M5, iPadOS 27.0, portrait, français, mode sombre,
signature ad hoc locale. Cinq scénarios d’interface distincts ont réussi :

| Scénario | Résultat local |
| --- | --- |
| Accueil sans achat ni erreur de trousseau | `run-VFBUU7/Tests.xcresult` — ce test réussi ; trois autres tests de ce lot ont échoué sur une requête TabBar incompatible avec la barre flottante iPad. |
| Navigation entre les quatre onglets | `ipad-floating-tab-fix.xcresult` — réussi après adaptation de la requête accessible. |
| Navigation en texte accessibilité XXXL | `ipad-floating-tab-fix.xcresult` — réussi. |
| PDF natif, arrière-plan/retour, formulaire puis fermeture sans envoi | `final-core-pdf-reference.xcresult` — réussi après défilement jusqu’au bouton hors écran. |
| Devis de référence sans validation ni approbation | `final-core-pdf-reference.xcresult` — réussi, sans ouvrir de lien. |

Le lot final contient aussi **20 tests unitaires réussis**, avec le discriminant
serveur `faxPricing.executionScope`, les courses de session et le cycle trousseau
réel. Les résultats se trouvent sous `ios/.build/TestResults/`. Ce bilan distingue
les assertions corrigées des passages réussis et ne présente aucun lot ayant
échoué comme un succès complet.

La navigation iPad a été rejouée avec succès une dernière fois dans
`final-dark-contrast.xcresult` après correction de la couleur du texte du bouton
principal. La capture Atelier sombre retenue provient de ce dernier passage.

Les huit captures retenues ont été inspectées visuellement. Le PDF affiche le
contenu synthétique, le formulaire reste lisible après défilement, son bouton est
désactivé sans destinataire, et le devis de référence indique explicitement
qu’il ne peut être approuvé ni envoyé. Le texte XXXL s’affiche dans une liste
défilante avec les onglets accessibles. Le simulateur iPad dédié a été remis en
mode clair puis arrêté à la fin des tests.

| Capture | Contenu |
| --- | --- |
| [iPhone accueil](iphone-accueil.png) | Écran déconnecté sans erreur de stockage. |
| [iPad Atelier sombre](ipad-atelier-sombre.png) | Marque, trois opérations fictives et bouton au contraste corrigé. |
| [iPhone PDF](iphone-pdf-natif.png) | Lecteur natif après retour au premier plan. |
| [iPhone Compte XXXL](iphone-compte-texte-accessibilite.png) | Texte d’accessibilité et navigation. |
| [iPad Compte XXXL sombre](ipad-compte-texte-accessibilite-sombre.png) | Lisibilité du compte et barre flottante native. |
| [iPad PDF sombre](ipad-pdf-natif-sombre.png) | PDF dans une fenêtre native. |
| [iPad préparation sombre](ipad-preparation-sombre.png) | Formulaire défilé et devis désactivé. |
| [iPad devis de référence sombre](ipad-devis-reference-sombre.png) | Absence de validation ou d’expédition. |

## Limites

Le test PDF confirme que le lecteur natif réapparaît après mise en arrière-plan
et retour. Il ne prouve pas à lui seul que l’aperçu du sélecteur d’applications
masque le contenu au moment exact de sa capture par iOS. Cette observation reste
à vérifier sur appareil physique. VoiceOver, appareil physique, authentification
réelle, approbation navigateur, backend de production, providers, TestFlight et
App Review ne sont pas qualifiés par ces fixtures.

Les résultats complets restent locaux dans `ios/.build/`, ignoré par Git.
Le manifeste de ce dossier conserve l’origine et l’empreinte des images retenues.
