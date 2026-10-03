# Décisions, état du projet et points de reprise

## Demande et livrables attendus

Film français avec Gutenberg parlant à travers sept époques de transmission de
l'information : pierre, papyrus en Égypte, imprimerie, fax, emails, sites web,
Guteneo. Deux exports souhaités : **1920 × 1080 horizontal** et **1080 × 1920
vertical Instagram**. Durée de montage prévue : **74 secondes**, soit sept scènes
de 10, 11, 10, 8, 9, 9 et 10 secondes, puis 7 secondes de fin officielle.

Le personnage doit rester centré, avec visage, bouche et objet principal lisibles
dans le format vertical. Ce centrage ne garantit pas qu'un recadrage d'une vidéo
1080p horizontale produise une vidéo verticale de qualité native : il faut
chiffrer et décider le mode de production des deux formats avant de générer.

## Validations à préserver

- Style d'animation 3D de long métrage familial, demandé comme « style Pixar ».
- Personnage de la **proposition 2** approuvé : marbre ivoire, yeux bruns
  expressifs, chevelure ondulée, grande barbe sculptée et robe drapée.
- Vocaux actuels explicitement jugés parfaits par l'utilisateur. Conserver les
  huit fichiers `archive/production/audio/01-voix.mp3` à `08-voix.mp3`.
- François-Louis, modèle Eleven v4, pour les scènes 1 à 7 ; Manon pour
  « Guteneo. La suite de vos mots. ». Aucun nouvel essai vocal nécessaire.
- Interfaces produit : uniquement de vraies captures de guteneo.com ou de
  l'application si elle est effectivement capturée. Les captures présentes sont
  celles du **site responsive**, pas de l'application native.
- Fin : même carton que la vidéo d'accueil, avec timbre, oblitération,
  `guteneo.com` et hirondelles. Réutiliser les sources officielles, sans logo IA.
- Aucune baisse de qualité pour compenser un manque de crédits.

L'identité du personnage est validée ; le bureau et la signalétique de l'image de
référence ne doivent pas contaminer les sept nouveaux environnements. Certains
lettrages bleus de cette image historique ne respectent pas les règles actuelles
de marque : garder l'image comme référence de personnage et ne pas reproduire
ces lettrages dans les nouvelles scènes. Une nouvelle signature graphique est
en minuscules et noir encre `#181b22`, avec une seule signature par carte.

## Dernière correction créative demandée

L'utilisateur constate que les plans 4, 5 et 6 se ressemblent trop. La dernière
proposition les différencie par leur lieu, leur époque, leurs accessoires, leur
lumière et leur action : bureau administratif des années 1990 pour le fax,
cybercafé vers 2000 pour les emails, place extérieure contemporaine pour le web.
Le bureau premium avec vraie fenêtre sur Luxembourg est réservé au plan 7.

La marche est proposée aux plans 2 et 6 seulement, avec une caméra qui maintient
Gutenberg au centre. Faire marcher le personnage partout ajouterait une nouvelle
répétition et compliquerait les mains, les accessoires et la synchronisation.
Les nouveaux prompts décrivent une image fixe ; les mouvements sont indiqués
séparément pour la future génération vidéo. Cette nouvelle série de scènes
**n'a pas encore été approuvée par image ni produite**.

## Ce qui existe réellement

| Éléments | État |
| --- | --- |
| 8 vocaux définitifs | Disponibles, approuvés par l'utilisateur |
| Référence personnage proposition 2 | Disponible, approuvée |
| Images des anciennes scènes H/V | Disponibles ; direction des décors dépassée |
| Seedance et Sync H05, H07, V04, V05, V06, V07 | Disponibles |
| H05 et V05 | **Rejetés** : interface dessinée sur l'arrière du moniteur |
| H01, H02, H03, H04, H06, V01, V02, V03 | Absents ; blocage de quota avant génération réussie |
| Aperçu vertical 34 s | Disponible ; V04 + V06 + V07 + fin, sans scène 5 |
| Film complet H et V de 74 s | **Non terminé, non livré** |
| Nouvelles images/scènes du storyboard révisé | Non générées |

