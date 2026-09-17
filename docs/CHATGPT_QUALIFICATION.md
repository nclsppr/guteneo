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
