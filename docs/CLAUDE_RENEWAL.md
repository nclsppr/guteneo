# Claude.ai : installation et renouvellement

État du **18 septembre 2026** : candidat local. La connexion réelle initiale est
qualifiée dans [CLAUDE_QUALIFICATION.md](CLAUDE_QUALIFICATION.md). Le bouton et le
renouvellement décrits ici nécessitent encore publication et activation Auth0 ;
aucun échange réel de refresh token n’est attesté par les tests locaux.

## Installation pour un autre utilisateur

1. Créer son compte Guteneo, vérifier son adresse e-mail et ouvrir son espace
   Guteneo une première fois. Cette étape crée son identité et son organisation.
2. Dans l’onglet Claude de l’accueil, ou dans « Connecter un assistant », utiliser
   **Connecter à Claude**. Le lien officiel préremplit le nom Guteneo et l’URL
   `https://guteneo.com/mcp` dans le formulaire Claude.ai.
3. Copier l’identifiant public `IhJieRsvZBAnl1uJO125X2SPoIHxT8ed`, choisir
   **Use your own OAuth client** et le coller dans **OAuth client ID**. Laisser
   le secret vide. Le lien officiel ne sait pas préremplir ces champs OAuth.
4. Ajouter le connecteur puis connecter son propre compte Guteneo et examiner
   les permissions. Sur un espace Claude administré, son propriétaire peut
   devoir ajouter le connecteur avant que les membres puissent se connecter.

L’identifiant public ne donne accès à aucun compte. Chaque connexion conserve
son utilisateur authentifié, ses permissions et son organisation. Un utilisateur
ayant plusieurs organisations choisit celle à associer dans Guteneo. Aucun
compte Auth0 d’administration ni terminal n’est demandé au client final.

Le parcours conserve les contrôles du mode local et de la maquette publique :
ils ne présentent pas une connexion de démonstration comme une connexion réelle.
La configuration téléchargeable pour le terminal est nommée **Claude Code**.

Source : [liens d’installation officiels Claude](https://claude.com/docs/connectors/building/directory-vs-custom#share-an-install-link).

## Durées et sécurité

| Élément | Politique préparée |
| --- | --- |
| Jeton d’accès | Une heure au maximum, comme auparavant |
| Renouvellement | Nouveau refresh token à chaque échange |
| Inactivité | Expiration après 30 jours sans échange de renouvellement |
| Durée absolue | Nouvelle authentification au plus tard après 90 jours |
| Tolérance réseau | 3 secondes pour un échange concurrent ou une réponse perdue |
| Réutilisation hors tolérance | Détection et révocation de la famille par Auth0 |

Les 90 jours constituent un choix produit borné, pas une durée imposée par
Auth0. La rotation et les deux expirations utilisent le mécanisme natif Auth0.
Claude demande `offline_access` quand la découverte du serveur le propose et
gère les jetons côté hôte. Guteneo ne les stocke pas dans le navigateur, ne les
ajoute pas aux URL et n’introduit aucun timer de maintien artificiel de session.

Les Actions conservent S256 PKCE pour l’autorisation initiale. Seul un client
hébergé explicitement sélectionné peut ensuite utiliser `oauth2-refresh-token`,
pour la bonne audience, la connexion de comptes Guteneo et un compte toujours
vérifié. Un refresh ne prouve pas une nouvelle MFA : aucun claim MFA n’est
réémis à ce titre et la politique MFA stricte refuse ce parcours silencieux.
Les autres clients et la session navigateur ne reçoivent pas cette extension.

À chaque requête, le Worker vérifie encore l’identité signée, l’appartenance à
l’organisation, les scopes et la connexion active. **Révoquer la connexion dans
Guteneo bloque aussi les nouveaux jetons issus d’un renouvellement.** Cette
révocation locale ne supprime pas le consentement Auth0 ; celui-ci et sa famille
de refresh tokens peuvent être révoqués chez Auth0. Une réassociation explicite
par le navigateur reste nécessaire après une révocation locale. Le renouvellement
OAuth n’active ni ne prolonge un mandat expert.

Sources : [authentification Claude](https://claude.com/docs/connectors/building/authentication),
[rotation Auth0](https://auth0.com/docs/secure/tokens/refresh-tokens/configure-refresh-token-rotation),
[expiration Auth0](https://auth0.com/docs/secure/tokens/refresh-tokens/configure-refresh-token-expiration).

## Activation et preuve à conserver

Le plan général reproductible est disponible avec :

```sh
node scripts/setup-auth0.mjs --auth-policy verified_email --claude-callback https://claude.ai/api/mcp/auth_callback --refresh-client claudeHosted
```

Pour l’installation existante, utiliser le script ciblé
`scripts/enable-claude-renewal.mjs` : inspection sans mutation, revue de son
empreinte, puis application de cette empreinte après autorisation de production.
Il ne réimporte pas de secret navigateur et ne modifie pas les autres clients.
Ne pas utiliser le provisioning global pour cette seule évolution.

```sh
node scripts/enable-claude-renewal.mjs --inspect
# Après revue de l’empreinte affichée et autorisation de production :
node scripts/enable-claude-renewal.mjs --apply --expect EMPREINTE_SHA256_REVALIDEE
```

La session CLI doit viser `pieper.eu.auth0.com` et permettre la lecture des
clients, connexions, API et Actions, ainsi que la mise à jour des clients, API
et Actions. Les versions des Actions et leurs associations sont relues avec
`read:actions`. L’inspection refuse une autre source active, une modification
personnalisée ou un état qui a changé depuis la revue. Une interruption impose
une nouvelle inspection et une nouvelle empreinte ; une mutation échouée n’est
jamais relancée automatiquement. Seul le code déjà validé permet une reprise.
Auth0 n’offre pas de transaction pour cet ensemble : éviter toute modification
administrative concurrente pendant l’application.

Après activation, reconnecter Claude une fois pour qu’une nouvelle autorisation
émette un refresh token. Un ancien jeton d’accès n’en acquiert pas rétroactivement.
Vérifier ensuite `get_capabilities`, puis un nouvel appel après expiration du
jeton d’accès, sans nouvelle authentification interactive. La preuve doit
distinguer : configuration relue, callback réussi, renouvellement réellement
observé, puis révocation. Ne conserver ni jeton, ni code OAuth, ni URL signée,
ni donnée de document dans cette recette. Aucun envoi réel n’est nécessaire.

Le 18 septembre, l’inspection administrative a été refusée car la session de la
CLI Auth0 avait expiré. Aucun réglage distant n’a été modifié. Cette limite ne
constitue pas un échec du connecteur utilisateur et ne change pas la preuve du
17 septembre.

## Vérifications locales du candidat

Le 18 septembre : typecheck, ESLint, build applicatif avec dry-run Wrangler,
build de production et build de la maquette réussis. Les **167 tests Node de
sécurité** passent, dont 30 cas de migration ciblée ; les **32 tests navigateur
de la maquette** passent avec quatre exclusions desktop intentionnelles. La
recette couvre copie, sélection manuelle, refus du presse-papiers, absence de
requêtes métier et écrans étroits. Une revue visuelle a été effectuée sur le
panneau Claude en largeur normale et à 390 px.

Le test d’authentification Worker utilise de vrais JWT signés par une clé de
fixture : après révocation, un jeton émis ultérieurement reste refusé. Ces
résultats ne prouvent ni émission Auth0 d’un refresh token, ni échange automatique
par Claude, ni publication du bouton sur le domaine de production.
