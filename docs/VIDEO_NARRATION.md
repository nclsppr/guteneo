# Narration des vidéos guteneo

État du 3 octobre 2026 : les voix françaises et anglaises ont été générées dans
**Safari, sur le site ElevenLabs**, depuis le compte Creator observé actif.
Les 34 séquences retenues sont des prises **Génération 2** ; elles ont été
importées, calées et mixées dans six candidats locaux. Leur intégrité, leur
décodage et la conservation des images et de la conclusion ont été contrôlés.
Cette note ne constitue pas une preuve de diffusion en production.
Les 17 exports allemands sont disponibles ; le lot luxembourgeois reste à
générer. L’utilisateur compare trois méthodes en français avant la suite.

Les mixages français provisoires réalisés avec les premières prises sont
obsolètes et ne font pas partie du lot retenu.
Récupérer la variante 2 déjà présente dans l’historique ne signifie pas refaire
une génération dans l’interface et ne déclenche pas de nouvelle tentative
fournisseur.

Direction choisie : **voix masculine, calme et chaleureuse**, diction naturelle,
sans emphase publicitaire. La voix utilisée est **George**, identifiant
`JBFqnCBsd6RMkjVDRZzb` copié depuis l’interface, avec **Eleven v4**. Ce choix ne
constitue pas encore une validation de l’accent ou du rendu dans chaque langue.

## Périmètre

Le lot prévu pour les douze vidéos actuellement diffusées comprend huit
narrations :

| Langue | Introduction, 56 s | Rôles, 36 s |
| --- | --- | --- |
| Français | Horizontal + iPhone, piste partagée | Quatre rôles |
| Anglais | Horizontal + iPhone, piste partagée | Quatre rôles |
| Allemand | Horizontal + iPhone, piste partagée | Quatre rôles |
| Luxembourgeois | Horizontal + iPhone, piste partagée | Quatre rôles |

Les textes et fenêtres de scène sont dans
`videos/guteneo-film/narration/scripts.json`. Ils peuvent être raccourcis pendant
le calage : le nombre de séquences et de caractères se calcule depuis le
manifest courant avec `npm run videos:narration`, sans compteur figé dans cette
documentation. Les anciennes révisions archivées ne sont pas incluses dans ce lot.
Les voix sont placées dans
les scènes existantes ; les cinq dernières secondes restent réservées au timbre
officiel, à `guteneo.com` et à la musique. Le plan Signature de l’introduction
reste également sans narration. Le texte ne change aucun droit métier.

## Accès ElevenLabs et réglages

Le plugin **ElevenLabs est installé et activé**, mais cette session n’expose
aucun outil MCP ElevenLabs invocable, notamment `creative_list_voices` ou
`creative_generate_speech`. Le parcours effectivement utilisé est le navigateur
Safari connecté, avec l’autorisation de génération donnée par l’utilisateur.
La connexion du plugin ne fournit pas une clé API au client local.

