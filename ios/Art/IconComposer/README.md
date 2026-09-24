# Icône Guteneo pour Icon Composer

Le document natif [AppIcon.icon](../../Guteneo/Resources/AppIcon.icon) associe deux
calques : un papier ivoire opaque `#F6F5EF` et le **portrait tramé officiel**,
transparent. Le portrait n'est présent qu'une fois. Son bleu provient du fichier
de marque existant ; aucune autre teinte n'a été générée pour le mode normal.
Les rendus teintés suivent la couleur choisie par l'utilisateur dans iOS.

L'icône classique `AppIcon.appiconset` reste dans le dépôt comme source de
comparaison. Xcode sélectionne le document Icon Composer portant le même nom
`AppIcon` ; ses rendus de compatibilité sont produits au build pour les anciens
systèmes pris en charge par l'application.

## Sources et fabrication

- Portrait source : `../../Guteneo/Resources/Assets.xcassets/BrandPortrait.imageset/image.png`,
  512 × 512, SHA-256 `df22d2f73f7e281ece61a2c99b5331d30be344e647dc97c738d09f9df122fb9a`.
- Papier : [01-paper.svg](01-paper.svg), rectangle vectoriel 1024 × 1024 couvrant
  tout le canevas ; SVG identique dans le document natif.
- [prepare-portrait.swift](prepare-portrait.swift) dispose le portrait inchangé
  en couleur au centre d'un canevas RGBA 1024 × 1024, à 840 × 840. Le script ne
  redessine ni ne détoure le logo. Le calque obtenu a un vrai canal alpha et
  garde 92 pixels de marge de chaque côté.
- Le document à deux calques a été exploré dans l'application **Icon Composer**
  installée avec Xcode 27, puis le paquet éditable `.icon` a été conservé dans
  le dépôt. Les cinq aperçus locaux ont été rendus par son binaire officiel
  `ictool` 27.0 (129), sans retouche.

## Vérification du 22 septembre 2026

- [Rendu normal 1024 px](previews/default.png) et
  [rendu 64 px](previews/small.png) : le portrait unique reste reconnaissable et
  son bleu cohérent avec le logo. Les modes sombre, teinté et génération 26 ont
  aussi été exportés et inspectés localement ; leurs sorties ne sont pas la
  source de l'icône.
- Build iOS simulateur réussi sous Xcode 27. Le catalogue compilé contient
  `AppIcon.iconstack` avec trois plans (fond système et deux groupes), plus des
  rendus 1024 px iPhone/iPad en modes clair et sombre. Les rendus compilés sont
  opaques. Le manifeste du binaire référence `AppIcon` comme icône primaire des
  deux familles. `assetutil --validate-file` valide le catalogue.
- Les coins arrondis transparents dans les **aperçus système** proviennent du
  masque d'iOS ; le papier du document couvre le canevas de l'icône. L'exigence
  de logos transparents concerne le portrait dans l'interface et le premier
  plan de cette icône, pas le bitmap de distribution composé par Xcode.

Cette vérification locale ne remplace pas l'essai de l'icône installée sur un
appareil physique ni la validation d'une archive de distribution signée.

[Guide Apple Icon Composer](https://developer.apple.com/documentation/xcode/creating-your-app-icon-using-icon-composer).
