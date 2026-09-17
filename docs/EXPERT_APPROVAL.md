# Délégation facultative aux assistants

Contrat de la tranche candidate du 17 septembre 2026. Les instructions et outils ne prouvent ni leur publication, ni une activation sur un compte, ni leur qualification dans ChatGPT, Claude, Cursor ou GitHub Copilot. Les preuves historiques de connexion restent datées dans leurs rapports.

Le **mode standard reste le défaut** : la personne relit le document, le destinataire et le devis dans Guteneo, puis approuve cette version. Le mode expert est **désactivé par défaut**. Seul un administrateur connecté dans le navigateur Guteneo peut déléguer les actions à une connexion OAuth précise, pour des canaux choisis, avec un plafond EUR par envoi, un plafond EUR quotidien, un nombre maximal quotidien et une expiration dans les 30 jours. Les limites du mandat s’ajoutent au crédit et aux quotas existants ; elles ne donnent ni crédit ni permission fournisseur.

L’assistant n’active, ne renouvelle et n’élargit jamais ce mandat. Il ne fabrique pas de consentement humain : l’approbation qu’il demande au serveur est enregistrée comme une action **déléguée**, sous le mandat préalable, et non comme une revue effectuée par la personne. La présence d’un outil, les scopes OAuth, une phrase « oui » ou l’autorisation d’exécution de l’hôte ne créent pas ce mandat. Les confirmations demandées par ChatGPT, Claude, Cursor ou Copilot restent celles de l’hôte : ne pas modifier leurs paramètres pour les supprimer.

Les budgets suivent les journées UTC. La somme comptée est celle des plafonds des envois acceptés, pas le décompte final : une annulation ou une modification du mandat ne reconstitue pas ce budget. Les brouillons Pingen ont un compteur distinct, limité au même nombre quotidien ; ils ne consomment pas le budget d’expédition avant l’acceptation d’un envoi.

## Outils et permissions

| Outil                       | Entrée stricte                                                                         | Scopes requis                                              |
| --------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `review_dispatch`           | `{dispatchId}`                                                                         | `dispatches:read`, `documents:read`, `dispatches:send`     |
| `approve_and_send_dispatch` | `{dispatchId,fingerprint,ceilingMinor,reviewToken,idempotencyKey,recipientRequested?}` | `dispatches:send`                                          |
| `transfer_postal_draft`     | `{preflightId,fingerprint}`                                                            | `documents:write`, `dispatches:prepare`, `dispatches:send` |

`fingerprint` et `reviewToken` sont les 64 caractères hexadécimaux minuscules retournés par le serveur. `ceilingMinor` est un entier de centimes EUR, pas un prix inventé. Les permissions n’accordent pas le mandat à elles seules. Une requête de revue crée une preuve temporaire privée ; elle ne fait aucun appel d’envoi fournisseur.

## Revue et envoi délégués

1. Préparer le document et le devis par le parcours habituel. Préserver les octets, le destinataire, les options, la devise et le plafond. Un document en quarantaine, un tarif absent ou un canal fermé reste bloqué.
2. Appeler `review_dispatch({dispatchId})` lorsque cette voie est disponible pour la connexion autorisée. Lire le document final et le résumé serveur, notamment destinataire, options, empreinte et coût/plafond. Le serveur retourne un `reviewToken` valable **au plus cinq minutes**, borné aussi par le mandat. Ce jeton est une preuve serveur récente ; il ne certifie pas que le modèle a correctement compris le PDF et ne constitue pas un consentement humain.
3. Si la revue correspond à la demande et aux limites, appeler `approve_and_send_dispatch` avec exactement `{dispatchId,fingerprint,ceilingMinor,reviewToken,idempotencyKey}` issus de cette version. Pour un e-mail, ajouter `recipientRequested:true` **uniquement lorsque la demande du destinataire est établie** ; le mandat ne permet pas d’inventer cette attestation. Ne pas copier un jeton d’un autre document, d’une autre connexion ou d’un autre compte. Ne pas afficher ou journaliser le jeton de revue.
4. Cet outil demande l’approbation déléguée et l’acceptation de l’envoi. Ne pas lui ajouter un `confirm_dispatch` automatique. Lire ensuite `get_dispatch_status` : `queued`, `accepted` et `delivered` restent des faits différents. Après une réponse perdue, relire l’état avant toute autre action ; ne pas créer une nouvelle clé ou un nouvel envoi pour contourner l’incertitude.

Une expiration, une révocation, un changement de rôle, de connexion, de version ou de plafond peut invalider la preuve. Révoquer ou reconnecter la connexion OAuth désactive le mandat ; obtenir d’abord les permissions OAuth nécessaires, puis réactiver volontairement la délégation dans le compte. Si le document ou devis change, relire la nouvelle version. Si le jeton expire alors que l’envoi reste préparé, demander une nouvelle revue du même envoi ; cela ne réautorise pas une soumission fournisseur incertaine. Un refus de mandat ou de limite est expliqué dans la conversation ; le parcours navigateur standard peut être proposé comme alternative choisie par la personne. L’assistant ne relève pas les limites à la place de l’administrateur.

`approvalUrl` reste un lien de consultation et de repli vers le parcours standard. Sa présence n’impose pas une navigation lorsque le serveur autorise réellement le parcours expert. `confirm_dispatch` conserve son usage après une approbation déjà enregistrée ; il ne crée pas à lui seul de délégation.

## Objectif de parcours dans ChatGPT et écarts actuels

