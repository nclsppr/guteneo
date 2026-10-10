# Production : revue et proposition de surveillance

Revue du 9 octobre 2026. Les observations distantes concernent la source
`4ce1bdd467f9aa35f98e525986db888eff3bf977`. Les corrections de cette branche sont
un candidat distinct : aucun merge, déploiement, envoi, transfert fournisseur,
activation de canal ou de mandat n’est effectué par cette revue.

## Ce qui est observé

Les deux origines `https://guteneo.com` et
`https://guteneo-app.nclsppr.workers.dev` annoncent la même source propre, les mêmes
empreintes de source et d’assets, construite le 9 octobre à 17:45 UTC. La CI du
commit déployé a réussi en **17 min 03 s** :
[exécution 37928685996](https://github.com/nclsppr/guteneo/actions/runs/37928685996).
Cela prouve la CI de cette source, pas la réussite des parcours fournisseurs.

44 lectures anonymes initiales ont vérifié les pages publiques, les quatre
langues, les métadonnées, les robots et le refus des API protégées. Le premier
moniteur a ensuite réussi ses **28 contrôles** sur les deux origines : il compare
notamment les octets des pages sélectionnées au manifeste de leur origine.
Ce manifeste public ne constitue pas une attestation indépendante du code :
pour une publication, conserver la comparaison à un build local propre avec
`scripts/verify-release.mjs` et l’identité du déploiement Cloudflare.

| Fonction | Observation distante | Ce qui reste à démontrer |
| --- | --- | --- |
| Site, langues, guides | Pages disponibles, langues et octets vérifiés ; en-têtes de sécurité présents | Navigation réelle, accessibilité et expérience sur appareils physiques |
| Identité | Auth0 annoncé configuré ; refus anonyme des routes privées | Inscription, réception du mail, connexion, expiration, renouvellement et révocation |
| Documents | Import/rendu annoncés ; scanner lié | Fraîcheur antivirus, analyse, exactitude des octets, rendu privé et suppression |
| Studio | Modèles, CSV/XLSX/JSON/XML et génération annoncés | Parcours authentifié sur données synthétiques, statut asynchrone et résultat PDF |
| Fax / courrier | Interrupteurs d’envoi actifs ; fournisseurs `configured_not_live_validated` | Devis courant, approbation, remise réelle, callback et livraison |
| E-mail et lien protégé | Fermés dans la configuration publique | Activation et qualification séparées |
| Horizon / veraPDF | Désactivés | Activation, diagnostic privé et débit autorisé |
| Paiements Stripe / propositions IA | Désactivés | Qualification séparée ; les crédits existants restent une fonction distincte |
| Assistants / natif | MCP anonyme refusé ; API native présente dans le code | OAuth, outils dans les vrais clients, appareil physique |
| Belvédère | Code inclus dans la source déployée ; adresse privée inconnue refusée | Accès Veilleur et données privées non lus dans cet audit |
| Files / cron / sauvegardes | Instrumentation et contrats présents dans le code | Activité récente, retards, DLQ et restauration indépendante |

## Changement de routage observé pendant la revue

À 19:04 UTC, le moniteur a détecté que l’ensemble des routes de l’adresse
technique répondait 404 tandis que le domaine canonique restait disponible.
La vérification du chat « Améliorer le profil et les rôles » a confirmé la
consigne explicite du propriétaire : fermer `workers.dev` et garder uniquement
`guteneo.com`. Il s’agit donc d’un changement attendu, pas d’une panne du produit.

Le moniteur final suit ce contrat : **14 contrôles sur guteneo.com et 3 contrôles
de fermeture de l’ancien hôte**. Un 404 y est attendu ; une réponse 200 ou une
redirection est une régression. Les observations précédentes sur les deux
origines restent une preuve historique. Aucune modification de routage n’a été
réalisée par cette branche de revue.

## Problèmes et corrections

1. **Maintenance des signatures non automatisée.** Les dernières exécutions
   planifiées de `scanner-refresh` sont ignorées ; aucune variable ni secret de
   dépôt nécessaire n’est installé. [Dernière exécution observée](https://github.com/nclsppr/guteneo/actions/runs/37950533248).
   Cela ne prouve pas des signatures périmées : leur âge n’a pas pu être lu,
   l’appel Cloudflare ayant échoué en 504. La prochaine action prioritaire est
   de qualifier leur fraîcheur puis d’activer la procédure documentée dans
   [SCANNER_CI.md](SCANNER_CI.md), avec le credential dédié et l’autorisation de
   publication du scanner. Aucun renouvellement/deploy n’a été déclenché ici.
2. **Faux résultat vert du résumé.** `production-status` acceptait une réponse
   cohérente même si l’identité ou le scanner manquaient, et ne rapprochait pas
   le drapeau d’envoi du manifeste. Corrigé avec régressions ; les dépendances
   et livraisons restent explicitement `not_checked`. Le manifeste accepte
   désormais jusqu’à 512 Kio, les deux petites réponses restent limitées à 64 Kio.
3. **Purge répétée.** Après retour du curseur en début d’historique, chaque
   document déjà purgé provoquait de nouvelles opérations D1/R2 et gonflait le
   compteur. Le correctif reconnaît seulement une suppression avec tombstone
   et audit de succès tenant-scopé, écrit après R2. Il conserve les lots de 25,
   les reprises après panne stockage/audit et les mêmes durées de conservation.
   Il évite le delete R2 et deux écritures D1 redondantes par nouveau passage ;
   le parcours de lecture demeure. Aucune économie facturée n’est mesurée.
4. **CI alourdie par les archives.** Les copies récupéraient aussi plus de 1 Go
   de rushes et captures historiques. Le checkout ciblé réduit de **65,9 %** le
   volume de fichiers du profil général, tout en conservant tests, médias
   publiés et sources de narration. Les profils spécialisés sont plus petits.
   La CI mesurée passe de 17 min 03 s à 14 min 12 s (−16,7 %), et le cumul des durées de jobs baisse de 39,8 %. Commandes, dépendances et couverture restent inchangées. Les artefacts
   déjà compressés ne sont plus recompressés. [Mesures et preuves CI](CI.md).
5. **Dépendances.** Correctifs compatibles de l’outillage et du parseur de
   source maps : audit npm de **8 à 3 entrées élevées**. Les trois restantes
   relèvent du même avis OAuth-client MCP ; aucun chemin accessible en
   production n’a été identifié. Les versions, limites et contraintes de
   migration sont dans [l’audit détaillé](DEPENDENCY_AUDIT_2026_10_09.md).

## Outil utilisable immédiatement

Depuis la racine de cette branche :

```sh
npm run status:prod
npm run monitor:prod
npm run monitor:prod -- --expected-sha 4ce1bdd467f9aa35f98e525986db888eff3bf977
npm run monitor:prod:live
```

La dernière commande ouvre un serveur sur **http://127.0.0.1:8796**. Il exécute
des lectures publiques toutes les 60 secondes ; l’interface relit seulement
son résultat local toutes les 10 secondes. Le moniteur ignore cookies et
credentials, refuse les redirections et n’accepte pas d’origine cible libre.
Le serveur refuse les hôtes étrangers, requêtes cross-origin et mutations.
Un contrôle expiré après 120 secondes devient périmé, y compris dans `/status`.
Ctrl+C arrête la surveillance ; aucune tâche permanente n’est installée.

Le résultat distingue **contrôles publics réussis**, **attention**,
**désactivé** et **non testé**. Le code de sortie 0 ne qualifie que le périmètre
public décrit. Le JSON conserve heure, source, statut, codes HTTP et durées ;
aucun corps brut, token, document ou destinataire n’est conservé. Les durées
depuis ce Mac sont des échantillons, pas des percentiles globaux ou un SLO.

Le manifeste compte 264 assets pour environ 413 Mo. Le moniteur ne télécharge
pas tous les médias à chaque minute ; la vérification exhaustive des deux
origines représente environ 826 Mo et reste un contrôle de publication.
Une mesure comporte 20 GET, soit 28 800 par jour si l’outil reste actif en
continu. Sans preuve de besoin, éviter les sondes plus fréquentes et les
réveils systématiques du scanner/renderer.

Pour borner les coûts : au tarif Workers Standard consulté le 9 octobre 2026,
le dépassement de requêtes coûte 0,30 USD/million au-delà des 10 millions inclus
partagés. 864 000 GET sur 30 jours représenteraient au plus **0,2592 USD de
composante requêtes** si chaque GET était facturé en dépassement. Ce calcul
exclut abonnement, CPU, logs, stockage, services privés et autres usages ; ce
n’est pas une estimation de facture. Les requêtes réellement facturées et le
CPU/mémoire/startup/temps actif des services restent à mesurer. [Tarification officielle](https://developers.cloudflare.com/workers/platform/pricing/).

## Proposition : une preuve par fonctionnalité dans Belvédère

Le dispositif suivant est une proposition à implémenter/activer séparément.
Il réutilise le rôle Veilleur et ne crée pas une nouvelle autorité d’assistant.

**1. Observation continue, sans mutation métier.** Afficher dans Belvédère la
dernière preuve, son âge, sa source déployée et la dernière erreur par fonction.
Reprendre les événements existants des Workers ; persister un heartbeat du
dernier cron réussi, l’âge du plus ancien outbox, les DLQ et les résultats
inconnus. Ces incidents doivent ignorer le filtre de période de création pour
ne pas masquer un ancien envoi bloqué. Lire des agrégats bornés et indexés ;
aucun contenu, destinataire, URL signée ni log brut. Un collecteur privé sous
credential dédié observe Cloudflare ; un accès assistant ordinaire ne devient
jamais Veilleur. L’absence de signal doit alerter autant qu’une erreur.

**2. Parcours synthétiques en production.** Réserver un atelier de contrôle et
des comptes de test à faible privilège. Exécuter des PDF connus et données
fictives, garder leurs hashes et codes, expirer leurs résultats. Un jeu de
fixtures dans la CI reste une simulation, même s’il utilise le mode production.
Le canari distant doit réellement traverser les services hébergés autorisés.

| Parcours proposé | Fréquence initiale | Preuve et limite |
| --- | --- | --- |
| Pages/langues/manifestes/protection anonyme | 60 s | HTTP, hashes ciblés, origine et date ; disponible aujourd’hui via outil local |
| Auth0 et lecture de l’atelier canari | 15 min | Session réelle, rôle courant, expiration ; pas de contournement d’auth |
| Import d’un petit PDF, scan et rendu | 60 min | Hash exact, statut ready et résultat rendu ; signatures surveillées à part |
| Modèle + dataset minuscule + génération | 60 min | Job terminal, lignes attendues et hashes ; quotas propres et purge |
| Préparation de devis sans approbation | Quotidien | Prix/fournisseur/date d’expiration ; aucun `approve` ou `send` |
| Pingen : transfert de brouillon | Seulement après autorisation distincte | Transfert externe réel, suppression confirmée ; ne pas inclure par défaut |
| MCP | Après publication puis quotidien | OAuth réel et outils de lecture/préparation ; aucune délégation activée |
| Horizon, lien protégé, Stripe, IA | Après activation autorisée | Budgets, entitlements et facturation réels : essais séparés et plafonnés |
| Restauration de sauvegarde | Mensuel | Restauration isolée et contrôles de cohérence ; jamais écraser la production |
| iOS et clients assistants | Après publication | Appareil/client réel, identité, bytes et révocation ; pas preuve par émulation seule |

**3. Communications réelles contrôlées.** Pour prouver une livraison, choisir
explicitement canal, destination de test possédée, contenu exact, options,
plafond de coût et fréquence. Revue humaine et autorisation d’envoi distinctes,
puis observation du fournisseur, callback et réception. Ne jamais transformer
un résultat fournisseur inconnu en nouvel envoi automatique. Un canari ne doit
pas renouveler une délégation, activer un canal ou débiter pour « réparer » un test.

Seuils de départ à calibrer : erreur/refus d’accès inattendu immédiatement ;
absence de mesure publique >2 min ; cron sans succès >5 min ; outbox >60 s ;
DLQ ou résultat fournisseur inconnu >0 ; signatures antivirus à prévenir avant
48 h et incident avant la fermeture à 72 h. Une lenteur répétée doit être jugée
sur une fenêtre et plusieurs lieux, pas sur une requête isolée. Dédupliquer les
alertes par incident, signaler ouverture/changement/rétablissement, garder une
trace de la dernière notification. Le canal de notification et sa destination
restent à choisir et autoriser avant tout message externe.

Utiliser une sonde externe indépendante pour détecter aussi la panne de
Cloudflare ou du collecteur. GitHub Actions peut lancer la qualification après
publication et un contrôle périodique de secours, mais ses horaires peuvent
être retardés : ne pas en faire une promesse de temps réel.
[Limite officielle des tâches planifiées GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Ce dispositif améliore le délai de détection sur un périmètre mesuré ; il ne
garantit pas de détecter tous les bugs. « Aucune donnée » et « preuve ancienne »
doivent rester des états à examiner, jamais devenir verts par défaut.
