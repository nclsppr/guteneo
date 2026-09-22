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

L'icône de lancement système est une ressource distincte : le document natif
`AppIcon.icon` place une seule fois le portrait tramé sur un papier ivoire couvrant
le canevas. Xcode produit le bitmap App Store opaque et les variantes système.
Cette contrainte ne s'applique pas au portrait transparent de l'interface.
La fabrication et les rendus sont documentés dans [Art/IconComposer](Art/IconComposer/README.md).

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

## L'atelier d'imprimeur

L'accueil et l'Atelier évoquent une table de travail d'imprimeur : papier chaud,
titres serif, filets discrets, documents et envois présentés dans un ordre utile.
Les listes et les formulaires gardent leur fonctionnement natif. La personnalité
vient du contenu éditorial et de l'illustration, sans multiplier les cadres,
les emblèmes ou les effets décoratifs.

`PrintWorkshop` est une illustration originale de presse manuelle, avec une
feuille vierge et des outils d'imprimerie. Elle ne contient ni texte, ni logo,
ni document utilisateur. Son fond transparent appartient à la couche de contenu,
pas à la navigation. Elle reste réservée à l'accueil et à l'Atelier ; les détails
vides de Documents et Envois utilisent un SF Symbol et un conseil concret.
L'illustration ne remplace aucune information et reste masquée à VoiceOver, sans
intercepter les gestes.

Son bleu électrique reprend le portrait réel : `#0033F9` est une couleur présente
dans ses pixels, avec des nuances possibles pour les hachures et la gravure.
Cette référence ne change ni les pixels du logo, ni les accents adaptatifs des
contrôles. Conserver les surfaces ivoire et la transparence de l'illustration,
sans rendu template, halo ou cartouche. La provenance et les contrôles du fichier
sont consignés dans [Art/README.md](Art/README.md).

L'accueil et l'Atelier utilisent deux colonnes lorsque la largeur disponible
atteint 800 points, que la classe horizontale est `regular` et que Dynamic Type
n'utilise pas une taille d'accessibilité. Le critère est la fenêtre actuelle,
pas le modèle d'appareil ni sa seule orientation. L'Atelier juxtapose alors les
derniers envois et les documents récents. En fenêtre étroite ou en taille
d'accessibilité, le contenu reprend un ordre vertical défilant. L'illustration
de l'Atelier s'efface dans cette disposition ; l'accueil peut la conserver en
petit format hors tailles d'accessibilité.

## Navigation et actions

Quatre onglets stables : **Atelier**, **Documents**, **Envois**, **Compte**.
Atelier et Compte utilisent une pile de navigation native. Documents et Envois
emploient `NavigationSplitView` : liste et détail côte à côte lorsque la fenêtre
le permet, navigation compacte et retour natif sous le contrôle du système
lorsqu'elle se rétrécit. La colonne de liste propose 340 points, dans une plage
de 280 à 420 points ; elle ne force pas une largeur de fenêtre. Une sélection
explicite ouvre le détail, sans présélection arbitraire.

La sélection repose sur l'identifiant du document ou de l'envoi. Le `.id` de la
pile de détail renouvelle ses états de chargement et de présentation lorsque
cet identifiant change : une ancienne feuille ou un ancien contenu ne doit pas
se retrouver associé au nouvel élément. Un élément absent d'une page actualisée
ou d'un filtre n'est pas réputé supprimé. La consultation du détail charge ses
métadonnées ; le PDF n'est téléchargé qu'après l'action explicite « Lire le PDF
original ».

La préparation d'un envoi s'ouvre dans une feuille ; les champs, erreurs et
actions restent visibles avec le clavier et lorsque le texte est agrandi.

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
animations. Les transitions sont celles de la navigation et des présentations
système. Le retour tactile de succès accompagne uniquement un dépôt PDF réussi,
après réception de son identifiant ; il ne simule ni progression, ni vérification
du document, ni envoi. Aucun rebond systématique ou son supplémentaire n'est
ajouté. Les effets système plus récents doivent conserver un rendu de repli sur
iOS 17. Ne pas revendiquer une validation VoiceOver ou appareil avant un essai
effectif.

Pendant l'inactivité, le masque de confidentialité cache aussi le contenu à
l'accessibilité et désactive ses interactions. Son cadenas et son texte ne
constituent pas une signature supplémentaire. La signature de l'accueil garde
sa place mais devient invisible et inaccessible pendant la connexion système.

## Crédits et preuves

Le coût d'une opération et le solde existant peuvent informer une décision.
Aucun écran ne propose d'ajouter des crédits ou de chercher où acheter. Un
solde insuffisant doit expliquer le blocage sans invitation commerciale.

Les aperçus Debug restent explicitement fictifs et sans envoi réel. Leur
interface n'est pas une preuve de disponibilité serveur. Les captures de
publication doivent provenir du binaire final, présenter des données fictives
et décrire uniquement les fonctions réellement livrées.