Une fois le mandat actif, le parcours expert visé couvre le dépôt du PDF, sa vérification, le devis, la revue, l’envoi délégué et le suivi dans la conversation, sans passage courant par guteneo.com. Une attente de scan se reprend ici avec le même document ; elle ne justifie pas un renvoi vers le site. Les liens web restent des consultations facultatives ou une alternative standard explicitement choisie lorsque la voie expert est indisponible.

La candidate locale ne satisfait pas encore une promesse absolue « ne jamais ouvrir Guteneo » : l’octroi et le renouvellement du mandat restent réservés à l’administrateur dans une session navigateur ; la revue exacte limite le PDF original à 1 Mio ; la lecture de la ressource intégrée dans chaque hôte reste à qualifier. De plus, `get_capabilities.approval.expert.available` décrit la disponibilité générale de la fonction, pas l’existence, les limites ou l’expiration d’un mandat pour cette connexion. Le contrôle d’autorité de `review_dispatch` reste déterminant. Une future capacité en lecture seule devra exposer cet état pour choisir la voie sans ambiguïté. Aucun de ces écarts ne permet à l’assistant d’activer son propre mandat ou d’envoyer sans lire le PDF exact.

## PDF exact dans la revue MCP

Pour un envoi contenant un document, `review_dispatch` fournit les octets privés exacts sous forme de ressource MCP intégrée : `{type:"resource",resource:{uri,mimeType:"application/pdf",blob}}`. Le `blob` est encodé en base64, uniquement dans `content`, jamais dupliqué dans le JSON structuré. L’URI `guteneo-document:///…` identifie ce contenu intégré ; ce n’est ni une URL publique, ni un lien signé, ni un endpoint de téléchargement. Le lien navigateur de `get_document` ne permet pas à lui seul une revue par l’assistant.

La limite est **1 Mio (1 048 576 octets)** du PDF original, avant encodage, sans extrait ni troncature. Le serveur vérifie l’appartenance au compte, le statut `ready`, les tailles déclarée et réellement lue, l’empreinte SHA-256 et, hors simulation locale explicite, la preuve de scan canonique du même compte. Il recontrôle les droits OAuth et la délégation après lecture ; l’insertion du jeton reste conditionnée à ces droits et à la preuve courante du document. Un document absent, altéré, non prêt, trop gros, une lecture échouée ou une révocation ne fournit aucun nouveau jeton ni octets au client.

`EXPERT_DOCUMENT_TOO_LARGE` bloque la revue expert. `EXPERT_DOCUMENT_UNAVAILABLE` signifie que le service de revue exacte n’est pas raccordé et bloque également cette voie. Expliquer la limite dans la conversation ; une revue humaine via `approvalUrl` reste une alternative choisie par la personne. Les autres erreurs de document ou d’autorité ne doivent pas être contournées. Si l’hôte ne sait pas rendre ou faire lire une ressource PDF intégrée, l’assistant **n’appelle pas** `approve_and_send_dispatch` et explique cette limite dans la conversation. Il peut proposer le parcours navigateur comme alternative, sans l’ouvrir automatiquement. Le jeton prouve la mise à disposition des octets validés, jamais leur perception ou leur compréhension par le modèle. Ne pas afficher ni journaliser le blob ou le jeton. La compatibilité réelle de chaque hôte reste à qualifier.

Le format suit les [ressources intégrées de la spécification MCP](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#embedded-resources). Les tests utilisent des PDF synthétiques, D1/R2 locaux et le transport MCP réel ; ils ne constituent aucun envoi fournisseur ni preuve de lecture par un modèle.

## Courrier : transfert distinct de l’expédition

Le contrôle `preflight_postal_pdf` ne dépose aucun PDF chez Pingen. Lire `get_postal_preflight`, les contrôles des pages et de l’adresse, puis le PDF exact. Une empreinte fournie au prochain outil doit être celle de la preuve serveur, pas un hash inventé ni celui d’un autre objet.

Dans le parcours standard, la personne ouvre `reviewUrl` et consent au dépôt dans Guteneo. En mode expert, le mandat doit explicitement couvrir le canal postal **et le transfert des données à Pingen**. L’outil `transfer_postal_draft({preflightId,fingerprint})` exerce ce mandat distinct, sur le contrôle existant. Il crée seulement le brouillon `auto_send:false` ; ce dépôt est déjà un transfert de données au fournisseur, mais jamais une autorisation d’impression ou d’expédition.

Consulter l’état du même préflight après le transfert. `prepared` n’est pas une preuve de fin d’analyse ; `unknown` exige rapprochement, sans nouvel upload. Une fois l’analyse prête, `quote_postal_draft({preflightId,idempotencyKey})` obtient le devis du même brouillon. L’envoi postal suit ensuite soit l’approbation navigateur, soit **une nouvelle revue d’envoi** avec `review_dispatch`, puis `approve_and_send_dispatch`. Le mandat de dépôt ne remplace jamais cette étape.

Un « test sans envoi » s’arrête au contrôle, au devis ou au brouillon explicitement autorisé. Même avec un mandat expert actif, il ne demande pas l’expédition. Les contrôles de scan, d’adresse, d’identité, de scopes, de compte fournisseur, de tarification, de budget et d’envoi réel restent applicables aux deux parcours.

## Qualification attendue

La recette doit distinguer mode standard sans mandat, mandat autorisé, canal exclu, dépassement des limites, expiration/révocation, revue altérée et réponse perdue. Vérifier aussi l’attestation e-mail et les deux étapes postales séparées. Les tests locaux prouvent leurs scénarios simulés ; ils ne prouvent pas une délégation activée, un consentement affiché correctement par chaque hôte, ni un envoi réel.
