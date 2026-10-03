# Gutenberg à travers les âges — storyboard et prompts de reprise

Dernière mise à jour : 3 octobre 2026.

**Statut : proposition écrite à valider.** Ce document formalise la dernière direction proposée après les critiques sur la ressemblance des plans 4, 5 et 6. Les images et vidéos correspondant à cette nouvelle direction n'ont pas encore été générées. Les fichiers déjà produits suivent en grande partie une direction antérieure.

La proposition 2 de Gutenberg a été explicitement choisie par le client. Les vocaux actuels ont été explicitement jugés parfaits : **conserver les fichiers et les textes sans changement**. L'autorisation d'archiver le travail dans Git ne constitue pas une nouvelle autorisation de dépenser des crédits de génération. La production payante reste suspendue après le dépassement budgétaire ; définir et approuver son budget total avant de la reprendre.

## 1. Fichiers de référence et conventions

Les chemins ci-dessous sont relatifs au dossier de cette archive documentaire. Ils supposent que le contenu historique de `/workspace/guteneo/` est conservé sous `archive/`. Si l'archive est stockée séparément pour des raisons de taille, son arborescence doit rester identique.

| Usage | Fichier ou dossier |
|---|---|
| **Référence Gutenberg validée — proposition 2** | `archive/production/images/Pixar-proposition-2.png` |
| Sept vocaux narrateur validés | `archive/production/audio/01-voix.mp3` à `07-voix.mp3` |
| Signature de Manon validée | `archive/production/audio/08-voix.mp3` |
| Audios de référence calés, scènes 1 à 6 | `archive/production/audio/01-reference.wav` à `06-reference.wav` |
| **Audio de référence final de la scène 7** | `archive/production/audio/07-reference-finale.wav` |
| Mixages scène par scène existants | `archive/production/finishing/scene-01-audio.wav` à `scene-07-audio.wav` |
| Référence officielle du site | `archive/brand-reference/guteneo-homepage-horizontal-v8-fr.mp4` et `guteneo-homepage-vertical-v8-fr.mp4` |
| Fins officielles déjà préparées | `archive/production/finishing/endcard-horizontal-preview.mp4` et `endcard-vertical-preview.mp4` |
| Captures réelles du produit | `archive/production/product/` |
| État historique détaillé | `archive/production/final-production.json` et `state.json` |

**Piège à éviter pour la scène 7 :** `07-reference.wav` et `07-voix-ancienne-conclusion.mp3` sont anciens. Pour le texte décrit ici, utiliser `07-voix.mp3` et `07-reference-finale.wav`. Ne pas rétablir l'ancienne conclusion commençant par « Les supports évoluent… ».

## 2. Principes créatifs retenus

Le personnage assure la continuité du film ; les lieux montrent le changement d'époque. Il faut donc reprendre l'identité de Gutenberg de la proposition 2, **sans recopier son bureau, son éclairage ou son décor** dans les six scènes historiques et contemporaines précédant Guteneo.

- Animation 3D de long métrage familial, dans le style Pixar demandé par le client : formes expressives, matériaux tactiles, composition de cinéma. Éviter le rendu photoréaliste de la première direction.
- Gutenberg conserve le même visage, les mêmes yeux bruns expressifs, le nez arrondi, la chevelure ondulée, la longue barbe sculptée, le marbre ivoire et le drapé de la référence. Il traverse les époques comme un narrateur ; ses vêtements ne changent pas à chaque scène.
- Sept identités visuelles : roche et terre ; Égypte vive et lumineuse ; bois sombre et papier ; administration des années 1990 ; cybercafé nocturne des années 2000 ; place contemporaine extérieure ; bureau Guteneo au Luxembourg.
- La bouche reste visible pendant la parole. Les documents ne doivent pas masquer le bas du visage. Des gestes simples valent mieux qu'une accumulation de manipulations difficiles à rendre correctement.
- Le bureau premium bleu et ivoire avec vue sur le Luxembourg est réservé à la scène 7. Il n'y a pas de papier peint représentant une ville.
- Aucun logo Guteneo ou écran produit ne doit être recréé par le modèle. Toute interface Guteneo montrée dans le montage provient d'une vraie capture.
- L'orthographe historique ou la lisibilité d'un texte généré n'est pas un objectif des accessoires. Les petites inscriptions peuvent rester illisibles ; le texte publicitaire et les marques sont ajoutés à partir des vrais éléments.

### Règles de marque du dépôt

Pour toute nouvelle signalétique ou composition de marque, respecter les règles `AGENTS` / `BRAND` du dépôt : `guteneo` et `guteneo.com` en minuscules, logo noir **`#181b22`**, une seule signature. Les hirondelles disposent d'un asset du site : `apps/web/public/luxembourg-blue-swallow-sheet.webp`, à rechercher depuis la racine du dépôt ; ne pas en improviser une autre identité graphique.

La proposition 2 comporte historiquement une signalétique bleue. **Le client en a validé l'identité du personnage ; cette validation ne transforme pas ses logos bleus en nouvelle règle de marque.** Archiver l'image intacte, en extraire seulement la référence du personnage et ne pas reproduire cette signalétique dans les nouveaux décors.

