# Candidat multilingue intégré — 22 septembre 2026

Ces quatre captures XCTest ont été renouvelées après reprise des changements
natifs `24bbe2a`, `c7542dc` et `fea555d` dans `codex/multilingual-ios`.
Elles proviennent des sources applicatives du commit `ec8fe77`, exécutées sur
**iPhone 17 Pro Max, iOS 27.0 (24A5423a)**. Le lot
`ios/.build/TestResults/run-QUTBZd/Tests.xcresult` a réussi **23 tests unitaires
et 7 tests d’interface**, sans échec ni test ignoré.

| Capture | Vérification |
| --- | --- |
| [Accueil anglais](iphone-welcome-en.png) | Sélection immédiate et choix conservé après relance. |
| [Profil allemand](iphone-account-de.png) | Langue, navigation et explication de la préférence partagée. |
| [Profil luxembourgeois](iphone-account-lb.png) | Changement dans le même profil, puis état de livraison traduit. |
| [Devis de référence](iphone-reference-fr.png) | Consultation sans action d’approbation ou d’envoi. |

Les images sont les PNG originaux exportés du résultat XCTest, sans retouche ni
recadrage. Elles ont été inspectées ; la liste de profil et le détail du devis
restent défilants sous la barre native. `manifest.json` conserve leur origine,
leur test et leur empreinte SHA-256. Tous les noms, documents, destinataires et
états des écrans connectés proviennent des fixtures Debug fictives.

Les captures iPad du dossier parent restent des preuves du candidat natif
initial : elles n’ont pas été régénérées pour cette intégration multilingue.
Aucun essai sur appareil physique, connexion Auth0 réelle, transmission réelle,
TestFlight ou App Review n’est revendiqué par ces captures.
