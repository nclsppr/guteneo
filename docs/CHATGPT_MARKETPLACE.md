# Dossier marketplace ChatGPT — reprise du 21 septembre 2026

**Candidat préparé pour la revue ; aucun brouillon de plugin créé, aucune soumission ni publication confirmée.** Ce dossier distingue la reprise du 21 septembre des preuves historiques du 17 septembre. La PR [#14](https://github.com/nclsppr/guteneo/pull/14) reste un candidat ; sa préparation ne publie ni le serveur ni le plugin.

## État exact du portail

Le 17 septembre, dans Safari, sur `https://platform.openai.com/plugins`, organisation **Personal**, le parcours **Create plugin → With MCP** a ouvert la fenêtre :

> Complete identity verification
>
> You need a verified developer identity before you can create or upload a plugin.

Les boutons affichés étaient **Cancel** et **Continue**. **Continue** a ouvert `https://platform.openai.com/settings/organization/general`. Aucun brouillon ni identifiant de plugin n’a été créé. La vérification personnelle ou d’entreprise doit être accomplie par le titulaire ; ce dossier ne l’atteste pas. Le nom d’éditeur devra correspondre à l’identité vérifiée. La marque **Guteneo** ne prouve pas une entreprise immatriculée ou vérifiée.

**Relecture du portail le 21 septembre 2026, heure de Paris : le même blocage d’identité est toujours affiché avant la création du brouillon.** Aucun client/callback de soumission ni challenge de domaine n’a donc été obtenu. L’utilisateur a été invité à compléter la vérification dans son compte ; son achèvement n’est pas présumé.

## Contenu prêt à reporter

La feuille [listing.json](../integrations/chatgpt/listing.json) contient descriptions, amorces, langue, contact et paramètres publics. **C’est un document interne, pas un schéma OpenAI ni un manifeste officiel à téléverser.** Les champs `null` attendent les informations réelles du portail.

| Champ                        | Valeur                                                    |
| ---------------------------- | --------------------------------------------------------- |
| Nom                          | Guteneo                                                   |
| Description courte           | PDF, devis et suivi des envois                            |
| Catégorie / langue           | Productivity / Français (`fr-FR`)                         |
| Site / support               | `https://guteneo.com` / `guteneo@pieper.fr`               |
| MCP universel                | `https://guteneo.com/mcp`                                 |
| Transport / authentification | Streamable HTTP / OAuth par utilisateur                   |
| Ressource / autorité OAuth   | `https://guteneo.com/mcp` / `https://pieper.eu.auth0.com` |
| Logo                         | `https://guteneo.com/brand/guteneo-mark.png`              |
| Captures d’UI native         | Aucune : le serveur ne fournit pas d’UI MCP native        |
| Politique de confidentialité | URL complète de politique réelle encore absente           |
| Client/callback/reviewer     | À configurer et vérifier ; aucune valeur fictive          |
| Enregistrement de démo       | URL absente ; ne pas remplacer par une capture du site    |
| Challenge du domaine         | URL et jeton exacts non obtenus dans le portail           |

Le texte décrit PDF, devis, plafond, approbation et suivi, selon les fonctions du compte. Il ne promet ni tous les pays, ni e-mail/courrier actif, ni livraison garantie, ni parcours sans sortie de ChatGPT. Le mode standard utilise l’approbation navigateur ; le mode expert exige un mandat préalable accordé par un administrateur.

## Paquet et nouveau logo

**Archive historique du 17 septembre :** le paquet `dist/integrations/guteneo-plugin.zip` **0.2.1** pesait **285 340 octets**, SHA-256 `b3c6a1f7f1d933fcf548b66b48f90edd95ffc938e3452a2aa9c468d4a709dfe4`. Ces valeurs ne décrivent pas l’archive reconstruite après la reprise. Le build n’est pas une publication. Le dossier `integrations/chatgpt/` reste une feuille de soumission séparée du paquet portable.

**Archive reconstruite le 21 septembre :** version **0.2.1**, **285 325 octets**, SHA-256 `1c9fca3eca5551ccb3b34a862c84165dc5daa32fc8e745883c0f526e5c67eb79`. Le [rapport de reprise](../reports/chatgpt-marketplace-resume-2026-09-21.json) distingue les GET publics, les contrôles locaux et le blocage du portail. Cette archive n’est ni déployée ni soumise par sa construction.

Selon [BRAND_IDENTITY.md](BRAND_IDENTITY.md), l’**emblème simple** sert au MCP et aux petites icônes ; le portrait transparent aux headers et à Auth0 ; le timbre « guteneo.com » au footer et aux communications externes.

`apps/web/public/brand/guteneo-mark.png` : **512 × 512**, **249 823 octets**, fond opaque, SHA-256 `d6a83bbe53abb6ffac19d66a66d02b5992887a4796d909fb86043c356580e8c9`. Le 17 septembre, son URL publique répondait `200 image/png` avec les mêmes octets que le fichier local. Aucune création/retouche d’image ni fausse transparence n’est revendiquée.

## Observation publique du 21 septembre

Les GET publics du **20 septembre à 22:19 UTC, soit le 21 septembre à 00:19 à Paris**, ont été relus avec `curl` et un User-Agent de navigateur. Une première tentative avec le client Python recevait `403` sur toutes les routes : ce refus d’accès ne prouvait ni une panne ni l’absence des pages.

| Route / champ                                    | Résultat observé                                                                                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/release.json`                                  | `200`, source `ef417c7f187bd11e327881b2127eae653288ac58`, `sourceDirty:false`, build `2026-09-20T19:44:57.804Z`, application `0.2.0`                                   |
| `/api/capabilities`                              | `200`, production sans simulation, `urlImport:true`, scanner connecté, fax et courrier avec `liveSending:true`, e-mail avec `liveSending:false`                        |
| Approbation et achats                            | Mode standard navigateur ; voie expert disponible avec activation préalable dans le compte. Facturation non configurée, `chargingEnabled:false`                        |
| `/mcp` sans Bearer                               | `401 AUTHENTICATION_REQUIRED`, refus attendu pour un endpoint protégé                                                                                                  |
| `/.well-known/oauth-protected-resource/mcp`      | `200`, audience MCP, autorité Auth0 et cinq scopes annoncés                                                                                                            |
| `/confidentialite/`, `/conditions/`, `/contact/` | `404`                                                                                                                                                                  |
| `/mentions-legales/`                             | `200`, texte daté du 20 septembre : atelier connecté et courrier distingués de la démonstration ; la rubrique données reste centrée sur la démonstration et Cloudflare |

Ces capacités décrivent la configuration publique. Elles ne prouvent ni les droits du compte reviewer, ni une route qualifiée, ni un nouvel envoi, ni la disponibilité de chaque outil dans ChatGPT. Les champs génériques de diagnostic encore anciens ne remplacent pas les preuves datées. Les mentions légales ont progressé depuis le 17 septembre, mais ne constituent pas une politique complète des traitements du service authentifié.

## Preuves historiques du 17 septembre

La lecture publique et le blocage du portail sont consignés dans le
[rapport expurgé](../reports/chatgpt-marketplace-public.json).

Lecture publique du 17 septembre pendant cette préparation :

- `/release.json` : source propre `c3798f59cb6cff4e1dcaddb524f43d59b1009822`, construite à `2026-09-17T14:32:49.407Z`, version applicative `0.2.0`.
- `/api/capabilities` : production, sans simulation, import d’URL actif ; **fax actif**, e-mail et courrier inactifs ; achats désactivés (`chargingEnabled:false`).
- Découverte OAuth : `documents:read documents:write dispatches:prepare dispatches:send dispatches:read`. L’autorité OIDC annonce `openid`, `email` et `userinfo_endpoint` ; la réponse `email_verified` du compte reviewer n’est pas qualifiée.
- `/mentions-legales` répond `200` mais décrit encore tout l’atelier comme une démonstration locale fictive sans envoi. `/confidentialite` et `/conditions` répondent `404`.

[CHATGPT_QUALIFICATION.md](CHATGPT_QUALIFICATION.md) conserve trois preuves distinctes : installation OAuth et lectures ; import natif exact de **136 018 octets**, puis document prêt ; un fax livré sur une route luxembourgeoise, suivi d’un rapprochement manuel de consommation. Elles ne qualifient pas toutes les routes/modèles, la recette reviewer, renouvellement/révocation OAuth ou règlement automatique généralisé.

Des champs publics (`not_tested_in_real_client`, `real login unverified`) et certaines notes de `LIVE_RELEASE.md` décrivent un état antérieur. Les rapprocher des preuves datées sans les présenter comme de nouveaux tests échoués, ni extrapoler une qualification globale.

Validation locale du **17 septembre** : **43 tests ciblés**, types, lint, build web et package. [Rapport de validation expurgé](../reports/chatgpt-marketplace-validation.json). La CI de `bd1fd01dc5188f1ed6aaf2271169c8e2f42dff9f` a réussi. Le 21 septembre, le candidat a été rebasé sur `origin/main` à `89d126d288b86f16f9c3be2d51182135ae6907e0` ; les anciens résultats et l’ancien hash ZIP ne valident pas ce nouveau candidat. Les contrôles de reprise doivent être consignés séparément. Aucun de ces résultats ne prouve un déploiement de 0.2.1 ni son admission au marketplace.

La reprise du **21 septembre** a également réussi **43 tests ciblés**, types, lint, build web et build du paquet, selon son rapport dédié. Ce sont des contrôles locaux sur fixtures ; aucun cas du compte reviewer n’a été exécuté et la CI historique n’est pas présentée comme une nouvelle CI du candidat rebasé.

## Champs de soumission vérifiés le 21 septembre

La [référence de soumission finale](https://developers.openai.com/plugins/deploy/submission-errors#final-directory-submission) impose une description courte de **30 caractères maximum**, **exactement cinq cas positifs et trois négatifs**, des notes de version, une URL de vidéo de démonstration, un challenge de domaine validé, un scan courant et une justification pour chacune des trois annotations de chaque outil. Les URLs HTTPS du site, du support, de confidentialité et des conditions sont requises pour le MCP distant. Le listing conserve `null` pour les données encore inconnues.

La sélection du portail est **P1, P2, P3, P5, P6 / N1, N2, N4** dans [reviewer-tests.md](../integrations/chatgpt/reviewer-tests.md). Les autres scénarios restent des contrôles internes. Tous attendent leur exécution avec le compte reviewer ; un résultat attendu n’est pas une preuve.

Après création du brouillon, reprendre l’URL et le jeton réellement générés, servir uniquement ce jeton sur le chemin `/.well-known/openai-apps-challenge` de l’hôte autorisé, puis obtenir **Verify Domain**. Aucun jeton ne doit être inventé, ni celui d’un autre plugin écrasé. La [documentation de soumission](https://developers.openai.com/plugins/deploy/submission#domain-verification) décrit le choix de l’origine autorisée. Ne pas présumer l’origine retenue avant sa lecture dans le portail.

Pour chaque outil scanné, fournir séparément la valeur et la justification de `readOnlyHint`, `openWorldHint` et `destructiveHint`. Les justifications doivent expliquer les effets réels, notamment l’import, les écritures de revue, le transfert du brouillon postal et l’envoi irréversible. Le renouvellement par `prepare_fax` peut annuler la préparation précédente : le candidat le déclare comme effet destructif, sans impliquer un envoi. Les justifications ne corrigent pas une annotation fausse côté serveur. Le scan courant et la vidéo ne sont pas encore qualifiés pour cette soumission.

Les [justifications des 21 outils du candidat](../integrations/chatgpt/tool-annotations.md) sont préparées à partir du code. Elles devront correspondre au snapshot publié et scanné.

## Points restant à résoudre

1. **Identité développeur :** refus confirmé le 21 septembre avant création du plugin.
2. **Politique réelle publiée :** la page actuelle ne couvre pas les données du service authentifié. Le [brouillon de travail](CHATGPT_PRIVACY_DRAFT.md) fournit des faits à valider, pas une politique adoptée. La page canonique doit cesser de présenter les traitements réels comme une simple mémoire d’onglet.
3. **Reviewer :** aucun compte dédié avec exemples et accès sans étape supplémentaire n’a été fourni/testé pour ce dossier. Transmettre les credentials uniquement dans les champs privés du portail.
4. **Projet et OAuth :** après vérification, contrôler un projet à résidence **Global** et la permission **Apps Management — Write** (incluse pour les propriétaires ; les noms API de lecture/écriture sont `api.apps.read` / `api.apps.write`). Leur absence n’a pas été constatée : ce sont des vérifications encore à faire. Copier le callback exact et qualifier le client de soumission ; l’ancienne installation privée ne suffit pas.
5. **Conditions, support et disponibilité :** publier les URLs de conditions d’utilisation et de support demandées par la soumission, et choisir explicitement les pays de disponibilité du plugin. Le contact e-mail existe, mais ne remplace pas une URL requise. La disponibilité du plugin ne doit pas être confondue avec les routes fax réellement qualifiées.
6. **Recette et scan :** exécuter les cinq cas positifs et trois négatifs sélectionnés, vérifier le challenge du domaine, scanner les outils du serveur publié et fournir les justifications de toutes leurs annotations. Tester aussi les cas internes correspondant aux fonctions annoncées.
7. **Vidéo et notes de version :** enregistrer le parcours réellement disponible sur les surfaces annoncées, sans secret ni donnée sensible, et fournir son URL accessible aux reviewers. Les notes du listing décrivent le candidat ; elles ne déclarent pas une version déjà publiée.

Les achats sont désactivés. Les règles OpenAI permettent l’accès aux fonctions d’un compte existant mais interdisent la vente de services ou crédits numériques dans le plugin et les liens déclenchant leur achat. Ne pas ajouter recharge, souscription ou paiement intégré. Le statut juridique/commercial doit être confirmé par l’éditeur ; ce dossier n’est pas une autorisation contractuelle.

## Après résolution

Créer le brouillon, configurer MCP/OAuth, **Scan Tools**, compléter champs et justifications à partir du serveur et des tests effectifs, puis **Submit for review**. Après approbation OpenAI, **Publish** est distinct. Conserver identifiant, version, statut et URL d’annuaire. Ne cocher aucune attestation non établie.

Le dossier cible ChatGPT. Si le portail distribue aussi sur Codex, qualifier les fonctions annoncées sur cette surface avant de les attester. Ne pas joindre de captures du site en prétendant qu’il s’agit d’UI MCP native.

Sources de reprise ouvertes le 21 septembre 2026 : [soumission](https://developers.openai.com/plugins/deploy/submission), [erreurs et contraintes finales](https://developers.openai.com/plugins/deploy/submission-errors#final-directory-submission). Références du dossier historique : [revue MCP](https://developers.openai.com/plugins/deploy/app-review), [règles des plugins](https://developers.openai.com/plugins/app-guidelines), [portail](https://platform.openai.com/plugins). OpenAI contrôle l’approbation et ses délais.
