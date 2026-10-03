# Gutenberg à travers les âges — dossier de reprise

Archive du travail réalisé le **3 octobre 2026**, accompagnée des décisions et de
la dernière proposition de mise en scène. Ce projet est distinct des films
d'accueil déjà publiés dans `../guteneo-film/`.

**Le film complet n'est pas terminé. Les générations payantes restent suspendues
jusqu'à validation d'un nouveau budget total et de son plafond.** L'autorisation
actuelle couvre l'archivage dans Git et son intégration à `main` ; elle ne relance
pas les anciens nœuds Seedance. Aucun média de cette archive n'est ajouté au
catalogue public du site.

## Commencer ici

1. Lire [les décisions et l'état actuel](DECISIONS-ET-ETAT.md).
2. Lire [le storyboard et les nouveaux prompts](STORYBOARD-ET-PROMPTS.md).
3. Utiliser [le guide technique](REPRISE-TECHNIQUE.md) pour les fichiers, les
   identifiants ElevenLabs, les durées, les commandes et les limites connues.
4. Consulter [l'inventaire vérifiable](inventory.json) et
   [l'état de reprise structuré](handoff.json).

La nouvelle proposition des sept scènes est documentée ici, mais ses images
n'ont pas encore été générées ni validées. Les anciens storyboards, prompts et
nœuds de génération conservés dans `archive/` ne remplacent pas cette proposition.

## Les trois fichiers à ouvrir en premier

- [Gutenberg, proposition 2 validée](archive/production/images/Pixar-proposition-2.png).
- [Dernier aperçu vertical de 34 secondes, sans l'ordinateur défectueux](archive/production/deliverables/Guteneo-apercu-court-sans-plan-ordinateur-34s.mp4).
- [Audit des crédits](archive/production/deliverables/cost-audit.json).

L'aperçu de 34 secondes réutilise les anciens plans fax, web et Guteneo. Il montre
ce qui a pu être récupéré, pas les sept nouveaux environnements proposés.

## Organisation

| Chemin | Contenu |
| --- | --- |
| `archive/production/images/` | Références, propositions, images des scènes et provenance |
| `archive/production/audio/` | Vocaux validés, pistes de référence et contrôles |
| `archive/production/video/` | Essai Égypte, plans Seedance et corrections de synchronisation |
| `archive/production/sfx/` | Bruitages ElevenLabs et leurs reçus |
| `archive/production/product/` | Vraies captures du site et script de capture |
| `archive/production/finishing/` | Mixages, éléments préparés et fins officielles |
| `archive/production/deliverables/` | Extraits exportés, audit, ancien kit ZIP et contrôles |
| `archive/brand-reference/` | Vidéos d'accueil officielles, timbre et sources publiques |
| `archive/verification/` | Première production historique et ses contrôles |
| `archive/production/*.py` | Scripts de montage locaux |
| `archive/production/{state,final-production}.json` | États historiques, prompts, références et identifiants fournisseur |
| `tools/` | Archivage et vérification sans génération |

## Récupérer les médias

Les médias sont conservés **dans Git**, sans réduction de qualité ni réencodage.
Le projet ajoute environ **1,14 Go** au checkout. Un clone normal récupère les
données ; aucun accès ElevenLabs ni Git LFS n'est nécessaire. Six fichiers
historiques de plus de 16 Mio sont stockés en blocs binaires et se reconstituent
localement avec la première commande ci-dessous. La proposition 2, tous les vocaux
et l'aperçu actuel de 34 secondes sont directement accessibles à leur chemin.
Installer Python 3.11 ou plus récent pour le vérificateur, puis depuis la racine
du dépôt :

```sh
python3 videos/guteneo-gutenberg/tools/restore_large_media.py
python3 videos/guteneo-gutenberg/tools/verify_archive.py
```

L'inventaire contient les tailles et SHA-256 de chaque fichier source et de sa
copie archivée. Le vérificateur détecte les fichiers absents ou incomplets.

Git LFS avait été envisagé pour isoler les gros médias, mais son point d'accès
a refusé l'authentification disponible dans l'environnement. Aucun objet LFS
n'a été transféré. L'envoi Git HTTPS a également refusé l'authentification,
alors que l'API GitHub autorisait bien les écritures. L'archive a donc été
transférée avec l'API Git. Pour respecter sa limite de requête, les six plus gros
fichiers sont découpés en blocs de 8 Mio sous `media-parts/`. Le manifeste
`large-media.json` et le script de restauration vérifient leurs empreintes et
reconstituent les originaux **octet pour octet**, sans codec ni service externe.
La restauration demande environ 207 Mo supplémentaires. Les fichiers restaurés
sont ignorés par Git pour éviter un ajout en double. Une éventuelle migration
future vers LFS sera une opération distincte.

## Fidélité et limites de la sauvegarde

Tous les fichiers utiles présents dans `/workspace/guteneo/` sont copiés dans
`archive/`, y compris les essais rejetés. Seuls les caches d'exécution
reconstructibles (`*.cache`, `__pycache__`, `*.pyc`) sont exclus et recensés dans
l'inventaire. Les médias conservent exactement leurs octets originaux.

Les paramètres d'accès temporaires des URL signées et les codes de connexion
`oobCode` sont retirés des copies textuelles avant publication dans ce dépôt
public. Les identifiants de génération sont conservés ; utiliser le compte
ElevenLabs autorisé pour renouveler un accès. Une URL nettoyée n'est pas une
promesse de téléchargement anonyme. Aucun jeton d'authentification n'est requis
pour lire ou monter les médias déjà archivés.

Les chemins `/workspace/guteneo/...` de certains reçus et rapports sont des
provenances historiques : leur équivalent est `archive/...` dans ce dossier.
Les scripts de montage utilisent leur propre emplacement pour résoudre les
entrées. Les listes temporaires de concaténation se régénèrent au montage.
Le chemin de sortie absolu de `production/product/capture.py` est remplacé par
un chemin relatif au script dans la copie Git ; cette modification est tracée
dans l'inventaire. Les captures existantes ne sont pas modifiées.

Cette archive contient les fichiers locaux disponibles et leurs manifestes,
pas un export intégral de l'historique de conversation ni toutes les variantes
éventuellement conservées uniquement par ElevenLabs. Les décisions essentielles
de la conversation et la dernière proposition de scènes sont retranscrites dans
les documents de reprise.
La copie originale de l'image jointe au tout premier message n'a pas été
identifiée avec certitude parmi les fichiers locaux. La référence approuvée
« proposition 2 », utilisée pour poursuivre le projet, est bien incluse.

## Relation avec le produit et la marque

Cet ajout archive un projet audiovisuel : il ne change aucune fonctionnalité,
permission, parcours client, vidéo diffusée ou configuration de déploiement.
Il n'appelle donc pas de modification de la carte des fonctionnalités.

Respecter [les règles de marque](../../docs/BRAND_IDENTITY.md) et
[les instructions du dépôt](../../AGENTS.md). Les demandes explicites pour ce
projet fixent François-Louis pour Gutenberg et Manon pour la signature, et
préservent les vocaux déjà approuvés. Ne pas régénérer ces voix pour appliquer
par défaut les choix des autres films du dépôt.
