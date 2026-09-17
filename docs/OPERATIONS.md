# Suivi de production

Cette tranche ajoute un suivi localement testé ; sa présence dans Git ne prouve pas son déploiement. Vérifier la version Cloudflare et les réglages publiés après chaque livraison. Aucun envoi, paiement, activation de canal ou nouvelle infrastructure n’est effectué par les outils ci-dessous.

## En une minute

Exécuter `node scripts/production-status.mjs`. Cette commande effectue uniquement trois lectures anonymes sur `https://guteneo.com` : `/api/health`, `/api/capabilities` et `/release.json`. Elle ne lit aucun fichier de secrets, n’accepte aucun argument, refuse les redirections et affiche seulement une projection bornée : disponibilité, source publiée, configuration de l’identité/scanner et interrupteur d’envoi. `attention` produit un code de sortie 1. Un résultat `ok` ne prouve ni connexion réelle, ni parcours fournisseur, ni fonctionnement des files ou du cron ; `deliveryQualification` reste `not_checked`.

Ouvrir ensuite le Worker concerné puis **Observability** pour les journaux, **Metrics** pour les erreurs/durée CPU/requêtes, et **Deployments** pour la version :

- [Application Guteneo](https://dash.cloudflare.com/39ac9fada6cba44d9ecf09d467609e69/workers/services/view/guteneo-app/production).
- [Analyse et rendu des documents](https://dash.cloudflare.com/39ac9fada6cba44d9ecf09d467609e69/workers/services/view/guteneo-documents/production).
- [Scanner privé : métriques et déploiements, logs persistants désactivés](https://dash.cloudflare.com/39ac9fada6cba44d9ecf09d467609e69/workers/services/view/guteneo-scanner/production).

Ces tableaux demandent l’accès au compte Cloudflare. Le résumé public ne donne pas accès aux données internes ni à l’historique des incidents. Aucun service de notification, envoi d’alerte à un tiers, export de logs ou surveillance permanente supplémentaire n’est configuré.

## Lire les signaux

Les nouveaux événements applicatifs sont des objets JSON avec `schema: 1`, `component`, `event`, `correlationId`, `versionId`, `route`, `code`, `durationMs` et, selon le traitement, `method`, `status`, `stage` et des compteurs entiers. `versionId` vient du binding `WRANGLER_VERSION_METADATA` ; `unavailable` indique un binding absent/invalide, jamais un SHA supposé. Retrouver la version dans Deployments puis la preuve de publication pour connaître son commit. L’identifiant `X-Correlation-ID` de la réponse permet de retrouver le journal correspondant.

| Signal dans Observability | Interprétation et premier geste |
| --- | --- |
| `event=http`, `status>=500` | Erreur technique ou configuration. Filtrer `correlationId` et `versionId`, puis le code de route fixe. |
| `code=CONFIGURATION_INVALID` | Une validation de configuration a fermé la route ; le journal couvre aussi les sorties précoces avant authentification. |
| `event=cron`, `stage=complete` | Le cycle de maintenance s’est terminé. Une absence de cycle complet depuis 5 minutes appelle une vérification des métriques cron/déploiement ; ce seuil est une règle opérateur initiale, pas un SLO mesuré. |
| `code=CRON_FAILED` | Le cron reste en échec auprès de Cloudflare. `stage` désigne le premier travail interrompu, sans sérialiser l’exception. |
| `code=IDENTITY_NOT_CONFIGURED`, `stage=identity` | Les callbacks vérifiés ont été réconciliés, puis le reste du cron s’est arrêté conformément à la protection existante. |
| `event=queue`, `retried>0` | Messages redemandés par la file, y compris attente de 300 secondes si l’envoi est fermé. Aucune nouvelle autorisation d’envoi. |
| `deadLetters>0` | Messages reçus en file d’échec ou invalides, persistés avant acquittement. Examiner le registre privé existant ; ne pas les réinjecter automatiquement. |
| `unknown>0` ou `uncertain>0` | Résultat fournisseur inconnu, ou lease expirée. Réconciliation humaine/fournisseur avant toute action ; jamais de nouvelle soumission automatique. |
| `code=OUTBOX_DEFERRED` | L’acceptation et l’outbox sont déjà persistées ; publication différée au cron. Ne pas recréer l’envoi. |
| `pending>0` dans un cron | Des callbacks du lot borné restent à projeter. Ce nombre ne mesure pas la totalité du stock. |
| `component=documents`, `status>=500` | Échec du service privé. Un document reste soumis aux gardes de quarantaine existantes. Pour le scanner, utiliser les erreurs du parcours document et ses métriques Cloudflare ; sa collecte persistante reste fermée. |

Un résumé est émis par lot de queue et par cycle cron, avec les compteurs fournis par les opérations existantes. Il n’ajoute aucune lecture D1 de statistiques. `published` compte la publication d’outbox, pas des communications envoyées ; `acked` compte des messages traités, pas des livraisons. Les replays peuvent réapparaître dans ces compteurs : ne pas les utiliser pour la facturation ou des volumes uniques. La durée HTTP mesure le traitement jusqu’à la réponse, pas la réception complète d’un flux chez le client. Chaque Worker/lot a son propre UUID ; aucune propagation distribuée ni corrélation automatique d’un document ou destinataire n’est ajoutée.

## Données et coûts

Les événements ne sérialisent ni requête/réponse complète, ni corps, destinataire, identifiant d’utilisateur/organisation, document, contenu, jeton, cookie, URL, query string, exception libre ou stack. Les routes sont des codes fermés. Seuls les chemins connus et les identifiants opaques de format attendu sont journalisés ; les chemins inconnus et `/media/:token` restent silencieux. Les assets publics réussis ne produisent pas un journal par fichier. Les diagnostics SNS antérieurs conservent leurs codes fermés et leur format existant.

Les configurations hébergées de l’application et du moteur de documents demandent `observability.enabled=true`, `head_sampling_rate=1`, `logs.persist=true`, `invocation_logs=false`, `redact_query_string=true`, et désactivent les traces. Les variantes locales ne persistent pas les logs. Le scanner reste explicitement `observability.enabled=false` : son SDK Containers peut écrire une exception brute avant notre wrapper. Son instrumentation est prête, mais sa collecte persistante n’est pas activée dans cette release. Aucun bucket, Logpush, Tail Worker ou service externe n’est créé. Les protections d’authentification, quotas, devis, approbation et transitions d’envoi restent inchangées.

Au 17 septembre 2026, Cloudflare annonce 200 000 événements/jour et 3 jours de conservation sur Workers Free ; sur Workers Paid, 20 millions/mois inclus, puis 0,60 USD par million supplémentaire, avec 7 jours de conservation. L’inclusion est partagée avec les autres usages du compte ; le dépôt ne prouve pas la consommation restante. Un résumé cron/minute représente environ 43 200 événements pour 30 jours, avant HTTP, files, erreurs et moteur de documents. L’échantillonnage à 100 % convient à la qualification initiale ; surveiller la consommation et revoir la fréquence/collecte avant forte charge. Diminuer le head sampling peut aussi perdre des erreurs. Ces logs ne sont ni une sauvegarde ni un registre d’audit durable, et aucune résidence UE des logs n’est affirmée. [Source officielle et tarification](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).

La projection sûre couvre les événements écrits par notre code. La plateforme peut ajouter ses propres métadonnées ; `redact_query_string` est une protection complémentaire pour les codes OAuth, et `invocation_logs=false` supprime les événements d’invocation automatiques. Les erreurs CPU/mémoire non interceptables restent des événements plateforme. Avant de qualifier la confidentialité de la collecte distante, vérifier une requête contenant uniquement des marqueurs synthétiques, dans les champs Cloudflare aussi bien que dans le message JSON. Ne jamais utiliser une clé, un code de connexion valide ou une vraie URL signée pour cette preuve. Une bibliothèque peut aussi écrire ses propres diagnostics ; le SDK Containers 0.3.7 comporte notamment des logs sur erreurs de proxy. Le hook `onError` de notre sous-classe remplace son exception par `SCANNER_CONTAINER_ERROR`, mais le logger de proxy du SDK reste distinct : ce changement ne suffit pas à qualifier la collecte, qui reste désactivée. Les requêtes vers notre conteneur sont limitées aux chemins internes fixes `/scan` et `/health`, sans credentials ni URL externe. Ne pas activer de debug Puppeteer/SDK ou de capture brute pour enquêter.

## Vérifier une publication

1. Comparer les paramètres publiés avec leur configuration versionnée : sur l’application et les documents, logs d’invocation/traces désactivés et query strings expurgées ; sur le scanner, observabilité toujours désactivée. Vérifier que les Workers privés n’ont toujours ni route publique ni `workers.dev`.
2. Relancer le résumé public. Vérifier un événement HTTP d’une route connue, son `X-Correlation-ID` et sa version dans Deployments, puis la présence du dernier cron complet. Ne pas provoquer un envoi ou une erreur métier pour obtenir un log.
3. Contrôler les marqueurs synthétiques de confidentialité. L’absence d’un marqueur dans notre JSON seul ne suffit pas à prouver l’absence dans les métadonnées plateforme.
4. En cas d’incident, conserver seulement le code, l’heure, la version et le UUID de corrélation dans le dossier d’intervention. Ne pas copier un export brut de console, un corps de callback ou une table de données métier.

Les tests locaux couvrent la projection à champs fermés, les erreurs précoces d’identité, les marqueurs OAuth, les exceptions des services privés, les acquittements/réessais du consumer, l’incertitude sans relance, les étapes de cron et les réglages de confidentialité. Ils ne prouvent pas encore la collecte distante ni la rétention effective du compte. Voir aussi [metadata des versions](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/) et [configuration Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/#observability).
