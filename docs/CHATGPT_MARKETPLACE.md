# Dossier marketplace ChatGPT — 17 septembre 2026

**Paquet préparé pour la revue ; aucun brouillon de plugin créé, aucune soumission ni publication confirmée.** Le nouveau logo simple est déjà public. Les blocages ci-dessous distinguent l’état observé du portail, les manques documentés et les contrôles encore à réaliser.

## État exact du portail

Dans Safari, sur `https://platform.openai.com/plugins`, organisation **Personal**, le parcours **Create plugin → With MCP** a ouvert la fenêtre :

> Complete identity verification
>
> You need a verified developer identity before you can create or upload a plugin.

Les boutons affichés étaient **Cancel** et **Continue**. **Continue** a ouvert `https://platform.openai.com/settings/organization/general`. Aucun brouillon ni identifiant de plugin n’a été créé. La vérification personnelle ou d’entreprise doit être accomplie par le titulaire ; ce dossier ne l’atteste pas. Le nom d’éditeur devra correspondre à l’identité vérifiée. La marque **Guteneo** ne prouve pas une entreprise immatriculée ou vérifiée.

## Contenu prêt à reporter

La feuille [listing.json](../integrations/chatgpt/listing.json) contient descriptions, amorces, langue, contact et paramètres publics. **C’est un document interne, pas un schéma OpenAI ni un manifeste officiel à téléverser.** Les champs `null` attendent les informations réelles du portail.

| Champ                        | Valeur                                                    |
| ---------------------------- | --------------------------------------------------------- |
| Nom                          | Guteneo                                                   |
| Description courte           | Préparez vos PDF, consultez le prix et suivez vos envois. |
| Catégorie / langue           | Productivity / Français (`fr-FR`)                         |
| Site / support               | `https://guteneo.com` / `guteneo@pieper.fr`               |
| MCP universel                | `https://guteneo.com/mcp`                                 |
| Transport / authentification | Streamable HTTP / OAuth par utilisateur                   |
| Ressource / autorité OAuth   | `https://guteneo.com/mcp` / `https://pieper.eu.auth0.com` |
| Logo                         | `https://guteneo.com/brand/guteneo-mark.png`              |
| Captures d’UI native         | Aucune : le serveur ne fournit pas d’UI MCP native        |
| Politique de confidentialité | URL complète de politique réelle encore absente           |
| Client/callback/reviewer     | À configurer et vérifier ; aucune valeur fictive          |

Le texte décrit PDF, devis, plafond, approbation et suivi, selon les fonctions du compte. Il ne promet ni tous les pays, ni e-mail/courrier actif, ni livraison garantie, ni parcours sans sortie de ChatGPT. Le mode standard utilise l’approbation navigateur ; le mode expert exige un mandat préalable accordé par un administrateur.

## Paquet et nouveau logo

Le paquet local `dist/integrations/guteneo-plugin.zip` **0.2.1** pèse **285 340 octets**, SHA-256 `b3c6a1f7f1d933fcf548b66b48f90edd95ffc938e3452a2aa9c468d4a709dfe4`. Le build n’est pas une publication. Le dossier `integrations/chatgpt/` reste une feuille de soumission séparée du paquet portable.

Selon [BRAND_IDENTITY.md](BRAND_IDENTITY.md), l’**emblème simple** sert au MCP et aux petites icônes ; le portrait transparent aux headers et à Auth0 ; le timbre « guteneo.com » au footer et aux communications externes.

`apps/web/public/brand/guteneo-mark.png` : **512 × 512**, **249 823 octets**, fond opaque, SHA-256 `d6a83bbe53abb6ffac19d66a66d02b5992887a4796d909fb86043c356580e8c9`. Le 17 septembre, son URL publique répondait `200 image/png` avec les mêmes octets que le fichier local. Aucune création/retouche d’image ni fausse transparence n’est revendiquée.

## Preuves actuelles et historiques

La lecture publique et le blocage du portail sont consignés dans le
[rapport expurgé](../reports/chatgpt-marketplace-public.json).

Lecture publique du 17 septembre pendant cette préparation :

