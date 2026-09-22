# Direction native — Guteneo

Le frontend web définit l'identité ; les conventions iOS définissent
l'interaction. L'application utilise SwiftUI, les contrôles Apple, un lecteur
PDF natif et le sélecteur de Fichiers. Le tableau de bord HTML n'est pas
encapsulé dans une WebView.

## Identité et hiérarchie

Conserver le mot-symbole **guteneo** avec son `g` minuscule. Une seule signature
associe le portrait tramé transparent au mot-symbole. Elle apparaît à l'accueil,
dans l'Atelier et dans À propos, au maximum une fois par écran. Ne pas ajouter
un deuxième symbole, un cartouche opaque ou un autre logo dans une feuille.
Le chargement et le masque de confidentialité n'affichent aucun logo ; la
signature de l'accueil disparaît pendant la connexion système. Le portrait
mesure 64 points et suit Dynamic Type jusqu'à 88 points.

L'icône de lancement système est une ressource distincte : le bitmap App Store
1024 × 1024 reste opaque. Cette contrainte ne s'applique pas au portrait de
l'interface. Une éventuelle version Icon Composer peut utiliser des calques
translucides ; son fond importé doit rester opaque et couvrir toute l'image.

Le catalogue d'assets porte les couleurs adaptatives :

| Rôle | Clair | Sombre |
| --- | --- | --- |
| Papier | `#F6F5EF` | `#17191E` |
| Encre | `#181B22` | `#F6F5EF` |
| Accent cobalt | `#2450DB` | `#90ABFF` |

Les surfaces utilisent `Surface` et les couleurs sémantiques du système. Les
titres éditoriaux emploient la variante serif des polices système ; formulaires,
listes, montants et actions utilisent les styles typographiques iOS. Les tailles
restent liées à Dynamic Type. Ne pas transformer les formulaires en affiches ou
ajouter un effet de verre décoratif aux documents.

## Navigation et actions

Quatre onglets stables : **Atelier**, **Documents**, **Envois**, **Compte**.
Chaque onglet utilise une pile de navigation native. La préparation d'un envoi
s'ouvre dans une feuille ; les champs, erreurs et actions restent visibles avec
le clavier et lorsque le texte est agrandi.

Les onglets, barres d'outils et feuilles utilisent les matériaux natifs fournis
par SwiftUI : Liquid Glass sur les systèmes récents, rendu système compatible
sur iOS 17. Ne pas dessiner un faux verre ou imposer un fond personnalisé aux
barres. Les documents, listes et formulaires appartiennent à la couche de
contenu ; ils conservent leur fond lisible. Les raffinements iOS 27 et les
préférences de transparence sont laissés au système.

L'action principale prépare une opération. La validation humaine ouvre le
navigateur système et demeure distincte de cette préparation. Le libellé doit
expliquer le prochain geste sans laisser croire qu'un envoi a déjà eu lieu.
Un changement de canal ne doit jamais être implicite.

## Documents et états

Afficher le nom du document, ses pages, son état de vérification et son contenu
réel avant une opération. Un PDF indisponible, encore en analyse ou refusé doit
proposer une explication exploitable. Ne pas assimiler la quarantaine à une
infection confirmée et ne pas masquer un échec derrière un indicateur infini.

Les listes distinguent l'attente, le traitement et les résultats confirmés.
Associer une icône et un texte à chaque état : la couleur seule ne suffit pas.
Les échecs et résultats inconnus utilisent l'encre adaptative, pour conserver
le contraste du petit texte ; leur symbole et leur libellé portent le sens.
Un état fournisseur inconnu ne doit pas être présenté comme un échec certain
ni encourager un renvoi susceptible de créer un doublon.

## Accessibilité et adaptation

Utiliser les boutons, liens, listes, onglets, formulaires et feuilles standards.
Conserver des cibles tactiles confortables et des noms VoiceOver explicites.
Les illustrations décoratives sont cachées aux technologies d'assistance ; les
informations des lignes se lisent dans un ordre logique.

Vérifier les noms de fichiers et adresses longs, les tailles d'accessibilité, le
mode sombre, l'iPhone compact, l'iPad en paysage et le retour du navigateur.
Limiter les animations ; toute animation ajoutée doit respecter Réduire les
animations. Les effets système plus récents doivent conserver un rendu de
repli sur iOS 17. Ne pas revendiquer une validation VoiceOver ou appareil avant
un essai effectif.

## Crédits et preuves

Le coût d'une opération et le solde existant peuvent informer une décision.
Aucun écran ne propose d'ajouter des crédits ou de chercher où acheter. Un
solde insuffisant doit expliquer le blocage sans invitation commerciale.

Les aperçus Debug restent explicitement fictifs et sans envoi réel. Leur
interface n'est pas une preuve de disponibilité serveur. Les captures de
publication doivent provenir du binaire final, présenter des données fictives
et décrire uniquement les fonctions réellement livrées.
