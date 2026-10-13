# Installation MCP et diffusion des plugins — 13 octobre 2026

Document technique interne. L’accès HTTP, une connexion OAuth, un parcours PDF,
le renouvellement et une publication de catalogue sont des preuves distinctes.
Les instructions utilisateur sont dans [LLM_SETUP.md](LLM_SETUP.md).

## Production, revue et candidat

| Objet                | État observé                                                                                                                                                                                                                  | Limite                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Production           | Source `6a27eff665cd1fe9a330448f0dd92864650f7354`, build `2026-10-13T18:36:46.854Z`. `/mcp` anonyme : 401 ; métadonnées OAuth : 200.                                                                                          | Le refus anonyme protège le service ; il ne démontre pas une installation réussie.                                                          |
| Base `main` actuelle | `6a27eff665cd1fe9a330448f0dd92864650f7354`, après Dashboard V2 (#61) et sa stabilisation (#62). Le contrat MCP et les intégrations restent inchangés depuis l’audit initial ; API auth/profil/mobile et interface ont évolué. | Cette source main est désormais déployée. La correction locale d’issuer reste dans le candidat.                                             |
| Audit initial        | `1e5ab18a464adfdb22af85d71f291600149ff330` avait MCP/API/intégrations identiques à la production au début de cette passe.                                                                                                     | Référence historique ; ses contrôles CI ne qualifient pas la dernière base ni le candidat rebâti dessus.                                    |
| Paquet public        | **0.3.2**, 1 310 328 octets, SHA-256 `4a098e789b480b54713c2ddd448b8c32d172267f1d8eb58047140fe9080e1f4c` ; manifeste et reconstruction de la base initiale `1e5ab18` concordants.                                              | Archive préservée ; téléchargement distinct d’une installation et d’un annuaire.                                                            |
| Portail OpenAI       | **0.3.2 · In review · Not published · Not live**. Scan du **13 octobre à 13:56:30 CEST** : **67 outils**, « No findings in the latest MCP scan. » Six skills : « Checks passed ».                                             | Aucun remplacement, annulation de revue ou publication dans cette passe. Un scan réussi ne qualifie pas la recette ou la durée OAuth.       |
| Candidat local       | **0.3.4**, distinct du brouillon 0.3.3 de PR #52, rebasé sur `6a27eff`. Archive source inchangée lors de cette reprise : 1 315 169 octets, SHA-256 `3749a558dd4bb36dedea813348dd534947e997a202c20945f002e7991f327474`.        | Reconstruction et CI du candidat sur la dernière base à confirmer. Ni déploiement, ni import, ni soumission ; l’archive n’active pas Auth0. |

La CI du commit `6b80d0a` a réussi ses 13 jobs et les guides passent 22/22 contrôles
desktop/iPhone dans quatre langues. Le correctif ultérieur du callback reviewer
passe 96/96 tests ciblés ; vérifier séparément la CI du nouveau commit de PR #63.
Les fichiers du paquet 0.3.4 n’ont pas changé avec ce correctif de script.

Le GET public final du 13 octobre à 18:56 UTC confirme la nouvelle release
`6a27eff…`, après la stabilisation de Dashboard V2 (#62). La découverte conserve
encore l’issuer sans slash final. Deux SELECT D1 bornés relus à 18:58 UTC
confirment **0053 dans le ledger et colonne `users.preferred_dashboard_appearance`
présente**. Ce préalable de release est désormais satisfait ; aucune migration
n’a été appliquée par cette passe. Le constat antérieur `f1a2681…` et l’absence
0053/colonne à 16:18 UTC restent historiques, sans être repris comme état actuel.
Le ZIP public a été relu à 18:59 UTC : 0.3.2, 19 fichiers, octets et SHA-256
inchangés. Une future release MCP exige toujours sa propre autorisation,
CI exacte et vérification du manifeste canonique.

La reconnexion du connecteur **Guteneo Review** a réussi ce tour ;
`get_capabilities`, `list_documents` et `expert_status` ont répondu en production,
avec `simulation:false`, sans activation expert. Six documents ont été observés,
mais aucun ne correspondait au SHA-256 de la fixture attendue. Le couple exact
issuer/subject et la restriction D1 n’ont pas été rapprochés dans cette passe.
Il s’agit du connecteur reviewer de développement dans **Codex, 24 outils**,
distinct du catalogue serveur scanné de 67 outils : **P3 et la recette complète
ne sont pas qualifiés**. Voir [la recette](../integrations/chatgpt/reviewer-tests.md).

## Voies de distribution

Sources officielles relues le 13 octobre. « Voie documentée » décrit la plateforme,
sans prétendre que Guteneo y a terminé OAuth ou obtenu une publication.

| Surface                                        | Installation documentée                                                                                                                                                                  | Diffusion publique et travail restant                                                                                                                                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ChatGPT                                        | [Custom MCP puis plugin personnel](https://developers.openai.com/plugins/deploy/connect-chatgpt), OAuth par utilisateur.                                                                 | Revue 0.3.2 en cours. Qualifier le compte, les cas et le renouvellement ; approbation et publication restent distinctes.                                                                                                                                           |
| Claude web/Desktop ; mobile pour le connecteur | [Custom connector](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) ; upload ZIP sur web/Desktop et connexion OAuth séparés.         | [Deux soumissions](https://claude.com/docs/directory/publish) : connecteur distant et plugin GitHub, même organisation. Préparer revue, compte de test, confidentialité et admissibilité des opérations payantes ; qualification Claude du 17 septembre seulement. |
| Claude Code / Grok Build                       | [Plugin Claude Code](https://code.claude.com/docs/en/plugins-reference) ; [plugins compatibles dans Grok Build](https://docs.x.ai/build/features/skills-plugins-marketplaces).           | Paquet local/GitHub et marketplaces configurables. Cela ne vaut pas référencement Claude ou Grok grand public ; OAuth CLI à qualifier séparément.                                                                                                                  |
| Grok web/mobile                                | [New Connector → Custom](https://docs.x.ai/grok/connectors), URL publique et authentification ; autorisation administrateur selon l’offre.                                               | Guide Guteneo présent en production. Aucun processus public de soumission ni callback/client statique OAuth vérifié dans ces sources ; relever le parcours réel avant d’enregistrer le client.                                                                     |
| Gemini grand public                            | [Custom connected app](https://support.google.com/gemini/answer/17209137), actuellement compte personnel, 18+, États-Unis, anglais et activité activée. Client fourni possible sans DCR. | Pas de voie générale de publication de plugin vérifiée. Guide conditionnel et qualification depuis un compte éligible à préparer.                                                                                                                                  |
| Perplexity                                     | [Remote connector](https://www.perplexity.ai/help-center/en/articles/13915507-adding-custom-remote-connectors), Pro/Max/Enterprise, Streamable HTTP/SSE, OAuth DCR ou client fourni.     | Pas de portail public de soumission vérifié. Ajouter guide, client enregistré et qualification individuelle ; callbacks consumer et Enterprise distincts.                                                                                                          |
| Mistral / Le Chat / Work                       | [Custom MCP](https://docs.mistral.ai/vibe/work/connectors/mcp-connectors), administrateur, HTTPS Streamable HTTP, OAuth 2.1 avec **DCR**.                                                | Annuaire existant, procédure publique non vérifiée. Aucun fallback statique documenté : compatibilité conditionnée à un DCR réellement utilisable. Pas de resources/prompts automatiques.                                                                          |
| Cursor                                         | [MCP distant OAuth](https://cursor.com/docs/mcp), client statique possible.                                                                                                              | Plugin propriétaire conservé : catalogue public open source exclu. Installation locale ou privée à qualifier, y compris la préséance des manifestes.                                                                                                               |
| GitHub Copilot                                 | [MCP IDE/CLI](https://docs.github.com/en/copilot/concepts/context/mcp), configuration selon l’hôte et ses politiques.                                                                    | Registres public/organisation distincts. [Cloud agent et code review sans OAuth distant](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers) : incompatibles avec le parcours Guteneo retenu.                    |
| Microsoft 365 Copilot                          | Connecteur fédéré MCP, OAuth et consentement administrateur.                                                                                                                             | [Voie ISV/Partner Center](https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/submit-federated-connector), outils search/fetch, dossier et certification propres. Aucune voie custom MCP générale vérifiée pour Copilot grand public.               |
| Windsurf / Devin Desktop                       | [MCP distant OAuth](https://docs.devin.ai/desktop/cascade/mcp). Documentation Windsurf redirigée vers Devin ; legacy Cascade configuré manuellement.                                     | Marketplace/en un clic propre à Devin Local ; publication tierce non vérifiée. Guide adapté au produit et test réel à préparer.                                                                                                                                    |
| Gemini CLI                                     | [MCP OAuth](https://geminicli.com/docs/tools/mcp-server/), découverte ou client fourni, callback localhost configurable.                                                                 | [Galerie](https://geminicli.com/docs/extensions/releasing/) : dépôt public, topic `gemini-cli-extension`, `gemini-extension.json` à la racine, indexation quotidienne. Package et test CLI à préparer ; distinct de Gemini grand public.                           |

Le paquet portable ne remplace pas les formats de soumission et les politiques
propres aux catalogues. La [politique Claude Directory](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy)
exige une autorisation écrite pour l’exécution de transactions financières et
interdit l’extraction des fichiers téléversés dans Claude. Faire examiner le
périmètre payant de Guteneo ; ne pas promettre ce transfert dans une fiche.

## Prérequis du paquet et des catalogues

Les [métadonnées OAuth du paquet OpenAI](https://developers.openai.com/plugins/build/plugins)
`extensions.com.openai.auth` ne sont pas activées dans 0.3.4. Leur intégration
dans la configuration MCP reste à résoudre : le [schéma portable 1.0.0 validé
localement](../integrations/schemas/mcp.schema.json) interdit les propriétés HTTP
supplémentaires (`additionalProperties:false`), dont `extensions`. Ajouter ce
champ sans résoudre le contrat ferait échouer le builder ; assouplir la copie du
schéma officiel ou déduire un client/DCR n’est pas une qualification. Le scan réussi porte
sur la configuration OAuth **du portail existant**, distincte de l’installation
OAuth **d’un nouveau paquet**. La conformité et un test réel du paquet restent
donc des prérequis de diffusion.

La soumission publique Cursor requiert un projet open source. Le titulaire a
choisi de **garder le plugin propriétaire** le 13 octobre : cette soumission est
donc exclue du parcours retenu. L’installation locale ou privée reste à qualifier.
Aucune licence open source n’est ajoutée au plugin ni au SaaS.
Le clone du dépôt observé pèse environ **1,8 Go**,
contre **1,3 Mo** pour le ZIP ; les index marketplace à la racine ne sont pas
ajoutés dans ce candidat. Préparer ultérieurement un petit dépôt de distribution
avec les index propres aux hôtes, après résolution du contrat
OAuth ; ne pas présenter `main` comme une installation marketplace prête.

## Durabilité OAuth et activation reviewer

La découverte publique annonce actuellement `https://pieper.eu.auth0.com`, alors
que l’issuer Auth0 exact est `https://pieper.eu.auth0.com/`. La correction conservant
le slash est **locale**, avec tests du client MCP ; la production reste à corriger
sous autorisation de déploiement. Un succès de reconnexion manuel ne prouve ni la
conformité de cette découverte ni le renouvellement automatique.

La lecture authentifiée du Dashboard Auth0 a confirmé trois blocages reviewer :
grant `refresh_token` désactivé, API `allow_offline_access:false` et Action
d’identité déployée acceptant seulement le protocole initial avec S256 PKCE.
Les accès restent limités à une heure. Après autorisation explicite, le CLI a
été reconnecté sur le tenant exact, séparément du Dashboard. Le premier GET a
révélé une erreur du candidat : sa constante utilisait un callback générique,
alors que le client live et l’historique marketplace conservent le callback
exact propre au connecteur. Le refus strict a précédé toute mutation. Le
candidat conserve désormais cette URL exacte. Son inspection complète en GET
a réussi : les deux Actions draft/déployées, leurs listes historiques, l’API,
les quatre connexions et les bindings sont reconnus. Le plan comporte les
deux Actions à mettre à jour et déployer, offline access de l’API, puis refresh
rotatif du seul reviewer. La copie indépendante et la source corrigée produisent
la même synthèse et la même empreinte ; aucune application n’a été effectuée.

Le [migrateur ciblé](../scripts/enable-openai-review-renewal.mjs) prépare uniquement
le client public reviewer `2vjfO7mSnP8TPMh4RRyZCx6r9D8ADXzX`, owner
`guteneo-openai-review-v1`, component `openai-review`, callback exact
`https://chatgpt.com/connector/oauth/aAwc9dso12_L`. Il conserve les clients historiques
des Actions, ajoute seulement l’allowlist de renouvellement reviewer, déploie les
deux Actions avant d’autoriser l’émission et borne la rotation à **30 jours idle,
90 jours absolus, 3 secondes de tolérance**. Aucun autre client renouvelable
Guteneo n’est modifié ; un état non reconnu est refusé. Aucun secret, binding,
compte, mandat, D1 ou configuration Wrangler n’est modifié.

Parcours opérateur, sans application dans cette passe :

1. Rétablir l’inspection CLI sur le tenant attendu puis exécuter
   `node scripts/enable-openai-review-renewal.mjs --inspect`. Relire le plan
   expurgé et son empreinte ; les fixtures ne certifient pas la configuration live.
2. Obtenir l’autorisation explicite pour ce plan précis avant
   `--apply --expect EMPREINTE_REVUE`. Après un échec, aucune mutation n’est
   réessayée automatiquement : inspecter et revoir une nouvelle empreinte ; seul
   un état partiel exact reconnu peut reprendre les étapes restantes.
3. Inspecter l’état final puis qualifier sans mutation avec
   `node scripts/prepare-chatgpt-reviewer.mjs --qualify-client https://chatgpt.com/connector/oauth/aAwc9dso12_L --expect-renewal EMPREINTE_FINALE_REVUE`.
4. Rapprocher séparément issuer/subject, compte, tenant, client et restriction D1
   `prepare_only` ; reconstituer les données synthétiques et exécuter la recette
   dans l’hôte prévu. Observer expiry/refresh/revocation réels. Aucun envoi ni
   activation de canal/mandat ne sert à satisfaire ces tests.
5. Maintenir 0.3.2 en revue jusqu’à décision ou autorisation distincte de
   remplacement ; déployer le correctif, soumettre un candidat et publier dans un
   annuaire exigent chacun leur propre autorisation et preuve.

Preuve locale initiale : **95 tests ciblés** migrateur/reviewer/régression Claude réussis,
lint et formatage réussis ; revue indépendante migrateur/reviewer **65/65**.
Ce sont des fixtures, sans modification Auth0 ou qualification de renouvellement.
Ces résultats précèdent la reprise sur `54639e7` ; ils ne qualifient pas la CI du
candidat final sur cette nouvelle base. Après correction du callback exact,
**96/96 tests ciblés** réussissent. Une fixture positive indépendante de la
constante et le refus sans écriture de l’ancien callback couvrent le défaut
trouvé en GET live. La revue indépendante conserve l’égalité stricte et confirme
que les patches du client n’incluent jamais `callbacks`.
Les rapports expurgés restent hors dépôt dans le dossier d’audit privé du
13 octobre ; aucune identité, donnée documentaire ni réponse provider brute
n’est copiée ici.
