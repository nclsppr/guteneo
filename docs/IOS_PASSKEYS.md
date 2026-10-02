# Passkeys Apple et connexion Guteneo

Audit du 22 septembre 2026. Aucune configuration Auth0 modifiée, aucune clé
créée, aucun compte créé et aucune connexion biométrique réalisée pendant cet
audit.

## Conclusion

Auth0 prend en charge les passkeys de ses connexions de comptes. Une clé propre
au compte Guteneo peut être conservée dans Mots de passe / le trousseau iCloud,
puis utilisée sur Mac et iPhone. Il ne s'agit pas de réutiliser la clé du compte
Apple ni d'ajouter le fournisseur « Se connecter avec Apple ».

Le code Guteneo n'impose pas de mot de passe et peut conserver son parcours
Universal Login. La lecture du tableau de bord Auth0 authentifié confirme que
les passkeys sont **désactivées** sur **Guteneo-Accounts**, avec **Identifier
First** encore manquant. Aucun essai réussi sur un Mac ou un iPhone réel n'est
revendiqué.

## Ce qui a été vérifié

| Niveau | Constat |
| --- | --- |
| Fournisseur | Auth0 documente les passkeys dans Universal Login et leur coexistence avec les mots de passe. |
| Apple | Le trousseau iCloud peut synchroniser les passkeys entre appareils approuvés. Safari et les systèmes compatibles présentent la validation locale, notamment Face ID ou Touch ID. |
| Client iOS | `Authentication.swift` utilise `ASWebAuthenticationSession`. Il n'intègre pas de formulaire de mot de passe ni de méthode d'authentification imposée. |
| Serveur | `auth.ts` utilise le code OAuth et PKCE sans forcer le mot de passe. Le compte doit toujours satisfaire la vérification d'adresse et les preuves signées existantes. |
| Page publique | Le HTML obtenu avec des en-têtes Safari Mac et iPhone présente e-mail et mot de passe, sans bouton passkey ni attribut `webauthn` dans l'autocomplétion. L'écran a également été observé dans le navigateur intégré : formulaire de mot de passe et un logo Guteneo. Ce contrôle n'est pas un essai Safari ou appareil. L'absence de bouton ne suffit pas à établir la configuration administrative. |
| Administration | Lecture dans Safari du tableau de bord authentifié `manage.auth0.com/dashboard/eu/pieper/` : Enable Passkey désactivé ; Password actif ; Identifier First manquant. Aucune option enregistrée ou modifiée. |
| Appareils | Création de clé, synchronisation et authentification Mac/iPhone restent non qualifiées. L'API mobile de cette branche n'est pas déployée. |

Le provisionnement `scripts/setup-auth0.mjs` ne configure ni les passkeys ni
Identifier First. Cela décrit ce que fait le script, pas l'état actuel du
fournisseur. Il préserve les options existantes de la connexion.

Le même relevé public montre un seul logo Auth0, chargé depuis
`https://guteneo.com/brand/guteneo-stamp.png`. Ce PNG est le timbre tramé avec
« guteneo.com », entièrement opaque (512 × 512 ; 262 144 pixels alpha 255).
Il est identique au fichier du dépôt, empreinte SHA-256
`4a71302cbf9226fb6efc2df99ce8effc48101d5bc254d2e71bb10e84f8820822`.
Le logo transparent employé dans l'app est donc corrigé séparément ; le logo
effectivement présenté par Auth0 reste à remplacer. Le plan actuel des nouveaux
clients utilise déjà `guteneo-portrait.png`. Pour un client existant, suivre
[AUTH0_BRANDING.md](AUTH0_BRANDING.md) : contrôler sa propriété Guteneo, puis
modifier uniquement son `logo_uri` après autorisation, sans réappliquer le
provisionnement ni le thème de tout le tenant.

