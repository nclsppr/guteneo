# Démonstration vidéo pour la revue OpenAI

## État vérifié le 2 octobre 2026

La [vidéo historique du 21 septembre](https://guteneo.com/review/guteneo-chatgpt-demo-20260921.mp4) est accessible publiquement : GET **200**, **2 367 095 octets**, SHA-256 `8ff81c30eaefcb6bf319c8f8987cf543ffc300ba4e184eb7f3e83a0257928df2`, identique au fichier local. Cette vérification ne certifie ni de nouveaux appels d’outils ni la fraîcheur actuelle du compte reviewer.

Le scanner du portail a réalisé une nouvelle authentification OAuth et un **scan complet des 24 outils**. La mise à jour du brouillon MCP et sa sauvegarde par **Exit** ont donné **Version 0.2.3 · Not submitted** sur le tableau de bord. Les trois ZIP de skills individuels ont été importés : **get-started, fax-pdf et postal-pdf sont chacun Passed**, avec persistance vérifiée après rechargement de l’éditeur legacy. La description anglaise 0.2.3, **Not submitted** et **MCP configured** sont également relus. La vue globale **Metadata & Skills** indique séparément **No Skills in this version / Review Unavailable**, car aucun paquet global n’est importé sur cette ancienne application MCP ; elle ne remplace pas les trois résultats legacy. La page Submit ne signalait plus **Skills incomplete**, mais ses six cases de politique restaient décochées. Aucun **Submit** ni publication n’a été effectué.

La connexion MCP Guteneo Review du chat a été rétablie par le parcours moderne **Plugin page → Reconnect → Continue** dans ChatGPT Safari. Le `get_capabilities` réel a réussi dans **Codex** le `2026-10-02T16:02:05.789Z`, sans simulation ni activation du mode expert ; les anciens échecs de connexion restent historiques. Le compte, le tenant et le client reviewer attendus ont été rapprochés exactement dans D1 avant l’import. Le tarif reviewer est expiré depuis le **24 septembre** et son association historique au CSV Telnyx dépasse **168 heures** ; une connexion Telnyx du titulaire a été demandée pour relire les sources sans envoi. **P1/P2/P3 sont réussis comme appels MCP bornés dans Codex**, sans nouvel enregistrement : P2 liste un PDF avec `limit:5`, sans page suivante ; P3 déduplique le PDF synthétique exact de 4 290 octets et deux pages, `ready`, sans simulation, puis `get_document` confirme. Cette déduplication ne prouve pas une nouvelle analyse antivirus. P5/P6/R1/R2/R3 ne sont pas rejoués et la sélection automatique du plugin dans ChatGPT reste non qualifiée. Rétablir les références non envoyables valides avant de reprendre [reviewer-tests.md](reviewer-tests.md). Les lectures et l’import Codex ne remplacent pas de nouvelles séquences filmées dans ChatGPT.

Le ZIP global local courant 0.2.3 pèse **1 283 503 octets**, SHA-256 `962b67688b7947724b28fe8846594ea3ce4fd3180db4971ed75cc9a92d861d13` ; il n’a pas été téléversé globalement. Le refus historique de l’ancien ZIP ne s’applique pas à la preuve de sauvegarde du brouillon ni aux imports individuels de skills. L’approbation et la publication restent distinctes de ces préparatifs. Le Plugin Creator officiel v0.1.22 a été installé dans ChatGPT et ses instructions de préparation lues dans l’interface ; aucun nouvel outil local callable dans Codex ni API Submit n’a été observé. Il demande au développeur autorisé de compléter lui-même les attestations légales/de politique et ne transforme pas cette préparation en soumission.

## Scénario et procédure historiques

Le scénario ci-dessous a été préparé le **21 septembre 2026**, avant la mise à disposition de la vidéo. Les mentions de capture non éprouvée décrivent cet état initial. Il reste une procédure de reprise ; ses attentes ne sont pas des résultats observés. Toute nouvelle vidéo doit montrer le vrai client relié au serveur publié et distinguer les séquences historiques d’une nouvelle recette.

## Exigence et périmètre

OpenAI demande une URL de vidéo qui montre les principaux cas d’usage et outils sur les plateformes prises en charge. Les cinq cas positifs et trois cas négatifs du formulaire constituent une exigence séparée : une vidéo ne remplace pas leurs résultats observés. Source : [contraintes de soumission finale](https://developers.openai.com/plugins/deploy/submission-errors#final-directory-submission), relues le 21 septembre 2026.

Le parcours préparé montre les capacités, les documents, l’import du PDF exact, un devis de fax sans expédition et son statut. Il ne démontre pas un envoi, une livraison, un mandat expert, un transfert postal ni un paiement. Ajouter une séquence réelle si l’un de ces parcours est revendiqué dans la soumission. Si Codex fait partie des plateformes annoncées, filmer et qualifier séparément ses fonctions promises ; ne pas extrapoler une preuve ChatGPT.

## Capture disponible sur le poste

Aucun outil de capture vidéo directe n’a été trouvé parmi les outils connectés. L’inventaire CUA expose les applications natives macOS et l’API permet d’ouvrir QuickTime Player par son nom, même s’il n’est pas encore lancé. **Cette voie reste à éprouver dans l’interface ; l’inventaire ne prouve pas que l’enregistrement a réussi.** Un seul agent doit piloter le navigateur et l’enregistreur.

Procédure opératoire à effectuer entièrement avec les outils CUA :

1. Ouvrir QuickTime Player puis **Fichier → Nouvel enregistrement de l’écran**. Le raccourci Apple est `Ctrl + Cmd + N`.
2. Dans les contrôles macOS, sélectionner la fenêtre voulue si l’option existe, sinon une portion limitée au navigateur. Vérifier le cadrage dans l’état visible. Éviter les autres fenêtres, les onglets privés et les notifications.
3. Choisir un dossier de sortie identifié dans **Options**, désactiver microphone et audio système, et choisir SDR/H.264 si proposé. Le texte des prompts et réponses suffit pour cette démonstration.
4. Lancer l’enregistrement, exécuter le parcours réel ci-dessous, puis arrêter avec le bouton de la barre des menus ou `Cmd + Ctrl + Échap`.
5. Relire le fichier dans QuickTime et enregistrer sa copie de soumission. Le format natif peut être `.mov` ; ne pas renommer une extension pour prétendre avoir converti le fichier.

Ces contrôles et formats sont décrits par [Apple](https://support.apple.com/en-ie/102618). Il n’est pas nécessaire d’installer un enregistreur, de fabriquer des images de ChatGPT ou de capturer l’écran par un script externe à CUA. Si une permission macOS empêche la capture, consigner le libellé précis avant de décider de la suite.

## Préparation hors enregistrement

- Se connecter au compte reviewer dans une session neuve et vérifier le flux OAuth réel. Ne pas filmer les identifiants, l’adresse privée du compte, les jetons ni les URL de retour d’authentification. Une coupure explicite entre connexion et démonstration est acceptable ; elle ne doit pas être présentée comme la preuve filmée de la connexion.
- Ouvrir une conversation neuve, connecter Guteneo, masquer la liste des conversations personnelles et cadrer uniquement la fenêtre utile. Préparer le PDF synthétique original, sans données personnelles, ainsi que sa taille et son SHA-256 dans les preuves privées.
- Utiliser le numéro de recette contrôlé et le plafond déjà validés pour la recette. Ne pas inventer de destinataire, de crédit, de mandat ou d’autorisation pour obtenir une réponse favorable. Aucun bouton d’approbation ou d’envoi n’est nécessaire au scénario.
- Noter dans le rapport privé la date, la surface et le modèle ChatGPT, le SHA réellement publié, le snapshot MCP scanné, les scopes, les identifiants techniques du document et de la préparation. Ces identifiants ne sont pas à exposer dans un fichier public s’ils donnent accès à des ressources.

## Déroulé à filmer

Viser un enregistrement lisible, sans durée artificiellement imposée. Conserver les appels d’outils visibles et le temps nécessaire pour lire leurs résultats. Les attentes ci-dessous servent de critères de contrôle, jamais de réponses à écrire à la place du client.

| Séquence            | Action réelle dans ChatGPT                                                                                                                                             | Preuve visible recherchée                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 — capacités      | « Quelles fonctions sont disponibles sur mon compte Guteneo ? »                                                                                                        | Appel `get_capabilities`, réponse fidèle à l’état courant, aucune activation.                                                                                               |
| P2 — documents      | « Liste mes documents Guteneo, cinq au maximum. »                                                                                                                      | Appel `list_documents`, résultat borné et uniquement composé des données synthétiques du compte reviewer.                                                                   |
| P3 — original PDF   | Joindre le PDF puis demander : « Importe ce PDF et indique quand sa vérification est terminée. Ne prépare aucun envoi. »                                               | `import_document`, puis lecture de statut si nécessaire ; `ready` confirmé. La taille et l’empreinte sont contrôlées séparément, sans recopier de lien signé dans la vidéo. |
| P5 — devis          | Indiquer le destinataire de recette contrôlé et le plafond, puis : « Prépare un fax de ce PDF vers ce numéro, avec ce plafond. Présente le devis et ne l’envoie pas. » | `prepare_fax`, estimation et plafond distingués, échéance visible, aucun appel d’envoi. Le devis ne vaut pas paiement ou livraison.                                         |
| P6 — suivi          | « Où en est le fax de recette que nous venons de préparer ? »                                                                                                          | `get_dispatch_status`, état `prepared`, aucune tentative si le serveur expose cette donnée. Ne pas déduire zéro tentative d’un champ absent.                                |
| R1 — hors périmètre | Dans une nouvelle conversation sans PDF sensible : « Appose une signature électronique sur ce contrat PDF. »                                                           | Explication de la limite ; aucun outil Guteneo appelé.                                                                                                                      |
| R2 — hors périmètre | « Retrouve la pièce jointe de mon dernier message Gmail. »                                                                                                             | Aucun outil Guteneo ; aucune prétention d’accès à Gmail.                                                                                                                    |
| R3 — hors périmètre | « Envoie un SMS pour prévenir mon collègue de mon retard. »                                                                                                            | Aucun outil Guteneo ; aucune conversion en fax, courrier ou e-mail.                                                                                                         |

Les trois cas négatifs peuvent être regroupés en un segment distinct, dans des conversations neuves si nécessaire pour éviter le contexte du fax. Ne pas connecter de messagerie ni de service SMS pour satisfaire ces prompts : ils vérifient le choix de Guteneo.

Si ChatGPT ne peut pas transmettre la pièce jointe, n’expose pas l’outil, échoue à l’OAuth ou retourne une erreur, consigner l’échec. Un import via l’atelier ou un appel direct du serveur ne transforme pas ce cas en succès dans ChatGPT. Corriger, puis refaire la séquence concernée en conservant la distinction avec la première tentative.

## Vérification et mise à disposition

1. Relire toute la vidéo : texte lisible, appels réels, résultats concordants, aucune donnée personnelle, aucun secret ni URL signée. Conserver l’original local. Des coupes d’attente ou de connexion doivent rester évidentes et ne pas modifier l’ordre ou le sens des actions.
2. Reporter les résultats réellement observés des huit cas dans le rapport de recette, avec les horodatages de la vidéo quand ils sont utiles. Ne passer aucun cas à « réussi » sur la seule base de ce scénario.
3. Déposer uniquement la copie expurgée sur un hébergement existant autorisé. Vérifier en session déconnectée que le lien HTTPS exact permet sa lecture sans connexion, code ou permission supplémentaire. La présence d’un fichier local ne suffit pas.
4. Renseigner `demoRecordingUrl` et le champ privé de soumission seulement après ce contrôle. Garder la vidéo en dehors du paquet de plugin et du dépôt source ; enregistrer dans la preuve sa taille, sa durée, son empreinte et son URL accessible, sans secrets.

État à l’écriture initiale du scénario : aucune vidéo créée, aucune URL publiée et aucun cas reviewer qualifié par ce document. L’état courant du fichier vidéo et de son URL est consigné en tête ; aucun résultat de recette n’est déduit de ce scénario.
