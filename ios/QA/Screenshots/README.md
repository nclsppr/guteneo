# Preuves visuelles locales — 22 septembre 2026

Les huit captures sélectionnées proviennent de l'application SwiftUI exécutée
par XCTest, sans retouche, recadrage ou montage. Les écrans connectés utilisent
exclusivement les fixtures Debug locales : noms, documents, destinataires et
états sont fictifs. Aucune communication réelle n'a été envoyée.

Il s'agit de preuves de revue locale, pas des images finales de la fiche App
Store. La configuration Release n'inclut pas ce mode de simulation. Les captures
de soumission devront correspondre au binaire et au service qualifiés, avec un
compte reviewer autorisé et des données fictives identifiées.

## Sources et environnement

- Sources applicatives : `f39eae14198665fcb4340d209add29ff25f5cb3a`.
- Ajustement du seul test d'arrière-plan :
  `d6e194256a735a1037781a26b0a7b377f8edc508`, sans changement du binaire applicatif.
- Xcode 27.0, SDK iOS 27.0, Swift 6, signature ad hoc des simulateurs.
- iPhone 17e, iOS 26.5, portrait, français, mode clair.
- iPad Pro 13 pouces M5 « Guteneo iPad QA », iPadOS 27.0, portrait, français,
  mode sombre. Le mode clair a été restauré et le simulateur arrêté après essai.

Le manifeste associe à chaque image son empreinte, son horodatage, son appareil,
son résultat XCTest et les révisions de l'app et du test. Une image issue d'un
scénario réussi dans un lot partiellement échoué est identifiée comme telle.

## Résultats de la campagne de marque

| Lot local dans `ios/.build/TestResults/` | Résultat |
| --- | --- |
| `run-RY2IZq/Tests.xcresult` — iPhone compact | **22 tests unitaires et 5 tests UI réussis**, premier passage. |
| `run-D0MUvN/Tests.xcresult` — iPad sombre | **4 tests UI réussis sur 5**. Le PDF s'ouvre, puis l'attente de l'état exact `runningBackground` échoue après Home. |
| `brand-ipad-pdf-state.xcresult` — iPad sombre | **1 test ciblé réussi** : PDF, arrière-plan et retour, puis formulaire fermé sans envoi. |
| `brand-ipad-navigation.xcresult` — iPad sombre | **2 tests de suivi réussis** : navigation/À propos et accueil. |

Le test d'arrière-plan accepte désormais exactement les deux états documentés
par Apple : `runningBackground` et `runningBackgroundSuspended`, avec le même
délai de cinq secondes. Il refuse les états inconnu, arrêté ou au premier plan.
L'observation jointe au passage réussi indique `afterHome=4` (premier plan), puis
`afterWait=3` (arrière-plan). **Elle ne démontre donc pas que la suspension a
causé l'échec du premier lot. Cette cause reste indéterminée.** Aucun retry
automatique ou changement de comportement de l'application n'a été ajouté.

Les cinq scénarios distincts sont ainsi couverts sur chaque format : accueil
sans achat, navigation, très grand texte XXXL, PDF/formulaire et devis de
référence sans approbation. Les tests de marque comptent une seule signature
à l'accueil, dans l'Atelier et dans À propos, et aucune dans les autres onglets,
le PDF et le formulaire. Les tests unitaires vérifient les pixels transparents
du portrait compilé et le contraste des couleurs chargées depuis le catalogue,
en clair/sombre et avec contraste normal/élevé.

## Sélection inspectée

| Capture | Observation |
| --- | --- |
| [iPhone accueil](iphone-accueil.png) | Une signature transparente, aucun second symbole ni erreur de trousseau. |
| [iPhone Atelier](iphone-atelier.png) | Marque unique et barre native Liquid Glass. |
| [iPhone Compte XXXL](iphone-compte-texte-accessibilite.png) | Texte dans une liste défilante, onglet Compte accessible et sélectionné. |
| [iPad accueil sombre](ipad-accueil-sombre.png) | Portrait sans cartouche opaque, mot-symbole et bouton lisibles. |
| [iPad Atelier sombre](ipad-atelier-sombre.png) | Marque unique, commande principale et barre flottante natives. |
| [iPad À propos sombre](ipad-a-propos-sombre.png) | Une seule signature sur la surface de contenu. |
| [iPad PDF sombre](ipad-pdf-natif-sombre.png) | Document synthétique dans PDFKit après retour au premier plan. |
| [iPad préparation sombre](ipad-preparation-sombre.png) | Formulaire défilé, devis désactivé sans destinataire, aucun logo ajouté. |

Les autres captures restent dans les résultats bruts. La capture À propos sur
iPhone montre une notification système Apple Intelligence ; elle n'a pas été
retouchée et n'est pas retenue dans cette sélection. Les captures antérieures
à la correction de marque sont remplacées ici, tout en restant dans l'historique
Git et les résultats locaux précédents.

## Limites

Le comptage XCTest porte sur l'arbre accessible ; la revue visuelle le complète.
Le passage PDF en arrière-plan ne prouve pas l'image exacte capturée par iOS
pour le sélecteur d'applications. Le masquage à cet instant et la véritable
session d'authentification restent à vérifier sur appareil physique. La page
Auth0 distante conserve un ancien logo opaque, distinct du binaire natif ; voir
[IOS_PASSKEYS.md](../../../docs/IOS_PASSKEYS.md).

VoiceOver, toutes les préférences de transparence et de mouvement, l'appareil
physique, l'authentification réelle, l'approbation navigateur, le service mobile
de production, TestFlight et App Review ne sont pas qualifiés par ces fixtures.
Les captures n'attestent aucune livraison, soumission ou publication.

Les détails de conception et les sources Apple actuelles figurent dans
[l'audit Apple UI](../APPLE_UI_AUDIT.md). Les résultats complets restent dans
`ios/.build/`, ignoré par Git.
