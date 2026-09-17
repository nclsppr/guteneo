# Qualification fournisseur Pingen par document fictif

Candidat local basé sur `118ce087c3fe5a1ad63bd4c562adb8e26aa8af21`. Aucun dépôt, appel fournisseur authentifié, déploiement ni qualification réelle n'a été effectué pendant son développement. Les réponses des tests sont fictives ; le verrou R2 est exercé sur le runtime local réel.

Cette preuve est indépendante de l'inscription Guteneo et du parcours applicatif. Elle ne crée aucun tenant, document métier, approbation, dispatch, quota ou crédit. `appJourneyVerified`, `liveSendingVerified` et `canSend` restent toujours `false`. Le PDF embarqué est entièrement fictif : une page A4, adresse à gauche x25/y62 mm, Arial incorporé, zones réservées blanches, mention de ne pas imprimer ni expédier. Son rendu a été contrôlé localement ; ce test fournisseur ne prétend pas prouver un upload client, une analyse antivirus métier ou un consentement navigateur.

## Autorisation et périmètre

Après intégration/revue et déploiement autorisés, l'opérateur disposant de l'accès Cloudflare au même compte peut appeler la méthode RPC privée `ProviderInspection.qualifyPingenSynthetic`. La classe conserve `fetch() -> 404` ; aucune route REST/MCP/publique n'est ajoutée. L'accès Cloudflare opérateur, distinct d'Auth0, est l'autorité du test. Ne pas accorder une liaison vers ce point d'entrée à un Worker non approuvé.

La seule entrée est `{phase: "calculator" | "create" | "inspect" | "cleanup"}`. Toute clé supplémentaire est refusée. Aucun PDF, URL, destinataire, organisation, identifiant de lettre, date ou dépendance n'est contrôlable par cette entrée. PDF/SHA, nom, run `20260917-synthetic-v1` et options LU/gauche/cheap/simplex/grayscale sont fixés dans la source. Seule l'organisation déjà configurée est accessible. Le profil relu doit être EUR/LU/fenêtre gauche. La configuration exige explicitement production, `PINGEN_SANDBOX=false`, `LIVE_SENDS_ENABLED=false` et l'origine de dépôt déjà qualifiée, seule dans l'allowliste.

Création et calculateur expirent le **18 septembre 2026 à 12:00 UTC**, y compris après les attentes réseau. Inspection et nettoyage restent possibles ensuite pour le seul brouillon enregistré. Cette date ne se prolonge pas à chaque invocation ; un autre run nécessite une nouvelle décision et une modification revue. Aucun flag d'envoi ni tarif actif n'est modifié.

## Commandes opérateur distinctes

Le script local et son fichier de liaison **ne doivent jamais être déployés**. Ils utilisent un nom de proxy dédié, `persist:false`, `envFiles:[]`, aucune route et aucune observabilité. Les secrets restent dans le Worker. Ne pas utiliser ces commandes sans l'autorisation d'exécuter le test fournisseur.

```sh
node scripts/qualify-pingen-draft.mjs --price-only
node scripts/qualify-pingen-draft.mjs --create-synthetic-draft
node scripts/qualify-pingen-draft.mjs --inspect-created
node scripts/qualify-pingen-draft.mjs --delete-created
```

Chaque commande réalise une phase, sans boucle de polling ni nouvelle tentative automatique. La connexion locale expire après 20 s, l'opération RPC après 50 s, la fermeture après 3 s. Un timeout avant réception du proxy signifie qu'aucune RPC n'a été déclenchée. Après invocation de `create`, un timeout signifie un résultat potentiellement inconnu : utiliser seulement `--inspect-created`, jamais relancer une création. Les réponses et erreurs sont filtrées deux fois, dans le Worker puis dans le driver. Aucun message fournisseur, token, identifiant de lettre, adresse, nom de police, URL ou signature n'est imprimé.

## Protocole borné

OAuth demande explicitement `letter organisation_read`, sans élargissement automatique. Le scope `letter` autorise aussi l'envoi chez Pingen : c'est donc le code fermé de ce probe, et non un scope « lecture seule », qui interdit toute expédition. Il n'existe aucun chemin `/send`, `/cancel`, preset ou batch dans ce module.

Le calculateur POST traite uniquement 200 comme un prix EUR exploitable ; 202 reste `price_pending`. Le montant est conservé en centimes entiers après parsing décimal exact. La création réclame d'abord le journal durable, puis obtient une URL de dépôt, transmet les seuls octets embarqués via PUT sans Bearer, et crée une lettre avec `auto_send:false` littéral et clé d'idempotence fixe. Les requêtes sont limitées à 8 s, corps compris, et les JSON à 64 Kio. Toutes les redirections sont manuelles.

