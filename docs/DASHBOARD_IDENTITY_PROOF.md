# Intégration dashboard, identité et membres — 9 octobre 2026

Candidat basé sur `619c8b4` (main), avec intégration de Belvédère `a8ac638`.
Le checkout principal et ses travaux non liés sont préservés. La fusion de
l’administration est expressément autorisée ; production et activation ne le sont pas.

## Preuves locales exécutées

| Vérification                                   | Résultat                                                                                                                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installation `npm ci`                          | Réussie ; versions verrouillées inchangées                                                                                                                                                                                          |
| TypeScript, ESLint et `git diff --check`       | Réussis sur le candidat final                                                                                                                                                                                                       |
| Atlas technique et matrice/parcours            | Régénérés et vérifiés                                                                                                                                                                                                               |
| Migrations                                     | 52 migrations, 362 objets, schéma équivalent, `quickCheck: ok`, zéro violation FK                                                                                                                                                   |
| Suite locale complète                          | 1 920 tests applicatifs et 242 tests de sécurité réussis avant les corrections de télémétrie ; le dernier SHA est vérifié en CI                                                                                                     |
| Authentification, compte, Belvédère et finance | 92 tests réussis, incluant les vrais triggers D1 de débit Horizon et les six régressions de télémétrie                                                                                                                              |
| Identité/profil/contacts/homonymes             | 30 tests navigateur réussis, trois projets, quatre langues                                                                                                                                                                          |
| Régression dashboard/compte/facturation/rôles  | 75 réussis, 3 skips desktop intentionnels                                                                                                                                                                                           |
| Belvédère, navigation et finance               | 20 tests réussis, ordinateur et iPhone WebKit                                                                                                                                                                                       |
| Build application + Worker dry-run             | Réussi ; aucun Worker publié                                                                                                                                                                                                        |
| Build preview                                  | Réussi ; aucune publication                                                                                                                                                                                                         |
| Preview public                                 | Premier run : 145 réussis, 6 skips et une mesure de header instable avant chargement des fontes. Attente des fontes ajoutée ; les 6 scénarios iPhone de navigation/langue passent ensuite. La CI vérifie de nouveau toute la suite. |

Les 30 nouveaux scénarios couvrent identité persistante, profil/locale enregistrés,
email en lecture seule, superviseur aux options indépendantes, contacts et droits,
homonymes, erreur et reprise, changement d’atelier et changement de compte dans
un autre onglet encore actif, et réponse contacts malformée sans perte du profil. Tous leurs appels sont interceptés : ce sont des
preuves d’interface avec des personnes fictives, pas une qualification Auth0 hébergée.
Les tests backend exercent les gardes réelles des sessions, memberships et D1.

La finance Belvédère inclut les débits Horizon par date de comptabilisation,
séparément des canaux d’envoi et sans les ajouter aux compteurs d’envois. Les vues
opérationnelles overview/atelier conservent leur cohorte d’envois créée sur la période.
Le nouvel index Horizon limite le coût des lectures de débit. La session est
relue au retour d’onglet, sans polling périodique ; les événements focus/visibility
sont dédupliqués sur une seconde.

Les 117 scénarios regroupant identité, langues, guides assistant et délégation
passent sur les trois projets après correction des fixtures de contacts. Les
assertions de consentement et de mutation sont conservées. Une réponse de contacts
malformée affiche une erreur locale avec reprise et laisse le profil modifiable.

Le candidat `c645aba` a passé la CI complète `37906035678` : 561 scénarios
applicatifs, 146 preview et 20 Belvédère, avec leurs skips intentionnels et un
contrôle final de complétude réussi. Les corrections de télémétrie passent
les 92 tests regroupés : erreur d’observation sans refus MCP/login/rotation,
déduplication/concurrence/TTL/isolation et nouvelle session/pays/atelier courant.
La preuve signée et l’invalidation de l’ancien cookie sont vérifiées ; les
contrôles de rôle et révocation restent courants. Une nouvelle CI est requise
sur le SHA exact de ces corrections.

La PR 54 a été fusionnée dans `820b51c` après réussite complète de la CI
`37909805642` sur `9ebbe18` : 1 926 tests applicatifs dans 102 fichiers,
242 tests de sécurité, 561 scénarios applicatifs, 146 preview et 20 Belvédère.
La CI de main `37912466748` a réussi onze jobs préalables à la collecte finale,
mais le job iPhone a dépassé son budget total de quinze minutes : ses
187 tests applicatifs et 76 tests preview avaient réussi, et les dix tests
Belvédère n'ont pas pu démarrer. L'annotation GitHub confirme cette limite
de durée. Le budget navigateur passe à trente minutes pour inclure le checkout,
l'installation et toutes les suites, sans changer les délais internes,
les assertions ou la couverture. La PR corrective et la CI de main après
sa fusion portent la preuve complète sur les SHAs exacts.