La séquence finale officielle demandée par le client est réutilisée telle quelle comme source historique approuvée. Ne pas recolorier, redessiner ou « corriger » ses éléments de marque en appliquant mécaniquement les règles de création nouvelle. Conserver les sources officielles intactes et documenter toute adaptation technique de cadrage.

### Ce qu'il faut challenger dans la demande

1. **Faire marcher Gutenberg dans tous les plans créerait une nouvelle répétition.** Garder le déplacement pour le quai du Nil et la place contemporaine ; varier ailleurs le geste et le mouvement de caméra.
2. **« Ancien » ne signifie pas antique pour le fax.** Un bureau administratif autour de 1990, avec son éclairage, ses plastiques et ses meubles, sera plus juste et plus distinctif qu'un autre atelier de bois.
3. **Une image fixe ne décrit qu'un instant.** Les prompts d'images ci-dessous définissent une pose de départ cohérente. Les déplacements et les enchaînements de gestes sont réservés au prompt vidéo.
4. **Le centrage ne suffit pas à garantir deux exports de qualité équivalente.** Dans une image 16:9, un recadrage vertical 9:16 ne conserve que 31,64 % de la largeur. À partir d'une source 1920 × 1080, le recadrage ne représente qu'environ 608 × 1080 pixels avant agrandissement. Ne pas présenter ce résultat comme un rendu vertical natif 1080 × 1920. Une source réellement plus grande ou une génération verticale distincte peut être nécessaire ; choisir cette stratégie avec son coût avant la reprise.
5. **Une belle image ne valide pas un plan vidéo.** Vérifier aussi la géométrie des appareils, les mains, le sens de circulation du papier, le maintien des accessoires pendant le mouvement et la synchronisation avec les voix originales.

## 3. Vue d'ensemble et minutage prévisionnel

Les durées de plans réservent de l'air autour des voix, sans couper les mots ni accélérer le débit. Elles reprennent le découpage courant de production. Les durées audio ci-dessous décrivent les fichiers existants ; les timings exacts de placement restent dans les audios de référence et de finition.

| Plan | Période et lieu | Durée du plan | Voix seule | Repère dans le film | Action dominante |
|---|---|---:|---:|---|---|
| 1 | Transmission gravée, abri rocheux ouvert | 10 s | 9,20 s | 00:00–00:10 | Montrer l'effort de porter la pierre |
| 2 | Égypte ancienne, quai du Nil | 11 s | 9,68 s | 00:10–00:21 | Deux pas et présentation du papyrus |
| 3 | Mayence, vers 1450, atelier d'imprimerie | 10 s | 9,04 s | 00:21–00:31 | Lever une feuille fraîchement imprimée |
| 4 | Bureau administratif, vers 1990 | 8 s | 7,12 s | 00:31–00:39 | Engager une seule feuille dans le fax |
| 5 | Cybercafé urbain, vers 2000 | 9 s | 7,28 s | 00:39–00:48 | Cliquer, puis regarder le spectateur |
| 6 | Place devant une médiathèque actuelle | 9 s | 7,28 s | 00:48–00:57 | Deux pas puis un geste d'ouverture |
| 7 | Bureau Guteneo, Luxembourg actuel | 10 s | 9,68 s | 00:57–01:07 | Poser le document et conclure |
| Fin | Séquence officielle du site | 7 s | 2,72 s, Manon | 01:07–01:14 | Slogan, identité officielle, hirondelles |

Durée cible actuelle : **74 secondes**, dont 67 secondes de scènes et 7 secondes de fin officielle. Ces durées ne sont pas une preuve que les quatorze variantes H/V existent : la production est incomplète.

## 4. Utilisation des prompts d'image

Pour chaque scène, joindre **la même image** `Pixar-proposition-2.png` à ChatGPT. Ne pas joindre une ancienne scène avec son décor comme seule référence de personnage : cela favoriserait le retour du même environnement.

Chaque bloc ci-dessous est un prompt autonome. Demander d'abord **une image par scène**, et vérifier la série complète avant toute animation payante. L'image est un plan de départ, pas une planche à cases et pas un montage de plusieurs moments. La consigne de haute résolution désigne un objectif ; vérifier la taille réellement obtenue à l'export.

Le cadre 16:9 demandé ici prépare la composition horizontale. L'examen du recadrage 9:16 est une validation de composition, pas une décision de produire le film vertical par simple agrandissement.

## 5. Plan 1 — La pierre : un message qui pèse

**Voix existante, texte exact :**

> Je suis Gutenberg. Bien avant mes livres, on gravait les messages dans la pierre. Solide… mais peu pratique à transporter !

**Décor et intention.** Un abri rocheux ouvert sur un paysage aride. Roche irrégulière, poussière, outils simples de pierre et de bois. Palette terre rouge, calcaire et gris. Le poids du support doit se comprendre visuellement. Le ton comporte une légère pointe d'humour, sans grimace caricaturale.