Le portrait public `https://guteneo.com/brand/guteneo-portrait.png` a aussi été
contrôlé : SHA-256
`df22d2f73f7e281ece61a2c99b5331d30be344e647dc97c738d09f9df122fb9a`,
64 315 pixels transparents. Sa disponibilité et sa transparence sont prouvées ;
elles ne prouvent pas que le client Auth0 l'utilise déjà.

La politique configurée dans le dépôt de production est `verified_email`.
L'audit ne l'a pas changée. Une passkey ne doit pas être transformée en preuve
de MFA par le client : le mode strict, lorsqu'il est choisi, exige une MFA
effectivement rapportée par Auth0. Les règles d'approbation humaine et de tenant
restent applicables quelle que soit la méthode de connexion.

## Réglages Auth0 observés dans Safari

Le panneau Database > Guteneo-Accounts > Authentication Methods > Configure
Passkey montre Enable Passkey désactivé (`Value 0`) et Password actif. Les
prérequis affichés sont : Requires Username désactivé, page de login
personnalisée désactivée et Universal Login activé — tous satisfaits ;
Identifier First reste en attente.

Le choix Button & Autofill est sélectionné, ainsi que les options d'enrôlement
progressif et local affichées. La méthode restant désactivée, ces choix ne
constituent pas une activation effective. Aucun réglage n'a été changé.

Dans l'onglet Applications de cette connexion, Browser, ChatGPT, Claude Code,
Claude hosted, Cursor et OpenAI Review sont activés. Default App et Parkventory
sont désactivés. L'activation des passkeys sur cette connexion concernerait donc
ses six clients Guteneo. Conserver un accès de secours par mot de passe.

L'option passkeys appartient à la connexion de comptes ; Identifier First
affecte le parcours de login du tenant. Il faut donc examiner les autres bases
de comptes et applications avant cette modification. Confirmer aussi le domaine
de connexion et le RP ID avant
de créer des clés : changer cette identité peut imposer un nouvel enrôlement.

