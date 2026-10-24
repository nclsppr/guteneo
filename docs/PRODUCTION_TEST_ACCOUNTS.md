# Comptes de qualification en production

Date de recherche : 24 octobre 2026. **Spécification proposée, non activée.** Aucun compte, secret, facteur Auth0, fixture métier, réglage de tenant ou workflow connecté n’a été créé par cette étude.

**Décision de lancement ultérieure :** le profil live choisi est désormais
`verified_account`. Un compte vérifié connecté par le flux normal peut accéder
aux documents autorisés sans passkey ou MFA supplémentaire. Les propositions
WebAuthn ci-dessous documentent la recherche initiale du profil `strong` ; elles
ne sont pas des prérequis de cette livraison. La surveillance connectée reste
à configurer avec des identités de recette autorisées, un accès CI protégé et
des fixtures synthétiques préapprouvées. Les contrôles publics ne la qualifient
pas.

## Décision proposée

Utiliser des comptes Auth0 réels réservés à la qualification, sur le même émetteur et la même application web que les clients. **Privilégier le MFA WebAuthn natif d’Auth0 avec vérification utilisateur obligatoire**, puis une Action distincte attestant le facteur réellement utilisé. Un authentificateur virtuel Chromium, enrôlé par le vrai parcours Auth0, peut répondre aux challenges. Guteneo reçoit le callback normal et crée sa session normale ; aucun JWT, cookie applicatif, facteur fort ou consentement humain n’est fabriqué par le test.

La première suite de production couvre **la connexion et les lectures autorisées de fixtures synthétiques déjà approuvées par une personne**. Elle ne confirme aucun envoi et ne dépense aucun crédit métier. La création initiale de ces fixtures est une opération distincte à autoriser et à tracer : une activation réelle peut avoir un coût et une communication associée. Un compte de test ne supprime pas ces invariants.

La génération locale de l’authentificateur, le bit UV et la présence simulés sont des preuves de fonctionnement du protocole dans un navigateur automatisé. Ils ne prouvent ni Face ID, ni une clé physique, ni la présence ou le consentement d’une personne. Aucune approbation documentaire de production ne sera qualifiée d’« humaine » parce que CI a cliqué sur un bouton.

## État réel du tenant, inspection sans écriture

Le 24 octobre 2026, le profil CLI existant a permis de lire la configuration du seul tenant attendu `pieper.eu.auth0.com`. Aucune identité utilisateur n’a été lue. Les réponses contenant potentiellement des secrets et le code des Actions sont restés en mémoire ; seuls des booléens, des valeurs choisies et des empreintes ont été projetés.

| Contrôle réel                              | Observation                                                | Conséquence                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Connexion `Guteneo-Accounts`               | Mot de passe activé ; passkey DB désactivée                | Pas de qualification passkey actuelle ; cela n’exclut pas le MFA WebAuthn, qui est un mécanisme distinct |
| Application `Guteneo - Browser`            | Callback attendu et authorization code présents            | Réutilisation possible du vrai parcours web                                                              |
| Grant passkey natif                        | Absent                                                     | Ce grant concerne l’API native ; son absence n’interdit pas le parcours Universal Login par redirection  |
| Deux Actions post-login déployées          | Aucune n’émet le claim documentaire ni ne vérifie WebAuthn | La preuve forte requise par le nouveau coffre n’est pas actuellement produite                            |
| Liste Guardian et réglage WebAuthn roaming | Lecture refusée faute de privilège suffisant               | Facteurs, politique UV et disponibilité contractuelle inconnus ; ne pas les déclarer désactivés          |
| Connexion forte de test réelle             | Aucune effectuée                                           | Aucun parcours connecté de production n’est certifié par cette inspection                                |

Les empreintes SHA-256 des deux sources déployées lues étaient `7f21fc09c349ccec20a72a485882e4159b12095fbd9e5b02aa6c5e7b5c76edc7` et `f9be402e234b4be6fef61723f92e646f118ed2ef7c20f6da8dd2cd7f9c9f3a69`. Elles servent à détecter une dérive avant une revue, jamais à qualifier seules une assurance. L’état est daté et doit être relu avant activation.