**Mouvement prévu, 10 secondes.** Caméra presque fixe, éventuellement une très légère approche. Gutenberg soulève modestement la dalle, manifeste son poids puis adresse un regard complice au spectateur. Ses mains soutiennent réellement la pierre. Ne pas faire graver, soulever et marcher simultanément.

**Prompt ChatGPT — image de départ :**

```text
Crée une seule image de cinéma d'animation 3D, dans le style Pixar d'un long métrage familial, en format horizontal 16:9 et à la plus haute résolution disponible.

L'image jointe est uniquement la référence d'identité de Gutenberg, validée comme « proposition 2 ». Reprends fidèlement son visage, ses yeux bruns expressifs, son nez arrondi, ses cheveux ondulés, sa longue barbe sculptée, ses proportions, sa matière de marbre ivoire et son vêtement drapé. Conserve cette identité dans un rendu 3D stylisé et tactile, sans photoréalisme. Ne reprends ni le bureau, ni le mobilier, ni le décor, ni l'éclairage de l'image de référence.

Place Gutenberg dans un abri rocheux ancien, ouvert sur un paysage aride. Les parois sont brutes et irrégulières ; quelques outils simples en pierre et en bois se trouvent au sol. La palette associe terre rouge, calcaire clair et gris minéral. Une lumière matinale rasante révèle les reliefs de la roche et du marbre. Aucun meuble moderne ni décor de bureau.

Gutenberg se tient au centre, presque face à la caméra, cadré à mi-cuisses. Il porte devant le bas de son torse une petite dalle de pierre irrégulière, suffisamment épaisse pour sembler lourde. Quelques pictogrammes simples sont gravés dessus. Ses deux mains soutiennent le poids de manière physiquement crédible. La dalle reste sous sa barbe et sa bouche est entièrement dégagée. Son expression suggère un léger effort et un humour chaleureux, sans grimace excessive.

Compose l'image pour que le visage, les mains et la dalle restent dans la bande verticale centrale d'environ un tiers de la largeur, afin de préparer aussi une composition 9:16. Laisse de l'air au-dessus de sa tête. Le paysage peut s'étendre sur les côtés. Produis un seul instant stable, pas plusieurs poses. Anatomie cohérente, doigts distincts, objet unique, aucun texte publicitaire, aucun logo, aucun filigrane.
```

**À vérifier avant animation :** dalle supportée, bras non déformés, pictogrammes simples, pas de meubles empruntés au bureau de référence, visage intact dans la coupe verticale. Ambiance possible : pierre et léger souffle, sous la voix.

## 6. Plan 2 — Le papyrus : les mots quittent la pierre

**Voix existante, texte exact :**

> En Égypte, le papyrus change la donne. Léger, il se roule et s’emporte. Les mots voyagent avec ceux qui les portent.

**Décor et intention.** Quai ou embarcadère de l'Égypte ancienne au bord du Nil : eau turquoise, roseaux verts, bateau de bois, voile de lin, bâtiments ocre et touches de bleu et rouge d'une toile d'ombrage. La couleur et le mouvement donnent immédiatement une personnalité différente du plan de pierre. Le lieu choisi rend lisible le voyage des mots et situe correctement le papyrus en Égypte.

**Mouvement prévu, 11 secondes.** Gutenberg fait deux petits pas vers l'avant tandis que la caméra recule doucement pour le garder au centre. Il présente le papyrus partiellement déroulé, sans passage devant la bouche. Roseaux et toile bougent légèrement ; le bateau demeure amarré. Pas de traversée de foule ni de mouvements complexes de doigts.

**Prompt ChatGPT — image de départ :**

```text
Crée une seule image de cinéma d'animation 3D, dans le style Pixar d'un long métrage familial, en format horizontal 16:9 et à la plus haute résolution disponible.

Utilise l'image jointe, « proposition 2 », uniquement pour conserver exactement l'identité de Gutenberg : même visage, mêmes yeux bruns expressifs, même nez arrondi, mêmes cheveux ondulés, même longue barbe sculptée, mêmes proportions, même marbre ivoire et même vêtement drapé. Le personnage est une statue vivante expressive au rendu stylisé et tactile. Ne copie pas le décor, le bureau, les accessoires ou la lumière de l'image jointe. Pas de photoréalisme.

Invente un véritable lieu différent : un quai de l'Égypte ancienne au bord du Nil, vivant et très coloré. L'eau turquoise et les roseaux verts occupent une partie du fond. Un bateau de bois à voile de lin est amarré. Quelques bâtiments ocre, paniers et poteries se trouvent près d'un auvent de toile avec des touches de bleu et de rouge. La lumière est solaire, claire et chaleureuse ; les couleurs restent élégantes et lisibles. Ne transforme pas le lieu en palais doré, en décor de pyramides géantes ou en bureau.

Gutenberg est au centre du quai, presque face à nous, cadré à mi-cuisses. Sa posture naturelle suggère qu'il va avancer tranquillement, mais l'image ne montre qu'un instant stable. Il tient devant le bas du torse un rouleau de papyrus partiellement déroulé, léger et fibreux. Ses mains sont crédibles, ses bras ne se croisent pas et le papyrus ne masque ni sa bouche ni sa barbe. Son expression est curieuse, lumineuse et accueillante.

Garde sa tête, sa bouche, ses mains et le papyrus dans une bande verticale centrale d'environ un tiers de l'image pour préparer une composition 9:16. Laisse une marge au-dessus de sa tête. Le quai et le Nil donnent de la profondeur sur les côtés. Aucun texte publicitaire, aucune marque, aucun logo, aucune interface, aucun filigrane. Un seul personnage principal et un seul rouleau cohérent.
```