Le premier run du correctif `37914891327` sur `2fbdac3`, encore limité à
vingt minutes, a mesuré dix minutes vingt-et-une secondes d'installation des
dépendances WebKit. Les 187 tests applicatifs iPhone réussissent ensuite,
mais le preview est interrompu à 25 scénarios sur 76 et Belvédère reste ignoré.
La même CI mobile Chromium atteint ses assertions de configuration postale,
puis échoue sur une capture avec `Page.captureScreenshot: Unable to capture
screenshot` ; les 186 autres tests passent. Ces deux résultats incomplets
restent distincts des runs verts. Le budget de trente minutes tient compte
de l'installation lente observée ; la capture conserve une image obligatoire
et ne reprend que cette erreur transitoire, au plus trois fois.
Le job de sécurité installe les mêmes dépendances Chromium/WebKit : son budget
passe à vingt minutes pour couvrir ce même miroir avant les tests de sécurité.
Les 36 scénarios de configuration postale passent avec cette capture sur
Chromium desktop, Chromium mobile et iPhone WebKit. TypeScript, ESLint,
format YAML/TypeScript et atlas technique passent aussi sur le correctif.

Le run `37921928774` sur `ba6890a` confirme que le budget seul ne corrige pas
le débit : APT reçoit 116 MB en 23 min 15 s (83,4 kB/s) depuis Azure ;
l'installation WebKit dure 23 min 43 s. GitHub interrompt alors le job iPhone
à trente minutes, pendant la suite applicative. Les onze autres jobs préalables
réussissent, mais ce résultat reste incomplet. Le correctif préfère les archives
HTTPS Canonical déjà présentes dans le mirrorlist GitHub et conserve Azure
en secours, en changeant uniquement sa priorité de 1 à 4 avant les installations
Playwright. Il vérifie la référence active et les trois entrées attendues,
refuse sans mutation une configuration inconnue et ne réécrit rien au second
passage. Les suites, clés de signature et sandbox restent inchangées.
Ce choix suit le [mirrorlist officiel GitHub](https://github.com/actions/runner-images/blob/c74a28e5f8943ae6a39cac7c3701dd6bd0a2ea51/images/ubuntu/scripts/build/configure-apt-sources.sh)
et l'[ordre de sélection documenté par APT](https://manpages.debian.org/bookworm/apt/apt-transport-mirror.1.en.html#Fallback_order_for_mirrors).
Le gain de débit et la complétude exigent une nouvelle CI sur le SHA exact.
Dix-huit vérifications ciblées passent sur fixtures en mémoire : sources deb822 et
legacy avec options, commentaire, source désactivée, URI proche, doublon,
priorité inattendue, URI inconnue, absence de source, CRLF, idempotence,
valeurs de désactivation alternatives et champ Enabled ambigu.
Elles ne modifient aucun fichier système et ne contactent aucun miroir.

## Fusion et limites

La PR rattachée contient les résultats des vérifications complètes sur son SHA
exact et l’état de fusion. La CI de main se vérifie aussi après la fusion. Les
anciennes preuves Belvédère restent historiques et ne qualifient pas cette intégration.

Le run CI `37903261816` a interrompu checks et le quatrième shard après dix
minutes : téléchargement du dépôt, installation FFmpeg et suite séquentielle
consommaient le budget du job. Les budgets de ces deux jobs deviennent vingt
minutes, et celui de collecte/vérification dix minutes. Les délais internes des
tests, les fichiers découverts et les exigences de preuve restent inchangés.

Captures fictives revues hors du dépôt sous `/tmp/guteneo-identity-ui/` et résultats
dans `test-results/identity-final2/`. Les journaux de cette exécution sont sous
`/tmp/guteneo-identity-*.log`. Ils ne contiennent que les scénarios synthétiques.

Aucun déploiement, migration distante, configuration Auth0/Cloudflare, envoi réel,
provisionnement payant ou activation de mandat n’est effectué. La migration 0052
doit précéder toute publication du nouveau backend : elle porte aussi les preuves
signées d'identité Auth0 obligatoires au callback, même si Belvédère est désactivé.
Belvédère exige une configuration serveur privée et une nouvelle connexion
vérifiée pour la qualification hébergée. Les contacts web n’ajoutent pas d’annuaire
natif/MCP ni de rôle atelier. Les connexions Auth0 et les fournisseurs sociaux
restent à qualifier en hébergement ; Changer de compte demande la réauthentification
sans promettre le choix d’un compte chez tout fournisseur. Voir les
[limites Auth0](https://auth0.com/docs/authenticate/login/max-age-reauthentication).
