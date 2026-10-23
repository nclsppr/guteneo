# Claude : paquet 1.0.0 et preuves distinctes

État du candidat au **23 octobre 2026**. Le répertoire
`integrations/claude/plugins/guteneo` contient un vrai paquet Claude Code autonome :
manifeste, connexion HTTP distante et six skills adaptés aux limites de cet hôte.
Le catalogue local `integrations/claude/.claude-plugin/marketplace.json` le référence
sans chemin externe. Le manifeste Claude du paquet combiné reste disponible à la
même version ; ces deux distributions alternatives ne doivent pas être installées
simultanément sous le nom `guteneo`.

## Trois surfaces à distinguer

| Surface                           | Livrable / accès                                                      | Preuve actuelle                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Plugin Claude Code                | ZIP dédié, répertoire local ou catalogue local `guteneo-plugins`      | Format des deux ZIP extraits validé par Claude Code 2.1.309 ; installation et appels réels à qualifier.                      |
| Connecteur personnalisé Claude.ai | URL `https://guteneo.com/mcp`, connexion OAuth propre à l'utilisateur | Connexion et `get_capabilities` observés le 17 septembre seulement, dans [CLAUDE_QUALIFICATION.md](CLAUDE_QUALIFICATION.md). |
| Annuaire Anthropic                | Soumission séparée du connecteur ou du plugin                         | Aucune soumission, inscription ou approbation affirmée. Un catalogue local ne publie rien dans cet annuaire.                 |