Dans l’interface TTS, sélectionner [Eleven v4](https://elevenlabs.io/v4), George,
**Stability 50 %** et **Similarity 75 %**, puis exporter en **MP3 à 128 kbit/s**.
Le plan local porte `modelId: eleven_v4`, `outputFormat: mp3_44100_128`,
`stability: 0.5` et `similarity_boost: 0.75`.
Activer l’override de langue correspondant à chaque séquence : français `fr`,
anglais `en`, allemand `de`, luxembourgeois `lb`. Une langue ou un modèle
indisponible doit interrompre ce parcours, sans substitution silencieuse.

Les générations web consomment les crédits du compte. Le compte Creator actif
est une preuve de l’état observé dans l’UI ; ce n’est pas une preuve de passage
du préflight API, ni un reçu chiffré pour chaque export. Les tarifs, quotas et
conditions restent ceux du compte au moment de l’opération.

## Plan local et configuration

Node 22+, FFmpeg et ffprobe sont nécessaires. Aucun nouveau paquet ni service
de production n’est requis. Depuis la racine, ces commandes sont **hors ligne** :

```sh
npm run videos:narration
npm run videos:narration:mix
npm run test:videos:narration
```

Le premier affiche le lot et ses caractères, sans texte ni secret dans les logs.
Le second présente les candidats de mixage. Aucun n’appelle ElevenLabs,
ne modifie un MP4 public ou ne consomme de crédit par défaut.

Les points d’entrée locaux d’import et de calage sont également disponibles
depuis la racine :

```sh
npm run videos:narration:import -- --help
npm run videos:narration:fit -- --help
```

Dans le dossier vidéo, les mêmes commandes sont `npm run narration:import` et
`npm run narration:fit`. Le fitter est situé à la **racine du dépôt**, dans
`scripts/fit-web-narration.mjs` ; l’alias du dossier vidéo utilise
`../../scripts/fit-web-narration.mjs`.

Depuis le dossier vidéo :

```sh
cd videos/guteneo-film
cp narration/voices.example.json narration/voices.local.json
```

Renseigner `voiceId: "JBFqnCBsd6RMkjVDRZzb"` dans ce fichier local ignoré par Git,
avec les paramètres utilisés dans l’interface. Si une langue nécessite
une autre voix pour son accent, `localeVoiceIds` permet une sélection explicite
parmi `fr`, `en`, `de` et `lb` ; les valeurs `null` reprennent la voix commune.
La direction inscrite dans le fichier sert au casting ; elle n’est pas envoyée
comme un paramètre TTS. Les seuls réglages v4 préparés sont `stability: 0.5` et
`similarity_boost: 0.75`, à ajuster après l’écoute.
Le champ local `webGeneration: 2`, présent dans l’exemple de configuration,
sélectionne la préférence contrôlée par le mixeur ; il ne participe pas à
l’empreinte API et n’est pas un paramètre TTS. L’importeur exige l’option
explicite `--web-generation 2` pour attester la provenance de chaque fichier,
sans la déduire de ce champ de configuration.

## Comparer les méthodes de narration

Trois variantes françaises du film des rôles sont préparées sur les mêmes
images de 36 secondes, avec les six mêmes textes, la même voix George v4 et
les mêmes réglages. Toutes utilisent la sélection Génération 2 et la partition
d’origine ; les cinq dernières secondes restent sans voix.

- **A : six phrases séparées**, méthode du lot FR/EN déjà mixé.
- **B : une narration complète**, avec les six paragraphes dans une génération,
  puis des découpes dans les silences pour les placer sur les scènes.
- **C : trois blocs**, chacun contenant deux paragraphes, puis le même calage.

B et C conservent le débit original, sans accélération. Les frontières sont
contrôlées par les silences acoustiques et les horodatages ASR ; ces contrôles
ne remplacent pas une écoute. Les intros sont équilibrées séparément vers
−20 LUFS pour éviter que leur volume influence le choix. Les autres séquences
utilisent le même traitement que A. Ces variantes sont des comparaisons locales,
pas des remplacements du catalogue public. Le choix de méthode reste ouvert.

La [documentation TTS](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)
décrit le contrôle du rythme par le texte, la ponctuation et les balises audio.
Des timecodes écrits dans le texte ne garantissent pas une durée imposée.
L’[API avec horodatages](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps/)
renvoie le calage de l’audio produit ; ce n’est pas une contrainte de timing en
entrée. Le parcours historique Voiceover Studio avec CSV de timings a été
retiré le 15 mai 2026 : ne pas le présenter comme une fonction v4 disponible.

## Génération web et import des MP3

Le lot FR/EN existant utilise **une séquence du manifest par export**. Pour
reproduire cette méthode A, copier exactement son
texte dans l’interface TTS, avec la voix, le modèle et la langue correspondants.
Conserver le MP3 téléchargé original et l’historique ElevenLabs. Pour le lot
retenu, sélectionner **Génération 2** de chaque résultat et récupérer cette
prise déjà disponible dans l’historique. Ne pas réétiqueter une prise 1 comme
une prise 2. Si le résultat
d’une génération est incertain, consulter cet historique et récupérer l’audio
existant avant de cliquer à nouveau sur Generate : chaque nouvelle génération
peut être facturée.

Importer chaque export localement, sans clé API ni accès fournisseur :

```sh
npm run narration:import -- --config narration/voices.local.json \
  --narration introduction-fr --cue one --file /chemin/absolu/export-gen2.mp3 \
  --web-generation 2
```

Le fichier est `out/narration/clips/introduction-fr/one.mp3`. Remplacer
`--narration`, `--cue` et `--file` pour chaque export ; le fichier source doit
avoir un chemin absolu. L’importeur reconstruit l’empreinte via `buildPlan`,
mesure une copie exacte des octets avec ffprobe et journalise l’import avant
l’écriture atomique du MP3 puis de son reçu. Il exige un `voiceId` renseigné,
mais ne peut déduire du MP3 son
texte, sa langue, son modèle ou ses réglages : leur correspondance avec le plan
doit être vérifiée dans l’interface.

Le reçu porte `source: elevenlabs-web`, le nom du fichier source, l’heure
d’import, le hash et la durée réelle. `webGeneration: 2` atteste le choix
explicite de l’export ; sans option, cette métadonnée reste absente sur un nouvel
import, y compris si la configuration indique 2. Les anciens reçus et les
résultats API ne sont pas attribués automatiquement à une variante web.
Il n’invente ni `requestId`, ni montant,
ni nombre de caractères facturés. Un import identique est repris depuis le
cache ; une empreinte, un audio ou une provenance 1/2 connue différente exige
**`--replace` explicite**.
Cet argument remplace un fichier local, sans déclencher une génération.

L’importeur conserve une séquence trop longue sans coupe ni accélération avec
`status: complete`, `timingFit: false` et un code de sortie CLI **2**. Le mixeur
la refuse. Ajuster le texte ou le calage, vérifier le résultat, puis importer
explicitement la version retenue. Le verrou `generation.lock` est partagé avec
le client API ; une interruption exige inspection avant déverrouillage ou
remplacement. Terminer les imports et remplacements avant le mixage, qui utilise
son propre verrou `.mix.lock`.

## Calage local sur une copie séparée

Le fitter analyse un MP3 déjà téléchargé. Il ne génère aucune voix, n’appelle
aucun fournisseur et n’importe aucun résultat dans le cache. Depuis le dossier
vidéo, commencer par une analyse sans publier de copie :

```sh
npm run narration:fit -- --narration introduction-fr --cue personal \
  --input /chemin/absolu/original-gen2.mp3 \
  --output /chemin/absolu/nouvelle-copie-gen2.mp3
```

Les chemins d’entrée et de sortie doivent être absolus et distincts. Choisir
une nouvelle sortie `.mp3` dans `videos/guteneo-film/out/narration/fitted/`,
ignoré par Git, ou hors du dépôt. Avec **`--execute`**, le fitter écrit la copie
et sa preuve `<sortie>.fit.json`. Il refuse d’écraser une sortie ou une preuve
existante, et conserve le téléchargement source.

Le calage détecte les zones sous **−45 dB pendant au moins 60 ms**. Seuls les
silences qui touchent les bords sont éligibles au retrait ; les pauses internes
ne sont pas supprimées. Il conserve une marge source de **66 ms**, essaie
d’abord le retrait des bords seul, puis des paliers de tempo si nécessaire,
avec un plafond de **1,10×**. Une copie qui tient déjà est conservée octet pour
octet. La durée retenue pour qualification est le maximum de la durée du
conteneur et de celle du signal intégralement décodé ; aucun `-t` ou `-shortest`
ne coupe la fin pour faire tenir la séquence.

La marge source vise nominalement 60 ms au tempo maximal ; `atempo` peut
reconstruire l’amplitude des bords. La preuve mesure donc séparément
`output.detectedEdgeSilences`. **Ni 60 ms effectifs en sortie, ni l’absence de
mots coupés ne sont garantis** par cette détection d’amplitude.
`wordBoundariesVerified: false` et `criticalListening: pending` restent les
limites déclarées de la preuve, avec les hashes, filtres et paliers réellement
appliqués. La copie et le placement doivent encore être vérifiés à l’écoute.

Si la copie complète ne tient pas sous le plafond de tempo, `--execute` écrit
une preuve de refus, aucune copie qualifiée, et la CLI retourne **2**. Revoir
le texte ou les fenêtres en coordination ; ce refus ne déclenche pas de
nouvelle génération fournisseur.

Après contrôle de la copie retenue, l’import reste explicite et conserve le
numéro de sa prise web d’origine :

```sh
npm run narration:import -- --config narration/voices.local.json \
  --narration introduction-fr --cue personal \
  --file /chemin/absolu/nouvelle-copie-gen2.mp3 --web-generation 2 --replace
```

## API v4 non qualifiée, plan hors ligne disponible

Le parcours réel de ce lot est **Safari → export Génération 2 → import local →
calage et mixage**. Aucun appel de génération API n’a été effectué ni qualifié.
Le mode par défaut de `scripts/generate-narration.mjs` reste un plan hors ligne :

```sh
npm run narration:plan -- --config narration/voices.local.json
```

**`--generate` et l’export `generateNarration` sont désactivés** avec l’erreur
`API_ADAPTER_UNQUALIFIED`, avant tout appel réseau ou écriture de cache. Une clé,
un budget ou des reçus existants ne lèvent pas ce verrou.
`narration:generate` ne permet donc pas encore de régénérer les voix par API.

La [documentation des modèles](https://elevenlabs.io/docs/overview/models)
rattache Eleven v4 à **Text to Dialogue**. L’ancien client préparé cible
`/v1/text-to-speech/{voice_id}` ; aucune qualification de v4 sur cette route
n’est attestée. La [référence dialogue](https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert)
décrit `POST /v1/text-to-dialogue?output_format=mp3_44100_128`, avec
`inputs: [{ text, voice_id }]`, `model_id: eleven_v4`, `language_code` et
`settings: { stability: 0.5, similarity: 0.75 }`.
Le champ dialogue est **`similarity`**, différent du `similarity_boost` conservé
dans notre configuration et notre empreinte actuelles.
La référence recommande au plus 2 000 caractères par requête pour une génération
fiable ; cette recommandation n’est pas une garantie de durée sur les plans.

Un adaptateur dialogue distinct reste à préparer et à qualifier, avec contrôles
d’abonnement, langues, budget, cache et résultats inconnus avant activation.
Les empreintes existantes sont conservées pour les imports web et le mixage ;
elles ne prouvent ni un appel API réel, ni la compatibilité de l’ancien endpoint.
Un futur changement d’identité API demandera une migration explicite, sans
réétiqueter ou régénérer automatiquement les MP3 déjà reçus.
La connexion du plugin et l’abonnement Creator vu dans Safari ne fournissent
pas une clé au client local et ne prouvent pas son préflight API.

## Mixage local et qualification

Après réception et qualification de toutes les séquences choisies :

Pour ce lot web, chaque reçu sélectionné doit porter **`webGeneration: 2`**.
Avec `webGeneration: 2` dans la configuration, le mixeur refuse un reçu
`source: elevenlabs-web` de prise 1 ou sans numéro, avant d’écrire les candidats.
Il conserve la provenance dans sa preuve de mixage. Les reçus API compatibles
restent distincts : ils ne sont ni réétiquetés ni présentés comme une prise web 2.
Le contrôle ne sélectionne pas la variante dans l’interface à la place de
l’opérateur. Un ancien audio de prise 1 ne devient pas une prise 2 parce que
les paramètres TTS et leur empreinte sont identiques.

```sh
npm run narration:mix -- --execute --voices narration/voices.local.json
```

Le catalogue source par défaut est **`narration/source-videos.json`** : il
référence les MP4 musicaux d’origine, conservés comme bases de mixage. Le
catalogue public peut ensuite pointer vers des fichiers déjà narrés ; ses
changements ne modifient pas automatiquement les sources du mixeur.
Si le snapshot manque, le mixage échoue sans repli vers le catalogue public.

**Pour une nouvelle version visuelle, mettre à jour le catalogue source est
obligatoire** : produire et conserver les nouveaux MP4 musicaux, mettre à jour
`source-videos.json` et vérifier les fenêtres du manifest avant de mixer.
Un catalogue source alternatif se choisit explicitement avec
`--catalog narration/nouvelles-sources.json` ; il doit référencer des bases
musicales auxquelles ajouter les voix une seule fois.

`--execute` réalise uniquement des candidats locaux. Le mixeur vérifie les
empreintes, les fichiers et leurs durées avant d’écrire un film. Il vise
−18 LUFS pour chaque voix, atténue la partition autour de la parole,
puis rétablit son niveau sur la conclusion. Il conserve les séquences musicales
et bruitages existants, avec un nouvel encodage AAC stéréo à 48 kHz.

La vidéo est copiée avec `-c:v copy` : aucun recadrage ni nouveau rendu des
images. Le hash de la piste H.264 doit être identique au fichier source. Durée,
dimensions, cadence, nombre de frames, audio stéréo, décodage intégral et taille
inférieure à 25 MiB sont vérifiés. Les candidats sont dans
`out/narration/videos/`, avec `out/narration/mix-proof.json` ; les fichiers diffusés,
le catalogue de langues et les posters restent inchangés à ce stade.

L’entrée audio n’est pas disponible au modèle dans cette session pour une écoute
critique : **`criticalListening: pending` reste obligatoire**. L’existence d’un
MP3 exporté et les mesures techniques ne qualifient pas l’accent ou la diction.
Avant publication, il reste à écouter **chaque langue** à vitesse normale, en
mono et à faible volume, vérifier les mots et le placement sur les plans, puis
tester chaque format dans les navigateurs. Les preuves automatiques gardent
`criticalListening: pending` tant que cette étape n’est pas faite. Les voix et
mixages synthétiques des tests ne sont pas des preuves de qualité ElevenLabs.
La publication des candidats nécessitera la mise à jour des assets et du
manifeste, les contrôles habituels et l’autorisation de cette nouvelle version.

## Preuves de préparation

`tests/narration.test.mjs` couvre le plan hors ligne, les bornes du manifest,
la stabilité des empreintes utilisées par les imports, et le refus explicite de
l’API non qualifiée avant réseau, mesure audio ou écriture. Il vérifie que ce
refus préserve les MP3, reçus et verrous existants, y compris les résultats
incertains. `tests/import-narration.test.mjs` vérifie l’import local,
l’absence d’appel réseau, la durée et le hash du MP3, les conflits et remplacements,
le verrou, puis la compatibilité d’un audio importé avec un mixage FFmpeg.
`tests/fit-web-narration.test.mjs` utilise le fitter à la racine et vérifie les
bords, la conservation des pauses internes, le plafond de tempo, la durée
décodée, les sorties de refus et la préservation du fichier original.
`tests/mix-narration.test.mjs` couvre la réutilisation de huit
pistes pour douze formats, le silence final, les reçus périmés, et un vrai mixage
FFmpeg de médias synthétiques avec identité de la piste vidéo et contrôles du
niveau musical. Les tests n’envoient aucune requête réelle à ElevenLabs.
La suite pertinente se lance avec `npm run test:videos:narration` ; son décompte
et son état viennent du résultat courant après chaque modification du manifest.
Ces tests ne peuvent attester la complétude des exports web ou la qualité de
la voix retenue.
Les 34 prises FR/EN sélectionnées sont importées et calées ; leur lot de six
candidats a été contrôlé techniquement. L’écoute critique reste à qualifier,
puis la diffusion des candidats doit être vérifiée séparément.