- `/release.json` : source propre `c3798f59cb6cff4e1dcaddb524f43d59b1009822`, construite à `2026-09-17T14:32:49.407Z`, version applicative `0.2.0`.
- `/api/capabilities` : production, sans simulation, import d’URL actif ; **fax actif**, e-mail et courrier inactifs ; achats désactivés (`chargingEnabled:false`).
- Découverte OAuth : `documents:read documents:write dispatches:prepare dispatches:send dispatches:read`. L’autorité OIDC annonce `openid`, `email` et `userinfo_endpoint` ; la réponse `email_verified` du compte reviewer n’est pas qualifiée.
- `/mentions-legales` répond `200` mais décrit encore tout l’atelier comme une démonstration locale fictive sans envoi. `/confidentialite` et `/conditions` répondent `404`.

[CHATGPT_QUALIFICATION.md](CHATGPT_QUALIFICATION.md) conserve trois preuves distinctes : installation OAuth et lectures ; import natif exact de **136 018 octets**, puis document prêt ; un fax livré sur une route luxembourgeoise, suivi d’un rapprochement manuel de consommation. Elles ne qualifient pas toutes les routes/modèles, la recette reviewer, renouvellement/révocation OAuth ou règlement automatique généralisé.

Des champs publics (`not_tested_in_real_client`, `real login unverified`) et certaines notes de `LIVE_RELEASE.md` décrivent un état antérieur. Les rapprocher des preuves datées sans les présenter comme de nouveaux tests échoués, ni extrapoler une qualification globale.

Validation locale du paquet annoncée dans cette préparation : **43 tests ciblés**, vérifications complètes des types et du lint, build web et package. [Rapport de validation expurgé](../reports/chatgpt-marketplace-validation.json). Rapport ciblé local : `test-results/chatgpt-marketplace/targeted-vitest.json`. Ces résultats ne prouvent ni un déploiement de 0.2.1 ni son admission au marketplace.

## Points restant à résoudre

1. **Identité développeur :** refus observé avant création du plugin.
2. **Politique réelle publiée :** la page actuelle ne couvre pas les données du service authentifié. Le [brouillon de travail](CHATGPT_PRIVACY_DRAFT.md) fournit des faits à valider, pas une politique adoptée. La page canonique doit cesser de présenter les traitements réels comme une simple mémoire d’onglet.
3. **Reviewer :** aucun compte dédié avec exemples et accès sans étape supplémentaire n’a été fourni/testé pour ce dossier. Transmettre les credentials uniquement dans les champs privés du portail.
4. **Projet et OAuth :** après vérification, contrôler un projet à résidence **Global** et la permission **Apps Management — Write** (incluse pour les propriétaires ; les noms API de lecture/écriture sont `api.apps.read` / `api.apps.write`). Leur absence n’a pas été constatée : ce sont des vérifications encore à faire. Copier le callback exact et qualifier le client de soumission ; l’ancienne installation privée ne suffit pas.
5. **Conditions, support et disponibilité :** publier les URLs de conditions d’utilisation et de support demandées par la soumission, et choisir explicitement les pays de disponibilité du plugin. Le contact e-mail existe, mais ne remplace pas une URL requise. La disponibilité du plugin ne doit pas être confondue avec les routes fax réellement qualifiées.
6. **Recette et scan :** exécuter les [cas reviewer](../integrations/chatgpt/reviewer-tests.md), scanner les outils du serveur publié, contrôler annotations et snapshot. Une justification ne remplace pas une annotation serveur incorrecte.

Les achats sont désactivés. Les règles OpenAI permettent l’accès aux fonctions d’un compte existant mais interdisent la vente de services ou crédits numériques dans le plugin et les liens déclenchant leur achat. Ne pas ajouter recharge, souscription ou paiement intégré. Le statut juridique/commercial doit être confirmé par l’éditeur ; ce dossier n’est pas une autorisation contractuelle.

## Après résolution

Créer le brouillon, configurer MCP/OAuth, **Scan Tools**, compléter champs et justifications à partir du serveur et des tests effectifs, puis **Submit for review**. Après approbation OpenAI, **Publish** est distinct. Conserver identifiant, version, statut et URL d’annuaire. Ne cocher aucune attestation non établie.

Le dossier cible ChatGPT. Si le portail distribue aussi sur Codex, qualifier les fonctions annoncées sur cette surface avant de les attester. Ne pas joindre de captures du site en prétendant qu’il s’agit d’UI MCP native.

Sources officielles consultées le 17 septembre 2026 : [soumission](https://developers.openai.com/plugins/deploy/submission), [revue MCP](https://developers.openai.com/plugins/deploy/app-review), [règles des plugins](https://developers.openai.com/plugins/app-guidelines), [portail](https://platform.openai.com/plugins). OpenAI contrôle l’approbation et ses délais.
