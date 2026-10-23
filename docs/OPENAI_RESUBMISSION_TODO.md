# Reprise de la soumission OpenAI Guteneo — 23 octobre 2026

Ce suivi concerne le plugin existant
`app-6ab05fbae9a881918dc6ee4e2f235d93` et son serveur
`https://guteneo.com/mcp`. Reprendre cette identité et son état réel à chaque
session. Ne pas créer un doublon pour contourner un contrôle indisponible.
Les identifiants, secrets, destinataires, URL signées et données privées de
revue restent hors de ce fichier et du dépôt.

## État établi

| Couche | Preuve du 23 octobre | Limite |
| --- | --- | --- |
| Motif du refus | Notification pour annotations d’outils ; booléens explicites et justifications demandés | Aucun outil ni instantané exact incriminé n’a été identifié par cette notification |
| Correctif | PR #65 fusionnée, commit `5b5041ab04b235b57fccfa60814e7efa5683e17d` | Le correctif ne prouve pas une approbation de revue |
| CI main | 13 contrôles réussis, [run 39914778387](https://github.com/nclsppr/guteneo/actions/runs/39914778387) | Preuve locale et automatisée du commit, distincte de la production |
| Application | Publication réussie, version Worker `0334ff69-f89e-419c-ba11-6cf4d035cd88` ; vérification complète inchangée réussie à 08:11:41 UTC : 266 ressources exactes, robots et en-têtes conformes | Catalogue MCP authentifié encore à qualifier séparément |
| Annotations locales | 67 outils, 268 booléens, 216 références de code ; aucun écart structurel ; documents générés synchronisés | Ne remplace ni l’audit sémantique ni le scan sauvegardé du portail |
| Paquet | 0.3.5, 19 fichiers, 1 315 855 octets ; schéma, CRC et reconstruction déterministe conformes | Double audit des exigences terminé ; 32 tests du paquet réussis ; paquet pas importé ni soumis |
| Portail | 0.3.2 « Changes required », « Not published » ; configuration MCP indisponible, aucun contrôle de rescan accessible | Mise à jour ZIP bloquée par « Configure the existing MCP app before updating its plugin ZIP. » |
| Scanner | Restauration qualifiée à 08:27:39 UTC : ClamAV 1.5.4, signatures 28162 du 23 octobre à 06:24:08 UTC, version `6f9f4e2d-ade1-4c67-abc2-d490988a9fe0`, trafic privé à 100 % | Le run initial reste en échec après une lecture trop précoce du plan de contrôle ; maintenance planifiée encore inactive |
| Corrections complémentaires | PR #67 fusionnée au commit `f5d7c9aea1f938719bede15f4a6edd4892520ff1` ; publication des PR #67 et #68 explicitement autorisée | Nouvelle publication et vérification publique encore à effectuer |
| Support OpenAI | Courriel envoyé à 10:03 Paris après double audit complet ; destinataire et texte vérifiés dans les messages envoyés | Demande de restauration de la configuration existante ; aucune réponse ou résolution encore établie |
| Reviewer | Restriction `prepare_only` restaurée : insertion protégée d’une ligne et trois contrôles de relecture exacts réussis | Connecteur « Guteneo Review » actuellement sur un autre tenant ; ses appels ne prouvent pas le compte de soumission |
| OAuth | Configuration de renouvellement Auth0 appliquée le 13 octobre | Refresh réel dans l’hôte toujours non qualifié |

SHA-256 du paquet 0.3.5 :
`717748d2b61b0ea3aee64d329fa3ad35c95a650f02106188bffd287790feae88`.
Le nom du développeur correspond à l’identité déjà vérifiée dans le portail.
Le paquet ne remplace pas les cas de test du portail ; aucune réussite de cas
non exécuté n’a été déclarée.

## Ordre de reprise

1. **Qualification MCP après la release vérifiée.** Le vérificateur complet
   inchangé a réussi le 23 octobre à 08:11:41 UTC : 266 ressources publiques,
   robots et en-têtes conformes. L’ancienne vidéo a récupéré sans mutation ; ne
   pas rejouer un plan de réparation. Capturer ensuite le catalogue MCP
   authentifié du bon client, en vérifiant les 67 noms, descriptions, schémas et
   annotations, notamment les deux `destructiveHint` corrigés. Conserver la
   preuve expurgée hors du dépôt.
2. **Rétablir la configuration de l’application MCP existante dans le portail.**
   Relire l’état frais et les contrôles disponibles. Résoudre le blocage de
   configuration avant de réessayer le ZIP. Si le portail reste indisponible,
   conserver le message exact et demander à OpenAI la restauration du contrôle
   de configuration/rescan ainsi que les champs ou outils mis en cause.
   La demande de support a été envoyée le 23 octobre à 10:03 Paris après le
   double audit complet des exigences, puis vérifiée dans les messages envoyés.
   Elle demande aussi les outils et valeurs exacts du snapshot rejeté. Ne pas
   dupliquer cet envoi ; reprendre la réponse quand elle arrive. Le ZIP et la
   réponse de revue restent deux étapes distinctes.
3. **Reconnecter le reviewer protégé.** La restauration `prepare_only` est
   terminée le 23 octobre : exactement une ligne insérée, puis
   `target_guard_matches=1`, `exact_restriction_present=1` et
   `intended_user_prepare_only=1`. Aucun canal, mandat, solde ou envoi n’a changé.
   Ne pas rejouer l’insertion déjà réussie. Vérifier en privé la correspondance
   du client OAuth et du tenant au moment de corriger la connexion de l’hôte
   vers ce compte ; une connexion différente ne reçoit pas cette qualification.
4. **Terminer la maintenance automatique du scanner restauré.** La restauration
   autorisée est qualifiée à 08:27:39 UTC sur l’image réellement servie : PDF
   synthétique propre, EICAR, empreintes exactes, contenu vide et type incorrect
   contrôlés ; aucune donnée client ni communication réelle. Le run
   [39923762583](https://github.com/nclsppr/guteneo/actions/runs/39923762583)
   conserve son échec initial : le plan de contrôle a convergé après sa lecture
   prématurée. La requalification n’a effectué aucune nouvelle publication.
   La PR #66 ajoute une attente bornée en lecture seule, sans répétition du
   déploiement, et une surveillance indépendante. Le secret GitHub dédié est
   installé ; l’accès Workers et conteneurs à l’échelle du compte a été autorisé
   pour 90 jours, jusqu’au `2027-01-21T22:59:59Z`. Le courriel GitHub d’échec a
   effectivement été reçu. Après fusion et CI réussie du main final, obtenir un
   nouveau run manuel réussi et qualifier son artefact et son runtime, puis
   activer `SCANNER_REFRESH_ENABLED` et vérifier le watchdog. Cette activation
   n’est pas encore établie. Suivre [SCANNER_CI.md](SCANNER_CI.md), en conservant
   les limites privées/EU, la borne d’instance et le rejet des signatures âgées.
5. **Reprendre les huit cas existants sur le compte et l’hôte attendus.**
   Conserver P1/P2/P3/P5/P6 et R1/R2/R3, avec leurs critères réels décrits dans
   [reviewer-tests.md](../integrations/chatgpt/reviewer-tests.md). P3 exige le PDF
   synthétique exact, son SHA-256 et le statut confirmé. P5 exige un document
   prêt, une autorité opérateur fraîche et un devis valide. L’autorisation explicite
   reçue le 23 octobre à 11:19:24 UTC a été appliquée et vérifiée indépendamment à
   11:31:58 UTC : ancien tarif expiré révoqué, ancienne autorité conservée, une
   nouvelle autorité `review_prepare_only` et son tarif de revue créés. Les bornes
   sont de 7 pages, 200 centimes et 900 secondes par devis ; estimation supérieure
   de référence : 166 centimes. L’autorité expire le `2026-11-22T00:00:00Z` ; le
   tarif, limité par son association la plus courte, le `2026-10-30T11:10:26.278Z`.
   Recontrôler ces échéances au moment du cas. Aucun envoi, canal, mandat expert ou
   solde n’a changé. Cette autorité ne vaut pas autorisation d’expédition ; P5
   dans l’hôte reste non qualifié tant que sa connexion cible le mauvais compte.
   P6 réutilise cette référence préparée sans approbation ni envoi. Les trois
   cas négatifs doivent s’exécuter dans un hôte contrôlé où seul Guteneo est
   disponible. Ne pas substituer des cas plus faciles ou transformer un scan
   réussi en réussite de parcours. Requalifier aussi connexion, refresh et
   révocation OAuth ; noter les résultats indépendamment.
6. **Importer et rescanner la version 0.3.5.** Quand la configuration existante
   est rétablie, importer le ZIP dont l’empreinte figure ci-dessus, relire les
   champs sauvegardés et obtenir un scan du serveur corrigé. Rapprocher chaque
   valeur et justification de la matrice actuelle, y compris `dry_run_dispatch`
   et les lacunes historiques de `update_template`, `archive_template`,
   `share_template` et `cancel_generation_job`. Conserver les cas déjà présents
   dans le portail tant qu’une modification justifiée n’a pas été vérifiée.
7. **Resoumettre et vérifier le reçu.** Utiliser l’autorisation donnée dans la
   session de reprise pour transmettre les éléments corrigés et une réponse
   factuelle au motif du refus. Toute attestation doit correspondre aux preuves
   réellement obtenues. Relire ensuite version, statut et horodatage de la
   soumission existante. « Submitted/In review » prouve seulement la réception ;
   approbation et publication exigent leurs propres observations.

## Preuves de travail et historique

Les artefacts locaux de cette passe se trouvent hors du dépôt dans
`/Users/nclsppr/.codex/artifacts/guteneo-resubmission-2026-10-23/` :
`annotation-audit/`, `submission/`, `SCANNER_REVIEW_READINESS.md`,
`scanner-preparation/READY_FOR_AUTHORIZATION.md`,
`public-assets-bounded-verification.json`, `PUBLIC_RELEASE_ASSET_DIAGNOSIS.md`
`LEGACY_ASSET_RECOVERY.md`, `legacy-asset-repair/full-release-verification.log`,
`SUPPORT_EMAIL_SENT.md`, les deux matrices complètes des exigences et les rapports
expurgés du scanner. Le clone `release/` est distinct du worktree du paquet.
Un fichier de rapport créé mais vide ou une commande en cours ne constitue pas
un résultat réussi.

Les observations d’octobre antérieures dans le dossier marketplace,
`listing.json` et les recettes restent historiques. En particulier, « In review »
du 13 octobre, les anciennes preuves P1/P2/P3, le scan « No findings » et les
anciennes mentions de refresh désactivé ne doivent pas être copiés comme état
courant. Le [dossier de remédiation](MCP_ANNOTATION_REMEDIATION.md) conserve les
changements de comportement décrits, les tests locaux et leurs limites.