**À vérifier avant animation :** palette nettement plus colorée, Égypte identifiable sans cliché monumental envahissant, rouleau unique et de taille crédible, trajectoire de deux pas dégagée. Ambiance possible : froissement léger de papyrus, eau et vent doux.

## 7. Plan 3 — L'imprimerie : une idée, des milliers de lecteurs

**Voix existante, texte exact :**

> Au quinzième siècle, mes caractères mobiles contribuent à multiplier les livres en Europe. Une même idée peut toucher des milliers de lecteurs.

**Décor et intention.** Atelier de Mayence autour de 1450 : presse à vis en bois plausible, poutres sombres, casses de caractères mobiles, outils d'encrage et quelques pages suspendues. Une petite fenêtre diffuse une lumière plus froide sur le papier crème. L'espace est artisanal et précis, pas un bureau moderne décoré avec une presse.

**Mouvement prévu, 10 secondes.** Gutenberg lève et présente une feuille. Un léger mouvement de caméra peut accompagner le geste. La presse demeure mécaniquement stable : éviter la rotation d'une grosse vis et la manipulation de la feuille pendant toute la diction. La phrase reconnaît sa contribution européenne ; ne pas réécrire le texte pour lui attribuer l'invention mondiale de l'imprimerie.

**Prompt ChatGPT — image de départ :**

```text
Crée une seule image de cinéma d'animation 3D, dans le style Pixar d'un long métrage familial, au format horizontal 16:9 et à la plus haute résolution disponible.

L'image jointe « proposition 2 » définit uniquement le personnage. Reprends exactement ce Gutenberg : visage, grands yeux bruns expressifs, nez arrondi, chevelure ondulée, longue barbe sculptée, proportions, marbre ivoire et drapé. Il reste une statue vivante stylisée aux matériaux tactiles. Ne reprends aucun élément de son bureau de référence et n'imite pas le photoréalisme.

Le lieu est un atelier d'imprimerie de Mayence vers 1450. Montre une presse à vis en bois dont l'assemblage est mécaniquement plausible, des poutres sombres, des casses contenant des caractères mobiles, quelques outils d'encrage et des pages suspendues pour sécher. L'atelier est intime, fonctionnel, habité par le travail. Une petite fenêtre apporte une lumière légèrement froide qui contraste avec le bois brun sombre et le papier crème. Aucun ordinateur, aucune imprimante moderne, aucun mobilier de bureau contemporain.

Gutenberg se tient au centre, presque face à la caméra, cadré à mi-cuisses. Il tient de ses deux mains une feuille crème fraîchement imprimée, devant son torse et sous la barbe. Sur la feuille, deux colonnes fines suggèrent une impression historique sans exiger de mots lisibles. Il est fier et heureux de partager sa découverte, avec une expression subtile. La bouche reste complètement visible. Les mains et les coins de la feuille ont une géométrie cohérente.

Place le visage, les mains et l'essentiel de la feuille dans la bande verticale centrale d'environ un tiers de l'image pour une composition 9:16. Laisse de l'air au-dessus de sa tête. La presse est visible autour de lui sans masquer son visage et sans placer une pièce de bois devant sa bouche. Un seul instant stable, aucune planche en plusieurs cases, aucun logo, aucun slogan, aucun filigrane.
```

**À vérifier avant animation :** période cohérente, architecture de presse plausible, feuille rectangulaire unique, typographie discrète, pas de trop grandes machines en arrière-plan. Ambiance possible : bois et mécanique légère, froissement de papier.

## 8. Plan 4 — Le fax : l'administration autour de 1990

**Voix existante, texte exact :**

> Puis le fax transmet les documents à distance. Une feuille entre ici… sa copie apparaît ailleurs.

**Décor et intention.** Bureau administratif d'expédition autour de 1990, immédiatement reconnaissable : plafond suspendu, tubes fluorescents, linoléum, armoires métalliques, classeurs, bacs à courrier et horloge analogique. Gris clair, vert désaturé et plastique beige. Ce plan abandonne le bois premium, la lumière dorée et la vue du Luxembourg.

**Mouvement prévu, 8 secondes.** Gutenberg engage une seule feuille dans l'alimentation visible du fax, puis regarde la caméra. Ne pas montrer la « copie ailleurs » en faisant sortir une seconde feuille du même appareil : le texte l'explique, un éventuel son ponctue l'idée. Le trajet de la feuille doit rester physiquement compréhensible. Caméra fixe ou infime approche ; Gutenberg ne marche pas.

**Prompt ChatGPT — image de départ :**

