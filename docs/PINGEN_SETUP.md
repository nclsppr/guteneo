# Connexion privée Pingen

Créer une application dédiée à Guteneo dans Pingen, type **Client Credentials**, puis lancer `node scripts/secure-setup.mjs pingen`. Le formulaire local exige `PINGEN_CLIENT_ID`, `PINGEN_CLIENT_SECRET` et `PINGEN_ORGANIZATION_ID`. Il les transmet directement aux secrets du Worker via l’entrée standard de Wrangler ; aucun fichier d’accès, argument de processus ou sortie contenant leurs valeurs n’est produit. Voir [SECURE_CONFIGURATION.md](SECURE_CONFIGURATION.md).

Cette installation ne modifie aucun flag d’activation ou d’environnement. Le secret `PINGEN_WEBHOOK_SECRET` n’est pas nécessaire pour l’authentification et la lecture de l’organisation. Il devra être défini lors d’une future inscription explicite des notifications signées. Aucun webhook n’est créé par ce parcours.

Après déploiement du point d’entrée privé, `node scripts/provider-readiness.mjs pingen` appelle le service Cloudflare `ProviderInspection`. Ce service n’expose aucune route HTTP d’inspection. Les accès restent dans Cloudflare ; le script local ne reçoit que le résultat filtré.

L’inspection effectue exactement deux appels : un échange OAuth `client_credentials` limité à `organisation_read`, puis un `GET /organisations/{id}` pour l’organisation configurée. Elle utilise les hôtes canoniques `identity.pingen.com` et `api.v2.pingen.com`. Si `PINGEN_SANDBOX=true`, elle utilise les hôtes staging distincts. Pour cette lecture privée uniquement, l’absence du flag désigne le compte de production ; l’adaptateur d’envoi conserve ses exigences de configuration explicite.

Les redirections sont refusées, chaque requête expire après huit secondes et chaque réponse est limitée à64Kio. Aucune liste d’organisations, aucun lien renvoyé par Pingen, aucun fichier, brouillon, devis, achat ou courrier n’est consulté ou créé. La réponse contient seulement la réussite de l’authentification, la correspondance avec l’organisation configurée, sa devise de facturation, son pays de destination par défaut et sa position d’adresse par défaut. Les erreurs exposent uniquement une étape, un code fixe et éventuellement le statut HTTP. Noms, adresses, soldes, identifiants, jetons et messages d’erreur Pingen sont exclus.

Un résultat `ok` prouve uniquement que ces accès permettent de lire cette organisation. Il ne prouve ni un crédit disponible, ni un tarif final, ni l’aptitude à imprimer ou envoyer. `liveSendingVerified` reste toujours `false`.

Sources officielles vérifiées le17septembre2026 : [documentation OAuth et environnements Pingen](https://www.postman.com/pingen/pingen-v2-public-workspace/collection/t9s7epw/endpoints), [contrat de lecture d’organisation du SDK officiel](https://github.com/pingencom/pingen2-sdk-go/blob/main/organisations/organisations.go), [création d’une application et notifications signées](https://github.com/pingencom/n8n-nodes-pingen2).

Preuve locale : les tests interceptent les appels avec des réponses fictives. Ils couvrent portée OAuth, isolation de l’organisation, environnements, absence de cache partagé, limites, redirections, erreurs et exclusion des données privées. Aucun compte réel ni courrier n’a été utilisé dans ces tests.
