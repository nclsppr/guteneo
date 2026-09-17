# Auth0 : identité Guteneo

Le script `scripts/setup-auth0-branding.mjs` applique uniquement la présentation de **New Universal Login** sur le tenant `pieper.eu.auth0.com`. Cette personnalisation a été autorisée pour Guteneo ; l’ancien produit n’utilise plus ce tenant. Le tenant doit déjà utiliser New Universal Login : le script refuse de changer de parcours.

## Présentation

- Papier `#f6f5ef`, formulaire `#fffefa`, texte `#181b22`, bouton et liens `#2450db`.
- Logo de connexion : portrait sans texte à fond transparent, `https://guteneo.com/brand/guteneo-portrait.png`.
- Favicon simple distinct : `https://guteneo.com/favicon.svg?brand=20260917`.
- Nom d’affichage du tenant : **Guteneo**. Aucun autre champ des paramètres du tenant n’est envoyé.
- Titres, descriptions et texte alternatif du logo en français et anglais pour les écrans `login`, `login-id`, `login-password`, `signup`, `signup-id` et `signup-password`.
- Formulaire natif Auth0, sans police distante, gabarit HTML personnalisé, Classic Login ou domaine personnalisé.

Le thème de présentation ne change ni les méthodes d’authentification ni les exigences de vérification du compte. Le nom d’affichage s’applique au tenant ; il ne renomme pas son domaine. Les nouveaux clients prennent le portrait transparent dans le plan de provisionnement. Pour mettre à jour les clients existants, limiter l’écriture à leur champ `logo_uri`, après vérification de leur propriété Guteneo ; ne pas relancer le provisionnement général pour une modification visuelle. Voir [BRAND_IDENTITY.md](BRAND_IDENTITY.md) pour la distinction avec le timbre « guteneo.com » du footer et des communications externes.

## Utilisation

Le CLI officiel Auth0 doit déjà être authentifié sur ce tenant. Le script ne lit aucun fichier de credentials, ne récupère pas de token pour un autre processus, ne réauthentifie pas automatiquement et ne change pas de tenant.

```sh
# Plan local : aucun appel réseau.
node scripts/setup-auth0-branding.mjs

# Relecture distante, sortie limitée à des états vérifiés.
node scripts/setup-auth0-branding.mjs --inspect

# Écritures de présentation uniquement ; requiert une autorisation opérateur.
node scripts/setup-auth0-branding.mjs --apply

node --test tests/security/auth0-branding.test.mjs
```

Le script relit l’identité du tenant actif avant chaque appel. Les routes de gestion autorisées sont limitées au branding, au thème, aux douze dictionnaires de textes et à `friendly_name`. Chaque dictionnaire est relu puis fusionné avant son remplacement pour conserver les autres textes personnalisés. Une seconde application ne réécrit pas les réglages déjà conformes. Les refus et erreurs sont projetés en codes sans corps de réponse, tokens, URLs signées ou données personnelles.

Les commandes distantes ne sont pas une transaction : une interruption peut laisser une partie du branding déjà appliquée. Relire l’état, puis relancer le même script après résolution du motif d’échec. Ne pas interpréter une absence de thème (404) comme un refus de permission (403). Un refus de permission arrête le script sans lancer de connexion interactive.

## Preuve et limites

Application distante confirmée le **17 septembre 2026 à 01:11 UTC** : nom Guteneo, branding, thème et les douze dictionnaires relus conformes. La passe de vérification idempotente a effectué **zéro écriture**. Les six tests ciblés et le contrôle ESLint ont réussi.

La preuve filtrée, lorsqu’elle existe, est conservée dans `reports/auth0-branding-proof.json`. Elle indique l’heure de relecture, l’expérience New Universal Login et les comparaisons exactes avec les constantes du script. Elle ne contient pas de réponse Auth0 brute ni de session de connexion. Les paramètres fonctionnels des prompts et la liste des langues sont comparés avant/après par l’application complète.

Les tests locaux couvrent la conservation des textes et paramètres fonctionnels, l’idempotence, le refus de Classic, le contrôle du tenant, l’interdiction des routes hors périmètre et la projection des erreurs du CLI. Une relecture API ne prouve pas à elle seule le rendu dans le navigateur ou la création réussie d’un compte. Ces vérifications restent distinctes. Aucun abonnement, domaine personnalisé payant ou réglage MFA personnel n’est modifié par ce script.

## Documentation primaire consultée le 17 septembre 2026

- [CLI Auth0 : accès à la Management API](https://auth0.github.io/auth0-cli/auth0_api.html)
- [Personnaliser les thèmes de New Universal Login](https://auth0.com/docs/customize/login-pages/universal-login/customize-themes)
- [Créer un thème](https://auth0.com/docs/api/management/v2/branding/post-branding-theme) et [mettre à jour un thème](https://auth0.com/docs/api/management/v2/branding/patch-branding-theme)
- [Paramètres de branding](https://auth0.com/docs/api/management/v2/branding/patch-branding)
- [Personnaliser les textes](https://auth0.com/docs/customize/login-pages/universal-login/customize-text-elements) et [remplacer un dictionnaire par langue](https://auth0.com/docs/api/management/v2/prompts/put-custom-text-by-language)
- [Schéma de thème du fournisseur Terraform officiel Auth0](https://registry.terraform.io/providers/auth0/auth0/latest/docs/resources/branding_theme), notamment les valeurs admises pour les bordures
