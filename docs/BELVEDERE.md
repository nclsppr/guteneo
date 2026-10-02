# Belvédère — tour de contrôle de guteneo

Candidat sur `codex/belvedere-control-tower`, créé depuis `origin/main` (`8b060bb`).
Le rôle **Veilleur** désigne l'accès personnel de Nicolas à cette surface de
lecture. Ce n'est ni un rôle d'atelier ni un mandat donné à un assistant.
Le [système visuel](belvedere/DESIGN.md) documente l'interface effectivement construite.

## Parcours

- **Synthèse** : activité quotidienne, changement de mesure dans le graphique,
  consommation client, ateliers et membres, sessions/autorisations, pays observés,
  répartition des canaux et incidents à examiner. Le globe « Le monde de guteneo »
  bascule entre connexions et distribution, conserve un classement textuel et
  ouvre les envois du pays sélectionné. Voir [géographie et interactions](BELVEDERE_GLOBE.md).
- **Ateliers** : recherche, pagination, détail des envois et des membres. Chaque
  opération distingue devis, plafond, consommation réglée, réservation et coût
  fournisseur vérifié. Aucun contenu de document ou destinataire n'est exposé.
- **Envois** : suivi global filtrable par canal, état, pays de destination et
  atelier. Les liens depuis les incidents ou le globe conservent les filtres de
  période et de mode ; ouvrir un incident ne relance aucune opération.
- **Membres** : annuaire global avec recherche, appartenance aux ateliers, rôles,
  permissions des superviseurs et connexions. Les appartenances restent actuelles.
- **Connexions** : sessions navigateur et natives valides, autorisations MCP,
  journal des connexions réussies et pays fourni par Cloudflare. Une autorisation
  n'est pas une présence en ligne ; un appel MCP n'est pas un nouvel utilisateur.
- **Finances** : consommation des crédits, réservations, dotations promotionnelles,
  paiements Stripe vérifiés par devise et coûts fournisseurs disponibles. Le
  résultat net reste indisponible tant que les charges et remboursements ne sont
  pas rapprochés. La consommation de cette vue suit la date des **débits inscrits
  au registre**, y compris pour les envois supprimés depuis ; les frais
  d'hébergement y figurent une seule fois. La synthèse et les ateliers suivent
  plutôt les envois **créés** pendant la période et leur consommation réglée à
  ce jour. Les paiements vérifiés suivent la date de création Stripe disponible,
  sans prétendre démontrer la date de réception bancaire. Soldes et réservations
  sont actuels. Les coûts fournisseurs suivent la date d'enregistrement du
  rapprochement ; le nombre d'envois sans coût vérifié suit la cohorte créée
  sur la période. Ces bases de calcul sont indiquées dans l'interface.
- **Infrastructure** : connecteurs Cloudflare en lecture seule, état explicite
  lorsqu'ils ne sont pas configurés. Voir [sources et limites](BELVEDERE_CLOUDFLARE.md).

Les périodes de 7, 30, 90 jours ou personnalisées sont exprimées en UTC. Production
et simulation se consultent séparément. Les tableaux ont une pagination serveur ;
une absence de mesure n'est pas remplacée par un chiffre inventé.

## Accès

La route est `/belvedere/<BELVEDERE_SECRET_SLUG>`. Le segment secret de 32 à 128
caractères alphanumériques, tirets ou underscores est une configuration serveur,
jamais une constante de l'interface. Utiliser une valeur aléatoire forte, par
exemple 32 octets tirés par un générateur cryptographique puis encodés en hexadécimal.
Ne pas la déposer dans Git ni dans une variable `VITE_*`.

L'adresse seule ne donne aucun droit. Le serveur exige :

1. L'environnement et le mode production, une configuration de route valide et
   l'origine canonique de l'application.
2. Une session navigateur authentifiée et valide, avec appartenance actuelle.
3. Une preuve du dernier parcours Auth0, liée au hash de la session et à
   l'identité fournisseur : issuer attendu, subject signé et adresse vérifiée
   exactement `nicolas@pieper.fr` (normalisation minuscule).
4. Si `BELVEDERE_AUTH0_SUBJECT` est configuré, le même subject Auth0. Cette
   protection supplémentaire évite de dépendre d'une seule adresse réattribuable.

La preuve est capturée après validation des deux JWT et de l'adresse vérifiée.
Les anciennes sessions doivent se reconnecter. Modifier `users.email`, posséder
un rôle administrateur d'atelier ou fournir un token MCP/native ne confère pas
ce privilège. La politique MFA existante reste appliquée par l'authentification.

Toute lecture JSON refait le contrôle d'accès. Les routes ne proposent aucune
mutation métier. Les refus et adresses inconnues restent discrets ; une visite
sans session à l'adresse exacte peut lancer le parcours Auth0. Les réponses
privées utilisent `no-store`, `noindex`, `no-referrer`, la CSP existante et un
marqueur HTML inerte pour ouvrir le module React. Le secret n'est pas envoyé à
l'asset binding, aux intégrations, à la navigation ordinaire ou au sitemap.
L'aperçu public refuse cette famille de routes et ne peut pas l'activer.
Un refus de lecture retire les données déjà affichées. Le retour sur l'onglet
ou une restauration du navigateur déclenche une nouvelle vérification d'accès,
sans interrogation périodique en arrière-plan.

## Données et isolation

