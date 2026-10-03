# Narration des vidéos guteneo

La méthode retenue par l’utilisateur est **C : trois blocs contextualisés**, avec
une voix off en phrases complètes. Elle s’applique aux douze films du catalogue
public : les introductions horizontale et iPhone et la présentation des quatre
rôles, en français, anglais, allemand et luxembourgeois. Les deux formats de
l’introduction partagent une narration ; les rôles ont leur texte propre.

## Règles éditoriales

La narration présente les plans comme une personne présentant des diapositives.
Les accroches visuelles ne doivent pas être lues comme une suite de mots isolés.
Les phrases décrivant les permissions suivent `WORKSPACE_ROLES.md` et le contrat
`packages/contracts/src/roles.ts`. L’amélioration de style ne change aucun droit.

Utiliser **Manon Voix française spontanée sérieuse**,
`m5U7XCsc8v988k2RJAqN`, quand la voix et la langue sont compatibles. À défaut,
choisir une voix féminine pour la langue et enregistrer le choix réel. La langue
est explicitement `fr`, `en`, `de` ou `lb` ; le lecteur suit la langue résolue de
l’interface et la préférence personnelle du compte. Ces règles figurent dans
`AGENTS.md`.

Passer le texte complet par l’action native ElevenLabs **Améliorer**, puis
accepter avec **Garder**. Vérifier les mots et les permissions. Conserver le
résultat natif exact dans `enhancement.json`. Pour une présentation calme, les
balises peuvent être harmonisées vers `[thoughtful]` et `[short pause]` et les
effets non verbaux retirés ; enregistrer ces interventions dans `editorialEdits`.
Le résultat accepté et la version éditoriale finale ne sont pas confondus.

Les introductions regroupent leurs onze paragraphes en blocs **4 / 4 / 3** ; les
rôles regroupent leurs six paragraphes en blocs **2 / 2 / 2**. L’indication de ton
est reprise au début de chaque bloc. Les pauses entre blocs sont placées au
montage.

## Génération ElevenLabs

Le plugin Creative Studio est le premier parcours de synthèse : rechercher la
voix, vérifier le schéma réel du modèle, créer les nodes TTS `eleven_v4` avec
`voice_id` et `model_parameters.language_code`, puis lancer **deux variations
par bloc**. Retenir la seconde variation en liant les IDs de session et de
génération, sans déduire son rang de l’ordre des médias retournés.

Un résultat inconnu exige la consultation du flow et de ses sessions, sans
relancer une génération. Archiver les MP3 originaux avec leurs SHA-256, tailles,
durées et reçus nettoyés. Ne pas enregistrer de token ou d’URL signée. Une
estimation de génération n’est pas un reçu de consommation.

La provenance actuelle est `elevenlabs-creative-plugin`, `variationIndex: 2`.
Elle est distincte de `elevenlabs-web`, `webGeneration: 2` du lot George
historique. La préférence pour le second résultat est conservée, sans inventer
une provenance web.

Le connecteur n’expose pas l’action native Enhance : Safari fournit cette
fonction depuis le compte connecté. Les exports natifs Scribe peuvent également
servir à vérifier les frontières lorsque le connecteur ou l’ASR local ne fournit
pas une reconnaissance indépendante avec des horodatages utilisables.