Le qualificateur exécutable est `scripts/qualify-production-auth0.mjs` : `node scripts/qualify-production-auth0.mjs --plan` expose le plan sans accès réseau, sous-processus ou recherche de secrets ; `--inspect` effectue uniquement des lectures Management API, revalide le tenant avant chaque requête et n’expose aucun utilisateur, secret ou code d’Action. Il garde toujours `ready=false` et `liveMethodQualified=false` : une revue statique n’est pas un login qualifié.

Les privilèges de lecture minimaux sont `read:connections`, `read:clients`, `read:actions` et `read:guardian_factors`. Obtenir ce dernier pour un opérateur autorisé permettrait de conclure sur les facteurs et leur réglage ; cela ne donne pas `create:users` et n’autorise aucune création de compte. La disponibilité payante du MFA doit être vérifiée dans l’offre/contrat existant, séparément : aucun achat ou surclassement n’est proposé automatiquement.

## Ce qui a été vérifié

| Élément             | Preuve disponible                                                                                   | Limite                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Politique Guteneo   | `apps/api/src/auth.ts`, `documentAuthenticationEvidence`                                            | La preuve forte vient du JWT Auth0 signé ; sa qualification sur le tenant réel reste à faire                      |
| Fraîcheur           | Code de session et gardes documentaires                                                             | 15 minutes pour lecture ; 5 minutes pour export et opérations personnelles sensibles                              |
| TesterArmy installé | `e2e` 0.21.3 ; export public `surfaceOf(engine)` dans `@e2e-dev/web`                                | L’accès au contexte exige la même instance de moteur et une tentative démarrée                                    |
| Chromium/CDP local  | Sonde éphémère exécutée : `WebAuthn.enable`, ajout et retrait d’un authentificateur virtuel réussis | Aucun appel Auth0 ; aucune authentification de production démontrée                                               |
| Production anonyme  | `e2e.production.config.ts`, `tests/production-e2e/public-pages.e2e.ts`                              | Les résultats anonymes ne certifient aucun parcours connecté                                                      |
| Restriction d’envoi | Migration `0041_prepare_only_accounts.sql`                                                          | Restriction liée à `(issuer, subject)` ; elle interdit l’acceptation d’un envoi, pas toute modification de compte |

## Le point à qualifier dans Auth0 : passkey et UV

