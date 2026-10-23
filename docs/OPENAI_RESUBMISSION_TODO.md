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
| Application | Publication réussie, version Worker `0334ff69-f89e-419c-ba11-6cf4d035cd88` ; manifeste public conforme ; 265 ressources exactes, robots conforme, `/_headers` identifié comme configuration | Sur 268 entrées, seul `/videos/guteneo-vertical-v6-en.mp4` renvoie HTTP 500 ; aucune réussite complète ; catalogue MCP authentifié encore à qualifier |
| Annotations locales | 67 outils, 268 booléens, 216 références de code ; aucun écart structurel ; documents générés synchronisés | Ne remplace ni l’audit sémantique ni le scan sauvegardé du portail |
| Paquet | 0.3.5, 19 fichiers, 1 315 855 octets ; schéma, CRC et reconstruction déterministe conformes | Double audit des exigences terminé ; 32 tests du paquet réussis ; paquet pas importé ni soumis |
| Portail | 0.3.2 « Changes required », « Not published » ; configuration MCP indisponible, aucun contrôle de rescan accessible | Mise à jour ZIP bloquée par « Configure the existing MCP app before updating its plugin ZIP. » |
| Scanner | Lecture privée à 09:23:31 Paris : HTTP 503 `SIGNATURES_STALE` ; version du 2 octobre confirmée à 100 % du trafic ; restauration et maintenance automatique désormais autorisées | Exécution et qualification non encore établies ; une release application ne rafraîchit pas les signatures |
| Support OpenAI | Courriel envoyé à 10:03 Paris après double audit complet ; destinataire et texte vérifiés dans les messages envoyés | Demande de restauration de la configuration existante ; aucune réponse ou résolution encore établie |
| Reviewer | Restriction `prepare_only` restaurée : insertion protégée d’une ligne et trois contrôles de relecture exacts réussis | Connecteur « Guteneo Review » actuellement sur un autre tenant ; ses appels ne prouvent pas le compte de soumission |
| OAuth | Configuration de renouvellement Auth0 appliquée le 13 octobre | Refresh réel dans l’hôte toujours non qualifié |

SHA-256 du paquet 0.3.5 :
`717748d2b61b0ea3aee64d329fa3ad35c95a650f02106188bffd287790feae88`.
Le nom du développeur correspond à l’identité déjà vérifiée dans le portail.
Le paquet ne remplace pas les cas de test du portail ; aucune réussite de cas
non exécuté n’a été déclarée.

## Ordre de reprise

1. **Terminer la vérification de la release application.** Le contrôle borné des
   268 entrées laisse une seule ressource en échec : l’ancien film non catalogué
   `/videos/guteneo-vertical-v6-en.mp4`, HTTP 500 sans octets lors de deux lectures
   avec clés de cache distinctes. Les 265 autres ressources publiques ont les
   tailles et SHA-256 attendus ; robots, configuration `/_headers` et en-têtes de
   l’accueil sont contrôlés. Les 41 autres MP4 sont conformes. Diagnostiquer et
   rétablir cette URL avec ses octets exacts, sans retirer le fichier ni affaiblir
   le vérificateur. Ne déclarer la release entièrement vérifiée qu’après succès.
   Capturer ensuite le catalogue
   MCP authentifié du bon client, en vérifiant les 67 noms, descriptions, schémas
   et annotations, notamment les deux `destructiveHint` corrigés. Conserver la
   preuve expurgée hors du dépôt. Ne pas redéployer un candidat sans rapport avec
   cette empreinte pour faire disparaître un échec de vérification.
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
4. **Restaurer le scanner privé et sa maintenance autorisés.** Le titulaire a
   autorisé cette restauration et la maintenance automatique. Le plan de travail
   précis est conservé hors dépôt dans
   `scanner-preparation/READY_FOR_AUTHORIZATION.md` ; son nom historique ne
   signifie pas que l’autorisation doit être redemandée. Construire une image fraîche
   depuis la source revue, qualifier les contrôles synthétiques existants,
   publier son digest immuable et relire la version réellement servie. Conserver
   les limites privées/EU, la borne d’instance et le rejet des signatures âgées.
   La preuve doit porter sur l’image et les signatures chargées ; le résultat du
   2 octobre ou une image du 14 octobre ne suffit plus. Suivre
   [SCANNER_CI.md](SCANNER_CI.md) pour le credential dédié et le contrôle manuel
   qualifié préalable à la maintenance planifiée. Les métadonnées inspectées
   le 23 octobre n’exposaient ni `SCANNER_REFRESH_ENABLED` ni
   `CLOUDFLARE_SCANNER_API_TOKEN` ; les cinq dernières exécutions planifiées
   étaient ignorées. Ne pas présenter la maintenance comme active avant preuve.
5. **Reprendre les huit cas existants sur le compte et l’hôte attendus.**
   Conserver P1/P2/P3/P5/P6 et R1/R2/R3, avec leurs critères réels décrits dans
   [reviewer-tests.md](../integrations/chatgpt/reviewer-tests.md). P3 exige le PDF
   synthétique exact, son SHA-256 et le statut confirmé. P5 exige un document
   prêt et une autorité opérateur fraîche, étroitement bornée au numéro et au
   plafond de recette, puis un devis valide : l’autorité de revue fax précédente
   a expiré le `2026-10-21T00:00:00Z`, et les contrôles courants comptent zéro
   autorité et zéro tarif valides. Le numéro et le plafond historiques seuls ne
   suffisent donc pas. Cette autorité ne vaut pas autorisation d’expédition.
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
et les rapports expurgés du scanner. Le clone `release/` est distinct du worktree du paquet.
Un fichier de rapport créé mais vide ou une commande en cours ne constitue pas
un résultat réussi.

Les observations d’octobre antérieures dans le dossier marketplace,
`listing.json` et les recettes restent historiques. En particulier, « In review »
du 13 octobre, les anciennes preuves P1/P2/P3, le scan « No findings » et les
anciennes mentions de refresh désactivé ne doivent pas être copiés comme état
courant. Le [dossier de remédiation](MCP_ANNOTATION_REMEDIATION.md) conserve les
changements de comportement décrits, les tests locaux et leurs limites.