L'inspection vérifie l'identité de la lettre et de son organisation, son nom unique et sa date de création proches du claim, et exige `submitted_at:null`. Elle projette seulement des booléens de correspondance adresse/pays/papier/polices, le nombre de pages et les capacités `delete`/`submit`. Si `get-pdf-raw` vaut `ok`, elle constate le 302 de `/file` sans lire, renvoyer ou suivre `Location`. Cela **ne prouve pas** un aperçu final d'impression ni le téléchargement du fichier.

## Journal, concurrence et nettoyage

Le journal privé `qualification/pingen/20260917-synthetic-v1.json` contient seulement le run, le SHA fictif, un hash de liaison compte/client, l'heure, la révision, l'état et l'identifiant technique éventuellement reçu. Aucune URL signée, clé ou donnée utilisateur n'y figure. Aucun autre objet R2 n'est écrit.

`If-None-Match:*` réserve le run avant tout dépôt ; chaque évolution utilise `etagMatches` et une révision croissante. Un résultat de claim nul ou incertain interdit le réseau fournisseur. Une lecture `inspect` ne modifie pas le journal. Un ancien claim n'est jamais effacé pour permettre une nouvelle création. Le tombstone `deleted` est conservé.

Un POST sans acknowledgement utilisable devient `create_unknown` et n'est jamais rejoué. Un crash dur peut laisser `claimed`, également non rejouable. Si 201 et l'identifiant sont reçus mais que l'écriture suivante échoue, une écriture de secours conserve cet identifiant quand possible. Un crash dur entre l'acknowledgement et toute écriture durable peut laisser un brouillon dont l'identifiant est inconnu : ce probe ne liste pas arbitrairement les lettres et exige alors une réconciliation opérateur séparée. Un PUT réussi suivi d'un échec avant création peut laisser un fichier temporaire fournisseur ; aucun endpoint de suppression de cet upload n'est prétendu.

Le nettoyage relit seulement l'identifiant du journal, contrôle à nouveau organisation/nom/date/absence de soumission et exige `abilities.self.delete === "ok"`. Il réserve la suppression par CAS, vérifie sa possession, puis effectue `DELETE` sans corps. Une commande simultanée ne peut pas supprimer une autre lettre. Après un crash, une reprise explicite peut récupérer ce claim après 120 s ; une ancienne invocation ne peut lancer DELETE au-delà de sa fenêtre de 30 s. Un retour 204 est inscrit durablement comme `deleted`. Une réponse perdue conserve `delete_unknown` ; une commande explicite peut rapprocher 404/410 après une tentative de suppression. Aucun nouvel appel POST n'est nécessaire.

Le nettoyage confirme uniquement la suppression API, pas l'effacement immédiat des copies ou sauvegardes. Ne jamais effacer/réinitialiser le journal pour rendre une nouvelle création possible.

Sources officielles vérifiées le 17 septembre 2026 : [OpenAPI Pingen](https://api.pingen.com/documentation/swagger-docs), [SDK Pingen](https://github.com/pingencom/pingen2-sdk-go/blob/main/letters/letters.go), [R2 : conditions et cohérence forte](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/). L'OpenAPI documente DELETE 204, GETfile 302 et une idempotence fournisseur limitée à 24 h ; le journal Guteneo reste donc nécessaire au-delà de cette période.

Note de connexion du 17 septembre 2026 : trois tentatives avec Wrangler 4.132.0 sont restées sans résultat pendant la liaison distante. Une installation isolée de 4.133.0 a ensuite permis les lectures privées Telnyx et Pingen, avec fermeture normale. Le projet utilise désormais Wrangler 4.133.0 et sa version correspondante de Miniflare. Les 45 tests fournisseur et les 7 tests du driver, le typecheck et le lint ciblé passent également avec ces dépendances. La cause précise du blocage précédent n’est pas établie ; ces lectures réussies ne constituent pas une preuve de dépôt Pingen.

Preuve locale : 45 tests Vitest (31 nouveaux cas de qualification et 14 cas de lecture Pingen), 7 tests du driver, typecheck et lint ciblé réussis. Le rapport Vitest global n'a pas été remplacé. SHA-256 du PDF A4 final : `ee8217b869d6e552df3582ea2f886e4c7889964000ef26c975424ece5ba53385`. Rendu visuel local contrôlé après fixation des dimensions A4 exactes ; le test vérifie aussi l'incorporation des polices.