Les fichiers nommés `Guteneo-film-final.mp4` et
`Guteneo-La-suite-de-vos-mots.mp4` à la racine de `archive/` appartiennent à la
première production : leur nom ne signifie pas qu'ils répondent au brief actuel.
L'extrait `Extrait-Pixar2-Instagram-43s.mp4` contient encore V05 et ne doit pas
servir d'aperçu validé. Le test Égypte conserve l'ancien style plus réaliste.
L'ancien ZIP et les anciens storyboards restent des archives, pas le plan courant.

## Budget : constat et responsabilité

L'utilisateur avait retenu une estimation de **630 000 crédits / 156 dollars**.
Il a ensuite signalé plus de 120 euros de crédits consommés, suivis d'une nouvelle
demande de recharge importante. Ce dépassement n'est pas une erreur de sa part.

Le décompte local vérifié de la nouvelle production est de
**601 684,087074 crédits**, hors quelques petites transcriptions dont le prix
n'est pas inclus dans ce total. La première production historique est distincte :
**123 555,631651 crédits** documentés pour ses vidéos et synchronisations, sans
prétendre couvrir tous ses autres postes.

Les causes identifiées sont le passage à quatorze vidéos natives (sept par
format), les lots d'images avec quatre variantes par défaut, les changements de
direction après production et un chiffrage incomplet. **112 images** ont été
générées. L'estimation technique de 156,35 dollars correspondait en réalité à
**947 569,476 crédits pour les vidéos et synchronisations finales seules**,
sans les préparations ni les tests. Elle ne justifiait pas l'enveloppe annoncée.

L'estimation de l'époque pour terminer les huit plans manquants et leurs
synchronisations était d'environ **558 641,706 crédits**, soit un total projeté
de **1 160 325,793 crédits** pour cette nouvelle production. Ce chiffre est
**historique et devenu insuffisant pour chiffrer la nouvelle direction** : il
n'inclut pas correctement la reprise des plans rejetés ou des décors à refaire.
Il ne faut donc ni l'utiliser comme devis actuel ni demander une recharge sur
cette base. Les prix USD d'outils ne prouvent pas le montant réel facturé en euros.

Audit détaillé : `archive/production/deliverables/cost-audit.json` et `.csv`.
Aucune génération supplémentaire n'a été effectuée pour cet archivage.

## Reprise recommandée

1. Vérifier les fichiers téléchargés avec `tools/verify_archive.py`.
2. Conserver les vocaux et le personnage validés. Examiner le storyboard révisé
   comme un ensemble pour vérifier la variété des sept lieux.
3. Définir une stratégie H/V chiffrée : dimensions natives, recadrage éventuel,
   nombre exact de variantes, essais, synchronisation, reprises et plafond total.
4. Faire valider ce budget avant tout nouvel appel payant. L'autorisation de
   sauvegarder/fusionner le dépôt n'autorise pas de nouvelles dépenses média.
5. Produire d'abord les images de référence de la nouvelle direction, puis
   les faire examiner avant de passer aux vidéos.
6. Contrôler les mains, l'orientation des appareils, les accessoires, le cadrage
   H/V et la lisibilité du visage avant et après chaque génération vidéo.
7. Conserver les timings exacts des vocaux, puis vérifier la synchronisation
   labiale et l'absence de mots coupés. Un score ASR ne prouve pas le lip sync.
8. Monter les deux films, ajouter les vraies captures en postproduction et
   réutiliser la fin officielle. Ne publier qu'après validation des exports.

## Corrections à ne pas oublier

Le moniteur doit avoir une seule face d'affichage. Si sa face est orientée vers
Gutenberg et son dos vers la caméra, le spectateur voit une coque opaque, ses
aérations et ses câbles. Le prompt ne suffit pas : il faut contrôler le résultat.
Les plans H05/V05 ont échoué sur ce point malgré une précédente revue technique.

Le tweet partagé par l'utilisateur décrit une référence audio emballée dans une
vidéo noire de durée identique, puis le remplacement du son par l'original
ElevenLabs : <https://x.com/buraktuyan/status/2106033810164908306>.
Notre essai utilise la référence audio directement prise en charge par le modèle.
Le pilote a montré une dérive variable entre la voix générée et l'original ;
un simple remplacement du son ne garantit donc pas la synchronisation.
