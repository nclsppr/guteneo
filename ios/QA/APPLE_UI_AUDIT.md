# Audit de l'interface Apple — 22 septembre 2026

Cet audit compare les sources natives aux recommandations Apple consultées à
cette date, y compris les évolutions WWDC26. Les recommandations de conception,
les exigences du produit et les preuves de soumission restent distinctes.

## Liquid Glass et navigation

Apple réserve Liquid Glass aux commandes et à la navigation qui surplombent le
contenu. Les listes, documents et fonds de contenu ne doivent pas recevoir du
verre décoratif. Les effets personnalisés doivent rester rares.
[HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials).

Guteneo utilise `TabView`, `NavigationStack`, les barres d'outils, feuilles et
formulaires SwiftUI. Aucun fond artificiel ne remplace les barres système, aucun
`glassEffect` n'est appliqué aux PDF ou aux cartes. Les composants standards
adoptent le rendu récent avec le SDK et le système appropriés, puis s'adaptent
aux préférences de transparence et de mouvement. Le fond `Paper` concerne le
contenu. Le repli iOS 17 reste celui du système.
[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass).

Les annonces 2026 précisent que les apps ayant adopté Liquid Glass reçoivent
les raffinements de lisibilité et de matière sur les systèmes 27 ; Xcode 27
retire le choix de l'ancien design. Il ne s'agit pas d'une consigne d'ajouter du
verre à chaque vue. Le projet ne possède aucune clé de compatibilité visuelle
qui désactiverait le nouveau design.
[Platforms State of the Union 2026](https://developer.apple.com/videos/play/wwdc2026/102/).

## Marque et icône

La règle « au maximum une signature par écran » vient de la demande produit.
Le doublon portrait + symbole indépendant de l'accueil a été retiré. La seule
signature associe le portrait tramé transparent au mot `guteneo`, à l'accueil,
dans l'Atelier et dans À propos. Chargement, PDF, formulaire et masque de
confidentialité n'ajoutent pas de logo. Pendant la connexion système, le logo
de l'accueil est masqué, visuellement et pour l'accessibilité.

Le PNG source du portrait, 512 × 512, utilise une palette avec transparence
`tRNS` : alpha de 0 à 255, 64 315 pixels entièrement transparents sur 262 144,
quatre coins transparents. L'icône d'app distincte, 1024 × 1024, reste RGB opaque.
L'opacité de cette icône de distribution ne justifie aucun cartouche opaque
autour des logos dans l'interface. Les icônes multicouches Icon Composer peuvent
utiliser des premiers plans translucides ; Apple demande un fond importé opaque
et couvrant toute l'image. Le catalogue classique et Icon Composer sont deux
voies documentées, sans obligation de refaire le logo en verre.
[HIG App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons),
[App Store Connect : ajouter une icône](https://developer.apple.com/help/app-store-connect/manage-app-information/add-an-app-icon).

## Lisibilité et accessibilité

Les textes suivent les styles système et Dynamic Type ; le portrait évolue de
64 à 88 points. Chaque état possède un libellé et un symbole. Les petits textes
d'échec ou de résultat inconnu utilisent maintenant `Ink`, une couleur
adaptative, pour une lisibilité prévisible ; aucune mesure non effectuée de
l'ancien orange n'est revendiquée. Les tests calculent le contraste des couleurs
chargées depuis le catalogue dans les modes clair/sombre et contraste
normal/élevé. Le seuil retenu est 4,5:1 pour le petit texte.
[HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).

Les contrôles natifs conservent leurs comportements système ; les tests ne
remplacent pas un essai VoiceOver. Les préférences Réduire la transparence,
Réduire les animations et le curseur Liquid Glass iOS 27 ne font pas encore
l'objet d'une campagne manuelle complète. Aucun changement d'ordre UIKit ou
de superposition des onglets n'est déduit de l'échec intermittent antérieur.

## Qualification de ce changement

Les résultats et captures de la campagne dédiée sont consignés dans
[Screenshots/README.md](Screenshots/README.md). Les fixtures sont exclusivement
locales et fictives. Le comptage automatique concerne les signatures exposées
dans l'arbre accessible ; la revue visuelle complète ce contrôle.

Les paires `Ink/Paper`, `Ink/Surface`, `Cobalt/Paper` et `Cobalt/Surface`
présentent respectivement des rapports 15,78 ; 17,07 ; 5,92 ; 6,41 en clair,
et 16,10 ; 14,04 ; 7,92 ; 6,91 en sombre. Ces valeurs concernent les couleurs
opaques du catalogue, pas la composition variable des barres Liquid Glass.

La source du masque de confidentialité cache aussi le contenu sous-jacent et
son accessibilité. Le scénario PDF contrôle la reprise après arrière-plan. Il
ne prouve pas le contenu exact photographié par iOS pour le sélecteur d'apps,
ni le rendu de la vraie session d'authentification sur un appareil physique.
La page Auth0 de production possède sa propre marque administrée côté serveur ;
son ancien logo opaque reste un écart distinct, décrit dans
[IOS_PASSKEYS.md](../../docs/IOS_PASSKEYS.md). La transparence vérifiée ici
concerne les ressources du binaire natif.
L'audit ne constitue pas une acceptation App Review ou une publication.
