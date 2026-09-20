# Démonstration vidéo pour la revue OpenAI

Préparé le **21 septembre 2026**. **Scénario prêt ; aucun enregistrement ni résultat de recette n’est attesté par ce document.** La vidéo finale doit montrer le vrai client ChatGPT relié au serveur publié, avec le compte reviewer dédié. La recette de référence est [reviewer-tests.md](reviewer-tests.md).

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

État à l’écriture : aucune vidéo créée, aucune URL publiée et aucun cas reviewer qualifié par ce document.