```text
Crée une seule image de cinéma d'animation 3D, dans le style Pixar d'un long métrage familial, en format horizontal 16:9 et à la plus haute résolution disponible.

L'image jointe « proposition 2 » est uniquement la référence d'identité de Gutenberg : conserve son visage, ses yeux bruns expressifs, son nez arrondi, ses cheveux ondulés, sa longue barbe sculptée, son marbre ivoire, ses proportions et son vêtement drapé. Même personnage stylisé et tactile, sans photoréalisme. Ne copie surtout pas le bureau élégant, les couleurs décoratives ou la fenêtre de l'image de référence.

Place-le dans un bureau administratif d'expédition vers 1990. Le lieu possède un plafond suspendu avec des tubes fluorescents, un sol en linoléum, des armoires métalliques, des classeurs, des bacs à courrier et une horloge analogique. La palette associe gris pâle, vert désaturé et beige plastique. La lumière est uniforme et légèrement froide, typique d'un bureau de cette époque. Aucun chêne premium, aucune vue de Luxembourg, aucun écran moderne, aucun éclairage doré de showroom.

Au centre, Gutenberg se tient derrière un poste de travail simple. Devant lui, assez bas pour dégager son torse et sa bouche, se trouve un fax beige de l'époque avec combiné téléphonique latéral, petit afficheur, clavier physique et alimentation papier parfaitement identifiable. Gutenberg tient UNE seule feuille au-dessus de cette alimentation, prêt à l'y engager. La feuille ne traverse aucune pièce de la machine et aucun autre papier ne sort simultanément. Son autre main reste naturelle. Son expression est attentive et complice, tournée presque vers la caméra.

Garde le visage, les mains, la feuille et les éléments essentiels du fax dans la bande verticale centrale d'environ un tiers de l'image. Laisse une marge au-dessus de sa tête. Le reste du bureau s'étend latéralement. Le personnage, la machine et le papier doivent être physiquement cohérents. Aucun logo, aucune fausse marque, aucun slogan, aucun filigrane, pas de collage de plusieurs instants.
```

**À vérifier avant animation :** fax identifiable et daté, une feuille seulement, alimentation et combiné stables, aucune duplication de papier, mains sans fusion avec la machine. Ambiance possible : mécanique et signal discret du fax, suffisamment bas pour laisser entendre chaque mot.

## 9. Plan 5 — Les emails : cybercafé autour de 2000

**Voix existante, texte exact :**

> Avec les emails, quelques secondes suffisent. Le message traverse les frontières et rejoint son destinataire.

**Décor et intention.** Cybercafé urbain du début des années 2000, en soirée. Rangées de postes, petites cloisons, chaises colorées, rue nocturne derrière la vitrine. Palette bleu-violet et touches ambre. Un écran cathodique donne une époque claire et éloigne ce plan du fax comme du bureau final.

**Mouvement prévu, 9 secondes.** Gutenberg clique avec la souris, puis relève le regard vers le spectateur. La caméra reste fixe. La façade d'affichage du moniteur fait face à Gutenberg : le spectateur voit sa coque arrière opaque, sa ventilation et ses câbles. **Aucune interface n'apparaît sur l'arrière du moniteur.** L'envoi se comprend par le geste et le son ; il n'est pas nécessaire de montrer un écran.

**Prompt ChatGPT — image de départ :**

```text
Crée une seule image de cinéma d'animation 3D, dans le style Pixar d'un long métrage familial, au format horizontal 16:9 et à la plus haute résolution disponible.

L'image jointe « proposition 2 » définit uniquement l'identité de Gutenberg. Reprends exactement son visage, ses yeux bruns expressifs, son nez arrondi, ses cheveux ondulés, sa longue barbe sculptée, ses proportions, son marbre ivoire et son drapé. Garde un rendu d'animation stylisé et tactile. N'emprunte ni le décor de bureau, ni les appareils, ni l'éclairage de l'image jointe. Aucun photoréalisme.

Imagine un cybercafé urbain vers l'an 2000, en début de soirée : rangées de postes informatiques, séparations basses, chaises colorées et vitrine donnant sur une rue nocturne. Des tons bleu-violet sont équilibrés par de petites lumières ambre. Le lieu est chaleureux et typique de cette période, sans devenir futuriste ni ressembler à une salle de serveurs.

Gutenberg est au centre, installé à un poste et presque face à la caméra. Un moniteur cathodique beige se trouve ENTRE la caméra et Gutenberg, sous le niveau de son torse pour laisser son visage et sa bouche entièrement visibles. La face qui affiche l'image est orientée vers Gutenberg. La caméra voit UNIQUEMENT la coque arrière opaque du moniteur, avec des aérations et les sorties de ses câbles électriques et vidéo. Aucune surface lumineuse, aucun affichage, aucune interface sur cette coque arrière. Le clavier est du côté de Gutenberg ; une souris se trouve à portée de sa main, à côté du moniteur. Une main repose naturellement sur la souris. Il commence à relever le regard vers nous avec une expression satisfaite et calme.

Garde le visage, les mains et les parties nécessaires à la lecture du geste dans la bande verticale centrale d'environ un tiers de l'image. Laisse une marge au-dessus de la tête. La perspective du poste, la position des câbles et la relation entre l'écran, le clavier et le personnage sont physiquement cohérentes. Aucun logo, aucune interface inventée, aucun texte publicitaire, aucun filigrane. Un seul instant stable.
```