Auth0 documente l’identification d’un login par passkey dans une Action avec `event.authentication.methods` et le nom `passkey`. Cette information établit la méthode employée ; elle ne constitue pas, à elle seule, un champ attestant le résultat UV de cette transaction. Les facteurs simplement enregistrés dans `enrolledFactors` ne sont pas une preuve de leur utilisation. [Détection officielle de la passkey](https://support.auth0.com/center/s/article/detecting-passkey-usage-in-auth0-post-login-actions), [référence de l’événement](https://auth0.com/docs/actions/reference/post-login/post-login-event-object).

La documentation des API passkey Auth0 montre notamment `userVerification: "preferred"`. Cela ne démontre pas la configuration effective d’Universal Login sur notre tenant. Cela interdit en revanche de déduire une garantie universelle « UV obligatoire » du seul mot passkey. La documentation de configuration décrit les prérequis et le RP ID ; tout changement de RP ID peut invalider les passkeys existantes. Ne pas changer ce domaine pour faciliter les tests. [API passkey](https://auth0.com/docs/authenticate/database-connections/passkeys/passkey-apis), [configuration passkey](https://auth0.com/docs/authenticate/database-connections/passkeys/configure-passkey-policy).

Le contrat actuel attendu par Guteneo est :

```json
{
  "auth_time": 1792800000,
  "iat": 1792800004,
  "https://guteneo.com/document_authentication": {
    "policy": "guteneo-sensitive-v1",
    "method": "webauthn_uv",
    "factor": "webauthn-platform",
    "authenticated_at": 1792800003
  }
}
```

Cet exemple décrit la forme du contrat, pas un jeton utilisable. `authenticated_at` est la date effective du MFA, calculée depuis le timestamp ISO fourni par Auth0. Le parser exige des secondes entières positives et la relation **`auth_time ≤ authenticated_at ≤ iat`** ; les dates de première authentification et de MFA peuvent donc différer. La session conserve `auth_time` comme origine des fenêtres de fraîcheur de 15/5 minutes : cela reste conservateur. Une Action ne remplace jamais une date de cérémonie par `Date.now()`, et ne donne aucune assurance à un identifiant de test, une adresse email, un client CI ou un facteur seulement inscrit. Le JWT et ses dates sont validés côté serveur ; Auth0 classe `auth_time` parmi les claims réservés. [Restrictions des claims personnalisés](https://auth0.com/docs/secure/tokens/json-web-tokens/create-custom-claims).

### Voie recommandée : MFA WebAuthn natif et Actions séquencées

Auth0 documente deux moyens d’obtenir UV dans son MFA : Device Biometrics (`webauthn-platform`) l’effectue systématiquement ; Security Keys (`webauthn-roaming`) possède un réglage **Required**, compatible FIDO2, qui impose la vérification. Le défaut « Never » des clés de sécurité ne suffit pas à notre méthode `webauthn_uv`. La disponibilité de ces fonctions dépend de l’offre ou du contrat ; elle reste à établir pour Guteneo. [WebAuthn comme MFA](https://auth0.com/docs/secure/multi-factor-authentication/webauthn-as-mfa), [politique des clés de sécurité](https://auth0.com/docs/secure/multi-factor-authentication/fido-authentication-with-webauthn/configure-webauthn-security-keys-for-mfa).

Le SDK officiel expose la lecture `GET /api/v2/guardian/factors/webauthn-roaming/settings` et le champ JSON **`userVerification`** (`required`, `preferred`, `discouraged`). C’est une configuration Guardian MFA distincte des options de passkey d’une connexion DB. Ne pas transposer le nom Terraform `user_verification` dans une requête HTTP, inventer une propriété de connexion ou activer le grant passkey natif pour ce parcours. Aucun réglage n’a été modifié. [SDK Management Auth0](https://github.com/auth0/go-auth0/blob/v1/management/guardian.go).

Le candidat à faire relire comporte une Action de challenge, puis une Action de preuve. La première impose le facteur WebAuthn qualifié. La seconde examine `event.authentication.methods` : objet `name: "mfa"`, `type: "webauthn-platform"` ou `"webauthn-roaming"`, et date du facteur effectivement accompli. Auth0 précise que les méthodes ne sont actualisées qu’au début de l’Action suivante ; vérifier immédiatement après `challengeWith` dans la même Action donnerait une preuve incorrecte. [Sélection et séquencement MFA](https://auth0.com/docs/secure/multi-factor-authentication/customize-mfa/customize-mfa-selection-universal-login).

La preuve doit refuser OTP, récupération, simple enrôlement et méthode trop ancienne. L’Action ne doit pas promouvoir un autre facteur proposé par l’interface. Pour roaming, l’assurance UV repose sur le réglage Required vérifié et sa surveillance, puis sur le challenge effectivement validé ; le nom du facteur seul ne contient pas un résultat UV. Une clé sans UV peut représenter une autre politique MFA résistante à l’hameçonnage, mais ne peut pas être renommée `webauthn_uv`. Ajouter une méthode comme `phishing_resistant_mfa` demanderait une évolution de politique explicite ; elle n’est ni nécessaire au candidat UV Required, ni réalisée ici.

Le timestamp de MFA est documenté sous forme ISO dans `event.authentication.methods`. Le candidat le convertit en secondes par `floor(Date.parse(timestamp)/1000)` ; le Worker vérifie indépendamment sa relation avec les claims réservés signés. Aucun accès Enterprise à `event.session.authenticated_at` n’est nécessaire. Les contrôles réels devront confirmer ce schéma, sa précision et l’ordre des dates sur le tenant ; une méthode sans date ou une relation invalide échoue fermée. [Exemple officiel de timestamp MFA](https://support.auth0.com/center/s/article/Configure-number-of-days-to-remember-a-device).

Cette voie évite d’héberger notre propre vérificateur WebAuthn et n’exige pas d’activer les passkeys DB. Les passkeys de connexion pourront être qualifiées ensuite pour réduire la friction, avec la même exigence de preuve UV et de récupération sûre.

### Candidat source et effet de bascule

`scripts/auth0-document-authentication-actions.mjs` produit deux sources autonomes à relire ; il n’effectue aucune I/O, n’a aucun mode d’application et ne se branche pas sur le script de configuration existant. Les paramètres imposent le client Browser exact et la connexion DB exacte. Plateforme est le défaut ; roaming exige que la lecture opérateur ait réellement établi `userVerification=required`. Les tests de `tests/security/auth0-document-authentication-actions.test.mjs` exécutent ces sources hors réseau, avec des événements fictifs, et ne qualifient pas Auth0.

La première Action écrit un marqueur de transaction, puis appelle uniquement `challengeWith` avec le facteur choisi. La seconde exige ce marqueur et une MFA du même facteur, datée après le marqueur, fraîche et non future ; elle émet uniquement le claim d’ID token. `Date.now()` sert à mesurer la fenêtre de temps et le début du challenge, jamais à dater le MFA lui-même. Une preuve déjà présente avant ce challenge ne suffit pas ; ce candidat doit être placé avant une autre Action qui accomplirait le même MFA. La tenue réelle de ces métadonnées et l’ordre des Actions restent des contrôles d’intégration obligatoires.

**Ce candidat impose le challenge à tous les logins Browser admissibles, même sans demande ACR particulière.** Le déployer tel quel toucherait donc aussi les clients existants : un utilisateur sans facteur déjà enrôlé ne satisferait pas le challenge et pourrait être bloqué. Les autres clients OAuth ne sont pas modifiés. Il est interdit de le considérer prêt à activer globalement avant d’avoir défini l’enrôlement initial, l’accompagnement des utilisateurs existants, la récupération forte, la compatibilité des appareils et un retour arrière qui conserve le refus des documents sensibles. Le candidat n’automatise aucun enrôlement et une récupération TOTP/email seule ne reçoit jamais le claim fort.

Une variante limitée au parcours personnel/fort demandé par `acr_values` peut réduire cette rupture. Le serveur envoie déjà l’ACR multi-factor et `max_age=0` pour `context=personal` ; un login ordinaire `fresh=1` ne demande que `max_age=0`. Cette variante demanderait donc une décision produit et la qualification de tous les points de réauthentification avant activation. Modifier un hint de requête pourrait provoquer ou éviter un challenge, mais ne doit jamais accorder le contenu sans vraie preuve signée ; les gardes du coffre restent fermées. Aucune nouvelle route ni variante n’est ajoutée par ce dossier.

### Qualification du mécanisme retenu

Avant activation, l’opérateur relève la connexion, l’Action déployée et leurs versions. Il établit, par documentation officielle applicable ou confirmation Auth0 et par contrôles négatifs, ce qui permet au serveur d’attester UV pour **cette transaction**. Si le mécanisme réellement disponible ne distingue pas UV, il n’émet pas `webauthn_uv`.

La qualification demande :

1. Une vraie connexion avec le facteur WebAuthn retenu et UV positif ; preuve forte signée présente, méthode et date exactes, accès aux seuls documents autorisés.
2. Une tentative avec UV négatif ou authentificateur sans UV ; échec du login fort ou absence de preuve forte, puis refus du contenu par Guteneo. Le simple succès du scénario positif ne suffit pas.
3. Mot de passe seul, mot de passe plus TOTP, passkey seulement enregistrée, récupération de compte et réutilisation SSO : aucune promotion automatique vers notre politique forte.
4. Nouveau challenge, origine ou RP ID incorrect, ancienne assertion et mauvais compte : refus. Les contrôles de signature, challenge, origine et UV relèvent de la vérification serveur WebAuthn. [Vérification normative](https://www.w3.org/TR/webauthn-3/#sctn-verifying-assertion).
5. Reconnexion fraîche puis reconnexion SSO : vérifier la date réelle. Utiliser le parcours normal `max_age=0`, contrôler `auth_time` ; `prompt=login` seul n’est pas une preuve de fraîcheur. [Réauthentification Auth0](https://auth0.com/docs/authenticate/login/max-age-reauthentication).

Ne pas utiliser `event.session.authenticated_at` comme une dépendance supposée disponible : la référence Auth0 réserve certaines informations de session aux offres Enterprise. Ne pas inventer de disponibilité ou acheter une offre avant cet audit. Le mapping de la date d’Action vers le `auth_time` final doit être démontré sur le vrai flux.

### Repli concret si Auth0 ne fournit pas l’attestation nécessaire

Prévoir une **vraie étape WebAuthn UV dans le produit**, accessible selon la même politique aux clients et aux comptes internes, intégrée au login par une Action Auth0 avec redirection. Auth0 documente ce mécanisme, la validation d’un résultat signé et `recordMethod` après reprise du login ; il ne fonctionne pas comme un échange mot de passe sans navigateur. [Redirection Auth0 Actions](https://auth0.com/docs/customize/actions/redirect-with-actions).

Ce repli demande une implémentation et une revue de sécurité distinctes : challenge D1 à usage unique lié au sujet Auth0 et à la transaction, clé publique déjà enrôlée sur une preuve d’identité admissible, vérification serveur de la signature/origine/RP/UV, résultat court signé avec audience et nonce, reprise Auth0 et callback habituel. La clé d’attestation du résultat reste côté serveur/Action, jamais dans CI. Les inscriptions et récupérations ont la même exigence pour tous les utilisateurs.

Le moment UV doit rester distinct du `auth_time` de première authentification. Un éventuel repli conserve la relation entre ces deux instants et `iat`, et la fraîcheur conservatrice, sans réécrire un claim réservé. Cette alternative demande une implémentation et une qualification séparées ; elle n’est pas réalisée ni préférée ici.

Une fédération qualifiée peut constituer une autre solution après définition de son assurance. Le simple renommage d’un login mot de passe/TOTP en `qualified_federation` n’est pas une qualification.

## Comptes et périmètre des fixtures

Conserver une liste opérateur des sujets exacts ; ne pas reconnaître les comptes internes par un suffixe d’email ou un en-tête de navigateur.

| Persona proposée       | Autorité Guteneo                              | Parcours automatisables                                                                                                                 |
| ---------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Destinataire A         | Compte personnel sans atelier                 | Connexion, coffre et document synthétique déjà associé et autorisé, texte accessible, historique personnel, export original préautorisé |
| Destinataire B         | Compte personnel distinct sans atelier        | Absence des documents A et refus des identifiants de fixtures A                                                                         |
| Observateur atelier    | Rôle existant `viewer`, atelier interne dédié | Identité, navigation et seules lectures autorisées à ce rôle ; refus des commandes réservées                                            |
| Responsable de fixture | Administrateur humain de l’atelier interne    | Préparation et approbation initiales manuelles ; credential hors CI                                                                     |

Le `viewer` ne gagne pas des droits d’approbation ou de rapport pour rendre les assertions vertes. Les écrans confidentiels réservés au créateur/approbateur ne sont pas promis à ce rôle. Les comptes destinataires ne sont jamais membres de l’atelier par l’effet d’une invitation documentaire.

Les identités automatisées peuvent recevoir en plus la restriction opérateur `prepare_only`, créée pour ces nouveaux sujets avant leur première utilisation. C’est une protection supplémentaire contre l’envoi, pas un prétendu rôle entièrement en lecture seule. Ne pas toucher au compte de revue marketplace ni à ses restrictions. Une évolution future de restriction serveur générale en lecture seule aurait son propre contrat ; elle n’existe pas du seul fait de ce document.

L’atelier interne ne contient aucun client, aucune liste d’adresses, aucune donnée réelle. Les fixtures sont des PDF synthétiques reconnaissables, sans lien vers une personne, identifiés par manifeste exact et empreintes. Le manifeste contient les identifiants attendus, droits de lecture/export, sujets autorisés et échéances ; il ne contient ni jeton d’invitation, ni URL signée, ni secret. Les documents et associations sont déjà établis par le parcours humain autorisé. Une fixture expirée est un résultat « fixture indisponible », jamais une permission pour la recréer, prolonger ou réactiver automatiquement.

Les actions automatisées métier interdites sont : approuver, confirmer/activer, rattacher un destinataire, réclamer une invitation, déposer ou supprimer une copie, créer un atelier, modifier un profil ou des droits, payer, recharger, activer une délégation, envoyer ou provoquer un remboursement. Les écritures techniques de session et les événements d’accès produits par une lecture réelle sont attendus et restent audités.

## Mise en place opérateur, une fois autorisée

1. Vérifier la release et la migration réellement servies, l’émetteur canonique, le domaine d’autorisation, le client web, le callback, le RP ID et les politiques actives. Réutiliser la même application Auth0. Une nouvelle connexion dédiée éventuelle doit être signalée comme un périmètre différent de la connexion client habituelle.
2. Créer les nouvelles identités dédiées dans le tenant réel, avec des boîtes contrôlées. Établir leur vérification d’email de façon réelle et tracée. Aucune demande automatique de SMS/email pendant les runs ; création et vérification initiales sont des opérations séparées, non exécutées ici.
3. Faire leur premier login par Auth0 ; relever le mapping stable `(issuer, subject) → userId`. Ne pas créer une identité par correspondance d’email, saisir directement une session en D1 ou injecter un cookie arbitraire.
4. Enrôler le credential WebAuthn dédié à l’automatisation via le vrai parcours MFA Auth0 dans un navigateur contrôlé. Auth0 conserve la clé publique ; seul l’authentificateur de test conserve la clé privée. Aucune clé physique personnelle n’est exportée. Pour le candidat mot de passe + MFA WebAuthn, le mot de passe du seul compte de test est également un secret de bootstrap nécessaire.
5. Qualifier UV, la preuve signée, la fraîcheur et les refus décrits plus haut. Relever versions et résultat, sans publier token, clé ou détails de challenge.
6. Stocker les credentials dédiés dans le canal privé approuvé, établir les restrictions de sujets et les fixtures manuelles, puis autoriser le premier run connecté en lecture seule. Aucun changement du tenant ni secret n’est requis dans la routine de chaque test.

Les secrets proposés, distincts par persona, sont le credential ID, le user handle, la clé privée PKCS#8 exportés de l’authentificateur virtuel et, uniquement si ce vrai parcours l’exige, le mot de passe du compte de test. L’issuer attendu, le RP ID attendu et les identifiants de fixture sont des paramètres contrôlés, jamais des moyens d’accorder une assurance. Un éventuel secret TOTP ou credential de récupération reste hors du job récurrent s’il n’est pas nécessaire au login qualifié.

Le test suit tous les facteurs réellement exigés par le tenant. Il ne désactive ni MFA ni protection contre les attaques pour un sujet CI. Si un second facteur est demandé après la passkey, son automatisation doit être qualifiée et son secret protégé ; cela ne transforme pas TOTP seul en preuve `webauthn_uv`. Un challenge non automatisable entraîne un résultat explicite et une intervention opérateur, sans boucle de tentatives ou exemption cachée.

## Intégration TesterArmy et navigateur

`browser.evaluate` exécute du JavaScript dans la page. Il ne donne pas accès à CDP ni au contexte Node et ne doit pas remplacer `navigator.credentials` ou fabriquer une réponse serveur.

Le package installé expose `surfaceOf(engine).context()` et `.page()`. Un adaptateur de qualification, appelé après démarrage de la tentative et avant le login, peut créer `context.newCDPSession(page)`, puis activer le domaine WebAuthn de Chromium. Cet accès doit employer exactement l’instance de moteur du target ; un nouveau `web()` créé dans le test n’est pas le navigateur courant. Le point d’intégration worker/config devra être vérifié avant publication du hook. [Session CDP Playwright](https://playwright.dev/docs/api/class-browsercontext#browser-context-new-cdp-session), [protocole WebAuthn Chromium](https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/).

Paramètres à qualifier : `protocol=ctap2`, transport correspondant au facteur (`internal` pour plateforme, `usb` pour roaming), UV pris en charge, UV positif pour le cas positif, présence automatique ; credential résident seulement si le parcours le requiert. Importer le seul credential enregistré pour la persona et son RP ID exact ; basculer UV négatif pour le contrôle négatif. Le challenge vient d’Auth0, qui vérifie la signature. Une vue de téléphone dans Chromium prouve l’interface mobile web, pas Safari iOS ni une clé matérielle.

Le probe local effectué a démontré l’accès à CDP depuis la surface publique TesterArmy, la création/suppression d’un authentificateur vide et la lecture de zéro credential ; il n’a contacté ni Auth0 ni Guteneo. Autre limite vérifiée dans le driver installé : `@e2e-dev/web` lance Chromium sans exposer `chromiumSandbox`/`launchOptions`. Le helper CI existant protège le renderer PDF ; il ne démontre pas le sandbox du navigateur de test. Avant d’y introduire de vrais credentials, prévoir un bootstrap/fournisseur qui lance explicitement Chrome avec sandbox, puis CDP, ou démontrer le contrôle équivalent. Ne pas supposer que le job public anonyme est déjà adéquat pour ce job connecté.

Le compteur du credential est un point de qualification : ne pas réimporter systématiquement un compteur obsolète et désactiver une détection de clone pour cacher l’échec. Une seule exécution concurrente est autorisée. Si le serveur contrôle un compteur non nul, l’adaptateur doit utiliser une séquence monotone bornée pour ce credential CI, y compris les nouvelles tentatives, et refuser tout débordement ou retour arrière. Le compteur initial et la stratégie approuvée font partie du manifeste privé d’enrôlement. Aucune réinitialisation de credential côté Auth0 pendant un run.

La préférence est de réaliser le vrai login dans chaque contexte isolé : même onglet jusqu’au callback, session créée uniquement par le serveur, bootstrap personnel, puis vérification du `userId`, des ateliers attendus et de l’assurance publique. Pour l’export, se reconnecter avant la limite de cinq minutes ; ne pas attendre que le cookie d’une heure expire.

Un bootstrap Playwright avec `storageState` est un repli acceptable si l’adaptateur ne peut pas employer directement le moteur : il doit provenir d’un login Auth0 réel effectué dans ce même run, être importé uniquement dans le contexte attendu et rester éphémère. Son import n’allonge jamais `auth_time` ni l’expiration. Ne pas restaurer des cookies vieux de plusieurs jours. Playwright avertit que cet état permet d’usurper le compte : aucun cache, dépôt ou artifact ne doit le contenir. [Gestion de l’état authentifié](https://playwright.dev/docs/auth).

## Exécution GitHub et confidentialité

Prévoir un job séparé, initialement `workflow_dispatch`, utilisant un environnement proposé `production-auth-readonly`. Sa protection effective dépend de l’offre et de la visibilité du dépôt : GitHub n’offre pas toutes les règles d’approbation sur tous les dépôts privés. Vérifier cette disponibilité avant d’affirmer qu’une approbation est imposée. Sinon, démarrer par un run opérateur local contrôlé ou un canal de secrets déjà approuvé, sans acheter ni contourner une protection. [Environnements et secrets GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

Règles du futur job : branche/release approuvée et SHA exact, aucun code de PR non fiable ou de fork, actions tierces épinglées, permissions minimales `contents: read`, environnement privé, concurrence 1, zéro retry automatique, télémétrie/report cloud désactivés. La clé privée n’est accessible qu’au processus de login ; pas de trace, vidéo, HAR, capture automatique, corps de réponses, dump de cookie ou snapshot de coffre. Le filtrage des sorties reste nécessaire : le masquage GitHub n’est pas une garantie contre les transformations d’un secret. [Sécurité des workflows](https://docs.github.com/en/actions/reference/security/secure-use).

Les champs secrets doivent rester séparés plutôt qu’un gros JSON dont les transformations échappent au masquage. Un fichier temporaire éventuellement indispensable est privé au job et supprimé en `finally` ; il n’est jamais une sortie uploadée. Préférer un runner GitHub éphémère pour éviter la réutilisation du profil. GitHub documente une VM neuve par job hébergé, détruite après celui-ci. [Runners hébergés](https://docs.github.com/en/actions/how-tos/manage-runners/github-hosted-runners/use-github-hosted-runners).

GitHub OIDC peut signer la provenance du rapport, lié à son hash et à l’environnement exact. Il n’authentifie pas un utilisateur Guteneo et ne remplace pas Auth0. Vérifier issuer, audience, dépôt, environnement, workflow/ref et SHA ; ne pas supposer un format de sujet historique lorsqu’un dépôt utilise les sujets immuables récents. [Référence OIDC](https://docs.github.com/en/actions/reference/security/oidc).

Le rapport connecté futur doit être distinct de l’anonyme : `suite=authenticated_readonly`, version du schéma, SHA servi, exécution, navigateur, résultat par contrôle, présence d’une assurance qualifiée et âge maximal observé. Les détails sensibles restent privés ; publier uniquement états et codes contrôlés. Un succès anonyme ou une preuve locale ne peut changer l’état connecté en succès. Tant que comptes, UV et fixtures ne sont pas qualifiés, conserver le code explicite `DEDICATED_STRONG_AUTH_FIXTURES_NOT_CONFIGURED`.

Les futurs fichiers proposés sont `e2e.production-auth.config.ts`, un adaptateur Node privé de sortie sensible dans `scripts/production-auth-bootstrap.ts`, et `tests/production-auth-readonly/`. Le job connecté référence seulement le code approuvé de ces fichiers ; aucune route `/dev/login`, endpoint de création de session de test ou branche spéciale de validation JWT n’est ajoutée au Worker. Ces fichiers ne sont pas implémentés par cette étude.

## Contrôles de la suite V1

| Contrôle                  | Résultat exigé                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Identité réelle           | Callback Auth0 normal ; sujet/persona stable ; aucun login de développement                                              |
| Compte unique             | Destinataires sans atelier ; services visibles sans création implicite d’atelier                                         |
| Cloisonnement             | B ne liste, ne lit et n’exporte aucun document A ; refus sans divulgation                                                |
| Preuve forte              | UV positif qualifié autorise les lectures ; UV absent/négatif ou preuve manquante refuse                                 |
| Contenu                   | Pages et texte de la fixture ont les empreintes attendues ; cache privé/no-store                                         |
| Export préautorisé        | Octets synthétiques exacts ; événement de transfert, sans prétendre prouver une sauvegarde disque                        |
| CSRF                      | Une requête d’export sans CSRF est refusée avant toute remise d’octets                                                   |
| Session                   | Déconnexion puis refus de lecture ; nouvelle connexion restaure seulement l’autorité prévue                              |
| Non-régression financière | Aucun approve/confirm/activation ; aucun appel de communication, réservation ou débit ajouté                             |
| Preuve honnête            | Mobile web Chromium et authentificateur logiciel explicités ; pas de qualification de matériel ou de consentement humain |

Chaque scenario est lié à une route et à un document exacts. Le navigateur bloque en défense supplémentaire les mutations métier interdites ; ce filtre client ne remplace jamais les rôles et restrictions serveur. Si un écran manque aux droits de la persona, le test vérifie le refus ou réduit son périmètre, sans ajouter des droits.

## Budget, activation et critères de livraison

Budget initial proposé : un worker, une exécution à la demande, six minutes maximum, au plus huit connexions Auth0, deux viewports et un export synthétique borné ; aucun intervalle automatique avant mesure. Relever durée de démarrage, durée active/inactive du navigateur, CPU et mémoire du runner, requêtes Auth0/Workers/D1/R2 et volume d’objets lus. Les limites seront ajustées après la première mesure représentative. « Aucun crédit métier dépensé par la suite » ne signifie pas « aucune consommation Auth0, GitHub ou Cloudflare » ; ne pas annoncer un coût nul sans relevé.

La livraison est acquise lorsque : le dossier d’identité et d’enrôlement privé est validé ; le mapping UV/date de l’Action a ses preuves positives et négatives ; les fixtures humaines sont accessibles et non expirées ; le premier run connecté sur la release exacte réussit ; les rapports et traces sont inspectés pour absence de secrets ; les compteurs financiers et appels externes restent inchangés. L’activation d’un planning vient ensuite, séparément.

Les cycles complets de préparation, approbation fictive, activation simulée, dépôt, révocation et courses financières restent dans la suite locale isolée. Si un futur besoin impose des écritures automatisées en production, il faudra définir une autorité de test explicite, distincte du consentement humain, bornée aux seuls tenants synthétiques et à zéro fournisseur externe. Cela change un invariant et ne découle pas de la création des comptes décrits ici.
