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
| Suite locale complète                          | 1 920 tests applicatifs et 242 tests de sécurité réussis                                                                                                                                                                            |
| Authentification, compte, Belvédère et finance | 86 tests réussis, incluant les vrais triggers D1 de débit Horizon                                                                                                                                                                   |
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
provisionnement payant ou activation de mandat n’est effectué. Belvédère exige
encore la migration 0052, une configuration serveur privée et une nouvelle connexion
vérifiée pour la qualification hébergée. Les contacts web n’ajoutent pas d’annuaire
natif/MCP ni de rôle atelier. Les connexions Auth0 et les fournisseurs sociaux
restent à qualifier en hébergement ; Changer de compte demande la réauthentification
sans promettre le choix d’un compte chez tout fournisseur. Voir les
[limites Auth0](https://auth0.com/docs/authenticate/login/max-age-reauthentication).