Les [formats Claude Code](https://code.claude.com/docs/en/plugins-reference)
utilisent `.claude-plugin/plugin.json` et découvrent les skills et `.mcp.json` dans
leurs emplacements standards. Le nom reste `guteneo`, la version suit le produit,
et le transport existant conserve ses scopes. Le paquet ne contient aucun secret,
script, hook ou règle accordant automatiquement des permissions. Les instructions
et le guide de modèles restent des fichiers du paquet.

## Construction et validation

Depuis la racine du dépôt :

```sh
npm run build:integrations
node --test tests/security/claude-plugin.test.mjs
```

Le constructeur produit dans `dist/integrations/` :

- `guteneo-claude-code.zip` : racine du plugin ; après extraction,
  `claude plugin validate ./guteneo-claude-code`, puis, si l'utilisateur choisit
  de l'utiliser, `claude --plugin-dir ./guteneo-claude-code`.
- `guteneo-claude-marketplace.zip` : racine du catalogue, avec le même plugin sous
  `plugins/guteneo/`. Le README embarqué donne la commande de validation et les
  commandes distinctes d'enregistrement et d'installation.

Les tests vérifient le contenu exact des archives, les chemins contenus, la parité
de version/connexion, les limites d'autorité et le refus de configurations ajoutant
des secrets ou des permissions. Ils ne simulent pas un résultat de l'hôte.
`claude plugin validate` est le validateur Anthropic de référence ; son résultat
doit être conservé avec la version du CLI, séparément de la recette OAuth.
Le [catalogue local](https://code.claude.com/docs/en/plugin-marketplaces) reste un
mode de distribution propre à Guteneo, pas une présence dans l'annuaire Anthropic.

Le 23 octobre, le binaire officiel **Claude Code 2.1.309** a validé les deux
archives extraites avec `plugin validate --strict`, sans erreur ni avertissement
de manifeste. Le runtime npm était isolé hors du dépôt, sans script d'installation,
avec une configuration Claude vide et le réseau interdit pendant les validations.
Aucune connexion ni installation du plugin n'a été effectuée. Les cinq tests de
paquet passent, dont la vérification des octets réellement archivés et du refus
des substitutions de credentials, commandes, scopes, chemins et permissions.

Le contrôle supplémentaire `--profile directory --strict` échoue uniquement sur
`LICENSE_MISSING`. Il faut une décision du titulaire des droits sur la licence de
distribution avant une soumission à l'annuaire ; ni une licence libre inventée ni
la simple validation locale ne lève ce point. L'icône 512 × 512 existante et les
URLs publiques de support, confidentialité et conditions sont incluses. Le CLI
précise que ses vérifications ne remplacent pas l'analyse de sécurité et la revue
de politique de l'annuaire.

## Prérequis OAuth Claude Code

Le paquet distant utilise la découverte standard. Sa compatibilité effective
DCR/CIMD n'est pas démontrée ici. L'identifiant historique du client Claude.ai
`IhJieRsvZBAnl1uJO125X2SPoIHxT8ed` vise le callback hébergé
`https://claude.ai/api/mcp/auth_callback` ; il n'est pas un client localhost
qualifié pour Claude Code. Aucun nouvel identifiant, secret ou callback n'est
créé par le paquet.

Si l'enregistrement automatique est refusé, vérifier avec l'opérateur un client
public existant réellement enregistré pour le callback du CLI avant de le
configurer. Le modèle `integrations/config/claude-static-oauth.json` documente le
port 8788, mais son marqueur n'est pas une configuration utilisable. Ne pas copier
ce marqueur dans le plugin, ni modifier une inscription OAuth pour faire passer
la validation. Le [guide MCP Claude Code](https://code.claude.com/docs/en/mcp)
décrit `oauth.clientId`, le callback fixe et `/mcp` ; les permissions de l'hôte et
les droits Guteneo restent applicables. Aucune authentification n'a été exécutée
pour préparer ce candidat.

La documentation actuelle indique également que les connecteurs Claude.ai peuvent
apparaître dans Claude Code sous une connexion Claude.ai compatible. Ce chemin
reste à constater dans le vrai compte : il ne prouve ni le fonctionnement de la
connexion embarquée dans ce plugin, ni la réutilisation de son client OAuth.

## Recette avant toute affirmation de compatibilité réelle

1. Valider les deux répertoires extraits avec le CLI Anthropic et enregistrer sa
   version, le SHA-256 des ZIP et les sorties sans secret.
2. Après choix explicite d'installation, constater les six skills, le serveur et
   les confirmations normales. Faire la connexion OAuth normale du bon compte.
3. Appeler uniquement `get_capabilities` ; vérifier le mode, le tenant associé et
   les blocages réels sans créer de document ou d'envoi. La présence d'un outil
   n'est pas une preuve d'exécution ou d'autorité.
4. Qualifier séparément l'expiration, un vrai renouvellement et la révocation.
   Le code de rotation ou une reconnexion ne prouvent pas un échange de refresh.
5. Avec un PDF synthétique autorisé, constater les octets exacts, le scan et la
   lecture des pages. Ce paquet ne fournit aucun transfert local ou extraction
   de pièce jointe Claude. Le dépôt navigateur reste un parcours distinct.
6. Qualifier les préparations séparément, avec destinataire/plafond exacts et
   autorisation applicable. Un résultat `review_prepare_only` s'arrête avant la
   revue expert, le transfert fournisseur, l'approbation ou l'envoi. Aucun envoi
   réel n'est nécessaire pour valider le format du plugin.

Les workflows conservent les restrictions de contenu, les originaux immuables,
la revue navigateur par défaut, les mandats préexistants bornés par client, les
incertitudes fournisseur sans retry et les tarifs retournés par le serveur.
Les [skills Claude](https://code.claude.com/docs/en/skills) n'accordent ici aucun
`allowed-tools` : ce champ peut préautoriser des outils et ne remplace pas les
contrôles d'autorité du produit.

## Claude.ai et annuaire

Le [lien officiel de connecteur personnalisé](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Guteneo&connectorUrl=https%3A%2F%2Fguteneo.com%2Fmcp)
préremplit uniquement le nom et l'URL. L'utilisateur doit encore confirmer la
configuration et s'authentifier. L'installation privée n'accorde aucun badge,
publication ou référencement. La [distinction annuaire/connecteur personnalisé](https://claude.com/docs/connectors/building/directory-vs-custom)
et le [contrat d'authentification Anthropic](https://claude.com/docs/connectors/building/authentication)
imposent de qualifier le mécanisme d'identité choisi pour cette surface.
Une configuration de client hébergé ou une ancienne preuve de consentement ne
qualifie pas le CLI. Les modifications d'authentification, installations et
soumissions externes restent des opérations séparées de ce candidat source.

Sources primaires consultées le 23 octobre 2026. Les notes de septembre dans
[CLAUDE_RENEWAL.md](CLAUDE_RENEWAL.md) et [CLAUDE_QUALIFICATION.md](CLAUDE_QUALIFICATION.md)
restent historiques ; elles ne sont pas converties en preuve de recette du
paquet 1.0.0.
