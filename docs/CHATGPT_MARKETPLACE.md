# Dossier marketplace ChatGPT — reprise du 21 septembre 2026

**Brouillon OpenAI créé le 21 septembre 2026 ; aucune soumission ni publication effectuée.** L’identité individuelle vérifiée est désormais observée et sélectionnée dans le portail. Ce dossier distingue cette progression des blocages antérieurs et des preuves historiques. La PR [#14](https://github.com/nclsppr/guteneo/pull/14) reste un candidat ; sa préparation ne publie ni le serveur ni le plugin.

## Préparation complémentaire du 21 septembre

L’éditeur a explicitement autorisé la publication des pages, la vérification du domaine, la création du compte de revue, les tests, la vidéo et la soumission. Il indique avoir lu les conditions et autorise leur validation. Cette autorisation ne remplace pas les preuves exigées pour les attestations.

Les pages `/confidentialite/`, `/conditions/` et `/support/` sont maintenant implémentées avec liens partagés et HTML indexable. Les contrôles locaux ont réussi : types, lint ciblé, sept tests statiques et huit tests desktop/iPhone. Leur disponibilité publique doit encore être vérifiée après le déploiement de ce candidat. Les observations 404 ci-dessous sont historiques. Les descriptions d’import et de création PDF ainsi que le workflow et le skill fax relaient les restrictions du parcours ChatGPT ; aucun filtre automatique de contenu ni nouveau consentement serveur n’est annoncé.

Le composer dispose désormais d’un [dérivé transparent contrôlé](../integrations/chatgpt/icon-audit.md), créé avec ImageGen à partir de l’emblème : PNG RGBA de 1 254 × 1 254 px, 977 001 octets, SHA-256 `2dd792b032c4e244072494fef71344aa270893c4bf8e92c44600234eccb394cc`. Le logo d’annuaire reste inchangé. Le dérivé a été téléversé pour les modes clair et sombre, leurs aperçus ont été inspectés et la persistance après rechargement a été confirmée. L’archive 0.2.1 reconstruite avec cette image pèse 1 265 171 octets, SHA-256 `18485c5a5215175f051873fb2db0c15ea145ae83ad54e8d58ac2b3b7df2885a1` ; les empreintes d’archives antérieures ci-dessous restent historiques.

Le portail affiche le callback exact `https://chatgpt.com/connector/oauth/aAwc9dso12_L` pour un client prédéfini public. Un script ciblé prépare un client et une identité de revue isolés, sans modifier les Actions, MFA ou réglages du tenant. La revue a conduit à remplacer les recherches de sous-chaînes par une comparaison exacte des deux Actions déployées à leurs sources générées. Dix-neuf tests Auth0 et reviewer valident ces garde-fous sans réseau ; ils ne prouvent pas la connexion réelle. La reconnexion de l’administration Auth0 a expiré en attendant Touch ID ; elle doit être relancée. Aucun compte ou nouveau client n’a encore été créé.

Le PDF d’exemple est synthétique et sans destinataire ; le [scénario de capture](../integrations/chatgpt/demo-recording.md) est prêt. Ni vidéo ni recette exécutée avec un compte reviewer ne sont déclarées. Cloudflare confirme le rattachement existant de `guteneo.com` au Worker `guteneo-app` ; cela ne valide pas le challenge OpenAI dont le jeton est encore absent.

Les trois URLs publiques sont renseignées et persistent après rechargement. Le portail utilise une fiche de base anglaise : sous-titre « PDFs, fax quotes and tracking », description traduite mentionnant l’interface web française, et traduction française distincte. Les cinq scénarios positifs et les trois négatifs sont amorcés comme attendus de revue, sans preuve d’exécution ; le prompt exact de préparation du fax attend encore le destinataire contrôlé et son plafond. Le compte, la vidéo, le scan et le challenge restent manquants.

Le candidat est réconcilié avec la PR #20, intégrée à `main` (`406176933da9ad7d8c3d6265b26dbfa50e493c4b`). Le serveur complet déclare désormais 22 outils. `create_postal_address_page` a un titre et une annotation de périmètre fermé cohérente avec sa génération interne ; la table couvre les 22 outils, contrôlés par 39 tests MCP ciblés. La mise en production de la page d’adresse requiert aussi la migration 0033 et le moteur privé, suivis par la livraison postale distincte.

## État du portail avant ces préparatifs

Le 17 septembre, dans Safari, sur `https://platform.openai.com/plugins`, organisation **Personal**, le parcours **Create plugin → With MCP** a ouvert la fenêtre :

> Complete identity verification
>
> You need a verified developer identity before you can create or upload a plugin.

Les boutons affichés étaient **Cancel** et **Continue**. **Continue** a ouvert `https://platform.openai.com/settings/organization/general`. Aucun brouillon ni identifiant de plugin n’avait été créé à cette étape. La marque **Guteneo** ne prouve pas une entreprise immatriculée ou vérifiée.

La première relecture du 21 septembre, heure de Paris, montrait encore ce blocage. **Après la vérification réalisée par le titulaire, le portail a affiché une identité individuelle vérifiée dans l’organisation Guteneo et a permis de créer le brouillon.** Le nom légal complet et les pièces de vérification ne sont pas conservés dans ce dossier.

- Plugin : `asdk_app_6ab05fbae9a881918dc6ee4e2f235d93`.
- Version du brouillon : `asdk_app_v_6ab05fbc52b08191824184064aee539f`, version `0.2.1`.
- [Ouvrir le brouillon dans le portail](https://platform.openai.com/plugins/edit/asdk_app_6ab05fbae9a881918dc6ee4e2f235d93/asdk_app_v_6ab05fbc52b08191824184064aee539f).

Après rechargement, le nom, la version, la description courte, la description longue, la catégorie **Productivity**, le site et l’identité sélectionnée sont conservés. Les logos d’annuaire et du composeur sont également conservés, avec les modes clair/sombre présents dans l’interface. Les trois amorces et les notes de version persistent.

**La configuration MCP attend son scan avant enregistrement effectif.** L’URL `https://guteneo.com/mcp` et le choix OAuth ont été saisis, mais étaient absents après rechargement malgré l’indication **Draft saved**. Trois tentatives **Scan Tools**, dont la dernière après chargement complet du bouton, ont affiché **Saving draft**, puis **Draft saved**, sans résultat de scan. L’exigence **MCP tools scan is required** restait affichée : aucune connexion OAuth, aucun outil scanné ni jeton de challenge n’a été obtenu. Après resaisie et **Continue**, **Exit** avait explicitement demandé de scanner les changements MCP avant de quitter. Ce prérequis explique que la saisie seule ne suffit pas ; aucun bug de sauvegarde n’est établi. **Verify Domain** n’a produit aucune réussite observée. La cause de l’absence de résultat de scan reste inconnue. Les essais ont été arrêtés ; les valeurs laissées à l’écran ne sont ni qualifiées ni confirmées persistées.

Notes de version effectivement enregistrées : « Première version pour l’annuaire : consultation et import de PDF, préparation de fax avec estimation et plafond, puis suivi des envois. Les fonctions accessibles dépendent des droits et des canaux du compte Guteneo. » Elles décrivent le candidat ; leur saisie ne constitue pas sa publication.

Le bouton final **Submit for Review** est confirmé désactivé. Les messages visibles demandent **Customer support URL**, **MCP server URL**, **Test case scenario** et **Submit confirmation**. La langue par défaut **English (US)** et la disponibilité **Allow all** ne constituent pas des choix validés par l’éditeur. Le dossier restant incomplet, aucune confirmation contractuelle n’a été demandée au titulaire, aucune case contractuelle ni attestation n’a été cochée ; aucun **Submit for review** ni **Publish** n’a été effectué.

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
| Challenge du domaine         | URL observée ; jeton absent, vérification non obtenue     |

Le texte décrit PDF, devis, plafond, approbation et suivi, selon les fonctions du compte. Il ne promet ni tous les pays, ni e-mail/courrier actif, ni livraison garantie, ni parcours sans sortie de ChatGPT. Le mode standard utilise l’approbation navigateur ; le mode expert exige un mandat préalable accordé par un administrateur.

## Paquet et nouveau logo

**Archive historique du 17 septembre :** le paquet `dist/integrations/guteneo-plugin.zip` **0.2.1** pesait **285 340 octets**, SHA-256 `b3c6a1f7f1d933fcf548b66b48f90edd95ffc938e3452a2aa9c468d4a709dfe4`. Ces valeurs ne décrivent pas l’archive reconstruite après la reprise. Le build n’est pas une publication. Le dossier `integrations/chatgpt/` reste une feuille de soumission séparée du paquet portable.

**Archive reconstruite le 21 septembre :** version **0.2.1**, **285 325 octets**, SHA-256 `1c9fca3eca5551ccb3b34a862c84165dc5daa32fc8e745883c0f526e5c67eb79`. Le [rapport de reprise](../reports/chatgpt-marketplace-resume-2026-09-21.json) distingue les GET publics, les contrôles locaux et les étapes du portail. Cette archive n’est ni déployée ni soumise par sa construction.

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

La reprise du **21 septembre** a également réussi **43 tests ciblés**, types, lint, build web et build du paquet, selon son rapport dédié. La [CI du candidat `89b9bd79efc4040f3c6b05950e12203280a4fa9a`](https://github.com/nclsppr/guteneo/actions/runs/35541687278) a ensuite réussi tous ses contrôles, dont `verify` et `scanner`. Ces preuves locales et CI restent distinctes de la recette du compte reviewer, encore non exécutée, du déploiement et de la revue OpenAI.

## Champs de soumission vérifiés le 21 septembre

La [référence de soumission finale](https://developers.openai.com/plugins/deploy/submission-errors#final-directory-submission) impose une description courte de **30 caractères maximum**, **exactement cinq cas positifs et trois négatifs**, des notes de version, une URL de vidéo de démonstration, un challenge de domaine validé, un scan courant et une justification pour chacune des trois annotations de chaque outil. Les URLs HTTPS du site, du support, de confidentialité et des conditions sont requises pour le MCP distant. Le listing conserve `null` pour les données encore inconnues.

La sélection préparée est désormais **P1, P2, P3, P5, P6 / R1, R2, R3** dans [reviewer-tests.md](../integrations/chatgpt/reviewer-tests.md). L’interface demande des prompts négatifs pour lesquels le plugin ne doit pas être appelé : R1 demande une signature électronique de PDF, R2 la lecture de pièces jointes Gmail et R3 un SMS. Aucun appel Guteneo n’est attendu. N1, N2 et N4 restent des contrôles internes de refus d’autorisation et d’isolation. Cette adaptation est préparée, pas qualifiée : tous les cas attendent leur exécution avec le compte reviewer ; un résultat attendu n’est pas une preuve.

L’URL de challenge observée dans le brouillon est `https://guteneo.com/.well-known/openai-apps-challenge` ; le jeton est absent. Lorsque le portail fournira le jeton exact, servir uniquement celui-ci à cette URL, puis obtenir **Verify Domain**. Aucun jeton ne doit être inventé, ni celui d’un autre plugin écrasé. La [documentation de soumission](https://developers.openai.com/plugins/deploy/submission#domain-verification) décrit le choix de l’origine autorisée. La lecture de l’URL ne constitue pas la réussite du challenge.

Pour chaque outil scanné, fournir séparément la valeur et la justification de `readOnlyHint`, `openWorldHint` et `destructiveHint`. Les justifications doivent expliquer les effets réels, notamment l’import, les écritures de revue, le transfert du brouillon postal et l’envoi irréversible. Le renouvellement par `prepare_fax` peut annuler la préparation précédente : le candidat le déclare comme effet destructif, sans impliquer un envoi. Les justifications ne corrigent pas une annotation fausse côté serveur. Le scan courant et la vidéo ne sont pas encore qualifiés pour cette soumission.

Les [justifications des 22 outils du candidat](../integrations/chatgpt/tool-annotations.md) sont préparées à partir du code. Elles devront correspondre au snapshot publié et scanné.

## Points restant à résoudre

1. **Finaliser le brouillon :** l’identité individuelle vérifiée, les informations relues, les logos, les amorces et les notes persistent. Confirmer langue et pays ; les valeurs par défaut du portail n’ont pas été validées par l’éditeur.
2. **Politique réelle publiée :** la page actuelle ne couvre pas les données du service authentifié. Le [brouillon de travail](CHATGPT_PRIVACY_DRAFT.md) fournit des faits à valider, pas une politique adoptée. La page canonique doit cesser de présenter les traitements réels comme une simple mémoire d’onglet.
3. **Reviewer :** aucun compte dédié avec exemples et accès sans étape supplémentaire n’a été fourni/testé pour ce dossier. Transmettre les credentials uniquement dans les champs privés du portail.
4. **Projet et OAuth :** terminer le scan exigé avant l’enregistrement effectif de l’URL MCP et d’OAuth, puis qualifier le client et son callback. Aucun scan réussi, flux OAuth ni challenge utilisable n’a été observé. La cause de l’absence de résultat du scan n’est pas établie. Contrôler aussi les caractéristiques du projet, notamment la résidence **Global**.
5. **Conditions, support et disponibilité :** publier les URLs de conditions d’utilisation et de support demandées par la soumission, et choisir explicitement les pays de disponibilité du plugin. Le contact e-mail existe, mais ne remplace pas une URL requise. La disponibilité du plugin ne doit pas être confondue avec les routes fax réellement qualifiées.
6. **Recette et scan :** valider avec le compte reviewer les cinq cas positifs et les trois prompts négatifs R1/R2/R3 préparés selon le critère « ne pas appeler le plugin ». Vérifier le challenge du domaine, scanner les outils du serveur publié et fournir les justifications de toutes leurs annotations. Conserver les refus d’autorisation comme contrôles internes.
7. **Vidéo et notes de version :** enregistrer le parcours réellement disponible sur les surfaces annoncées, sans secret ni donnée sensible, et fournir son URL accessible aux reviewers. Les notes du listing décrivent le candidat ; elles ne déclarent pas une version déjà publiée.

Les achats sont désactivés. Les règles OpenAI permettent l’accès aux fonctions d’un compte existant mais interdisent la vente de services ou crédits numériques dans le plugin et les liens déclenchant leur achat. Ne pas ajouter recharge, souscription ou paiement intégré. Le statut juridique/commercial doit être confirmé par l’éditeur ; ce dossier n’est pas une autorisation contractuelle.

## Après résolution

Compléter le brouillon existant, qualifier MCP/OAuth, obtenir **Scan Tools**, compléter champs et justifications à partir du serveur et des tests effectifs, puis **Submit for review**. Après approbation OpenAI, **Publish** est distinct. Conserver identifiant, version, statut et URL d’annuaire. Ne cocher aucune attestation non établie.

Le dossier cible ChatGPT. Si le portail distribue aussi sur Codex, qualifier les fonctions annoncées sur cette surface avant de les attester. Ne pas joindre de captures du site en prétendant qu’il s’agit d’UI MCP native.

Sources de reprise ouvertes le 21 septembre 2026 : [soumission](https://developers.openai.com/plugins/deploy/submission), [erreurs et contraintes finales](https://developers.openai.com/plugins/deploy/submission-errors#final-directory-submission). Références du dossier historique : [revue MCP](https://developers.openai.com/plugins/deploy/app-review), [règles des plugins](https://developers.openai.com/plugins/app-guidelines), [portail](https://platform.openai.com/plugins). OpenAI contrôle l’approbation et ses délais.
