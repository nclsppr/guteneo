# Installation MCP et diffusion des plugins — 13 octobre 2026

Document technique interne. L’accès HTTP, une connexion OAuth, un parcours PDF,
le renouvellement et une publication de catalogue sont des preuves distinctes.
Les instructions utilisateur sont dans [LLM_SETUP.md](LLM_SETUP.md).

## Production, revue et candidat

| Objet                | État observé                                                                                                                                                                                                     | Limite                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Production           | Source propre `f1a2681ce45ac4396fede5e7472a1722bca567d3`, build `2026-10-10T03:52:00.751Z`. `/mcp` anonyme : 401 ; métadonnées OAuth : 200.                                                                      | Le refus anonyme protège le service ; il ne démontre pas une installation réussie.                                                          |
| Base `main` actuelle | `54639e7f6331433a5b24b0449c50c1f4ce5bb57d`, après fusion de Dashboard V2 (#61). Le contrat MCP et les intégrations restent inchangés depuis l’audit initial ; API auth/profil/mobile et interface ont évolué.    | L’ensemble de l’API n’est plus identique à la production. La correction locale d’issuer reste dans le candidat.                             |
| Audit initial        | `1e5ab18a464adfdb22af85d71f291600149ff330` avait MCP/API/intégrations identiques à la production au début de cette passe.                                                                                        | Référence historique ; ses contrôles CI ne qualifient pas `54639e7` ni le candidat rebâti dessus.                                           |
| Paquet public        | **0.3.2**, 1 310 328 octets, SHA-256 `4a098e789b480b54713c2ddd448b8c32d172267f1d8eb58047140fe9080e1f4c` ; manifeste et reconstruction de la base initiale `1e5ab18` concordants.                                 | Archive préservée ; téléchargement distinct d’une installation et d’un annuaire.                                                            |
| Portail OpenAI       | **0.3.2 · In review · Not published · Not live**. Scan du **13 octobre à 13:56:30 CEST** : **67 outils**, « No findings in the latest MCP scan. » Six skills : « Checks passed ».                                | Aucun remplacement, annulation de revue ou publication dans cette passe. Un scan réussi ne qualifie pas la recette ou la durée OAuth.       |
| Candidat local       | **0.3.4**, distinct du brouillon 0.3.3 de PR #52, en reprise sur `54639e7`. Archive préparée avant cette reprise : 1 315 169 octets, SHA-256 `3749a558dd4bb36dedea813348dd534947e997a202c20945f002e7991f327474`. | Reconstruction et CI du candidat sur la dernière base à confirmer. Ni déploiement, ni import, ni soumission ; l’archive n’active pas Auth0. |

Le GET production `/release.json` a été relu après le fetch : **200**, toujours
`f1a2681…`, source propre et même build du 10 octobre. La découverte publique
conserve encore l’issuer sans slash final. Le futur déploiement depuis la dernière
base inclurait également Dashboard V2 et
[0053_user_dashboard_appearance.sql](../migrations/0053_user_dashboard_appearance.sql).
Vérifier le ledger et traiter cette migration avec les contrôles et l’autorisation
de release habituels ; le correctif MCP ne permet pas de les contourner.
Ni Dashboard V2 ni 0053 ne sont déclarés déployés par cette passe.

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
| Cursor                                         | [MCP distant OAuth](https://cursor.com/docs/mcp), client statique possible.                                                                                                              | [Soumission](https://cursor.com/marketplace/publish) depuis un dépôt public ; paquet préparé, installations desktop/web et publication à qualifier.                                                                                                                |
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

La soumission publique Cursor requiert un projet open source. Le dépôt n’a pas
de fichier LICENSE et GitHub ne reconnaît pas de licence : **choix humain de
licence requis avant cette soumission**. Ne pas sélectionner une licence pour
faire passer le catalogue. Le clone du dépôt observé pèse environ **1,8 Go**,
contre **1,3 Mo** pour le ZIP ; les index marketplace à la racine ne sont pas
ajoutés dans ce candidat. Préparer ultérieurement un petit dépôt de distribution
avec les index propres aux hôtes, après résolution de la licence et du contrat
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
Les accès restent limités à une heure. Le GET CLI du client reviewer a échoué sur
une authentification expirée (« please login »), alors que la liste des tenants
en cache sélectionne bien le tenant attendu. La connexion Dashboard dans le
navigateur est distincte de cette session CLI. **Aucune inspection CLI complète,
empreinte d’état live ou application ne sont attestées.** Les sources exactes
des deux Actions, leurs versions et bindings restent à obtenir par le migrateur.

Le [migrateur ciblé](../scripts/enable-openai-review-renewal.mjs) prépare uniquement
le client public reviewer `2vjfO7mSnP8TPMh4RRyZCx6r9D8ADXzX`, owner
`guteneo-openai-review-v1`, component `openai-review`, callback exact
`https://chatgpt.com/connector/oauth_callback`. Il conserve les clients historiques
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
   `node scripts/prepare-chatgpt-reviewer.mjs --qualify-client https://chatgpt.com/connector/oauth_callback --expect-renewal EMPREINTE_FINALE_REVUE`.
4. Rapprocher séparément issuer/subject, compte, tenant, client et restriction D1
   `prepare_only` ; reconstituer les données synthétiques et exécuter la recette
   dans l’hôte prévu. Observer expiry/refresh/revocation réels. Aucun envoi ni
   activation de canal/mandat ne sert à satisfaire ces tests.
5. Maintenir 0.3.2 en revue jusqu’à décision ou autorisation distincte de
   remplacement ; déployer le correctif, soumettre un candidat et publier dans un
   annuaire exigent chacun leur propre autorisation et preuve.

Preuve locale : **95 tests ciblés** migrateur/reviewer/régression Claude réussis,
lint et formatage réussis ; revue indépendante migrateur/reviewer **65/65**.
Ce sont des fixtures, sans modification Auth0 ou qualification de renouvellement.
Ces résultats précèdent la reprise sur `54639e7` ; ils ne qualifient pas la CI du
candidat final sur cette nouvelle base.
Les rapports expurgés restent hors dépôt dans le dossier d’audit privé du
13 octobre ; aucune identité, donnée documentaire ni réponse provider brute
n’est copiée ici.