**À vérifier avant animation :** il s'agit du contrôle bloquant le plus important après l'échec précédent. Examiner l'orientation de toutes les faces du moniteur, l'absence totale d'interface sur sa coque arrière, le placement clavier/souris et le dégagement du visage. Les anciennes vidéos `h-05` et `v-05`, en version Seedance comme synchronisée, ont été rejetées pour cette incohérence et ne constituent pas des références acceptées. Ambiance possible : clic simple et signal d'envoi discret.

## 10. Plan 6 — Le web : une porte ouverte, à l'extérieur

**Voix existante, texte exact :**

> Avec les sites internet, l’information se consulte à toute heure. Elle devient une porte ouverte sur vos idées.

**Décor et intention.** Place piétonne contemporaine devant une bibliothèque ou médiathèque, avec jardin, arbres, verre, dallage clair et banc coloré. Palette vert, blanc cassé et corail ; lumière diurne fraîche. Le passage à l'extérieur crée une vraie rupture avec deux scènes successives de postes de travail.

**Mouvement prévu, 9 secondes.** Gutenberg avance de deux petits pas ; la caméra recule en gardant son axe central. Il s'arrête et ouvre la main libre. Il tient une tablette dont le dos bleu marine fait face au spectateur et l'écran à lui. Toute démonstration réelle de guteneo.com est ajoutée au montage comme insert séparé, à partir des captures existantes ou d'une nouvelle capture réelle. Ne pas demander au modèle de dessiner le produit sur la tablette.

**Prompt ChatGPT — image de départ :**

```text
Crée une seule image de cinéma d'animation 3D, dans le style Pixar d'un long métrage familial, au format horizontal 16:9 et à la plus haute résolution disponible.

Utilise l'image jointe « proposition 2 » comme référence du personnage Gutenberg uniquement. Conserve exactement le visage, les yeux bruns expressifs, le nez arrondi, les cheveux ondulés, la longue barbe sculptée, les proportions, le marbre ivoire et le drapé. Le personnage conserve le même rendu 3D stylisé et tactile. Ne reprends aucun bureau, aucun mobilier et aucun décor de l'image jointe ; pas de photoréalisme.

Place Gutenberg à l'extérieur, sur une place piétonne contemporaine devant une bibliothèque ou une médiathèque donnant sur un jardin. L'architecture est claire, avec du verre, des volumes simples, des arbres, un banc coloré et un dallage lumineux. La palette associe vert, blanc cassé et touches de corail. La lumière de jour est fraîche et agréable. Le cadre est ouvert et profond ; pas de rangées de bureaux et pas d'ordinateur posé sur une table.

Gutenberg se tient au centre, cadré à mi-cuisses, presque de face. Sa posture naturelle suggère qu'il est sur le point d'avancer tranquillement vers nous. Il tient d'une main une tablette bleu marine au niveau du bas de son torse. Le dos opaque de la tablette est orienté vers la caméra et possède seulement un petit objectif arrière plausible. L'écran est tourné vers Gutenberg et reste invisible pour le spectateur. Aucun affichage ni interface sur l'arrière. Sa main libre est détendue, prête à un geste d'accueil. Sa bouche et sa barbe sont entièrement dégagées. Son expression est ouverte et curieuse.

Garde le visage, les mains et la tablette dans la bande verticale centrale d'environ un tiers de la largeur pour préparer aussi une composition 9:16. Laisse de l'air au-dessus de sa tête et un espace de déplacement crédible devant lui. Pas de logo, pas de nom de produit généré, pas de fausse interface, pas de slogan, pas de filigrane. Un seul instant stable, anatomie et perspective cohérentes.
```

**À vérifier avant animation :** véritable extérieur, marche sans obstacle, dos de tablette sans écran, main libre lisible et aucune rupture de l'identité de Gutenberg. Ambiance possible : extérieur doux, sans circulation bruyante ni voix de passants sous la narration.

**Capture produit.** `archive/production/product/mobile-wide.png` et `desktop.png` sont de vraies captures du site public. Les variantes `*-verification.png` représentent la démonstration publique avec des exemples explicitement fictifs. Ce sont des captures du site responsive, **pas des captures d'une application mobile native**. Garder leur provenance dans le montage et éviter les affirmations contraires.

## 11. Plan 7 — Guteneo : le bureau au Luxembourg

**Voix existante, texte exact :**

> Guteneo réunit fax, email et courrier dans votre conversation. Vous vérifiez les détails, confirmez l’envoi, puis suivez son résultat.

**Décor et intention.** C'est le seul bureau contemporain premium du film : chêne clair, ivoire, touches de bleu marine mesurées, lampe simple et peu d'objets. Une vraie ouverture donne sur une interprétation stylisée mais reconnaissable du Luxembourg, notamment les toits, la vallée de l'Alzette et le Grund. Le décor doit être crédible et sobre, pas un assemblage de logos, imprimantes et piles de papier.

