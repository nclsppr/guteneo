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

La relance native a ensuite fourni un second compte régional pour ce même fichier : `oaisdmntprdenmarkeast.blob.core.windows.net`, refusé avec `untrusted_host`. Cet hôte exact rejoint la configuration et les tests, aux côtés du premier compte Azure observé et de `files.oaiusercontent.com`. La région de stockage peut donc varier entre deux tentatives ; la liste reste fermée aux hôtes effectivement constatés. Aucune autorisation générique de `blob.core.windows.net` n’est ajoutée.

## Transfert exact qualifié dans le client réel — 17 septembre 2026

Une nouvelle conversation Chat dans Safari, avec Guteneo explicitement sélectionné et le PDF original joint depuis la bibliothèque native, a réussi `import_document` puis `get_document` avec **GPT-5.6 Sol, Extra High**. Guteneo a reçu **136 018 octets**, avec le SHA-256 attendu `c976528ff2a30ef6374c3df5aaf171036132e12a00c6d180dc19cf35da734e63`. Aucun téléchargement local, téléversement manuel, rendu ou reconstruction du PDF n’a été utilisé. La création D1 porte la source `import` et l’horodatage **2026-09-17T10:40:40.146Z**.

Le premier résultat était `quarantined`, sans nombre de pages validé. Une relance d’analyse n’a pas suffi. Le diagnostic séparé des services privés a ensuite qualifié l’antivirus et quatre cas de rendu synthétiques, sans Pingen ni modification D1/R2. Pendant que le scanner était prêt, `rescan_document` puis `get_document` dans ChatGPT ont confirmé **`ready`, une page, les mêmes octets et la même empreinte**. La lecture directe de D1 confirme ce résultat. Aucune quarantaine n’a été levée manuellement. Le démarrage à froid reste une limite opérationnelle : `sleepAfter=2m`, disponibilité après trois contrôles espacés de 30 secondes dans ce diagnostic ; un document en quarantaine ne doit jamais être présenté comme prêt.

Les essais récents avec GPT-6 Pro, y compris une demande native avec le connecteur attaché, n’exposaient que les outils de lecture. Le changement de modèle a permis cet essai, mais ne prouve pas une restriction générale de l’offre Pro : les sources officielles consultées sont contradictoires et les premiers appels d’import avaient atteint le serveur. Conserver une distinction entre disponibilité des outils dans l’hôte, autorisation du domaine, transfert des octets et validation de sécurité. La preuve porte sur ce parcours observé, pas sur tous les modèles ou sessions.

Aucun fax, e-mail ou courrier n’a été préparé, approuvé ou envoyé pour qualifier ce transfert. Le connecteur demeure une installation de développement privée.
