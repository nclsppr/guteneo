# Préparer un PDF postal Pingen

Vérification officielle : **17 septembre 2026**. Version locale : `pingen-2026-09-17-v1`. Ce document distingue les règles Pingen, les restrictions de la bêta Guteneo et les preuves encore nécessaires. La documentation fournisseur reste l’autorité pour son acceptation.

## Fichier et profil

Pingen demande un PDF A4 de **210 × 297 mm**, limité à **8 MB**. Guteneo interprète ce plafond prudemment comme **8 000 000 octets** et conserve sa limite existante de **100 pages**, inférieure aux 320 pages annoncées pour FR/LU/DE. Chaque page compte, y compris les pages blanches. Le recto verso réduit le nombre de feuilles à `ceil(pages / 2)` ; il ne divise pas le nombre de pages du PDF. [Pingen : Letter standards](https://help.pingen.com/en/templates-and-postal-requirements/letter-standards).

Le premier profil du compte qualifié est `default_country=LU`, fenêtre gauche. Ne pas déduire ce paramètre de l’adresse de l’utilisateur. Le serveur le lit dans l’organisation Pingen. Pour un compte français, la fenêtre droite est requise ; le gabarit français concerne la destination France. Les lettres de ce compte à destination d’autres pays suivent le gabarit général. Une lettre vers la France depuis un compte non français suit les exigences DHL et le gabarit général, pas le circuit La Poste local.

## Géométrie du document final

Unités : **mm, origine en haut à gauche**, avant toute rotation. Les rectangles suivants sont ceux des pages officielles, pas une estimation à partir d’une capture.

| Profil                    | Adresse page 1 : x, y, largeur, hauteur | Ensemble réservé page 1 : x, y, largeur, hauteur | Coin réservé sur chaque page |
| ------------------------- | --------------------------------------- | ------------------------------------------------ | ---------------------------- |
| Général, fenêtre gauche   | 22 ; 60 ; 85,5 ; 25,5                   | 20 ; 40 ; 89,5 ; 47,5                            | Bas gauche : 15 × 15         |
| Général, fenêtre droite   | 118 ; 60 ; 85,5 ; 25,5                  | 116 ; 40 ; 89,5 ; 47,5                           | Bas gauche : 15 × 15         |
| Compte FR, destination FR | 110 ; 50 ; 80 ; 28                      | 90 ; 30 ; 115 ; 64                               | Haut droit : 20 × 20         |

L’ensemble réservé contient le rectangle d’adresse : **seul le destinataire** est permis dans ce dernier, le reste doit être blanc. Conserver aussi **5 mm vierges sur les quatre bords de chaque page**. Logos, traits, numéros, repères de gabarit, filigranes et pixels gris sont du contenu. Les schémas officiels des coins ont été inspectés visuellement. [Gabarit général](https://help.pingen.com/en/templates-and-postal-requirements/layout-requirements), [gabarit français et exception internationale](https://help.pingen.com/en/templates-and-postal-requirements/layout-requirements-french-organisations).

Pour créer une nouvelle lettre : police lisible sans empattement, noire, normale, 10–12 pt, alignement gauche, aucune ligne vide. Réserver une marge intérieure supplémentaire ; ne pas placer les glyphes exactement sur la limite de la fenêtre. Ne jamais utiliser de coordonnées PDF partant du bas sans conversion `y_bas = hauteur_page − y_haut − hauteur_bloc`. Le rendu final, et non le CSS ou le prompt, détermine la position.

## Adresse et papier

L’adresse doit déjà figurer dans le PDF. Le parcours original conserve les octets : aucun déplacement, ajout de couverture, changement de taille ou aplatissage implicite. Une correction produit explicitement un nouveau document, une nouvelle empreinte et une nouvelle approbation.

| Destination  | Contrôles utiles et limites                                                                                                                                                                                                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LU           | 3–6 lignes hors pays ; rue puis numéro ; code de 4 chiffres, préfixe `L-` conseillé, puis localité. Pas de pays final pour un courrier local LU ; pays final requis à l’international. Police 8–12 pt, préférence 10–12. [Règles bpost LU](https://help.pingen.com/en/templates-and-postal-requirements/address-requirements-bpost-luxembourg). |
| DE           | Rue puis numéro, code de 5 chiffres puis ville ; pas de préfixe `DE-` ou `D-`. Les grands destinataires à deux lignes restent hors profil simplifié Guteneo. Pas de pays final pour le circuit domestique DE. [Règles Deutsche Post](https://help.pingen.com/en/templates-and-postal-requirements/address-requirements-deutsche-post).          |
| FR local     | 3–6 lignes, 38 caractères maximum par ligne ; numéro puis rue ; code de 5 chiffres puis ville en capitales. Supprimer la ponctuation à partir de la ligne de rue. Vérifier aussi espacements et hauteur des caractères. [Règles La Poste](https://help.pingen.com/en/templates-and-postal-requirements/address-requirements-la-poste).          |
| FR depuis LU | Appliquer le circuit international DHL ; dernière ligne `FRANCE`. Les règles locales françaises ne suffisent pas à qualifier ce trajet. [Règles DHL](https://help.pingen.com/en/templates-and-postal-requirements/address-requirements-dhl-international).                                                                                      |

Le helper accepte délibérément une forme canonique restreinte pour le pays final : `FRANCE`, `GERMANY`, `LUXEMBOURG`. Les autres graphies reconnues par Pingen peuvent être ajoutées après tests ; ce rejet conservateur n’affirme pas qu’elles sont invalides chez le fournisseur. Pingen publie sa [liste des noms de pays](https://help.pingen.com/en/templates-and-postal-requirements/supported-country-names). Cette page générale omet actuellement LU dans les exceptions domestiques ; la page LU plus précise exige l’absence de pays en local.

La bêta propose papier `normal`, `simplex`/`duplex`, `grayscale`/`color`, `fast`/`cheap` **lorsque le calculateur du compte les accepte**. Pas de papier SEPA, QR-facture, recommandé ou remplacement automatique d’un produit. Pingen détecte les types de papier par page ; conserver le tableau retourné pour le devis au lieu de fabriquer une équivalence avec le nombre de feuilles. [Papiers](https://help.pingen.com/en/printing-and-paper-options/supported-paper-types), [impression](https://help.pingen.com/en/printing-and-paper-options/print-options).

L’expéditeur vérifié et la gestion des retours sont deux contrôles distincts du destinataire. Une adresse imprimée en en-tête ne garantit pas le retour physique : Pingen décrit un traitement numérique des plis non distribuables et leur destruction sans ouverture. Ne pas annoncer un renvoi postal à l’expéditeur. [Retours Pingen](https://help.pingen.com/en/submit-and-send-letters/digital-returns-processing).

## Contrôles livrés et raccordement

`packages/contracts/src/pingen-preflight.ts` exporte :

- `preflightPingenPdf(bytes, options)` : lit les octets exacts, empreinte, nombre de pages/feuilles, A4, cadrage, rotation, unité PDF, formulaires, annotations, polices déclarées incorporées. Aucun réseau ni sauvegarde/modification. Il retourne `blocked` ou `review_required`, jamais une autorisation d’envoyer (`canSend: false`). Les restrictions annotations, rotation, cadrage et polices sont des choix conservateurs Guteneo. Le contrôle du fichier de police ne certifie pas la qualité de son programme.
- `pingenLayout(options)` : profil et rectangles en mm.
- `checkPingenAddress(lines, options)` : syntaxe bornée, sans normalisation silencieuse ; ne vérifie ni l’existence de l’adresse ni le contenu réel du PDF.
- `checkPingenRaster(input, options)` : pixels RGBA opaques rendus par le service isolé de confiance, minimum environ 144 dpi, maximum 10 millions de pixels/page ; vérifie les bords et coins sur chaque page, la zone d’affranchissement et la présence d’encre dans la fenêtre page 1. Tout pixel non blanc dans une zone interdite bloque. L’empreinte du rendu doit correspondre à celle du document.

Intégrer **après le scan qualifié et avant le dépôt fournisseur**, dans le service documentaire isolé. Le raster doit provenir des octets privés vérifiés, jamais du navigateur ou du LLM. Exiger un résultat pour chacune des pages, dans l’ordre, sans échantillonner seulement la première. La simple présence d’encre ne prouve pas qu’il s’agit d’une adresse : extraction de texte dans la fenêtre, comparaison au destinataire normalisé et examen visuel restent nécessaires. Images, glyphes vectorisés, texte invisible, superpositions et doublons imposent une revue. Un LLM peut assister cette revue, pas attester à lui seul la géométrie ou une identité.

Pour la revue finale : hash, nombre de pages, adresse extraite exacte, pays, fenêtre, papier détecté, options, montant fournisseur qualifié et prix client gelé doivent appartenir au même brouillon/manifest. Revalider droits et document avant chaque effet externe. Ne pas utiliser le résultat local comme jeton d’approbation. Les outils MCP n’accordent jamais le consentement humain.

Le candidat applicatif raccorde maintenant ces contrôles au renderer privé et à une revue navigateur. Leur présence dans le code ne prouve pas encore leur qualification distante ni le dépôt Pingen. Le connecteur applique également le plafond 8 000 000 octets. L’adresse attendue utilise le pays par défaut du compte qualifié ; elle conserve la dernière ligne de pays pour un destinataire international. Voir [le service documentaire](DOCUMENT_POSTAL_PREFLIGHT.md) pour la preuve du renderer et [la release](LIVE_RELEASE.md) pour l’état publié.

## Parcours du candidat REST et MCP

1. Lire `GET /api/postal/requirements?country=LU` ou `get_postal_requirements` avant de créer le PDF ; remplacer LU par le pays du destinataire. Le profil de l’organisation est lu chez Pingen, sans envoi de document. `qualified:true` concerne uniquement le profil.
2. Après import et scan qualifié, `POST /api/postal/preflights` ou `preflight_postal_pdf` reçoit le document, l’expéditeur, le destinataire, les options et le plafond. Les scopes OAuth `documents:write` et `dispatches:prepare` sont tous deux nécessaires. La clé d’idempotence protège aussi la consommation du quota de contrôle.
3. `GET /api/postal/preflights/{id}` ou `get_postal_preflight` expose l’état, le texte d’adresse, le lien de l’extrait PNG privé et `reviewUrl`. Ni cette lecture ni la préparation n’envoie le PDF à Pingen. Le rapport conserve `canSend:false`.
4. La session navigateur ouvre `/#/app/postal/{id}`. Elle présente les pages, l’adresse attendue et extraite, les anomalies et les options. Les deux cases explicites autorisent la revue puis le transfert de cette version précise ; le POST privé `/transfer` exige session actuelle et CSRF. Aucun outil MCP ni jeton OAuth ne peut le remplacer.
5. Le transfert crée uniquement un brouillon avec `auto_send:false`. Une réponse perdue oblige l’interface à relire l’état ; `unknown` ne réactive pas une création. Un échec de chargement de l’extrait bloque la confirmation et peut être repris par « Actualiser ».
6. Après dépôt consenti, `POST /api/postal/preflights/{id}/quote` ou `quote_postal_draft` demande le devis du même brouillon. Aucun document, prix ou destinataire n’est repris depuis un corps client. Pingen peut répondre que l’analyse n’est pas terminée ; conserver la même clé. L’approbation du devis et l’expédition sont des étapes distinctes.

`POSTAL_DRAFTS_ENABLED` contrôle la préparation fournisseur ; `LIVE_SENDS_ENABLED` contrôle toujours les expéditions. Les drapeaux seuls ne remplacent ni les preuves de scan/rendu, ni l’expéditeur, ni le profil, ni le devis. Le candidat est vérifié avec des données synthétiques ; l’activation et les essais réels restent des preuves séparées.

## Qualification distante sans expédition

Source normative lue : [OpenAPI Pingen courant](https://api.pingen.com/documentation/swagger-docs), [documentation](https://api.pingen.com/documentation). Les exemples de calculateur utilisent parfois `type: letters` ; le schéma `LetterPriceCalculatorPOST` donne `letter_price_calculator`, retenu dans Guteneo.

1. **Sans PDF** : OAuth client credentials avec scope `letter`, puis `POST /organisations/{id}/deliveries/letters/price-calculator`, JSON:API avec `country`, `paper_types`, `print_mode`, `print_spectrum`, `delivery_product`. `200` donne `data.attributes.currency` et `price`; `202` reste indéterminé. Cela ne crée pas une lettre. Le scope est toutefois capable d’envoyer : limiter le code de test aux méthodes et chemins exacts, sans proxy arbitraire ni journalisation de jeton.
2. **Brouillon autorisé séparément** : `GET /file-upload`, PUT des seuls octets autorisés vers l’origine fournisseur épinglée, puis `POST /organisations/{id}/deliveries/letters` avec `auto_send:false`, sans preset. C’est un transfert externe, même sans expédition. Persister l’identifiant et la clé d’idempotence avant les opérations suivantes ; réponse incertaine = rapprochement, pas création répétée.
3. Lire `GET /organisations/{id}/deliveries/letters/{letterId}` jusqu’à résultat borné : `address`, `country`, `file_pages`, `paper_types`, `fonts`, état et `meta.abilities.self.submit`. La création `201` ne prouve pas l’analyse terminée. Examiner l’aperçu dans la WebApp sans action de correction/envoi. Aucun `PATCH .../send` lors de ce test.
4. Les chemins `/file-validation`, `/extract-text`, `/cost-details` et `/calculate-prices` apparaissent dans l’OpenAPI public avec objets de chemin vides lors de cette vérification : aucune méthode ni réponse documentée ne doit être inventée. Le mécanisme de nettoyage du brouillon doit être qualifié avant son automatisation ; suppression et annulation ne sont pas interchangeables.
5. **Staging** : `identity-staging.pingen.com` et `api-staging.pingen.com`, compte et identifiants distincts. Pingen annonce qu’aucune lettre n’y est imprimée ou distribuée. L’accès production ne démontre pas un accès staging. Garder cette preuve distincte d’un brouillon production et de la simulation locale.

Le calculateur prépare une estimation fournisseur ; il faut encore qualifier devise, taxes, frais et validité avant de figer le prix client à deux fois le coût fournisseur total. Aucun crédit ni montant inconnu n’autorise un envoi gratuit. Les identifiants de document, secrets, URL signées et adresses ne doivent pas apparaître dans les journaux de test.

Validation locale : `npx vitest run tests/unit/pingen-preflight.test.ts --reporter=default`, typecheck et lint ciblé. Fixtures synthétiques exclusivement ; aucun dépôt ou courrier réel exécuté par ce module.
