# Narration des vidéos guteneo

Préparation du 2 octobre 2026. Direction choisie : **voix masculine, calme et
chaleureuse**, diction naturelle, sans emphase publicitaire. La même identité
vocale est recherchée en français, anglais, allemand et luxembourgeois. Le choix
du `voiceId` sera fait à l’écoute d’un court essai ; aucune voix n’est présélectionnée.

## Périmètre

Le lot prévu pour les douze vidéos actuellement diffusées comprend huit
narrations :

| Langue | Introduction, 56 s | Rôles, 36 s | Caractères de texte |
| --- | --- | --- | ---: |
| Français | Horizontal + iPhone, piste partagée | Quatre rôles | 1 052 |
| Anglais | Horizontal + iPhone, piste partagée | Quatre rôles | 995 |
| Allemand | Horizontal + iPhone, piste partagée | Quatre rôles | 1 078 |
| Luxembourgeois | Horizontal + iPhone, piste partagée | Quatre rôles | 1 026 |

Les textes sont dans `videos/guteneo-film/narration/scripts.json` : 68 séquences,
596 mots, **4 151 caractères**, espaces et ponctuation inclus. Les anciennes
révisions archivées ne sont pas incluses dans ce lot. Les voix sont placées dans
les scènes existantes ; les cinq dernières secondes restent réservées au timbre
officiel, à `guteneo.com` et à la musique. Le plan Signature de l’introduction
reste également sans narration. Le texte ne change aucun droit métier.

## ElevenLabs et abonnement

