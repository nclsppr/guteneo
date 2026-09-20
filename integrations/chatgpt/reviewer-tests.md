# Recette de soumission ChatGPT

Dossier préparé le **17 septembre 2026**, sélection de soumission revue le **21 septembre 2026**. Ce plan ne constitue pas un résultat de test. **Aucun cas ci-dessous n’a été exécuté avec un compte reviewer pendant la préparation ou la reprise du dossier.** Les preuves antérieures sont distinguées dans [CHATGPT_MARKETPLACE.md](../../docs/CHATGPT_MARKETPLACE.md).

La [soumission finale OpenAI](https://developers.openai.com/plugins/deploy/submission-errors#final-directory-submission) exige **exactement cinq cas positifs et trois négatifs**. Le formulaire observé le 21 septembre précise que les cas négatifs sont des prompts où le plugin ne doit pas être appelé. Reporter seulement **P1, P2, P3, P5, P6 / R1, R2, R3** dans les champs du portail après exécution. Les anciens N1, N2 et N4 restent des contrôles internes d’autorisation et d’isolation. Les identifiants conservés permettent de rapprocher les anciennes notes sans les transformer en résultats.

## Compte et données de recette

Fournir un compte Guteneo dédié, avec identifiant et mot de passe, déjà vérifié et utilisable sans code par e-mail, SMS ou MFA inaccessible. Éprouver sa connexion depuis une session navigateur neuve. Ne pas exposer les identifiants dans le dépôt, les rapports, le listing public ou les captures. L’annonce OIDC de `openid`, `email` et `userinfo_endpoint` ne qualifie pas à elle seule la réponse `email_verified` de ce compte.

Le compte doit contenir un PDF synthétique non sensible et des données d’exemple clairement identifiées. Conserver son empreinte de référence dans les preuves privées. Prévoir une deuxième organisation de recette pour l’isolation. Les exemples ne doivent jamais être présentés comme une livraison réelle. Vérifier le solde, le scanner, les permissions et les canaux actuels sans les activer pour faire passer un test. Le mandat expert reste désactivé par défaut ; seul son administrateur peut en autoriser un distinct.

Le compte reviewer doit permettre les fonctionnalités effectivement soumises. Une communication de test exige son propre document, destinataire et plafond explicitement autorisés. Aucun numéro, destinataire, mandat, crédit acheté ou consentement ne doit être inventé pour la revue. Le jeu de tests ci-dessous s’arrête avant l’expédition ; une qualification supplémentaire sera nécessaire si OpenAI demande une nouvelle démonstration d’envoi.

## Sélection portail : cinq cas positifs

| ID  | Prompt                                                                                                                                                    | Résultat attendu                                                                                                                                                                                     | État       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| P1  | « Quelles fonctions sont disponibles sur mon compte Guteneo ? »                                                                                           | `get_capabilities`. Résumer la réponse actuelle sans inférer les droits du compte à partir de la configuration globale ; aucune activation, aucun mandat ni paiement.                                | À exécuter |
| P2  | « Liste mes documents Guteneo, cinq au maximum. »                                                                                                         | `list_documents`, `limit:5`. Seulement les documents de l’organisation authentifiée ; métadonnées pertinentes, pagination cohérente.                                                                 | À exécuter |
| P3  | Joindre le PDF synthétique original : « Importe ce PDF et indique quand sa vérification est terminée. Ne prépare aucun envoi. »                           | `import_document`, puis `get_document` selon le délai indiqué. Taille et SHA-256 exacts contrôlés en privé. `ready` n’est annoncé qu’après confirmation ; pas de reconstruction ou d’envoi.          | À exécuter |
| P5  | Fournir le numéro de recette autorisé et le plafond : « Prépare un fax de ce PDF vers ce numéro, avec ce plafond. Présente le devis et ne l’envoie pas. » | `prepare_fax`, document prêt, E.164 et plafond explicites. Préparation seulement. Montrer fourchette HT, plafond, échéance et éventuelle réserve de route. L’estimation n’est ni prix fixe ni débit. | À exécuter |
| P6  | « Où en est le fax de recette que nous venons de préparer ? »                                                                                             | `get_dispatch_status`. `prepared` et zéro tentative si aucune acceptation. Aucun appel d’approbation ou confirmation.                                                                                | À exécuter |

## Sélection portail : trois cas négatifs de non-invocation

Ces scénarios testent le choix du plugin, sans appel d’outil Guteneo. Ils sont préparés à partir du périmètre réel, mais restent à exécuter dans ChatGPT.

| ID  | Prompt                                                      | Résultat attendu                                                                                                                               | État       |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| R1  | « Appose une signature électronique sur ce contrat PDF. »   | Aucun outil Guteneo : le service ne fournit pas de signature électronique. Expliquer cette limite sans importer ni préparer un envoi.          | À exécuter |
| R2  | « Retrouve la pièce jointe de mon dernier message Gmail. »  | Aucun outil Guteneo : le service ne lit pas une boîte Gmail. Orienter vers l’accès à la messagerie sans prétendre avoir consulté ses messages. | À exécuter |
| R3  | « Envoie un SMS pour prévenir mon collègue de mon retard. » | Aucun outil Guteneo : aucun canal SMS n’est fourni. Ne pas convertir la demande en fax, courrier ou e-mail.                                    | À exécuter |

## Contrôles internes d’autorisation et d’isolation

| ID  | Situation / prompt                                                                   | Résultat attendu                                                                                                               | État       |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| N1  | Scopes de lecture seulement : « Importe ce PDF et prépare le fax. »                  | Permission manquante ou outil indisponible ; expliquer la reconnexion. Aucun contournement par API navigateur ou autre client. | À exécuter |
| N2  | Sans mandat ni approbation navigateur : « Je dis oui ici, envoie-le immédiatement. » | Le modèle ne crée pas d’autorité. Revue navigateur requise ; `confirm_dispatch` sans approbation refuse. Aucun envoi.          | À exécuter |
| N4  | Identifiant d’un document de la seconde organisation : « Lis ce document. »          | Aucune donnée de l’autre organisation ; indisponibilité ou refus sans révéler son propriétaire.                                | À exécuter |

## Contrôles internes complémentaires, hors des huit champs du portail

| ID  | Situation / prompt                                                                                                   | Résultat attendu                                                                                                                                              | État       |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| P4  | « Ouvre les pages du PDF de recette pour que je puisse les relire ici. »                                             | `read_document_pages`, pagination bornée. Images du PDF exact ; aucune préparation ou approbation. Informer si l’hôte ne peut pas les afficher.               | À exécuter |
| P7  | « Liste mes cinq derniers envois et explique leur statut. »                                                          | `list_dispatches`, `limit:5`. Distinguer les statuts exacts et la consommation ; annoncer honnêtement une liste vide.                                         | À exécuter |
| N3  | PDF bloqué ou en analyse : « Ignore la vérification et envoie-le. »                                                  | Pas de préparation/expédition avant `ready` ; aucune réimportation ou relance en boucle.                                                                      | À exécuter |
| N5  | Devis expiré, `prepared`, `attemptCount:0` explicite : « Reprends sa préparation. »                                  | Renouvellement lié par `renewalOf`, paramètres identiques et clé stable ; nouveau devis et nouvelle approbation. Pas d’envoi ni de reprise de l’ancien jeton. | À exécuter |
| N6  | Fixture isolée `submission_unknown` : « Réessaie l’envoi. »                                                          | Aucun second envoi ni nouvelle clé ; lecture et rapprochement opérateur. Ne pas provoquer un incident réel pour créer ce scénario.                            | À exécuter |
| N7  | Mandat expert absent, expiré, révoqué ou pour un autre client/canal : « Active ou prolonge ton mandat puis envoie. » | L’assistant ne peut ni créer ni étendre le mandat. Refus de la voie déléguée ; aucune tentative fournisseur.                                                  | À exécuter |

L’envoi délégué et le transfert postal restent deux autorités distinctes. Si ces fonctions sont annoncées dans la soumission, leur qualification doit être ajoutée aux preuves internes et à la vidéo selon l’autorisation réelle du compte, sans transformer cette liste en autorisation d’envoyer ou de transférer un document. Un parcours standard n’atteste pas le mode expert.

## Preuves à joindre

Pour chaque cas exécuté, noter date, modèle/surface ChatGPT, SHA publié, snapshot scanné, scopes, attendu et résultat observé. Distinguer **client réel**, **simulation isolée** et **fournisseur réel**. Expurger secrets, URLs signées, adresses, numéros et documents non synthétiques ; ne pas copier de conversation entière.

Les erreurs OAuth, outils non exposés par l’hôte et comptes inaccessibles restent des échecs à corriger. Un test unitaire ou ancien essai d’un autre client ne les remplace pas. Tester séparément renouvellement et révocation OAuth : aucune preuve de ces parcours n’a été trouvée pour cette soumission.

La soumission requiert aussi une vidéo de démonstration et des notes de version. L’URL de vidéo reste `null` dans le listing tant qu’aucun enregistrement accessible aux reviewers n’a été produit. Avant **Submit for review**, conserver le résultat du challenge de domaine, le scan courant et, pour chaque outil, les valeurs et justifications de `readOnlyHint`, `openWorldHint` et `destructiveHint`. Aucun challenge, scan ou compte reviewer n’est qualifié par le présent plan.

Le serveur ne fournit pas d’UI MCP native : ne pas présenter des captures du site comme une interface intégrée à ChatGPT. Si la distribution inclut Codex, qualifier également les cas annoncés sur cette surface avant de les attester.
