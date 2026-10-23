# Remédiation du refus Guteneo 0.3.2 — suivi au 23 octobre 2026

## État courant du 23 octobre 2026

La [PR #65](https://github.com/nclsppr/guteneo/pull/65) est fusionnée dans
`main` au commit `5b5041ab04b235b57fccfa60814e7efa5683e17d`.
Les **13 contrôles de la CI main** sont réussis sur ce commit exact
([run 39914778387](https://github.com/nclsppr/guteneo/actions/runs/39914778387)).
La publication de l’application a réussi avec la version Worker
`0334ff69-f89e-419c-ba11-6cf4d035cd88`. Le vérificateur complet inchangé a réussi
le 23 octobre à **08:11:41 UTC** : les **266 ressources publiques** correspondent
exactement à leurs tailles et SHA-256, la politique dynamique `robots.txt` et les
en-têtes de sécurité sont conformes, et `/_headers` est reconnu comme
configuration. Le manifeste correspond au commit attendu, sans source modifiée ;
son snapshot est `733ca2fd31ec81bc537b055800364f8707d270066a9e3b365ddcd4dabb57710b`.
L’ancien film `/videos/guteneo-vertical-v6-en.mp4`, initialement en HTTP 500,
a retrouvé ses octets exacts sans purge ni changement de configuration. Les
lectures de son URL canonique et de l’URL de preuve sont conformes.
Le catalogue MCP authentifié doit encore être rapproché séparément.

Le portail existant affiche **0.3.2 — Changes required — Not published**.
Sa configuration MCP est indisponible et aucun contrôle de nouveau scan n’est
accessible. L’import du paquet **0.3.5** est refusé avec le message exact :
« Configure the existing MCP app before updating its plugin ZIP. »
Aucun import réussi, nouveau scan, resoumission ou approbation n’est établi.
Le paquet 0.3.5 a passé la validation de schéma, l’inventaire de 19 fichiers,
le contrôle CRC et la reconstruction déterministe ; son SHA-256 est
`717748d2b61b0ea3aee64d329fa3ad35c95a650f02106188bffd287790feae88`.
Il conserve l’identité du plugin et le serveur existants.
Le double audit complet des exigences a identifié des précisions de
confidentialité et de restrictions documentaires, un lien de présentation à
remplacer par la page informative, ainsi que des preuves reviewer manquantes.
Les corrections du serveur et des pages figurent dans la PR #67, fusionnée au
commit `f5d7c9aea1f938719bede15f4a6edd4892520ff1`, encore non déployée.
Les corrections du paquet et ses 32 tests sont terminées ; leur publication
avec les pages corrigées est explicitement autorisée.
La demande de support autorisée a été envoyée à 10:03 Paris après cet audit,
puis vérifiée dans les messages envoyés. Aucune réponse ni résolution n’est
encore établie ; les qualifications runtime restent distinctes.

Le scanner privé, initialement bloqué par **HTTP 503 `SIGNATURES_STALE`**, a été
restauré et qualifié à **08:27:39 UTC** : ClamAV **1.5.4**, signatures **28162**
du 23 octobre à **06:24:08 UTC**, version
`6f9f4e2d-ade1-4c67-abc2-d490988a9fe0`, trafic privé à 100 %. Les contrôles
synthétiques propres et négatifs portent sur l’image réellement servie, sans
document client ni communication réelle. Le run initial reste en échec après
une lecture trop précoce du plan de contrôle ; la qualification après convergence
n’a pas répété le déploiement. La PR #66 corrige cette attente et prépare la
surveillance indépendante. Le credential dédié autorisé pour 90 jours est
installé dans GitHub ; l’activation quotidienne attend encore un nouveau run
manuel réussi et la vérification de la surveillance. Le courriel GitHub de
l’échec initial a effectivement été reçu. Une release application ne constitue
toujours pas une preuve de fraîcheur du scanner.

La restriction dédiée `prepare_only` du compte reviewer a été restaurée et
relue le 23 octobre : l’insertion privée protégée a modifié exactement une ligne,
et les trois contrôles `target_guard_matches`, `exact_restriction_present` et
`intended_user_prepare_only` valent chacun `1`. Aucun canal, mandat, solde ou
envoi n’a été modifié. Le connecteur courant « Guteneo Review » cible toutefois
un autre tenant : il ne qualifie pas le compte de soumission.
La configuration Auth0 de renouvellement a déjà été
appliquée le 13 octobre ; le renouvellement OAuth réellement exécuté dans l’hôte
reste non qualifié. Les anciennes mentions « renouvellement désactivé » décrivent
donc un état historique, pas la configuration courante.

La [liste persistante de reprise](OPENAI_RESUBMISSION_TODO.md) ordonne les preuves
restantes et conserve les cas reviewer existants. Les sections ci-dessous
décrivent l’audit du 20 octobre ; leurs états « local » ou « non publié » ne
remplacent pas les observations datées de cette section.

## Historique du 20 octobre : état et périmètre de preuve

Le titulaire a fourni le 20 octobre 2026 un courriel annonçant le refus de
Guteneo **0.3.2** : au moins une annotation ne correspondrait pas au comportement,
les valeurs doivent être des booléens explicites et chaque valeur doit être
justifiée. Aucun nom d’outil ni identifiant de scan n’est donné. Cette notification
remplace l’ancien état « In review » dans le suivi courant ; le portail n’a pas
été relu indépendamment pendant cette remédiation.

Base locale inspectée : `473ddb3d3c58dd702daebd2f513f8a3371effedb`.
L’audit couvre les **67 outils** lorsque tous les services facultatifs sont
raccordés, y compris les chemins de production activables. Le compte de revue
limité à la préparation ne suffit pas à décrire les effets d’un autre compte
autorisé. La source locale, le serveur actuellement déployé, le catalogue du
connecteur de développement et l’instantané de soumission sont quatre preuves
distinctes.

Avant correction, le catalogue local comportait déjà 268 booléens explicites,
sans `null`. Cela ne démontre pas que le catalogue examiné par OpenAI était
identique. La table locale ne couvrait que 66 outils : `dry_run_dispatch` manquait.
L’historique du 4 octobre relève également quatre justifications alors manquantes
(`update_template`, `archive_template`, `share_template`,
`cancel_generation_job`). Le scan du 13 octobre « No findings » ne permet pas
d’affirmer que ces champs ont ensuite été complétés dans l’instantané rejeté.

## Sources officielles et interprétation

Sources OpenAI Developers consultées le 20 octobre :

- [Plugin guidelines — Correct annotation](https://developers.openai.com/plugins/plugin-guidelines#correct-annotation).
- [Remote MCP server review requirements](https://developers.openai.com/plugins/deploy/app-review).
- [Plugin submission errors](https://developers.openai.com/plugins/deploy/submission-errors).
- [Reference — Annotations](https://developers.openai.com/plugins/reference#annotations).

Les pages ne sont pas parfaitement alignées sur l’obligation des justifications :
les guidelines annoncent leur suppression, tandis que la page de revue et la
référence des erreurs décrivent encore leur usage. La demande explicite du
courriel est satisfaite en préparant les justifications pour **les quatre hints
de chaque outil**, y compris `idempotentHint`, facultatif dans la référence.
Une justification n’altère pas la valeur fournie par le serveur. Un futur
Scan Tools doit capturer les métadonnées du serveur corrigé.

La qualification destructive retenue porte sur des effets fonctionnels démontrés
de révocation et de clôture irréversible. Il s’agit de notre application des
règles aux handlers, pas d’une confirmation du motif précis retenu par OpenAI.
Une simple mise à jour de compteur, la fin d’une politique déjà expirée ou
le nettoyage d’un artefact temporaire ne sont pas assimilés mécaniquement
à une destruction de contenu utilisateur.

## Corrections préparées

| Outil / contrat                        | Avant                                                                      | Candidat corrigé                                                                         | Effet établi                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `review_dispatch.destructiveHint`      | `false`                                                                    | `true`                                                                                   | Une nouvelle revue terminée remplace le hash d’un jeton encore valide ; l’ancien jeton est refusé.                        |
| `prepare_distribution.destructiveHint` | `false`                                                                    | `true`                                                                                   | La création du manifeste ferme définitivement la reprise des records en échec du lot d’origine, même exclus du manifeste. |
| Justifications                         | 66 outils, trois colonnes explicites                                       | 67 outils, quatre valeurs et justifications par outil                                    | Couverture exacte contrôlée contre `tools/list`.                                                                          |
| Descriptions de lecture / usage IA     | Observation de connexion inégalement annoncée ; formulations trop absolues | Notice commune de l’observation persistée ; quota IA et validation du mapping explicités | Les effets décrits correspondent aux chemins possibles du serveur.                                                        |
| Configuration postale                  | Activation initiale et renouvellement peu explicites                       | Activation initiale du canal et clôture des seules politiques expirées décrites          | Aucun remplacement d’expéditeur ni révocation de devis encore valable.                                                    |

Le comportement métier reste identique : aucun scope, rôle, mandat, mécanisme
d’approbation, règle de débit ou appel fournisseur n’est ajouté ou assoupli.
Les nouvelles annotations peuvent modifier la manière dont l’hôte demande
confirmation. Les descriptions indiquent la conséquence avant l’opération.

Tous les `readOnlyHint` et `idempotentHint` restent `false` : après un succès
validé, le wrapper peut écrire l’activité d’une connexion de production encore
autorisée. Cette donnée est exposée dans l’état de connexion. L’absence d’écriture
dans certaines branches ne supprime pas cet effet possible. Les clés métier
continuent à protéger les opérations dédupliquées ; elles ne rendent pas
l’intégralité du tool sans effets supplémentaires.

Les appels bornés au compte privé d’un fournisseur restent distincts des
imports sur des domaines publics arbitraires et des envois à des destinataires
externes. La matrice documente ce raisonnement outil par outil.

`transfer_postal_draft` conserve son marqueur destructif pour un effet fonctionnel :
le démarrage consomme la tentative de transfert du préflight, sans retour possible
à l’état initial et sans reprise après `unknown`. La création du brouillon
fournisseur reste distincte de l’envoi postal. Cette justification ne repose
pas simplement sur la transmission de données à un prestataire ; les outils de
proposition IA n’écrasent pas les modèles et ne ferment pas leur reprise.
`store:false` côté IA n’est pas présenté comme une garantie d’absence de rétention.

## Prévention des régressions

- Le type local de déclaration exige les quatre booléens ; le SDK seul autorisait
  des propriétés facultatives.
- [La matrice structurée](../integrations/chatgpt/tool-annotations.json) contient
  chaque valeur, sa justification en anglais et des références de code.
- [Le document lisible](../integrations/chatgpt/tool-annotations.md) est généré
  depuis cette matrice et vérifié en CI.
- `npm run audit:mcp` interroge `tools/list` à travers le transport MCP du SDK,
  avec tous les services facultatifs présents et des stubs métier qui échouent
  s’ils sont invoqués. Le contrôle refuse les booléens absents, `null` ou chaînes,
  les nouveaux outils non documentés, les lignes périmées, doublons, divergences
  et justifications/références manquantes.
- Les tests comportementaux reproduisent le remplacement d’un jeton valide
  et le gel d’un lot partiel. Le premier vérifie aussi qu’un ancien jeton refusé
  n’ajoute aucun effet d’acceptation ou d’envoi.

La présence d’un symbole dans un fichier ne prouve pas à elle seule la justesse
d’une classification : ce contrôle complète l’audit des handlers et les tests,
sans s’y substituer. Une vérification locale ne qualifie pas l’accès OAuth du
reviewer ou le serveur de production.

## Vérifications reproductibles et résultats

Vérifications exécutées le 20 octobre sur le candidat local :

- Catalogue réel du SDK : **67 outils, 268 booléens explicites, 268
  justifications et 216 références contrôlées**, sans anomalie.
- Comparaison au catalogue exécuté depuis la base : seuls les marqueurs
  destructifs de `review_dispatch` et `prepare_distribution` changent ;
  les 67 descriptions intègrent l’observation de connexion. Aucun changement
  de nom, titre, schéma, métadonnées de sécurité ou autre champ du descripteur.
- Neuf suites ciblées : **260 tests réussis**, aucun échec ni test ignoré.
  Elles couvrent les annotations, les revues et jetons expert, les lots,
  la configuration et les parcours postaux, ainsi que les diagnostics PDF.
- Trois tests ciblés d’authentification réussis : l’observation ne provient
  que d’un appel authentifié réussi ; réassociation, révocation et séparation
  des ateliers restent contrôlées. Les 46 autres tests de ce fichier
  n’ont pas été exécutés dans cette sélection.
- Le test postal ciblé de révocation après obtention de l’emplacement de dépôt
  réussit : aucune transmission des octets et aucune reprise automatique
  après l’issue incertaine. Les neuf autres tests de ce fichier n’ont pas
  été exécutés dans cette sélection.
- Vérification TypeScript et lint complets réussis ; documents générés et
  `git diff --check` conformes.

Ces résultats locaux ne remplacent pas la CI complète du commit exact.
Les artefacts de travail sont conservés dans
`/workspace/guteneo-annotation-evidence/`, hors des fichiers publics du site.
Ils comprennent le catalogue local, le rapport structurel et les résultats
des suites ciblées. Les empreintes du rapport portent sur `JSON.stringify`
du catalogue et de la matrice analysés, et non sur les octets des fichiers
JSON mis en forme. Elles identifient les données contrôlées indépendamment
de leur indentation.

Empreintes normalisées du candidat contrôlé :

- Catalogue :
  `c0ea3d3d737b762a08dd843f657fe603869ef7d74f01917174957b5ff213e3c5`.
- Matrice :
  `747656fe125ad7fc7669ab57abf3987d2788fb4f01b1bdda3da110357ad966d4`.

```sh
npm run audit:mcp -- --output-dir /workspace/guteneo-annotation-evidence
node scripts/build-mcp-annotation-docs.mjs --check
node docs/build-feature-map.mjs --check
npm run typecheck
npm run lint
./node_modules/.bin/vitest run \
  tests/unit/mcp-integrations.test.ts \
  tests/integration/expert-approval.test.ts \
  tests/integration/expert-review-pages.test.ts \
  tests/integration/template-workflow.test.ts \
  tests/unit/postal-setup.test.ts \
  tests/unit/postal.test.ts \
  tests/unit/postal-address-page.test.ts \
  tests/unit/pdf-validation.test.ts \
  tests/unit/mcp-annotation-audit.test.ts
```

## Passage au serveur et au portail

Le plugin étant relié à un MCP hébergé séparément, modifier seulement un ZIP
ne corrige pas les annotations du serveur. Aucun changement de manifeste ou de
numéro de version n’est nécessaire pour établir la preuve locale de ces hints.
Les candidats de paquet 0.3.3 et 0.3.4 ne doivent pas être confondus avec la
soumission rejetée 0.3.2 ou promus implicitement par cette remédiation.

1. Relire le correctif et la CI du commit exact, puis utiliser la procédure
   de publication existante après autorisation explicite de production.
2. Capturer le `tools/list` authentifié du serveur déployé et vérifier la
   correspondance des noms, descriptions, schémas et annotations avec le candidat.
   Le catalogue local emploie une origine de fixture et ne doit pas être importé
   comme preuve de découverte de production.
3. Dans la soumission existante, lancer **Scan Tools**, vérifier les 67 outils
   et les deux nouvelles valeurs destructives, puis rapprocher chaque
   justification du catalogue réellement enregistré. Vérifier en particulier
   les quatre lacunes historiques et `dry_run_dispatch`.
4. Exécuter les cas reviewer sur le bon compte et dans l’hôte prévu, sans
   convertir un scan réussi en preuve d’un parcours réussi. Les lacunes OAuth
   et de recette consignées dans [le dossier marketplace](CHATGPT_MARKETPLACE.md)
   restent à qualifier séparément.
5. Compléter les attestations par le titulaire et effectuer une resoumission
   autorisée. La réponse de revue et la publication restent des étapes distinctes.

Au terme de la passe du 20 octobre, aucun déploiement, modification du portail,
attestation, courriel envoyé, resoumission ou approbation n’était établi. La source
alors déployée et l’instantané exact examiné n’avaient pas été récupérés.
L’état du 23 octobre figure en tête de ce dossier. Une demande de précision
préparée pendant la passe historique reste dans
[annotation-review-response.en.md](../integrations/chatgpt/annotation-review-response.en.md).