[Eleven v4](https://elevenlabs.io/v4) est disponible via l’API TTS, avec le modèle
`eleven_v4`. La [liste officielle des modèles](https://elevenlabs.io/docs/overview/models#eleven-v4)
inclut les quatre langues. Le générateur vérifie aussi leur disponibilité dans
la réponse authentifiée `/v1/models`, avant toute génération. Il ne remplace pas
une langue ou le modèle demandé si cette vérification échoue.

Pour ce premier lot, **Starter devrait suffire** : prix affiché de 6 USD/mois
hors taxes, promotion initiale éventuelle à vérifier lors de l’achat. Le format
API préparé, MP3 44,1 kHz à 128 kbit/s, ne requiert pas Creator ou Pro. Creator
peut servir pour davantage d’itérations, un clone professionnel ou le MP3 à
192 kbit/s. Il ne faut pas choisir Pro uniquement pour obtenir un WAV : les
MP3 reçus sont décodés localement pendant le mixage. Les tarifs et crédits
restent ceux du compte au moment de la génération :
[tarifs API](https://elevenlabs.io/pricing/api),
[formats TTS](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).

La [licence commerciale](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform)
nécessite des contenus générés sous un abonnement payant adapté. Le script exige
un abonnement payant reconnu et actif. Les essais gratuits ne seront pas
utilisés dans les films publiés. Un compte, une clé et la compatibilité réelle
de la voix choisie restent à qualifier ; cette préparation n’atteste pas encore
un résultat ElevenLabs.

## Préparation et essai

Node 22+, FFmpeg et ffprobe sont nécessaires. Aucun nouveau paquet ni service
de production n’est requis. Depuis la racine, ces commandes sont **hors ligne** :

```sh
npm run videos:narration
npm run videos:narration:mix
npm run test:videos:narration
```

Le premier affiche le lot et ses caractères, sans texte ni secret dans les logs.
Le second présente les douze candidats de mixage. Aucun n’appelle ElevenLabs,
ne modifie un MP4 public ou ne consomme de crédit par défaut.

Après activation du compte, créer une clé API avec les droits TTS et les lectures
d’abonnement/modèles nécessaires. La fournir à l’environnement du processus sous
`ELEVENLABS_API_KEY`, par un mécanisme local protégé. **Ne jamais coller cette clé
dans la conversation, un argument de commande ou un fichier suivi par Git.**

Depuis le dossier vidéo :

```sh
cd videos/guteneo-film
cp narration/voices.example.json narration/voices.local.json
```

Renseigner `voiceId` dans ce fichier local ignoré par Git. Si une langue nécessite
une autre voix pour son accent, `localeVoiceIds` permet une sélection explicite.
La direction inscrite dans le fichier sert au casting ; elle n’est pas envoyée
comme un paramètre TTS. Les seuls réglages v4 préparés sont `stability: 0.5` et
`similarity_boost: 0.75`, à ajuster après l’écoute.

L’essai suivant produit une seule séquence française de 30 caractères, sous un
plafond de 100 caractères. **Cette commande consomme des crédits** et se lance
après autorisation de génération :

```sh
npm run narration:generate -- --config narration/voices.local.json \
  --kind introduction --locales fr --cue one --max-characters 100
```

Le fichier est `out/narration/clips/introduction-fr/one.mp3`. Écouter le timbre,
le sourire discret, le débit et l’absence de théâtralité. Tester ensuite une
séquence allemande et une luxembourgeoise contenant les mots difficiles, avant
le lot complet : `guteneo`, PDF, E-Mail et les termes de rôles. La prise en charge
déclarée d’une langue ne garantit pas à elle seule la qualité de l’accent.

Après validation des essais et autorisation du lot :

```sh
npm run narration:generate -- --config narration/voices.local.json \
  --kind all --locales fr,en,de,lb --max-characters 4200
```

Ce plafond limite les caractères **non mis en cache envoyés en TTS** dans cette
exécution ; il n’est pas un devis monétaire et ne réserve pas le quota du compte.
Il couvre les 4 151 caractères du lot actuel, sans marge de nouvelles versions.
Les essais inchangés déjà qualifiés sont repris depuis le cache. Modifier un
texte, une voix ou un réglage demande un nouvel audio et un nouveau budget.

## Génération contrôlée

Le client utilise l’[endpoint TTS standard](https://elevenlabs.io/docs/api-reference/text-to-speech/convert),
avec `language_code` explicite et `output_format=mp3_44100_128`. Les appels sont
séquentiels, sans redirection, repli automatique ni nouvelle tentative.

Chaque requête est inscrite comme `inflight` **avant** l’appel. Un arrêt ou une
réponse réseau incertaine bloque la reprise de cette séquence, même si ses
paramètres changent. Vérifier l’historique ElevenLabs et récupérer le fichier
existant pour résoudre le reçu manuellement ; ne pas effacer une entrée
`unknown` pour relancer aveuglément. Un verrou persistant après interruption
demande la même inspection préalable. Les reçus contiennent des empreintes,
des durées et, si disponible, l’identifiant de requête ; pas le texte ou la clé.

Les audios reçus et leurs hashes sont conservés dans `out/narration/`. ffprobe
mesure la durée de chaque MP3. Une séquence qui dépasse sa scène est conservée
mais bloque la suite et le mixage : aucune coupe des mots ni accélération
automatique. Raccourcir le texte concerné ou ajuster la voix après écoute,
puis autoriser explicitement une nouvelle génération ciblée. Si seul un plan
ou une preuve de durée doit être réparé, récupérer et requalifier l’audio déjà
facturé plutôt que le régénérer.

## Mixage local et qualification

Après réception et qualification de toutes les séquences choisies :

```sh
npm run narration:mix -- --execute --voices narration/voices.local.json
```

`--execute` réalise uniquement des candidats locaux. Le mixeur vérifie les
empreintes, les fichiers et leurs durées avant d’écrire un film. Il normalise
chaque voix à une cible de −18 LUFS, atténue la partition autour de la parole,
puis rétablit son niveau sur la conclusion. Il conserve les séquences musicales
et bruitages existants, avec un nouvel encodage AAC stéréo à 48 kHz.

La vidéo est copiée avec `-c:v copy` : aucun recadrage ni nouveau rendu des
images. Le hash de la piste H.264 doit être identique au fichier source. Durée,
dimensions, cadence, nombre de frames, audio stéréo, décodage intégral et taille
inférieure à 25 MiB sont vérifiés. Les candidats sont dans
`out/narration/videos/`, avec `out/narration/mix-proof.json` ; les fichiers diffusés,
le catalogue de langues et les posters restent inchangés à ce stade.

Avant publication, il reste à écouter **chaque langue** à vitesse normale, en
mono et à faible volume, vérifier les mots et le placement sur les plans, puis
tester chaque format dans les navigateurs. Les preuves automatiques gardent
`criticalListening: pending` tant que cette étape n’est pas faite. Les voix et
mixages synthétiques des tests ne sont pas des preuves de qualité ElevenLabs.
La publication des candidats nécessitera la mise à jour des assets et du
manifeste, les contrôles habituels et l’autorisation de cette nouvelle version.

## Preuves de préparation

`tests/narration.test.mjs` couvre le budget, le cache, les mutations du plan,
l’abonnement payant, le modèle et les langues, les sorties trop longues et les
résultats inconnus. `tests/mix-narration.test.mjs` couvre la réutilisation de huit
pistes pour douze formats, le silence final, les reçus périmés, et un vrai mixage
FFmpeg de médias synthétiques avec identité de la piste vidéo et contrôles du
niveau musical. Les tests n’envoient aucune requête réelle à ElevenLabs.
Les 21 tests, les vérifications de syntaxe des scripts et le lint/TypeScript du
projet vidéo passent sur cette préparation. La génération et l’écoute réelles
restent à faire avec le compte et la voix retenus.
