# État du candidat iOS — 22 septembre 2026

Le candidat est une application SwiftUI pour iPhone et iPad, avec PDFKit,
authentification dans le navigateur système et API mobile dédiée. Il reprend
les ressources de marque et la palette du frontend. Il n'affiche aucune recharge
ni invitation à un achat externe. La validation humaine d'un véritable envoi
reste dans une page de navigateur authentifiée, distincte de l'app.

## Preuves locales

- Branche `codex/native-ios`, intégrée sur `origin/main` au commit `22c24d5`.
  Les préparations de référence `review_prepare_only` restent consultables et
  ne proposent aucune approbation ni expédition, dans l'app et le navigateur.
- Backend : 87 tests ciblés réussis après cette intégration, dont 14 tests
  mobiles, 28 tests de préparation de revue, 31 d'authentification et 14 de compte.
  Typage, lint et compilation complète réussis. La compilation Worker est un
  essai local sans déploiement.
- Migration `0037_native_sessions.sql` : 37 migrations vérifiées localement,
  241 objets de schéma équivalents, `quick_check=ok`, aucune violation de clé
  étrangère. Aucune migration de production n'a été exécutée.
- Les essais natifs, leurs résultats et captures brutes sont documentés dans
  [Screenshots/README.md](Screenshots/README.md) et [le guide iOS](../README.md).
  Les comptes, documents et résultats de ces écrans sont fictifs.
- L'URL de confidentialité `https://guteneo.com/confidentialite/` a été vérifiée
  publiquement : elle décrit le service et les critères de conservation du
  21 septembre. L'app ouvre directement cette page.

Les résultats locaux détaillés sont conservés dans `ios/.build/`, exclu du dépôt.
Le workflow `Guteneo iOS` permet de produire des résultats XCTest et une archive
non signée sur la branche examinée. Un résultat local n'est pas une preuve de
réussite du workflow distant ; consulter le statut réel de la pull request.

## Ce qui empêche encore une soumission App Store

| Élément | État et travail restant |
| --- | --- |
| Suppression du compte | L'app enregistre une demande authentifiée. Il reste à implémenter et qualifier le traitement effectif, avec les critères publics existants, le traitement des espaces partagés et les prestataires. La demande n'est pas une suppression réalisée. Voir [ACCOUNT_DELETION.md](../../docs/ACCOUNT_DELETION.md). |
| Service mobile en production | Le contrat mobile et la migration sont locaux. Une mise en service autorisée, vérifiée et compatible avec le binaire est nécessaire. |
| Signature de distribution | L'équipe propriétaire du bundle doit être confirmée. Aucun certificat Apple Distribution utilisable n'a été trouvé pendant le contrôle local. L'archive non signée n'est pas soumissible. |
| Appareil physique | Aucun appareil physique disponible pendant le contrôle. Restent la connexion réelle, l'import, le suivi, VoiceOver et le masque de confidentialité au changement d'app. |
| App Review et TestFlight | Compte dédié autorisé, parcours reproductible, archive signée, validation Apple, installation TestFlight et captures du binaire final restent à qualifier. Aucun identifiant reviewer n'est inventé. |

Les textes français de fiche, les notes de review, le manifeste et le relevé des
données sont préparés dans [AppStore](../AppStore/REVIEW_POLICY.md). Ils doivent
correspondre au binaire et au service finalement soumis. Le canal email reste
fermé dans les capacités de production observées ; la fiche actuelle promet la
préparation du fax, selon les disponibilités du compte.

Ce dossier n'atteste ni livraison réelle, ni soumission, ni acceptation Apple,
ni publication. Le candidat ne doit pas être présenté comme prêt à publier tant
que ces conditions obligatoires restent ouvertes.