La [documentation TTS ElevenLabs](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)
décrit le rythme par les phrases, la ponctuation et les balises. Des timecodes
écrits dans le prompt ne garantissent pas une durée de voix. Le montage suit donc
le débit produit. Le modèle est vérifié dans le schéma live du plugin et dans
[la documentation des modèles](https://elevenlabs.io/docs/overview/models).

## Calage et bibliothèque immuable

Décoder chaque MP3 intégralement en PCM24 mono 44,1 kHz. Reconnaître les mots sans
fournir le texte attendu comme prompt. Les frontières internes combinent les
mots horodatés et une pause acoustique ; conserver les différences réelles de
transcription, notamment les noms propres. Une transcription peu fiable ne
justifie pas de fabriquer des mots ni leurs timestamps.

Découper aux frontières qualifiées en conservant tous les échantillons, dans
leur ordre initial : `tempoFactor: 1`. Les scènes sont allongées selon les prises,
avec leurs durées minimales de lisibilité. Le plan Signature de l’introduction
conserve deux secondes sans voix ; le logo officiel conserve **cinq secondes**
sans narration dans les douze films.

Chaque snapshot `narration/releases/{introduction,roles}-{fr,en,de,lb}-natural-c-v1/`
contient texte, amélioration native, reçus, trois MP3, six ou onze WAV,
transcriptions, preuve de découpe, timeline et empreintes. Le builder refuse de
remplacer une bibliothèque existante. Le film des rôles FR approuvé par
l’utilisateur reste identique ; il conserve son chemin V3.

Les hashes des MP3, WAV et du PCM canonique sont stricts. Les coupes reconstruisent
exactement le signal canonique complet. Certains décodeurs MP3 macOS/Linux
produisent une différence de quantification : l’éligibilité exige le même nombre
d’échantillons et au plus **8 LSB PCM24** de différence, mesurée dans la preuve.
La qualification utilise le décodeur scalaire FFmpeg (`-cpuflags 0`) pour éviter
les écarts des chemins optimisés selon le processeur. La fixture
`tests/fixtures/natural-c-scalar-qualification.json` conserve les mesures des
24 sources sous Ubuntu arm64 et x86_64. Les WAV canoniques et les médias publiés
restent inchangés ; les décodeurs ne sont pas déclarés bit-identiques.

## Musique et régénération hors ligne

Le fond musical reçoit un gain constant **0,22** pendant toute la vidéo, y
compris entre les phrases et sur le logo. Il ne remonte pas pendant les pauses.
La partition conserve sa cadence et son fondu final. La voix est normalisée et
mixée séparément ; toute qualification audio garde ses mesures et limites.

Depuis la racine :

```sh
npm --prefix videos/guteneo-film ci
npm run test:videos:narration
npm run videos:render
```

Le renderer qualifie les bibliothèques avant toute écriture publique, rend les
bases musicales naturelles, remixe les voix locales en gardant les paquets
vidéo H.264, puis écrit sous-titres, posters et manifeste. FFmpeg, ffprobe et
cwebp sont nécessaires. Aucun appel ElevenLabs n’est effectué par le rendu.
Pour amorcer une nouvelle bibliothèque avant son premier mix, le helper
`render-natural-sources.mjs` rend les sources dans `out/`, sans catalogue,
manifeste ou écriture publique ; seules des sources qualifiées sont ensuite
installées aux chemins naturels explicitement liés au snapshot.

Une sélection peut être rendue avec `--locales de,lb --kind introduction` ou
`--kind roles`. `--skip-existing` exige le hash du manifeste, un poster et des
sous-titres correspondants. Les sources historiques V5/V1 et le snapshot George
`fr-en-g2/` sont conservés. Le fitter historique et les imports web restent
documentés dans son README ; ils ne sont pas le parcours naturel actuel.

Le client API local `narration:generate` reste bloqué par
`API_ADAPTER_UNQUALIFIED` avant réseau. La disponibilité du plugin ne qualifie
pas cet ancien adaptateur et ne lui fournit pas une clé API.

## Preuves et diffusion

Les actifs et empreintes sont décrits dans
[VIDEO_NARRATION_PUBLISHED.md](VIDEO_NARRATION_PUBLISHED.md). Le catalogue commun
couvre exactement douze MP4 et leur durée réelle ; il sélectionne film, poster
et sous-titres dans chaque langue. Une nouvelle langue doit recevoir ces trois
médias avant diffusion.

La vidéo des rôles FR a été écoutée et approuvée par l’utilisateur. Les preuves
techniques des autres narrations ne revendiquent pas une écoute humaine ni un
test sur téléphone physique. Les noms propres et accents conservent leurs
limites documentées. La publication suit [MAIN_RELEASE.md](MAIN_RELEASE.md) :
CI du commit fusionné, checkout propre de main, puis contrôle exact des assets
et des plages sur les deux origines. Aucun envoi métier n’est déclenché.