L'accès global constitue une capacité de lecture dédiée, séparée des permissions
et API d'atelier. Les relations entre opérations, réservations, documents,
rapprochements et membres conservent leurs clés d'organisation. Les opérations
métier et les règles d'approbation, d'envoi et de quota ne sont pas contournées.

La migration `0044_belvedere.sql` ajoute la preuve d'identité navigateur, un
identifiant public opaque aux sessions natives, le journal de connexion, l'audit
de consultation et les index de lecture. Les cookies, hashes de credentials,
contenus, destinataires, IP et user agents ne figurent pas dans les projections.

Les pays proviennent uniquement de `request.cf.country`, jamais d'un en-tête
fourni par le client, pour les **connexions**. Les **destinations** proviennent du
pays postal normalisé ou du pays tarifaire fax qualifié ; les emails et anciens
fax sans cette preuve restent « pays non renseigné ». Aucun pays n'est inféré
d'un domaine email. Les marqueurs indiquent un pays, jamais une position précise.
Les événements ne reconstruisent pas rétroactivement les
pays des sessions anciennes. MCP est dédupliqué à une observation par connexion
et jour ; les sessions navigateur et native sont observées à leur ouverture.
Les échecs de connexion Auth0 ne sont pas disponibles dans ce journal et
nécessiteraient un connecteur distinct aux journaux du fournisseur.

Les lectures excluent les événements de plus de 90 jours. Le cron supprime
jusqu'à 1 000 anciennes lignes par table et par passage. L'audit privé consigne
uniquement l'acteur, la date et un code d'action, sans adresse secrète ou requête.
La page de confidentialité décrit ce suivi en FR/EN/DE/LB.

## Examen local

```sh
npm ci
npm run preview:belvedere
```

Ouvrir l'URL affichée sur `127.0.0.1:8794`. Ce serveur autonome ne charge aucune
configuration ou binding métier. Les ateliers, personnes, événements et coûts
sont des fixtures marquées à l'écran. Il écoute uniquement la boucle locale,
refuse les autres en-têtes Host et les requêtes d'écriture. Il ne constitue pas
un mode d'authentification du Worker et ne sert pas à qualifier Auth0.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:belvedere
```

Les tests navigateur dédiés vérifient le vrai bundle avec des réponses fictives.
Les tests d'accès et de SQL utilisent les migrations réelles dans D1/Miniflare.
Ces deux catégories de preuve restent distinctes d'un parcours Auth0 et d'un
appel Cloudflare hébergés.

## Activation ultérieure

Aucune migration distante, configuration fournisseur, fusion ou publication
n'est autorisée par cette préparation. Après autorisation de mise en service :
appliquer la migration additive selon la procédure du dépôt, installer les
secrets serveur, vérifier le subject Auth0 de Nicolas et sa reconnexion, puis
vérifier les refus depuis un autre compte, un assistant, une session expirée et
l'aperçu public. Configurer les connecteurs Cloudflare avec leurs permissions
minimales et vérifier leurs données sur le compte réel. Ne pas inférer leur bon
fonctionnement à partir des réponses fictives.

## Preuves

Vérification locale du candidat le 2 octobre 2026 :

| Contrôle | Résultat |
| --- | --- |
| TypeScript et ESLint | Réussite sur le code final |
| `npm run build` | Bundle web et Worker compilés, dry-run uniquement |
| `npm run build:live` et `npm run build:preview` | Réussite, sans publication |
| Vérification locale des migrations | 44 migrations, schéma équivalent, `quickCheck: ok`, aucune violation de clé étrangère |
| Tests Belvédère backend | 16 réussis : identité signée, refus, isolation, projections, globe, filtres des envois et finances |
| Régressions comptables ciblées | 3 réussies : débit fractionnaire réel, conservation après suppression, hébergement compté une fois |
| Connecteurs Cloudflare | 65 réussis sur réponses fictives : 31 métriques, 34 facturation |
| Géographie du globe | 16 réussis : projection, hémisphères, coordonnées et pays inconnus |
| Sécurité Node | 215 réussis, dont refus de l'omission du préfixe privé dans les règles publiques |
| Navigateurs Belvédère | 18 réussis, Chromium desktop et WebKit iPhone, également avec le bundle de production |
| Pages publiques concernées | 10 réussis, confidentialité/mentions/SEO et sélecteurs de langue, sur les deux navigateurs |
| Revue visuelle | 16 captures inspectées, correction du menu mobile puis verdict `ship` |

La suite Vitest générale a validé 84 fichiers et 1 657 tests lors du premier
lancement. Deux cas Belvédère ont échoué alors que le module et ses nouveaux
tests étaient encore modifiés ; le fichier complet a ensuite été relancé sur
le code final, avec 16 réussites. Les 16 tests du globe, ajoutés après la découverte
initiale des fichiers, ont été exécutés séparément. Cela constitue une preuve
locale composée de la suite générale et des relances ciblées, pas une CI distante.
La suite de sécurité a également nécessité la mise à jour de sa fixture
`robots.txt` pour le nouveau préfixe privé avant de réussir intégralement.

Les tests navigateur couvrent les sept vues, recherche et pagination, ouverture
d'atelier et retour, filtres de pays/canal/état, globe au clavier, distinction des
pays inconnus, états vides, erreurs et retrait des données après expiration ou
reprise d'onglet. Les captures n'utilisent que des fixtures. Aucune connexion
Auth0 hébergée, dépense Cloudflare réelle, migration distante ou publication
n'est revendiquée par ces résultats.
