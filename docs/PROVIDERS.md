# Connecteurs et raccordement

Vérification documentaire : **16 septembre 2026**. Code : `packages/providers/`. HTTP callbacks : `apps/api/src/webhooks.ts`. Les requêtes et signatures sont testées avec fixtures et D1 local. **Aucun compte fournisseur, sandbox distante ni transport réel n'a été utilisé.** Les adaptateurs réels sont développés ; la soumission de production reste désactivée dans l'orchestration tant que identité, scanner, tarifs, budgets et essais autorisés ne sont pas qualifiés.

## Contrat commun et garanties

`TelnyxFaxProvider`, `SesEmailProvider`, `PingenPostalProvider` exposent leurs capacités, une validation, une estimation, `submit`, `readStatus` et `cancel`. Une capacité absente est explicite : SES ne propose ici ni annulation ni lecture d'un message par ID. Son rapprochement utilise les événements. Une estimation inconnue vaut `amount: null` ; ce n'est pas un coût nul. Les montants connus sont des entiers en unité monétaire mineure et une devise.

Les clients n'autorisent pas un envoi. Le cœur doit conserver avant `submit` l'approbation du manifeste final, le plafond, la réservation, l'outbox et la tentative. Le connecteur ne reçoit qu'un destinataire. Il ne choisit jamais un canal de remplacement.

Chaque opération réseau est bornée, refuse les redirections et n'effectue aucun retry interne. Une réponse perdue, un 5xx, un timeout, un conflit ou une réponse d'acceptation illisible après soumission donne `submission_unknown`. Aucun quota ne doit alors être libéré sur la simple absence de réponse. Un rejet certain est distinct. Le seul rejet HTTP explicitement marqué transitoire est 429 ; sa reprise appartient au cœur et doit respecter ses baux, limites et délais. Ne pas ajouter des retries au SDK/Queue en parallèle.

Les trois annulations n'offrent pas les mêmes garanties. Une réponse acceptant une demande d'annulation devient `requested`, jamais `confirmed`. Le dashboard ne doit proposer une annulation réelle qu'après qualification de la capacité correspondante. Une nouvelle expédition volontaire possède une nouvelle commande liée à l'original.

## Fax : Telnyx

