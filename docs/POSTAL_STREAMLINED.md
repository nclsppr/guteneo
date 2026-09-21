# Parcours courrier simplifié — candidat du 21 septembre 2026

## Expérience proposée

À partir d’un PDF importé et d’un expéditeur configuré, trois actions explicites suffisent :

1. **Préparer le courrier** : destinataire, fenêtre gauche/droite, options. La création facultative d’une page d’adresse puis le contrôle du PDF final s’enchaînent sans second bouton. Le PDF original est conservé. Un expéditeur manquant peut être déclaré dans cette même page par un administrateur.
2. **Valider le document et obtenir le prix** : l’utilisateur parcourt les pages et vérifie la fenêtre/l’adresse de retour. Le texte du bouton et son explication portent les deux déclarations de revue et de transfert. Les deux cases séparées sont supprimées ; les valeurs serveur `reviewed:true` et `consentToTransfer:true` restent exigées. Ce clic transmet uniquement le document pour analyse, sans impression ni envoi.
3. **Envoyer pour le prix exact affiché** : le navigateur approuve l’empreinte puis demande l’acceptation, avec la clé stable `web-confirm:<dispatchId>`. La réservation et la mise en file restent atomiques côté serveur. Le prix, sa validité et les options enregistrées sont visibles avant ce clic. Fax et e-mail conservent leur propre parcours.

Le suivi du devis retente uniquement la réponse explicite `POSTAL_DRAFT_NOT_READY`, au maximum 20 fois à 3 secondes d’intervalle. La clé `web-postal-quote:<preflightPath>` reste identique après retour/rechargement. Toute autre erreur arrête ce suivi ; un résultat de transfert ou d’envoi incertain n’est jamais relancé automatiquement. Une modification des champs pendant le scan interrompt la continuation et exige une nouvelle préparation.

Les textes ordinaires du portail, du MCP, du suivi et du skill parlent de Guteneo ou du prestataire d’impression. Les mentions légales/confidentialité et les identifiants, sources et preuves techniques internes conservent le fournisseur réel.

## Fenêtre liée au courrier

`PostalReviewInput.options.addressPosition` et `PostalAddressPageInput.addressPosition` acceptent facultativement `left|right`. Sans valeur, le défaut qualifié reste utilisé. `GET /api/postal/requirements` et `get_postal_requirements` acceptent le même choix ; `profile.addressPositions` indique les côtés disponibles. Les profils LU/DE autorisent les deux ; le profil fournisseur FR autorise uniquement la droite. Cette contrainte dépend du profil de l’organisation, pas du seul pays destinataire.

Le côté est lié à la requête, au PDF dérivé, au profil gelé, au contrôle raster, au brouillon et au devis. Changer le côté ne déplace jamais l’adresse d’un PDF original. Un PDF dérivé pour un côté ne peut pas être contrôlé ou envoyé avec l’autre.

Sources techniques vérifiées : [API de création de lettre](https://api.pingen.com/documentation/swagger-docs), [mise en page générale](https://help.pingen.com/en/templates-and-postal-requirements/layout-requirements), [profil France](https://help.pingen.com/en/templates-and-postal-requirements/layout-requirements-french-organisations). Aucun défaut global du compte fournisseur n’est modifié. Le côté du brouillon relu chez le prestataire est comparé au côté attendu lors du devis et de nouveau avant l’envoi. Une modification externe bloque la suite, sans changer la sérialisation des empreintes de prix historiques.

## Compatibilité et migration

La migration `0036_postal_window_options.sql` accepte les générations de 8 ou 16 politiques. Les profils non français configurés créent 16 combinaisons ; les profils français en conservent 8.

Les comptes existants possédant une génération qualifiée complète, courante, sont étendus aux deux côtés avec les mêmes dates, preuves et états. Les 8 politiques historiques et les anciens devis sont conservés. Une politique révoquée est copiée révoquée ; une qualification manuelle pour l’autre côté n’est pas écrasée. Une génération expirée n’est pas prolongée par migration : son renouvellement explicite existant produit 16 combinaisons. Aucun mandat expert, quota, crédit, expéditeur ou arrêt de canal n’est modifié.

## Preuve et limites

Les tests utilisent des organisations/PDF synthétiques, D1/R2 locaux et appels fournisseur interceptés. Ils couvrent les deux côtés, la provenance, les empreintes, les générations actives/expirées/révoquées, la préparation automatique, les retours/rechargements, les interruptions et l’envoi final à prix exact. Le renderer réel local vérifie aussi une couverture LU à droite.

La publication, les migrations distantes et la qualification dans les clients ChatGPT/Claude sont des preuves séparées. Aucun courrier réel n’est envoyé pour cette validation. Voir [LIVE_RELEASE.md](LIVE_RELEASE.md) pour une publication effectivement vérifiée.
