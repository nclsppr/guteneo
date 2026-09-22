# Direction native — Guteneo

Le frontend web définit l'identité ; les conventions iOS définissent
l'interaction. L'application utilise SwiftUI, les contrôles Apple, un lecteur
PDF natif et le sélecteur de Fichiers. Le tableau de bord HTML n'est pas
encapsulé dans une WebView.

## Identité et hiérarchie

Conserver le mot-symbole **guteneo** avec son `g` minuscule. Le portrait et la
marque sont des assets distincts : le portrait accompagne le mot-symbole ; le
symbole sert à l'accueil et à l'icône selon son cadrage validé. Ne pas inverser
leurs rôles.

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