**Mouvement prévu, 10 secondes.** Gutenberg pose un document, ouvre légèrement une main pour conclure et regarde le spectateur. Très légère approche de caméra. La voix de 9,68 secondes doit rester entière : l'audio de référence final ne possède que 60 ms de marge initiale. Aucun rallongement créatif ne doit forcer une coupe du dernier mot.

**Prompt ChatGPT — image de départ :**

```text
Crée une seule image de cinéma d'animation 3D, dans le style Pixar d'un long métrage familial, en format horizontal 16:9 et à la plus haute résolution disponible.

L'image jointe « proposition 2 » est la référence impérative de Gutenberg : conserve fidèlement son visage, ses yeux bruns expressifs, son nez arrondi, ses cheveux ondulés, sa longue barbe sculptée, ses proportions, son marbre ivoire et son vêtement drapé. Rendu stylisé et tactile, sans photoréalisme. Améliore le décor en le reconstruisant plutôt qu'en recopiant la pièce et ses accessoires.

Le lieu est un bureau contemporain élégant au Luxembourg. Le mobilier en chêne clair, les murs ivoire, quelques touches bleu marine et une lampe sobre forment un ensemble crédible et peu encombré. Une grande vraie fenêtre donne sur une vue extérieure stylisée mais reconnaissable du Luxembourg : toitures, végétation et relief de la vallée de l'Alzette autour du Grund. Cette vue possède une vraie profondeur à travers la fenêtre ; ce n'est ni une fresque, ni un poster, ni du papier peint bleu. Une lumière douce de fin d'après-midi entre dans la pièce. Aucun décor de showroom surchargé, aucune accumulation d'imprimantes, aucune pile de papier monumentale.

Gutenberg se tient au centre derrière un bureau simple, presque face à nous, dans un cadrage à mi-cuisses adapté à la table. Il tient un seul document clair devant le bas du torse, prêt à le poser. Son expression est chaleureuse, confiante et naturelle. Ses mains sont cohérentes, sa bouche et sa barbe entièrement visibles. Le plan doit évoquer la simplicité d'envoyer une information, sans nécessiter une interface à l'image.

Garde le visage, les mains et le document dans la bande verticale centrale d'environ un tiers de la largeur, avec une marge au-dessus de sa tête. Aucun ordinateur n'est nécessaire. N'invente aucun écran, aucun logo Guteneo, aucune typographie de marque, aucun slogan ni filigrane : l'identité exacte sera ajoutée avec la séquence officielle lors du montage. Un seul instant stable et une composition sobre.
```

**À vérifier avant animation :** fenêtre avec vraie perspective, Luxembourg identifiable sans papier peint, pas de multiplication d'appareils, identité du personnage constante, dernier mot audible intégralement. Ambiance possible : pièce calme, papier léger ; la voix porte la conclusion.

## 12. Fin officielle — identité Guteneo et Manon

**Voix existante, texte exact :**

> Guteneo. La suite de vos mots.

La voix est **Manon**, identique à la voix demandée pour la signature de la vidéo d'accueil. Ce passage est distinct des sept scènes de Gutenberg. Il ne faut générer ni une nouvelle voix, ni une interprétation visuelle approximative de l'identité Guteneo.

La fin doit reprendre la séquence officielle extraite de la vidéo d'accueil du site, avec les hirondelles :

1. Environ deux secondes sur fond bleu, slogan blanc « La suite de vos mots. » et hirondelles blanches.
2. Environ cinq secondes sur fond ivoire, timbre Gutenberg incliné, cachet noir du Luxembourg, `guteneo.com` et hirondelles bleues.
3. Maintien de la dernière image, sans fin noire prématurée.

La référence utilisée se situe autour de **59,5 à 66,5 secondes** dans les sources officielles archivées. Les vidéos de fin déjà préparées évitent de reconstruire l'identité depuis une capture isolée :

- `archive/production/finishing/endcard-horizontal-silent.mp4`
- `archive/production/finishing/endcard-vertical-silent.mp4`
- `archive/production/finishing/endcard-horizontal-preview.mp4`
- `archive/production/finishing/endcard-vertical-preview.mp4`
- `archive/production/finishing/endcard-audio.wav`

Les aperçus comprennent déjà la signature de Manon, décalée d'environ 0,55 seconde, la musique officielle atténuée et les hirondelles. Les contrôler avant réemploi pour ne pas doubler ces sons dans le montage. La source officielle verticale a un ratio plus étroit que 9:16 ; le recadrage préparé a conservé les éléments de marque. Vérifier à nouveau leurs marges dans l'export Instagram final.

## 13. Voix, synchronisation et adaptation future aux prompts vidéo

Le narrateur demandé est **François-Louis, ElevenLabs v4**, français de France ; les fichiers actuels sont ceux validés. Identifiant voix historique : `UBXZKOKbt62aLQHhc1Jm`. La signature utilise Manon, identifiant `m5U7XCsc8v988k2RJAqN`. Ces identifiants facilitent la reprise, sans constituer une invitation à régénérer les audios.