Le contrat [Send a fax](https://developers.telnyx.com/api-reference/programmable-fax-commands/send-a-fax) documente `POST https://api.telnyx.com/v2/faxes`, Bearer API key, `connection_id`, `from`, `to`, `media_url` et `client_state`. Le client encode dans `client_state` une référence opaque de commande, sans organisation ni contenu. `store_media` et `store_preview` sont désactivés. Une réponse 202 signifie seulement que la commande est acceptée ; `fax.delivered` fournit le résultat de transmission.

Préparer dans un compte Guteneo indépendant :

1. Une clé API serveur, une application fax et son `connection_id`, un numéro d'émission autorisé et le profil sortant requis. Aucun numéro de démonstration n'est fourni dans la configuration. Les valeurs numériques des tests sont exclusivement des fixtures locales jamais soumises.
2. Les pays sortants, le plafond de dépense et la concurrence fax du compte. Qualifier séparément Luxembourg, France et Allemagne avec un destinataire exact et son autorisation. Leur préfixe peut figurer dans la liste applicative autorisée sans prétendre qu'un appel y a réussi.
3. Un endpoint `https://<hôte>/webhooks/telnyx`, la clé publique Ed25519 du compte et le `connection_id` attendu.
4. Une URL HTTPS de document privée, temporaire, créée au moment de la soumission et limitée au document approuvé. Le client exige une origine serveur explicitement autorisée et au moins 20 minutes de validité résiduelle. Ce délai de garde n'est pas une garantie sur les files Telnyx : le TTL opérationnel et la durée de récupération doivent être qualifiés sous charge. Ne pas journaliser l'URL.

Configuration API : `TELNYX_API_KEY`, `TELNYX_PUBLIC_KEY`, `TELNYX_CONNECTION_ID`, `TELNYX_FROM`. Le constructeur reçoit aussi `webhookUrl`, `mediaOrigins` et `allowedDestinationPrefixes`. `readStatus` utilise `GET /v2/faxes/{id}` ; [l'annulation](https://developers.telnyx.com/api-reference/programmable-fax-commands/cancel-a-fax) utilise `POST /v2/faxes/{id}/actions/cancel`. DELETE supprime des données : ce n'est pas une annulation.

Le connecteur impose les limites documentées de 50 MB et 350 pages ; Guteneo peut être plus restrictif. Le pipeline doit avoir vérifié le PDF et son statut de scan avant de créer l'accès. La conservation des octets chez Guteneo est exacte ; la conversion de transport en télécopie ne préserve pas une signature numérique PDF.

La [documentation webhook fax](https://developers.telnyx.com/docs/programmable-fax/receiving-webhooks) indique des duplications et un ordre non garanti. Le code vérifie Ed25519 sur `timestamp + "|" + corps_original`, les headers `telnyx-signature-ed25519` / `telnyx-timestamp`, une fenêtre de 300 secondes et l'application fax. Il conserve les références orphelines. Le mécanisme est décrit par [Telnyx Support](https://support.telnyx.com/en/articles/4334722-how-to-leverage-webhooks). Synchroniser les horloges et tester les délais/reprises réels de callbacks.

La documentation mentionne une déduplication `command_id` pour certaines commandes, mais le schéma vérifié de création fax ne l'expose pas. **Aucune idempotence de création Telnyx n'est revendiquée**, aucun header arbitraire n'est envoyé. Une soumission incertaine exige lecture/rapprochement ou intervention, jamais un nouvel envoi automatique.

Tarif public consulté : [Telnyx Fax pricing](https://telnyx.com/pricing/fax), 0,007 USD/page **plus le transport SIP** ; numéro, destinations, durée, taxes et contrat peuvent ajouter des coûts. L'estimation applicative reste inconnue jusqu'à raccordement d'un tarif effectivement qualifié. [Prérequis officiels](https://developers.telnyx.com/docs/programmable-fax/get-started), [guide d'envoi](https://developers.telnyx.com/docs/programmable-fax/send-a-fax-api).

## E-mail : Amazon SES v2

`SesEmailProvider` signe la requête JSON avec `aws4fetch` et SigV4, service `ses`, puis effectue un unique fetch vers `https://email.<région>.amazonaws.com/v2/email/outbound-emails`. Il n'utilise ni SMTP ni SDK exigeant Node côté Worker. Le [contrat SendEmail v2](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html) accepte `Content.Simple`, HTML, texte, objet et désormais pièces jointes. `MessageId` est une acceptation, pas une remise ni une lecture.

Le connecteur envoie individuellement, fournit des tags de corrélation et le configuration set. Il limite les pièces jointes à cinq, à PDF/PNG/JPEG et à 20 MB de données brutes cumulées ; cette restriction est inférieure au plafond SES de 40 MB par message. Les octets autorisés sont encodés en base64 dans `RawContent`, avec `ContentTransferEncoding: BASE64`. Scanner et vérifier le type réel en amont. [Documentation officielle des pièces jointes](https://docs.aws.amazon.com/ses/latest/dg/attachments.html).

Raccordement :

1. Choisir explicitement une région SES UE disponible pour le compte ; l'identité et l'état sandbox sont régionaux. Vérifier le domaine d'émission, DKIM, SPF/MAIL FROM et DMARC. Le constructeur n'accepte que les expéditeurs serveur de `authorizedSenders`.
2. Créer un configuration set et activer les événements utiles, en particulier Send, Delivery, Bounce, Complaint, Reject et Rendering Failure. Désactiver suivi d'ouverture/clic. Séparer les paramètres de réputation des usages marketing et transactionnels. La version actuelle utilise un configuration set par instance de connecteur ; créer une instance/configuration distincte par politique avant l'activation marketing réelle.
3. Créer un principal IAM limité à `ses:SendEmail` dans la région, aux identités d'émission et au configuration set concernés, avec restriction `ses:FromAddress`. Vérifier la policy avec IAM Simulator contre les ressources exactes du compte. Ne pas accorder `ses:*`, ni une clé administrateur. Le rôle de provisioning des identités/SNS est séparé de celui d'envoi.
4. Fournir côté serveur `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `SES_CONFIGURATION_SET`; le client supporte aussi un `sessionToken` temporaire. Aucun secret dans Vite ou le navigateur.
5. Sortir de la sandbox seulement après validation opérationnelle. La sandbox est limitée à 200 messages/24 h et 1/s, vers identités vérifiées ou mailbox simulator. Le simulateur SES peut être facturé : il ne remplace pas notre simulateur local gratuit. [Accès production](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).

Le [publishing SES](https://docs.aws.amazon.com/ses/latest/dg/monitor-using-event-publishing.html) est raccordé à un topic SNS dédié autorisé par ARN exact (`SES_SNS_TOPIC_ARN`) et à `/webhooks/ses`. Le code vérifie l'enveloppe SNS avant de lire l'événement SES. Il exige **SignatureVersion 2**, à configurer explicitement sur le topic : la valeur par défaut SNS est 1. Le certificat provient uniquement du host HTTPS exact `sns.<région>.amazonaws.com`, d'un chemin officiel borné, sans redirection, query, credentials ou URL libre. La clé X509 est importée par `jose` et WebCrypto vérifie RSA-SHA256 sur la concaténation officielle, newline finale comprise. Une panne de récupération du certificat rend 503 pour permettre la reprise ; une signature invalide est rejetée avant stockage.

La confiance du certificat repose ici sur sa récupération auprès du host SNS officiel via la validation TLS du runtime ; le code ne construit pas un validateur X509/PKIX indépendant. Les tests prouvent la vérification RSA et le filtrage d'URL avec un certificat **de test auto-signé**, pas une connexion SNS distante. Les fichiers `fixtures/sns-test-key.pem` et `sns-test-cert.pem` sont des fixtures publiques sans pouvoir d'accès à aucun compte.

Les confirmations d'abonnement signées sont conservées comme reçu `unrecognized` avec le topic et le token, sans `SubscribeURL` ni contenu client. Aucun lien n'est suivi automatiquement. Un opérateur ayant accès au compte et à D1 confirme le **topic configuré** avec `aws sns confirm-subscription --region <region> --topic-arn <topic_attendu> --token <token_vérifié>`, puis efface le token de ce reçu. Ne pas exposer ces reçus bruts dans l'administration ordinaire, les exports ou les logs. [Vérification SNS](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html), [ordre canonique](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message-verify-message-signature.html), [configuration version 2](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message-configure-message-signature.html).

Le normaliseur conserve `bounceType` pour distinguer Permanent de Transient. Seuls hard bounces et plaintes doivent produire une suppression durable dans l'organisation concernée. Une Delivery signifie remise au serveur destinataire. Une plainte tardive reste un fait distinct. Les contacts ne figurent pas dans les métadonnées de callback conservées par cet adaptateur.

Pour le marketing, l'URL HTTPS de désinscription doit déjà apparaître dans les versions HTML **et** texte approuvées. Le connecteur ajoute les headers List-Unsubscribe/One-Click correspondant à cette URL ; le manifeste métier final doit également inclure cette politique et ces headers avant toute activation réelle. Le raccordement de l'endpoint public de désinscription et la qualification réputation constituent encore une condition d'ouverture marketing : un seul header ne réalise pas la désinscription. Pas d'idempotence SES vérifiée, pas de replay automatique d'une soumission inconnue.

La [tarification SES](https://aws.amazon.com/ses/pricing/) consultée distingue désormais les nouvelles offres : les comptes nouveaux ou compte/région inactifs depuis le 1er juin 2025 commencent en Essentials depuis le 21 juillet 2026, annoncé à 0,16 USD/1 000 e-mails. L'offre à la carte reste affichée à 0,10 USD/1 000 et 0,12 USD/GB de pièces jointes. Valider **l'offre du compte** ; SNS, données et autres options ne sont pas inclus implicitement. Aucun tarif commercial Guteneo n'en est déduit.

## Courrier postal : choix Pingen

Comparaison bornée sur sources officielles :

| Candidat                                                       | Éléments vérifiés                                                                                                                                                             | Décision                                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [Pingen](https://www.pingen.com/en/post-api/)                  | OAuth, API publique, staging annoncé sans expédition, PDF préadressé, devis par lettre, callbacks signés, idempotence 24 h ; FR/DE/LU nommés dans les options de distribution | Premier connecteur concret                                            |
| [LetterXpress v3](https://www.letterxpress.de/versandwege/api) | PDF base64, MD5, test/live, 50 MB, 120 req/min ; certaines opérations GET attendent une authentification dans le body, peu adaptée à fetch Workers                            | Alternative ; couverture FR/LU à qualifier explicitement              |
| [Stannp](https://www.stannp.com/uk/direct-mail-api/letters)    | API EU, test sans impression, PDF avec options de création/surimpression, [webhooks HMAC](https://www.stannp.com/uk/direct-mail-api/webhooks)                                 | Alternative ; couverture LU et préservation de l'original à qualifier |

Les [options Pingen](https://www.pingen.com/en/print-delivery-options/) identifient France/La Poste, Allemagne/Deutsche Post et Luxembourg/bpost. Cela démontre une offre annoncée, pas une validation du compte Guteneo ni des destinations réelles. Les délais affichés sont indicatifs. La [page sécurité](https://www.pingen.com/en/trust-security/) indique notamment l'hébergement en Suisse chez Cloudscale : ne pas présenter le traitement postal comme exclusivement UE.

### Contrat courant vérifié

Source normative : [OpenAPI Pingen](https://api.pingen.com/documentation/swagger-docs), découvert via la [documentation ReDoc](https://api.pingen.com/documentation). Attention : certains exemples marketing omettent encore `/deliveries` dans les chemins. Le code suit l'OpenAPI courant.

| Opération          | Contrat                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jeton              | POST `https://identity.pingen.com/auth/access-tokens`, form `grant_type=client_credentials`, client id/secret, scope `letter`                                  |
| Staging            | `https://identity-staging.pingen.com` et `https://api-staging.pingen.com`                                                                                      |
| Demande upload     | GET `/file-upload` → `url`, `url_signature`, expiration                                                                                                        |
| Transfert          | PUT des octets PDF exacts à `url`, sans Bearer token                                                                                                           |
| Création brouillon | POST `/organisations/{id}/deliveries/letters`, JSON:API `type: letters`, nom/url/signature, `address_position`, **`auto_send: false`**                         |
| Lecture            | GET `/organisations/{id}/deliveries/letters/{letterId}`                                                                                                        |
| Devis              | POST `/organisations/{id}/deliveries/letters/price-calculator`, JSON:API `type: letter_price_calculator`, pays, types papier, options ; 202 = calcul incomplet |
| Expédition         | PATCH `/organisations/{id}/deliveries/letters/{letterId}/send`, JSON:API options finales                                                                       |
| Annulation         | PATCH `/organisations/{id}/deliveries/letters/{letterId}/cancel`, 202 = demande reçue                                                                          |

`Idempotency-Key` est documenté pour POST/PATCH (1–64 caractères), réponses conservées 24 h, header de replay `Idempotent-Replayed`. Le connecteur utilise des clés stables pour création/expédition ; il n'en tire aucune garantie au-delà des 24 h et ne réessaie pas une soumission inconnue automatiquement.

Le destinataire doit déjà être imprimé dans la zone adresse du PDF. `prepareDocument` conserve les octets originaux, demande un brouillon sans envoi, puis retourne l'ID distant. Le cœur doit persister cet ID et attendre la fin du préflight Pingen avant approbation. `submit` relit le brouillon, compare le pays et l'adresse extraite à l'adresse approuvée, vérifie la capacité `submit`, les types papier et un devis inférieur ou égal au plafond approuvé. Un changement exige une nouvelle approbation. **Ne pas surimprimer silencieusement l'adresse dans le parcours “PDF exact”.** Un original incompatible est rejeté ; le parcours rendu peut créer explicitement une version distincte.

Restrictions initiales : FR/LU/DE, papier normal, simplex/duplex, grayscale/color, produits fast/cheap ; pas de recommandé, QR-facture, enveloppe personnalisée ou garantie de livraison. La région d'impression, le format, les marges, polices incorporées, adresse retour et couverture du produit doivent être vérifiés au préflight avec Pingen. Le code limite l'upload à 20 MB. L'origine d'upload doit être configurée depuis celle réellement fournie au compte (`uploadOrigins`) ; aucune liste permissive ou URL renvoyée arbitrairement n'est acceptée. Un secret ne va jamais à l'hôte de stockage.

Configuration API : `PINGEN_CLIENT_ID`, `PINGEN_CLIENT_SECRET`, `PINGEN_ORGANIZATION_ID`, `PINGEN_WEBHOOK_SECRET`. Le constructeur reçoit `sandbox: true` et les origines d'upload autorisées pour la première qualification. Le callback `/webhooks/pingen` vérifie `Signature` HMAC-SHA256 hexadécimal sur le corps original, l'organisation fournisseur et `deliverable.type === letters`.

`webhook_sent` signifie `handed_to_post`. `webhook_delivered` est conservé uniquement lorsqu'un événement signé et explicitement associé à une lettre fournit ce fait ; sa disponibilité n'est **pas promise** pour les produits courrier ordinaires retenus. `webhook_undeliverable` est un échec. `webhook_issues` est conservé en métadonnées non projetées : une difficulté remédiable n'est pas fabriquée en échec final. Les états fournisseur bruts restent consultables ; aucun inventaire complet de codes n'est supposé.

Prix : utiliser le calculateur authentifié par produit, pays et document. Une réponse 202 ou une absence de tarif n'autorise pas une expédition gratuite. Aucun prix catalogue non vérifié n'a été inscrit dans le code.

## Callbacks durables, réconciliation et exploitation

`handleWebhook(request, env, domain)` se place avant l'authentification navigateur sur `/webhooks/{telnyx|ses|pingen}`. Il limite le corps à 1 MB, vérifie la signature et le compte, puis insère une ligne `provider_receipts` idempotente. Seuls un événement normalisé ou des métadonnées minimales sont stockés ; aucun corps HTML/PDF ni liste de contacts. Une signature invalide n'atteint pas la base. Une panne de stockage rend 503, jamais 2xx. Une panne après stockage rend 202 et laisse `pending`.

`reconcileWebhookReceipts(db, domain, limit)` reprend au maximum 100 reçus indexés à chaque passage cron. Il ne fait aucun nouvel envoi. `projected` signifie transféré durablement au journal métier, même si le callback demeure orphelin dans ce journal ; cela ne signifie jamais “livré”. Les événements métier sont eux-mêmes dédupliqués, puis rapprochés de l'ID fournisseur/commande. Ne jamais dériver une organisation d'un paramètre d'URL ou d'un champ soumis par le modèle. Le choix de ne pas conserver les corps inconnus limite leur réinterprétation future : leurs métadonnées permettent le diagnostic, mais un nouveau normaliseur pourra nécessiter une consultation ou un replay autorisé chez le fournisseur.

Avant activation réelle, il reste à qualifier les ressources de lecture SNS et les renouvellements de certificats, la concurrence/quotas fournisseur, le scanning, la comptabilité finale, le budget de transport et la latence des callbacks avec les comptes Guteneo. L'administration doit alerter sur reçus `pending`, événements orphelins, états inconnus et files d'échec. La conservation des tokens SNS de confirmation est temporaire et restreinte aux opérateurs ; ne pas les exporter avec les métadonnées client.

## Preuves exécutées et prochaines qualifications

Commandes :

```sh
npx vitest run tests/unit/providers.test.ts tests/unit/providers-webhooks.test.ts --reporter=default --reporter=json --outputFile=reports/providers-vitest.json
npx eslint packages/providers apps/api/src/webhooks.ts tests/unit/providers*.test.ts
npm run typecheck
```

Les tests de contrat examinent les requêtes réellement construites : SigV4 SES et un seul destinataire, pièces jointes exactes, brouillon Pingen sans `auto_send`, transfert sans fuite de token, garde d'adresse/coût, absence de retry après réponse perdue. Les tests cryptographiques génèrent/signent de vrais messages Ed25519, HMAC et RSA, puis falsifient corps, compte, certificat ou timestamp. Les tests HTTP utilisent D1/Miniflare pour vérifier persistance avant ACK, déduplication, panne de projection/reprise, rejet avant stockage et 503 si le stockage manque.

Rapport : `reports/providers-vitest.json`. Les tests à fetch injecté valident les contrats locaux ; ils ne prouvent pas l'acceptation de ces requêtes par les comptes distants. La qualification suivante doit être explicite : Pingen staging (sans courrier physique), SES mailbox simulator (coût possible, autorisation requise), puis fax/e-mail/courrier réels vers des coordonnées fournies et autorisées. Conserver IDs, date, coût, résultats et limites de chaque essai. Ne pas mélanger ces résultats aux métriques de simulation locale.
