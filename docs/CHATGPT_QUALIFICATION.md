# Qualification ChatGPT — 17 septembre 2026

Dans Safari, l’utilisateur était connecté à Guteneo et à ChatGPT. Après son accord explicite, le mode développeur a été activé et le connecteur distant `https://guteneo.com/mcp` a été créé. Le consentement Auth0 a ensuite été accepté avec son autorisation : adresse e-mail, `documents:read` et `dispatches:read` uniquement. Aucun droit d’import, de préparation ou d’envoi n’a été accordé pour cette recette.

Un client OAuth Guteneo dédié à ChatGPT a été enregistré avec l’adresse de retour exacte fournie par l’interface. Ce client public utilise Authorization Code et les contrôles PKCE existants. Les Actions Guteneo vérifient aussi l’audience et l’identité ; leur configuration, le client navigateur et les secrets Cloudflare n’ont pas été modifiés. Aucun secret client n’a été copié dans ChatGPT.

L’interface a confirmé « Guteneo is installed ». Après actualisation des métadonnées, elle a découvert 16 outils et indiqué qu’une reconnexion avec des droits supplémentaires serait nécessaire pour les outils d’écriture. Une actualisation de la page ChatGPT a rendu le nouveau connecteur disponible dans le sélecteur `@Guteneo`.

Une conversation de test explicitement limitée à la lecture a retourné les résultats suivants :

| Appel | Résultat observé dans ChatGPT |
| --- | --- |
| `get_capabilities` | Réussite ; mode `production`, sans simulation |
| `list_documents` avec `limit:1` | Réussite ; liste vide |
| `list_dispatches` avec `limit:1` | Réussite ; liste vide |

Il s’agit d’une preuve observée dans l’interface réelle : installation, consentement, schémas découverts et réponse de la conversation. Aucun jeton, code de retour OAuth, URL signée ou contenu de document n’est conservé dans cette note. La source applicative publiée au moment de ce test était `44d1d5bb64418372c5174faa1ce5601681fcc813`.

Cette recette ne qualifie pas l’import ou la génération d’un PDF, son transfert exact et son empreinte, les parcours d’approbation, le renouvellement du jeton, la révocation ou une communication réelle. Aucun document n’a été créé ni envoyé. Le connecteur est une installation de développement privée ; le paquet de skills complet et la publication dans l’annuaire sont des étapes distinctes.

Parcours suivi : [documentation officielle OpenAI](https://developers.openai.com/plugins/deploy/connect-chatgpt). Limites et prochaines recettes : [LLM_SETUP.md](LLM_SETUP.md).

## Correction de l’import distant — 17 septembre 2026

Le refus `SOURCE_NOT_ALLOWED` venait notamment d’une configuration de production sans `IMPORT_ALLOWED_HOSTS` : toutes les sources distantes étaient refusées, indépendamment de l’activation du fax. Le domaine exact `files.oaiusercontent.com` est désormais configuré dans `wrangler.live.jsonc`. Aucun sous-domaine arbitraire, redirection ou URL non HTTPS n’est accepté. Le contrat natif `openai/fileParams` conserve `download_url` et `file_id` obligatoires ; les octets sont téléchargés, limités, analysés puis conservés avant toute préparation d’envoi.

Les erreurs d’import renvoient désormais une raison précise, le domaine public normalisé et une corrélation. Le serveur ne journalise que des catégories fermées et le domaine OpenAI reconnu ; aucune URL signée, chemin, nom de fichier, identifiant OpenAI ou domaine inconnu n’est conservé dans les logs. Un lien expiré, une redirection et un dépassement du délai de téléchargement de 15 secondes ont des codes distincts.

Validation locale : 73 tests ciblés réussis, dont un transfert simulé vers D1/R2 avec comparaison des octets et du SHA-256. Ces fixtures ne constituent pas une preuve de transfert réel depuis ChatGPT.

Le nouvel essai réel dans la conversation existante a pu relire le PDF original (136 018 octets, une page, SHA-256 `c976528ff2a30ef6374c3df5aaf171036132e12a00c6d180dc19cf35da734e63`) mais la session n’exposait que sept outils de lecture, sans `import_document`. `list_documents` a confirmé une liste vide. Aucun nouvel appel d’import ni fax n’a été effectué dans cet essai : le domaine réellement fourni par cette session, l’import et l’égalité de l’empreinte côté Guteneo restent à qualifier après réactualisation de la connexion d’écriture. Une correction de configuration n’est pas une preuve d’envoi réel.

## Source native observée dans ChatGPT — 17 septembre 2026

Après actualisation des métadonnées du connecteur et sélection explicite de Guteneo dans une nouvelle conversation Chat, le PDF original a été joint depuis la bibliothèque native de ChatGPT, sans téléchargement local, téléversement manuel ni reconstruction. Cette demande a réellement appelé `import_document` : la réponse authentifiée a identifié le domaine `oaisdmntprnortheu.blob.core.windows.net` avec la raison `untrusted_host`. Le refus du domaine Azure précis explique pourquoi l’autorisation de `files.oaiusercontent.com` ne suffisait pas pour ce fichier.

Les deux hôtes exacts sont désormais configurés dans `wrangler.live.jsonc`. Le domaine Azure observé rejoint la liste fermée des hôtes journalisables ; aucun autre compte Azure, sous-domaine, suffixe trompeur ou joker n’est autorisé. Les tests vérifient l’import des octets exacts depuis cet hôte et le refus de ces variantes, sans exposer l’URL signée. La configuration a été relue en production le 17 septembre à 10:18 UTC, avec le fax actif. Aucun fax n’a été envoyé dans cette recette.

Un simple message de suivi sans sélection explicite du connecteur n’a exposé que les outils de lecture et n’a effectué aucun nouvel import. La relance native avec le connecteur et le fichier attachés reste à observer pour confirmer le statut `ready`, la taille et l’égalité du SHA-256 côté Guteneo. L’identification et l’autorisation du domaine ne constituent pas encore cette preuve.