L'amélioration automatique de prompt peut enrichir la mise en scène ou l'éclairage, mais **ne doit pas réécrire le texte, remplacer la voix, changer les durées, réintroduire le bureau dans les plans historiques ou ajouter de faux écrans**. Conserver la version exacte du prompt envoyé et du prompt éventuellement amélioré.

Pour chaque futur prompt vidéo, partir de l'image validée et définir seulement :

- le lieu déjà présent dans l'image et l'identité inchangée du personnage ;
- le mouvement simple décrit dans le plan correspondant ;
- le mouvement de caméra, la durée et le maintien du personnage au centre ;
- la bouche dégagée et la synchronisation avec **l'audio original fourni**, sans paraphrase ;
- les contraintes physiques spécifiques de l'accessoire ;
- les sons d'ambiance souhaités, séparés de la voix si le montage permet leur contrôle.

L'essai antérieur a montré une dérive temporelle entre la parole générée par Seedance et la piste originale ElevenLabs. Remplacer simplement la bande sonore produite par Seedance par le fichier original peut donc décaler les lèvres de façon variable. La production a utilisé ensuite `sync-lipsync-v3` avec la voix d'origine et `sync_mode: silence`. Ce traitement a un coût distinct : l'inclure dans le budget et vérifier son résultat. Une corrélation audio ou une transcription exacte ne prouve pas à elle seule la qualité visuelle de la synchronisation.

Le tweet partagé par le client décrivait une piste audio importée comme vidéo noire de durée identique, puis un remplacement du son au montage : `https://x.com/buraktuyan/status/2106033810164908306`. Le connecteur utilisé acceptait directement une référence audio, ce qui a évité ce conteneur noir. Revalider les capacités du modèle réellement disponible au moment de la reprise, sans supposer qu'un nom commercial garantit toutes les fonctions.

## 14. Validation visuelle avant toute nouvelle dépense vidéo

Cette liste répond à des défauts déjà rencontrés dans ce projet.

1. Montrer les sept images côte à côte : chaque lieu doit être reconnaissable sans lire la légende. En particulier, fax, email et web doivent différer par l'architecture, la lumière, la palette et la posture.
2. Comparer chaque visage à la proposition 2 : yeux, nez, chevelure, barbe, silhouette, matière et drapé. Le décor peut changer ; l'identité du personnage reste stable.
3. Afficher un guide central 9:16 sur les images 16:9 et contrôler le visage, la bouche, les mains et les accessoires. Évaluer séparément la résolution nécessaire aux exports.
4. Examiner le fax, le moniteur et la tablette en agrandissement. Les appareils doivent avoir une orientation plausible et aucun écran ne doit apparaître sur leur dos.
5. Vérifier les mains, le nombre d'objets, leurs points de contact et leur poids apparent. Une feuille reste une feuille ; une dalle est soutenue ; aucun objet ne traverse un autre.
6. Relire les sept scripts avec les audios archivés. Conserver intégralement les prises validées et leur débit, notamment la conclusion de 9,68 secondes.
7. S'assurer que l'écran produit provient d'une capture réelle et que la fin correspond aux assets officiels, hirondelles comprises.
8. Avant lancement payant, établir le coût total de la stratégie H/V, des éventuelles nouvelles images, de la synchronisation, des sons et de toute reprise autorisée. Fixer un plafond explicite ; ne pas relancer automatiquement des variations ou des générations réussies.
9. Lors de la vidéo, contrôler le plan en mouvement et écouter la voix jusqu'au dernier mot. Des images extraites toutes les secondes aident à repérer des défauts, mais ne remplacent pas le visionnage continu.

## 15. Ce qui existe déjà et ce qui reste à produire

**Existe et reste valable :** identité Gutenberg proposition 2 ; sept voix narrateur ; signature de Manon ; captures réelles du site ; sources officielles et fins préparées ; effets sonores ; scripts de montage et historiques techniques.

**Existe mais suit l'ancienne direction :** plusieurs images et six vidéos finales générées, avec leurs versions synchronisées. Les anciennes scènes 4, 6 et 7 ont été utilisées dans un aperçu local de 34 secondes. Cet aperçu illustre le montage et les voix, mais ne valide pas les nouveaux décors décrits ici.

**Rejeté :** les plans ordinateur `h-05` et `v-05`, dont l'interface apparaît sur l'arrière du moniteur. Ne pas les recycler dans un futur rendu présenté comme corrigé. L'ancien aperçu vertical de 43 secondes les contient ; l'aperçu de 34 secondes les exclut.

**À faire après validation de la proposition et du budget :** produire ou faire fournir les sept nouvelles images selon cette direction, vérifier l'ensemble, décider de la stratégie horizontale/verticale en pleine connaissance de la résolution et du coût, puis animer et synchroniser les scènes retenues. Finaliser ensuite les deux exports complets, avec les voix originales, les effets mesurés, les vraies captures éventuelles et la fin officielle.

Ce document est la source de référence pour la dernière proposition créative écrite. Les prompts d'anciens nœuds ElevenLabs et le ZIP de production historique ne doivent pas être lancés sans adaptation à cette direction.
