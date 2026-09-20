# Contrôle des icônes de soumission

Audit du **21 septembre 2026** sur le candidat local, suivi d’une adaptation du composer demandée par l’éditeur. L’original d’annuaire n’a pas été modifié. L’acceptation du fichier, sa lisibilité et son affichage final dans ChatGPT sont des contrôles distincts.

## Contraintes vérifiées dans la documentation

La [référence officielle des erreurs d’image](https://developers.openai.com/plugins/deploy/submission-errors#image-errors), récupérée le 21 septembre, demande une image carrée pour `interface.logo` et `interface.composerIcon`. Elle accepte PNG, JPEG, WebP et SVG ; les images raster doivent mesurer entre **48 × 48** et **4 096 × 4 096 px**, peser au plus **5 Mio**, et avoir une extension cohérente avec leur format réel.

Cette page décrit les assets de marque des paquets. La [page de soumission](https://developers.openai.com/plugins/deploy/submission) demande des assets prêts pour la production, sans préciser dans le texte consulté de dimensions différentes pour les deux usages. Aucune obligation de transparence, de fond monochrome, ni de variantes distinctes clair/sombre n’a été trouvée dans ces deux références. Les indications propres au formulaire et son aperçu doivent être relus avant de conclure sur les uploads distants.

Les contraintes des captures de l’UI MCP, notamment leur largeur de 706 px, ne s’appliquent pas aux icônes de marque.

## Fichier effectivement examiné

| Propriété                             | Observation                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| Fichier                               | `apps/web/public/brand/guteneo-mark.png`                                       |
| Format détecté                        | PNG                                                                            |
| Dimensions                            | 512 × 512 px                                                                   |
| Taille                                | 249 823 octets                                                                 |
| Transparence                          | Aucun canal alpha ; fond blanc opaque                                          |
| SHA-256                               | `d6a83bbe53abb6ffac19d66a66d02b5992887a4796d909fb86043c356580e8c9`             |
| Occupation du bleu                    | De x = 17 à 494 et y = 19 à 491 inclus, selon le seuil de bleu de l’inspection |
| Usage dans le paquet avant adaptation | Même fichier déclaré pour `logo` et `composerIcon`                             |

Les dimensions, la taille et le format satisfont les contraintes documentées. Le dessin respecte la [charte Guteneo](../../docs/BRAND_IDENTITY.md), qui réserve cet emblème simple aux petits emplacements, aux favicons et au MCP. Le portrait tramé et le timbre avec texte ont d’autres usages.

## Lecture visuelle et décision

Le PNG 512 px, son export WebP 128 px et les favicons 32/16 px existants ont été ouverts. À 512 et 128 px, le portrait bleu et la denture restent propres et reconnaissables, sans texte à déchiffrer. À 32 et surtout 16 px, les détails du visage et la double bordure deviennent denses. Ce constat ne prouve pas un défaut dans le composer : il faut vérifier sa taille et son rendu réels dans le portail.

Le fond est blanc jusque dans les coins. Il peut donc apparaître comme une tuile blanche sur un thème sombre. Ce n’est pas une non-conformité documentaire établie. Une conversion automatique de tous les pixels blancs en transparence modifierait aussi les contreformes du portrait et leur contraste ; ce n’est pas un simple changement de format.

Le fichier n’exigeait pas de correction de dimensions ou de format. L’éditeur a demandé un dérivé plus adapté au composer : un extérieur réellement transparent et un cadre intérieur simplifié, en conservant le portrait, le bleu et la denture. Cette adaptation est documentée ci-dessous ; elle ne remplace pas l’asset d’annuaire ou les icônes du site.

## Dérivé du composer livré

L’outil `image_gen` a produit un PNG carré à partir de l’original. Le fichier généré a été conservé tel quel, sans retouche, modification de l’alpha ou redimensionnement. Le [master et sa provenance](../../assets/brand/source/guteneo-composer-transparent.png.json) décrivent le prompt exact et les copies.

| Propriété                      | Observation                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Fichier public candidat        | `apps/web/public/brand/guteneo-composer.png`                                                             |
| Fichier du paquet              | `integrations/guteneo/assets/guteneo-composer.png`                                                       |
| Dimensions et format           | 1 254 × 1 254 px, PNG RGBA                                                                               |
| Taille                         | 977 001 octets                                                                                           |
| SHA-256                        | `2dd792b032c4e244072494fef71344aa270893c4bf8e92c44600234eccb394cc`                                       |
| Pixels totalement transparents | 515 191 ; les quatre coins ont un alpha nul                                                              |
| Alpha du dessin                | Majoritairement 254/255, avec anticrénelage ; les contreformes blanches restent visibles sur fond sombre |
| Marges visibles                | x = 92 à 1 158 et y = 94 à 1 155 inclus, sur 1 254 px                                                    |

Une page de contrôle locale a été ouverte dans le navigateur CUA, sur fonds blanc et `#212121`, aux tailles **16, 24, 32, 48, 64 et 128 px**. L’extérieur transparent supprime la tuile blanche du fichier original ; les contreformes et le cadre simplifié restent visibles. Le personnage est reconnaissable et les détails du visage restent naturellement limités à 16 px. Les captures ont été examinées pendant la session ; le rapport local est `reports/icon-qa/proof.json` et la page de contrôle `reports/icon-qa/index.html`.

Le manifeste référence désormais le dérivé uniquement pour `composerIcon`. **Le contrôle du véritable aperçu du portail et l’upload restent à faire** ; ce contrôle local ne les atteste pas. Les deux fichiers respectent les contraintes de format et de dimensions documentées.

## Brief de référence

L’adaptation utilise le PNG original comme cible d’édition. Le prompt complet exécuté se trouve dans la provenance ; son intention est :

> Préparer une variante d’intégration du logo Guteneo joint pour le composer ChatGPT. Préserver exactement le portrait de Gutenberg, son orientation, sa silhouette, ses traits, le bleu et la denture du timbre. Ne pas redessiner le visage, ne pas ajouter de texte, d’ombre, de texture ou de dégradé. Remplacer uniquement le fond extérieur au contour dentelé par une transparence alpha réelle ; conserver les contreformes blanches intérieures et la géométrie du dessin. Image carrée, centrée, sans recadrage du timbre, au moins 512 × 512 px. Ne pas simuler la transparence par un damier.

Le résultat est un dérivé généré avec simplification du cadre, pas une exportation identique de l’emblème approuvé. La comparaison locale a été faite ; le rendu final dépend encore de l’hôte.
