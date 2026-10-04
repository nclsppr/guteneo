# Dossier marketplace ChatGPT — reprise du 4 octobre 2026

## Reprise de publication du 4 octobre 2026 — dernier checkpoint vérifié

L’utilisateur a autorisé la fusion, le déploiement et la soumission. La PR [#51](https://github.com/nclsppr/guteneo/pull/51) a été fusionnée à **15:43:58Z** avec le commit `619c8b4d043389ff58665663034df0a6e105892f`. La CI du head exact `0da3e9f…` est verte, **13/13**, run `37212328191`. La CI main `37214105319` a ensuite réussi, **13/13**. Les deux origines de production ont passé `scripts/verify-release.mjs` avec un timeout de 90 s et les mêmes assertions : canonique à **16:19:47.025Z**, fallback à **16:23:31.543Z**. Elles portent le même commit `619c8b4d043389ff58665663034df0a6e105892f`, snapshot source `52457044a84549ff9a56a28b18d1d142041efc901b28f36777b5c7d23b546db7` et **258 assets**. Le Worker `f370991e-a262-4bfe-a2d3-772ba566ae81` reçoit **100 % du trafic**. La soumission n’est pas déduite de ces vérifications.

Le scanner OAuth a été reconnecté, le domaine vérifié et **66 outils** découverts. Le brouillon Legacy 0.3.2, les descriptions EN/FR et notes de version ont été relus après rechargement. Les **six skills Passed** ont également été confirmés après rechargement, dont email/document-studio 0.3.2 et pdf-accessibility avec son seul bloc `interface` corrigé. Le nouveau scan du serveur déployé a réussi, puis l’import complet a retourné **Imported 66 / Skipped 0 / Missing 0 / Mismatched 0**. La relecture après rechargement confirme **198 champs de justification et zéro vide**, ainsi que les **six skills Passed**. Après confirmation explicite du développeur autorisé, les **six attestations ont été enregistrées** et le bouton **Submit for Review** activé. Le portail a affiché **Guteneo submitted for review**. L’éditeur est passé en lecture seule ; après navigation puis rechargement complet du tableau de bord, celui-ci confirme **Version 0.3.2 · In review**, **Not published** et **Configured**. La soumission est donc prouvée ; la publication reste distincte.

La connexion **Guteneo Review** a été rétablie. P1/P2/P3 ont réussi via les outils MCP exacts à **15:15Z** sur la source publique `c5cc0dd…` : production sans simulation, expert et Horizon inactifs, PDF synthétique exact de deux pages prêt. L’import a dédupliqué le document ; il ne prouve pas une nouvelle analyse antivirus. P5/P6 ont réussi à **15:35Z** : fax `prepared`, `review_prepare_only`, plafond 200 centimes, zéro tentative, aucune réservation ou consommation de crédit. La fourchette affichée était **0,1817–0,5737 € HT** ; 58 centimes désigne la borne haute arrondie, pas un prix fixe. Le devis expirait à **15:48:50.373Z**. D1 a confirmé en lecture seule zéro approbation, tentative, outbox, réservation ou acceptation expert dans l’organisation reviewer, avec le canal fax désactivé. Ces preuves sont antérieures au nouveau déploiement ; elles ne qualifient aucun envoi.

L’association Telnyx exacte profil/CSV a été observée dans Safari à **15:21:34Z**. Le CSV téléchargé par l’interface est identique aux 34 772 308 octets utilisés par le plan. Le plan digest `65bb1f15cb322ced6467f336a32a84af6a47611fb59c0584a2374b15b6cdc275` a été relu puis appliqué par l’agent principal après validation du digest exact ; il reste limité à la préparation, sans activation, mandat ni envoi. La référence expire le **11 octobre à 15:21:34Z**, l’autorité immuable le **21 octobre à 00:00Z**. Local Calling et l’envoi ne sont pas qualifiés.

Les négatifs **R1/R2/R3** ont été exécutés dans trois processus éphémères séparés du vrai **Codex CLI 0.144.4**, modèle effectif `gpt-5.6-sol` (OpenAI). Chacun termine avec **zéro appel Guteneo et zéro appel tiers**. P1 constitue le contrôle positif réussi avec un appel `get_capabilities` ; une lecture initiale positive supplémentaire est comptée séparément. Aucune permission Gmail ni configuration utilisateur n’a été modifiée. La preuve porte sur la **non-invocation** dans ce seul hôte et son catalogue connecté Review de **24 outils**, pas sur la sélection automatique de ChatGPT, la découverte de 66 outils ni la formulation des réponses finales.

La vidéo publique reste l’enregistrement du **21 septembre**, **87 secondes**, 2 367 095 octets, SHA-256 `8ff81c30eaefcb6bf319c8f8987cf543ffc300ba4e184eb7f3e83a0257928df2`. Le décodage intégral et neuf captures ont été vérifiés. Elle illustre un PDF déjà prêt, son devis limité à la préparation, puis le statut sans tentative, réservation ni approbation. Aucune contradiction visible n’a été relevée avec le canal e-mail désactivé ou les annotations corrigées, absents de ce parcours. Son prix est historique. **Elle ne qualifie pas 0.3.2 dans son ensemble, l’import initial, la revue visuelle de chaque page, les e-mails/liens protégés, Horizon, le studio de modèles ni la livraison réelle.** Aucun nouveau média n’a été créé.

Le premier contrôle reviewer après déploiement a échoué avec `UNAUTHORIZED / oauth_refresh_token_missing`. Une reconnexion de la connexion existante, sans élargissement des permissions, a ensuite permis **un get_capabilities réel réussi à 16:34:20.759Z** : production sans simulation, expert inactif et Horizon indisponible. Les capacités globales fax/postal ne constituent pas une autorisation d’envoi du reviewer. L’échec initial et le résultat après reconnexion sont conservés séparément ; aucune pérennité future du refresh token n’est déduite de ce seul succès.

Les consignes privées Testing ont été actualisées avec **CURRENT REVIEW QUALIFICATION — 4 October**, les limites réelles et les échéances, en préservant le bloc d’accès existant ; **Draft saved** a été observé. La relecture après rechargement a confirmé la conservation intégrale du bloc d’accès et de la note de qualification, ainsi que les cinq marqueurs de tests positifs et les trois négatifs. Aucun contenu privé n’est reproduit ici. Les preuves détaillées demeurent dans des rapports expurgés 0600 hors Git.

### Checklist persistante au dernier checkpoint

- [x] Recevoir l’autorisation utilisateur de fusionner, déployer et soumettre.
- [x] Fusionner #51 après la CI du head exact : 13/13 succès.
- [x] Vérifier la CI main `37214105319` : 13/13 succès, puis le déploiement public exact de `619c8b4…` sur les deux origines, 258 assets et 100 % du trafic.
- [x] Reconnecter le scanner OAuth, vérifier le domaine et découvrir 66 outils.
- [x] Enregistrer/recharger 0.3.2, EN/FR/notes et confirmer six skills Passed.
- [x] Relancer le scan du serveur corrigé et importer/relire les justifications des 66 outils : Imported 66, aucun skipped/missing/mismatched, 198 champs persistés et zéro vide.
- [x] Réactualiser le tarif de préparation sur association profil/CSV fraîche, sans ouvrir l’envoi.
- [x] Exécuter P1/P2/P3/P5/P6 via les outils Guteneo Review, sans simulation ni envoi, avec corroboration D1.
- [x] Vérifier R1/R2/R3 sans invocation dans le seul hôte Codex isolé ; conserver explicitement ses limites.
- [x] Relire la vidéo historique et décrire sa couverture réelle ; aucun parcours 0.3.2 supplémentaire n’est qualifié par celle-ci.
- [x] Actualiser les consignes Testing privées et observer Draft saved.
- [x] Relire la persistance intégrale des consignes Testing privées après le nouveau déploiement.
- [x] Revalider en lecture seule l’accès du compte reviewer après le nouveau déploiement : un get_capabilities réussi à 16:34:20.759Z, après reconnexion existante sans élargissement d’accès.
- [x] Recevoir la confirmation explicite du développeur autorisé pour les six attestations, les enregistrer puis vérifier le bouton Submit for Review activé.
- [x] Soumettre puis vérifier après rechargement **Version 0.3.2 · In review**, confirmation **Guteneo submitted for review** ; observation enregistrée le `2026-10-04T16:49:05.152583+00:00`.
- [ ] Après décision OpenAI, vérifier séparément la publication effective ; le dernier état observé reste **Not published**.

Le texte privé Testing complet (**4 317 caractères**) a été relu après rechargement : bloc d’accès initial, qualification actuelle et consigne de reconnexion OAuth présents intégralement. La configuration du client reviewer reste à jeton d’accès d’une heure sans renouvellement silencieux qualifié ; la proposition de refresh rotatif 90 jours / 30 jours d’inactivité n’a pas été appliquée et ne vaut pas modification du client public.

## Harmonisation anglaise préparée après soumission — candidat 0.3.3

Les cinq descriptions et titres français de skills ont été traduits en anglais ; `pdf-accessibility` était déjà anglais. Les champs principaux du manifeste, les descriptions des agents et les six descriptions sont cohérents. La traduction explicite `fr-FR` du listing reste une traduction distincte. Les règles métier internes des skills sont conservées.

Les URLs website/support/privacy/terms et les liens Documents ou confidentialité des skills utilisent le paramètre public vérifié `?lang=en` (avant le fragment). `/en/` et `/en/support/` sont absents ; les endpoints MCP/OAuth et médias restent des ressources techniques sans langue de query. Le code candidat empêche la préférence de session d’écraser une langue explicitement demandée dans l’URL ou au sélecteur, sans écrire cette demande dans la préférence du compte. Sans choix explicite, le profil reste prioritaire.

Le paquet candidat est **0.3.3** ; il n’est ni déployé ni importé. L’éditeur confirme **Viewing the review version. Only draft versions can be edited.** pour 0.3.2, et les imports de skills sont verrouillés. La version 0.3.2 reste **In review**. La vidéo de septembre reste française ; le paramètre `lang` ne traduit pas un MP4.

- [x] Préparer les six descriptions et titres anglais ainsi que les URLs publiques anglaises.
- [x] Corriger la priorité de langue URL/session et couvrir le sélecteur, Automatique et la sauvegarde du profil.
- [ ] Après vérification du candidat, recevoir l’autorisation explicite de remplacer la revue actuelle avant toute annulation.
- [ ] Fusionner/déployer le candidat uniquement après autorisation, puis vérifier les deux origines.
- [ ] Importer les skills modifiés et URLs dans une version modifiable, vérifier les scans et les consentements actuels, soumettre puis confirmer le nouvel état.

## Historique de la reprise du 2 octobre 2026

**Le brouillon version 0.3.1 est sauvegardé dans l’éditeur MCP existant ; après Exit, le tableau de bord affiche « Version 0.3.1 · Not submitted » et MCP configured. Aucun Submit ni aucune publication OpenAI n’a été effectué.** Le sous-titre anglais, les descriptions anglaise/française et les notes de version proviennent du manifeste 0.3.1 : e-mail désactivé jusqu’à qualification, liens PDF protégés et interface web en français, anglais, allemand et luxembourgeois. Le réglage **All countries** est conservé. La revue 0.2.2 avait été annulée explicitement pour son remplacement ; aucun motif de rejet de la revue OpenAI n’a été observé. Le plugin conserve l’identité `asdk_app_6ab05fbae9a881918dc6ee4e2f235d93`.

L’authentification OAuth du scanner et le **scan complet des 24 outils** ont réussi sur le serveur déjà déployé ; les 24 triplets d’annotations et leurs justifications ont été importés dans le parcours legacy. Cette reprise n’a produit aucun envoi réel, déploiement, merge, changement de mandat, attestation ou soumission. La sauvegarde du brouillon et la préparation du paquet restent distinctes de la revue OpenAI.

## Todo-list de reprise — conservée à la demande du titulaire le 2 octobre

- [x] Préparer la [PR #38](https://github.com/nclsppr/guteneo/pull/38), branche `codex/plugin-review-draft-progress`, sur `a808307c5687588eb8c0aab45c9e559aa70a03dc`. Le paquet final, reconstruit depuis cette base avec les derniers garde-fous email, a réussi **32/32 tests ciblés**, le schéma officiel, le déterminisme, le CRC et les contrôles de confidentialité/liaisons privées. La [CI de la base de la PR `015f7c3…`](https://github.com/nclsppr/guteneo/actions/runs/37033236823) a réussi **12/12 contrôles** ; elle ne qualifie pas les derniers garde-fous email ajoutés ensuite. Les 12/12 contrôles de PR #34 restent historiques.
- [x] Authentifier le scanner du portail, réaliser le scan complet de **24 outils** et importer leurs annotations dans l’[éditeur MCP existant](https://platform.openai.com/plugins/edit/asdk_app_6ab05fbae9a881918dc6ee4e2f235d93/asdk_app_v_6ab05fbc52b08191824184064aee539f).
- [x] Sauvegarder les informations **0.3.1** puis vérifier **Not submitted** et **MCP configured** sur le tableau de bord après **Exit**.
- [x] Conserver les trois ZIP individuels aux octets identiques à ceux de 0.2.3 : **get-started Passed**, **fax-pdf Passed**, **postal-pdf Passed**. Le réimport de get-started a réutilisé son résultat Passed en cache.
- [x] Compléter les garde-fous du quatrième skill **email** et reconstruire les ZIP finaux ; vérifier leurs octets et les 32 tests ciblés.
- [x] Remplacer le premier ZIP email par le ZIP final de **5 179 octets**, SHA-256 `2e81b491ef3b2a86f9df8b37b2a206ab9c0f6a9594206c89213886e275c58166`, puis confirmer **email Passed après rechargement**, avec get-started, fax-pdf et postal-pdf également Passed.
- [ ] Vérifier la CI après intégration des derniers garde-fous. Le Passed final email est confirmé sur le ZIP de 5 179 octets ; le Passed du premier ZIP reste historique.
- [x] Rétablir la connexion **Guteneo Review** et rapprocher exactement le compte, le tenant et le client OAuth attendus dans D1, sans exposer les identifiants. **P1/P2/P3** sont réussis comme appels MCP bornés dans Codex sur la source publique `a808307…`, sans simulation ni activation du mode expert ; cette preuve ne qualifie pas la sélection automatique ChatGPT ni une nouvelle analyse antivirus.
- [ ] Après la connexion Telnyx demandée au titulaire, relire les sources du tarif reviewer et l’association CSV au profil, puis préparer la requalification non envoyable. Le tarif reviewer est expiré depuis le **24 septembre** et l’association historique dépasse **168 heures**. Ne pas renouveler automatiquement un canal, mandat, plafond ou tarif pour satisfaire un test.
- [ ] Reprendre **P5/P6/R1/R2/R3** avec des références non envoyables valides et le vrai client ; mettre à jour la vidéo pour les fonctions annoncées en 0.3.1, notamment le traitement fidèle du canal e-mail désactivé et des liens protégés. `review_prepare_only` s’arrête avant toute approbation ou envoi. La vidéo de septembre ne vaut pas recette actuelle.
- [ ] Vérifier les réglages OAuth effectifs et la durée d’accès nécessaire à la revue, sans les élargir automatiquement. L’absence de refresh token dans les scripts et la limite d’une heure sont des indices locaux, pas une cause live confirmée.
- [ ] Faire compléter au développeur autorisé les six attestations légales/de politique après présentation des preuves. Après les quatre résultats Passed, la page Submit a été relue : **six cases de politique à 0**, **Submit for Review désactivé**, et seul problème visible **« Submit is incomplete Confirm this statement. »** ; aucun message Skills incomplete. Aucune case, attestation ni bouton final n’a été validé. Effectuer ensuite **Submit for review** et vérifier le statut réellement obtenu.
- [ ] Après approbation OpenAI, traiter séparément la publication dans l’annuaire sous autorisation du titulaire, puis retenter la migration ZIP si elle devient disponible. Vérifier la fiche et la version publiées ; ne pas créer de doublon.

Point de reprise : **CI après les derniers garde-fous, fraîcheur tarifaire, P5/P6/R1/R2/R3 et vidéo 0.3.1**, puis attestations et soumission. Cette liste ne programme aucun rappel.

## État du paquet et des skills

Le paquet local final **0.3.1 contient quatre skills**, pèse **1 290 534 octets** et porte le SHA-256 `25158ede8c9e178012f069dbe9958d83be6574a37b2cbb981e58a3a9c58f19b6`. Le ZIP individuel email pèse **5 179 octets**, SHA-256 `2e81b491ef3b2a86f9df8b37b2a206ab9c0f6a9594206c89213886e275c58166`. Le skill email applique les restrictions de données sensibles avant lecture/import/préparation et l’arrêt avant revue/approbation/confirmation, y compris le renouvellement, si le canal est désactivé, non qualifié ou `review_prepare_only`. La reconstruction finale a réussi **32/32 tests ciblés**, le schéma officiel, le déterminisme, le CRC et les contrôles de confidentialité/liaisons privées. Son rapport reste hors dépôt à `/Users/nclsppr/.codex/artifacts/guteneo-plugin-resubmission-2026-10-02/vitest-0.3.1-final-focused.json`. Ces derniers changements locaux ne sont pas qualifiés par la CI de la base `015f7c3…`. **Aucun ZIP global 0.3.1 n’a été importé ni retenté dans le portail.**

Les trois ZIP get-started/fax-pdf/postal-pdf sont inchangés et Passed. Le premier ZIP email de 4 340 octets avait obtenu Passed avant remplacement : ce résultat est historique. Le ZIP final email de **5 179 octets**, SHA-256 `2e81b491ef3b2a86f9df8b37b2a206ab9c0f6a9594206c89213886e275c58166`, a ensuite remplacé ce premier ZIP. Après une phase Scanning, **email Passed a été explicitement confirmé après rechargement de l’éditeur et ouverture de Skills** ; get-started, fax-pdf et postal-pdf sont également Passed. Les **quatre scans individuels sont donc Passed**, sur les octets finaux attendus. Les interfaces YAML obligatoires `display_name` et `short_description` sont conservées. L’import individuel d’un skill, son scan, la sauvegarde des métadonnées, la soumission et la publication restent des étapes distinctes.

Historique du 2 octobre : le ZIP global 0.2.3 de **1 283 344 octets**, SHA-256 `bf797190a6235d4886b63738454414a90ffa3071aee77333cbd2fa5e18fa6885`, a été refusé avec **Keep the existing MCP connection / Publish the existing MCP app before updating its plugin ZIP**. Cette contrainte de migration ne constitue pas un rejet de qualité du plugin. Le paquet 0.2.3 corrigé de **1 283 503 octets**, SHA-256 `962b67688b7947724b28fe8846594ea3ce4fd3180db4971ed75cc9a92d861d13`, n’a pas été importé globalement et est archivé hors dépôt à `/Users/nclsppr/.codex/artifacts/guteneo-plugin-resubmission-2026-10-02/guteneo-plugin-0.2.3.zip`. Son empreinte ne qualifie pas le paquet 0.3.1. Le brouillon 0.2.3 sauvegardé et ses trois scans Passed sont historiques depuis la sauvegarde 0.3.1.

Le panneau global **Metadata & Skills** avait affiché **No Skills in this version / Review Unavailable** pour cette ancienne application MCP sans paquet global importé. Cette observation historique ne remplace pas les résultats legacy individuels. La page Submit 0.2.3 ne signalait plus Skills incomplete et affichait six cases de politique décochées ; elle ne qualifie pas le quatrième skill email ajouté ensuite.

## Contrôles et dépendances encore ouverts

Le client MCP a été rétabli par **Plugin page → Reconnect → Continue** dans ChatGPT Safari, avec « Primary is now connected ». Le `get_capabilities` réel du `2026-10-02T16:02:05.789Z` a réussi dans Codex : production, sans simulation, expert inactif. Le compte, le tenant et le client reviewer attendus ont été rapprochés exactement dans D1 avant l’import. P2 a retourné un PDF avec `limit:5`, sans page suivante ; P3 a importé le PDF synthétique exact de **4 290 octets**, deux pages, SHA-256 `d25de4f63db4cab316d4718638c9747cc11628035dc4045610fed89c5079adbc`, puis `get_document` a confirmé ready sans simulation. L’import a dédupliqué un PDF existant : aucune nouvelle analyse antivirus n’est prouvée. Ces appels bornés ont utilisé le serveur public `a808307…` ; le rapport expurgé reste privé, non versionné, en permissions 0600. **P5/P6/R1/R2/R3 et la sélection automatique dans ChatGPT ne sont pas qualifiés.**

Deux observations partielles ont ensuite eu lieu dans ChatGPT Work, GPT-6.1 Sol Light. R1 a demandé de joindre un PDF et de préciser le type de signature, sans outil Guteneo visible ; la mention du plugin avait probablement été retirée lors du remplacement du texte du composeur, donc ce résultat n’est pas qualifié. Pour R2, la mention bleue **Guteneo Review** a été préservée et capturée ; le prompt Gmail a déclenché l’outil Gmail déjà connecté dans l’hôte, puis l’hôte a indiqué que Guteneo Review ne pouvait pas lire Gmail. La tentative a été arrêtée dès que l’usage de l’outil Gmail a été observé ; une lecture Gmail avait déjà eu lieu. Aucune communication n’a été envoyée et aucun contenu ou métadonnée récupéré n’est consigné ici. Cette lecture via Gmail ne qualifie pas un test isolé de non-invocation Guteneo. **R1/R2/R3 restent à exécuter dans un hôte contrôlé où seul le plugin Guteneo reviewer est disponible ; R3 n’a pas été tenté**, pour éviter le recours à un service de communication tiers.

Le tarif reviewer a expiré le **24 septembre** ; l’association historique au CSV Telnyx dépasse **168 heures**. La connexion Telnyx du titulaire reste nécessaire pour relire les sources sans envoi. L’autorité de préparation peut durer 30 jours, mais ne prolonge ni les observations ni les devis. Les [règles review_prepare_only](REVIEW_FAX_PREPARATION.md) et la [procédure opérateur](REVIEW_FAX_OPERATOR.md) restent applicables. Les erreurs initiales d’authentification et Missing OAuth callback data restent historiques ; l’absence de refresh token dans le code et la limite d’âge d’une heure ne prouvent pas les réglages privés Auth0 effectifs ni une cause exacte.

La lecture publique la plus récente du **2 octobre, à 16:19**, confirme la source propre `a808307c5687588eb8c0aab45c9e559aa70a03dc`, construite le `2026-10-02T12:43:39.396Z`. Le ZIP d’intégration servi publiquement pèse **1 289 274 octets**, SHA-256 `983e6fc7ca6f2f3f7bf603e2d05e2a50791ba8e9080e8b5410851b3774a9a8b4` ; ses octets sont distincts du paquet local final de 1 290 534 octets. La lecture antérieure du matin avait identifié `5dec27555ea27035b66d0f51162fe75a9755c82f`, construit le `2026-09-22T21:32:22.470Z` : elle reste historique. La publication du serveur est déjà intervenue en dehors de cette reprise ; aucun déploiement n’a été effectué par l’agent.

Les GET publics ont aussi vérifié `/confidentialite/`, `/conditions/`, `/support/` et la découverte OAuth à **200**, et `/mcp` anonyme à **401**, refus attendu. Le [PDF synthétique](https://guteneo.com/review/reviewer-original.pdf) reste accessible avec les octets attendus ; la [vidéo historique](https://guteneo.com/review/guteneo-chatgpt-demo-20260921.mp4) pèse **2 367 095 octets**, SHA-256 `8ff81c30eaefcb6bf319c8f8987cf543ffc300ba4e184eb7f3e83a0257928df2`. Ces GET ne qualifient pas les références tarifaires, les cas restants ou une nouvelle vidéo.

La [PR #34](https://github.com/nclsppr/guteneo/pull/34) a été **fusionnée extérieurement le 2 octobre à 11:41:57** ; elle n’est plus un brouillon. Ses **12/12 contrôles sur `88ca887…`** restent une preuve historique. La reprise courante est la **PR #38**. Sa CI sur `015f7c3…` est terminée avec **12/12 contrôles réussis**, sans qualifier les derniers garde-fous email ajoutés après ce commit.

## Parcours ZIP et éditeur MCP existant

Le [parcours de soumission actuel](https://developers.openai.com/plugins/deploy/submission) utilise le **ZIP comme source des champs importés**, en lecture seule dans ce parcours. [listing.json](../integrations/chatgpt/listing.json) reste une feuille de suivi interne. Les justifications ne sont plus des champs requis du nouveau parcours ZIP ; le fallback legacy a néanmoins reçu les 24 triplets et justifications. Les annotations doivent correspondre aux effets réels des outils.

Le **Plugin Creator officiel v0.1.22** est installé dans ChatGPT. Le skill local `prepare-plugin-submission` et ses **trois références ont maintenant été lus intégralement** depuis `/Users/nclsppr/.codex/plugins/cache/openai-curated-remote/plugin-creator/0.1.22/skills/prepare-plugin-submission/SKILL.md`. Le skill est disponible ; l’inventaire local des outils n’expose pas encore les actions Creator de lecture/mise à jour. Les actions visibles dans ChatGPT concernent création privée, mise à jour et métadonnées ; aucune API Submit n’est observée. Son instruction est : « Have the authorized developer complete legal/policy attestations. » **Continue**, **Exit**, l’installation du plugin et la préparation du paquet ne prouvent pas une soumission. Les attestations, Submit et la publication après approbation restent distincts.

## Historique conservé du 21 septembre

**État consigné à cette date : brouillon créé, aucune soumission ni publication encore observée.** Les sections suivantes décrivent cette préparation historique, ses exigences de formulaire et ses blocages d’alors. Les mentions « à publier », « aucun compte », « aucun scan », « aucune vidéo » ou « aucune soumission » ne décrivent pas l’état courant du 2 octobre. Les anciennes observations 404 et les anciennes versions du catalogue sont conservées pour leur provenance. La PR [#14](https://github.com/nclsppr/guteneo/pull/14) était alors présentée comme un candidat.

## Préparation complémentaire du 21 septembre

L’éditeur a explicitement autorisé la publication des pages, la vérification du domaine, la création du compte de revue, les tests, la vidéo et la soumission. Il indique avoir lu les conditions et autorise leur validation. Cette autorisation ne remplace pas les preuves exigées pour les attestations.

Les pages `/confidentialite/`, `/conditions/` et `/support/` sont maintenant implémentées avec liens partagés et HTML indexable. Les contrôles locaux ont réussi : types, lint ciblé, sept tests statiques et huit tests desktop/iPhone. Leur disponibilité publique doit encore être vérifiée après le déploiement de ce candidat. Les observations 404 ci-dessous sont historiques. Les descriptions d’import et de création PDF ainsi que le workflow et le skill fax relaient les restrictions du parcours ChatGPT ; aucun filtre automatique de contenu ni nouveau consentement serveur n’est annoncé.

Le composer dispose désormais d’un [dérivé transparent contrôlé](../integrations/chatgpt/icon-audit.md), créé avec ImageGen à partir de l’emblème : PNG RGBA de 1 254 × 1 254 px, 977 001 octets, SHA-256 `2dd792b032c4e244072494fef71344aa270893c4bf8e92c44600234eccb394cc`. Le logo d’annuaire reste inchangé. Le dérivé a été téléversé pour les modes clair et sombre, leurs aperçus ont été inspectés et la persistance après rechargement a été confirmée. L’archive 0.2.1 reconstruite avec cette image pèse 1 265 171 octets, SHA-256 `18485c5a5215175f051873fb2db0c15ea145ae83ad54e8d58ac2b3b7df2885a1` ; les empreintes d’archives antérieures ci-dessous restent historiques.

Le portail affiche le callback exact `https://chatgpt.com/connector/oauth/aAwc9dso12_L` pour un client prédéfini public. Un script ciblé prépare un client et une identité de revue isolés, sans modifier les Actions, MFA ou réglages du tenant. La revue a conduit à remplacer les recherches de sous-chaînes par une comparaison exacte des deux Actions déployées à leurs sources générées. Dix-neuf tests Auth0 et reviewer valident ces garde-fous sans réseau ; ils ne prouvent pas la connexion réelle. La reconnexion de l’administration Auth0 a expiré en attendant Touch ID ; elle doit être relancée. Aucun compte ou nouveau client n’a encore été créé.

Le PDF d’exemple est synthétique et sans destinataire ; le [scénario de capture](../integrations/chatgpt/demo-recording.md) est prêt. Ni vidéo ni recette exécutée avec un compte reviewer ne sont déclarées. Cloudflare confirme le rattachement existant de `guteneo.com` au Worker `guteneo-app`. Le jeton exact du challenge OpenAI a depuis été reçu dans le portail et commité dans la PR #23 ; son déploiement public et la réussite de **Verify Domain** restent à établir.

Les trois URLs publiques sont renseignées et persistent après rechargement. Le portail utilise une fiche de base anglaise : sous-titre « PDFs, fax quotes and tracking », description traduite mentionnant l’interface web française, et traduction française distincte. Les cinq scénarios positifs et les trois négatifs sont amorcés comme attendus de revue, sans preuve d’exécution ; le prompt exact de préparation du fax attend encore le destinataire contrôlé et son plafond. À ce stade initial, le compte, la vidéo et le scan restaient manquants ; le challenge a depuis été reçu et commité, sans preuve de déploiement ou de validation.

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

| Champ                        | Valeur                                                          |
| ---------------------------- | --------------------------------------------------------------- |
| Nom                          | Guteneo                                                         |
| Description courte           | PDF, devis et suivi des envois                                  |
| Catégorie / langue           | Productivity / Français (`fr-FR`)                               |
| Site / support               | `https://guteneo.com` / `guteneo@pieper.fr`                     |
| MCP universel                | `https://guteneo.com/mcp`                                       |
| Transport / authentification | Streamable HTTP / OAuth par utilisateur                         |
| Ressource / autorité OAuth   | `https://guteneo.com/mcp` / `https://pieper.eu.auth0.com`       |
| Logo                         | `https://guteneo.com/brand/guteneo-mark.png`                    |
| Captures d’UI native         | Aucune : le serveur ne fournit pas d’UI MCP native              |
| Politique de confidentialité | URL complète de politique réelle encore absente                 |
| Client/callback/reviewer     | À configurer et vérifier ; aucune valeur fictive                |
| Enregistrement de démo       | URL absente ; ne pas remplacer par une capture du site          |
| Challenge du domaine         | Jeton reçu et commité ; déploiement et vérification non obtenus |

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

L’URL de challenge observée dans le brouillon est `https://guteneo.com/.well-known/openai-apps-challenge`. Le portail a maintenant fourni le jeton exact, commité dans [l’asset public de la PR #23](../apps/web/public/.well-known/openai-apps-challenge) : 43 octets, sans retour à la ligne. Le build conserve ces octets et le Worker local répond `200 text/plain; charset=utf-8` ; ces contrôles locaux ne prouvent pas un déploiement. Publier cet asset, vérifier les octets à l’URL publique, puis obtenir **Verify Domain** dans le portail. Ne pas demander ou substituer un nouveau jeton tant que ce challenge reste celui du brouillon. Aucun jeton ne doit être inventé, ni celui d’un autre plugin écrasé. La [documentation de soumission](https://developers.openai.com/plugins/deploy/submission#domain-verification) décrit le choix de l’origine autorisée. La lecture de l’URL ne constitue pas la réussite du challenge.

Pour chaque outil scanné, fournir séparément la valeur et la justification de `readOnlyHint`, `openWorldHint` et `destructiveHint`. Les justifications doivent expliquer les effets réels, notamment l’import, les écritures de revue, le transfert du brouillon postal et l’envoi irréversible. Le renouvellement par `prepare_fax` peut annuler la préparation précédente : le candidat le déclare comme effet destructif, sans impliquer un envoi. Les justifications ne corrigent pas une annotation fausse côté serveur. Le scan courant et la vidéo ne sont pas encore qualifiés pour cette soumission.

Les [justifications des 22 outils du candidat](../integrations/chatgpt/tool-annotations.md) sont préparées à partir du code. Elles devront correspondre au snapshot publié et scanné.

## Points restant à résoudre

1. **Finaliser le brouillon :** l’identité individuelle vérifiée, les informations relues, les logos, les amorces et les notes persistent. Confirmer langue et pays ; les valeurs par défaut du portail n’ont pas été validées par l’éditeur.
2. **Politique réelle publiée :** la page actuelle ne couvre pas les données du service authentifié. Le [brouillon de travail](CHATGPT_PRIVACY_DRAFT.md) fournit des faits à valider, pas une politique adoptée. La page canonique doit cesser de présenter les traitements réels comme une simple mémoire d’onglet.
3. **Reviewer :** aucun compte dédié avec exemples et accès sans étape supplémentaire n’a été fourni/testé pour ce dossier. Transmettre les credentials uniquement dans les champs privés du portail.
4. **Projet et OAuth :** terminer le scan exigé avant l’enregistrement effectif de l’URL MCP et d’OAuth, puis qualifier le client et son callback. Aucun scan réussi ni flux OAuth de cette soumission n’a été observé. Le challenge reçu et commité attend encore son déploiement et sa validation par le portail. La cause de l’absence de résultat du scan n’est pas établie. Contrôler aussi les caractéristiques du projet, notamment la résidence **Global**.
5. **Conditions, support et disponibilité :** publier les URLs de conditions d’utilisation et de support demandées par la soumission, et choisir explicitement les pays de disponibilité du plugin. Le contact e-mail existe, mais ne remplace pas une URL requise. La disponibilité du plugin ne doit pas être confondue avec les routes fax réellement qualifiées.
6. **Recette et scan :** valider avec le compte reviewer les cinq cas positifs et les trois prompts négatifs R1/R2/R3 préparés selon le critère « ne pas appeler le plugin ». Vérifier le challenge du domaine, scanner les outils du serveur publié et fournir les justifications de toutes leurs annotations. Conserver les refus d’autorisation comme contrôles internes.
7. **Vidéo et notes de version :** enregistrer le parcours réellement disponible sur les surfaces annoncées, sans secret ni donnée sensible, et fournir son URL accessible aux reviewers. Les notes du listing décrivent le candidat ; elles ne déclarent pas une version déjà publiée.

Les achats sont désactivés. Les règles OpenAI permettent l’accès aux fonctions d’un compte existant mais interdisent la vente de services ou crédits numériques dans le plugin et les liens déclenchant leur achat. Ne pas ajouter recharge, souscription ou paiement intégré. Le statut juridique/commercial doit être confirmé par l’éditeur ; ce dossier n’est pas une autorisation contractuelle.

## Après résolution

Compléter le brouillon existant, qualifier MCP/OAuth, obtenir **Scan Tools**, compléter champs et justifications à partir du serveur et des tests effectifs, puis **Submit for review**. Après approbation OpenAI, **Publish** est distinct. Conserver identifiant, version, statut et URL d’annuaire. Ne cocher aucune attestation non établie.

Le dossier cible ChatGPT. Si le portail distribue aussi sur Codex, qualifier les fonctions annoncées sur cette surface avant de les attester. Ne pas joindre de captures du site en prétendant qu’il s’agit d’UI MCP native.

Sources de reprise ouvertes le 21 septembre 2026 : [soumission](https://developers.openai.com/plugins/deploy/submission), [erreurs et contraintes finales](https://developers.openai.com/plugins/deploy/submission-errors#final-directory-submission). Références du dossier historique : [revue MCP](https://developers.openai.com/plugins/deploy/app-review), [règles des plugins](https://developers.openai.com/plugins/app-guidelines), [portail](https://platform.openai.com/plugins). OpenAI contrôle l’approbation et ses délais.