L'app actuelle utilise l'authentification web système. Les APIs de passkey
directement intégrées dans une app constituent un autre parcours Auth0, avec
des prérequis supplémentaires (domaine personnalisé, association app/site et
paramètres de l'application). L'audit n'ajoute pas ce second parcours et ne
présente pas ces paramètres comme déjà configurés.

## Accès administratif durable en lecture

Le diagnostic CLI a été qualifié séparément en mémoire : les GET des connexions
et des prompts terminent avec un code processus 1 et la catégorie
`AUTHENTICATION_EXPIRED`. Aucun statut HTTP 401 ou 403 précis n'a été établi.
Les sorties brutes n'ont pas été exposées. La connexion au Dashboard dans Safari
ne renouvelle pas à elle seule l'identité de la CLI.

Pour les audits sans reconnexion humaine répétée, la proposition est une
application M2M dédiée de première partie, limitée à la lecture de la Management
API du tenant. La [CLI Auth0 distingue la connexion utilisateur et la connexion
machine](https://auth0.github.io/auth0-cli/auth0_login.html) ; le second mode
convient aux outils non interactifs. Cette application n'a pas été créée.

| Lecture nécessaire | Permissions proposées |
| --- | --- |
| Applications et leur configuration publique | `read:clients` |
| Connexions et réglages passkeys | `read:connections`, `read:connections_options` |
| Préférences générales du tenant | `read:tenant_settings` |
| Universal Login et Identifier First | `read:prompts` |

Les [champs clients ordinaires](https://auth0.com/docs/api/management/v2/clients/get-clients)
n'exigent pas l'accès aux secrets. Ne pas accorder `read:client_keys`,
`read:client_credentials`, `read:connections_keys`, l'accès aux utilisateurs ni
les permissions de création, modification ou suppression. Le scope
`read:connections_options` est nécessaire pour l'objet `options` depuis le
[changement Auth0 de juillet 2025](https://auth0.com/docs/troubleshoot/product-lifecycle/deprecations-and-migrations#new-management-api-scopes-required-for-connection-options).
Les permissions des [réglages du tenant](https://auth0.github.io/auth0-PHP/classes/Auth0-SDK-API-Management-Tenants.html)
et des [prompts](https://auth0.com/docs/api/management/v2/prompts/get-prompts)
restent distinctes. Ces scopes portent sur le tenant : un nom d'application
Guteneo ne limite pas matériellement la lecture à ses seuls objets. L'outil
d'audit doit donc limiter ses chemins et filtrer les réponses avant affichage.

Les permissions M2M sont accordées sur son autorisation Management API ;
`auth0 login --scopes` concerne la connexion utilisateur et ne crée pas ce
grant. Conserver l'authentifiant machine dans un coffre système ou un gestionnaire
de secrets, hors dépôt, conversation et historique de commandes. Utiliser les
jetons seulement en mémoire, sans trace brute. Une autorisation initiale reste
nécessaire ; elle ne donne pas à l'outil le droit de modifier les réglages.

Le flux client credentials permet de demander un nouveau jeton automatiquement
avec les identifiants machine ; il ne dépend pas d'un refresh token utilisateur.
[Auth0 explique ce renouvellement M2M](https://support.auth0.com/center/s/article/Refresh-token-for-M2M-applications).
Réutiliser le jeton jusqu'à son échéance avec une marge, puis le renouveler.
La durée Management API par défaut est de 24 heures ; privilégier une durée
courte compatible avec le besoin, sans modifier une durée partagée à l'aveugle.
Les jetons déjà émis restent valables jusqu'à expiration même après révocation
de l'accès futur : prévoir rotation de l'authentifiant et retrait du grant.
[Durée et sécurité des jetons](https://auth0.com/docs/secure/tokens/access-tokens/management-api-access-tokens)

Les jetons de l'audience interne Management API ne consomment pas le quota M2M
destiné aux audiences personnalisées. Cela ne supprime pas les limites de débit
ni ne qualifie toutes les fonctionnalités du forfait.
[Précision Auth0 sur le quota](https://support.auth0.com/center/s/article/Do-Management-API-tokens-count-towards-my-M2M-token-quota)
Les essais Touch ID/Face ID et la création volontaire d'une passkey restent des
actions de l'utilisateur ; l'accès machine ne les remplace pas.

## Qualification à terminer

1. Sur un compte de test autorisé, créer volontairement une clé Guteneo depuis
   Safari sur Mac et la conserver dans Mots de passe. L'utilisateur effectue
   lui-même la validation biométrique et la création de la clé.
2. Vérifier le retour dans Guteneo, le compte attendu et les contrôles d'accès ;
   se déconnecter puis se reconnecter avec cette clé.
3. Sur un iPhone réel approuvé avec le trousseau iCloud actif, vérifier la
   disponibilité de la clé, sa validation locale et le même compte Guteneo.
4. Après mise en service autorisée de l'API mobile, effectuer le même parcours
   depuis la fenêtre d'authentification iOS, avec retour dans l'app. Vérifier
   également annulation, clé absente, récupération et expiration de session.

Une simulation WebAuthn ou un changement d'en-tête HTTP ne prouve ni Face ID,
ni Touch ID, ni la synchronisation iCloud. Aucune clé existante ne doit être
supprimée pour cet essai ; aucun envoi de communication n'est nécessaire.

## Sources officielles consultées

- [Passkeys Auth0](https://auth0.com/docs/authenticate/database-connections/passkeys)
- [Prérequis et configuration Auth0](https://auth0.com/docs/authenticate/database-connections/passkeys/configure-passkey-policy)
- [Portée par connexion de comptes](https://support.auth0.com/center/s/article/enable-passkey-for-specific-app)
- [APIs passkeys intégrées](https://auth0.com/docs/authenticate/database-connections/passkeys/passkey-apis)
- [Mots de passe et passkeys sur les appareils Apple](https://support.apple.com/en-gb/120758)
- [Authentification web système Apple](https://developer.apple.com/documentation/authenticationservices/authenticating-a-user-through-a-web-service)
