# État du service Guteneo

`https://status.guteneo.com/` est le point d’entrée public pour les clients,
l’équipe produit et l’astreinte. Il possède son propre Worker et sa propre base
D1 européenne. Il reste indépendant des bindings, secrets, documents, comptes
et fournisseurs de l’application métier. Cette indépendance ne couvre pas une
panne générale de Cloudflare, qui héberge les deux services.

## Ce que les preuves permettent de conclure

- **Production observée** : quatorze lectures anonymes sur une liste fixe de
  pages, contrats publics et refus d’accès attendus, toutes les quinze minutes.
  Aucun devis, envoi, achat, scan hébergé ou rendu payant n’est déclenché.
- **Fonctions qualifiées localement** : vrai domaine en mode production, D1/R2
  locaux et scénarios synthétiques ; transports fournisseurs remplacés à leur
  frontière. Le profil hors ligne interdit les connexions externes au niveau du
  système et conserve une preuve horodatée, distincte de la production.
- **Non vérifié** : livraison chez le destinataire, prestations fournisseurs,
  intégration réelle du scanner et parcours authentifiés non exécutés. Une
  lecture HTTP ou une simulation ne transforme jamais ces lignes en succès.

Voir [les tests hors ligne](TESTING_OFFLINE.md) et
[le diagnostic de commande sans consommation](PRODUCTION_DRY_RUN.md).

## Historique et lecture

La vue **Service** présente les résultats de la surveillance publique, sa
fraîcheur, les trois groupes de contrôles et leur historique. Quatorze contrôles
récents réussis donnent un bilan positif limité à ce périmètre. Seul un écart
observé déclenche une alerte ; une mesure absente, invalide ou ancienne reste
inconnue. Le manque de couverture d’un parcours métier ne constitue pas une
panne et ne dégrade pas ce bilan.

La vue **Vérifications** conserve les résultats détaillés, les preuves locales
et la couverture des parcours. Les fonctions hors du périmètre public et les
fonctions non activées y sont présentées avec des badges neutres. Cette
séparation ne transforme ni une simulation ni une configuration en preuve de
livraison réelle.

Les vues 7 jours, 30 jours et 365 jours utilisent des observations réelles.
Le taux de disponibilité porte uniquement sur les mesures reçues ; la couverture
des créneaux attendus est affichée séparément. Une journée sans mesure demeure
inconnue. Aucun historique antérieur à l’activation n’est reconstitué.

Le collecteur écrit un instantané par créneau ; les agrégats journaliers évitent
de relire tous les instantanés lors d’une vue annuelle. La rétention est bornée
à 366 jours. Une observation trop ancienne déclasse l’état affiché en inconnu.
Les lectures publiques ne peuvent ni exécuter de test, ni écrire de résultat.

## Exploitation

1. Consulter l’heure de la dernière mesure avant d’interpréter un état.
2. Si les observations sont anciennes, vérifier le Cron Trigger, les erreurs
   du Worker `guteneo-status` et la disponibilité de `STATUS_DB`.
3. Si un contrat public échoue, comparer le détail du contrôle à la réponse
   réelle et à la version `/release.json` de Guteneo. Ne pas déclencher un
   envoi ou créer un devis pour diagnostiquer un problème de disponibilité.
4. Un résultat local échoué nécessite une nouvelle qualification sur les sources
   corrigées. Un rapport ancien ne prouve pas une nouvelle version.
5. Après correction, attendre une nouvelle collecte. Ne pas modifier un
   instantané historique pour rendre les graphiques verts.

L’interface expose des constats, dates et codes techniques publics, jamais de
contenu client, destinataire, identifiant de commande, jeton ou URL signée.
Les effets saisonniers sont décoratifs, désactivables, bornés et limités à la
page de statut. Ils respectent `prefers-reduced-motion`.

## Ressources et coût

L’utilisateur a explicitement accepté le 10 octobre 2026 l’utilisation des
quotas Cloudflare existants, avec **aucun coût métier**. Le compte utilise le
modèle Workers Standard ; le domaine « Free Website » ne rend pas Workers
gratuit. La lecture de l’abonnement et de la facture n’est pas permise par les
identifiants disponibles : aucune facture finale n’est inférée.

Tarifs officiels consultés le 10 octobre 2026 :

| Ressource | Inclus dans le compte Workers Paid | Dépassement |
| --- | --- | --- |
| Requêtes Worker | 10 millions/mois | 0,30 USD/million |
| CPU Worker | 30 millions de ms/mois | 0,02 USD/million de ms |
| Lectures D1 | 25 milliards de lignes/mois | 0,001 USD/million |
| Écritures D1 | 50 millions de lignes/mois | 1 USD/million |
| Stockage D1 | 5 Go | 0,75 USD/Go-mois |
| Fichiers statiques servis directement | Illimité | Gratuit |

Sources : [Workers](https://developers.cloudflare.com/workers/platform/pricing/)
et [D1](https://developers.cloudflare.com/d1/platform/pricing/).
Les quotas sont **partagés par le compte**, pas réservés à ce service.
Le compte possède déjà son abonnement ; aucun nouvel abonnement n’est créé.

À quinze minutes, prévoir 2 880 collectes et 40 320 lectures de Guteneo par mois
de trente jours. Les appels entrants à Guteneo peuvent consommer ses propres
quotas. La page statique évite le Worker ; seules les lectures d’état/historique
l’invoquent. Leur nombre dépend de l’audience. Le cache limite les lectures D1,
mais ne constitue pas une garantie de requêtes Worker gratuites. Ne pas activer
Workers Caching devant les fichiers statiques, qui changerait leur facturation.

Les agrégats annuels lisent au maximum 1 460 lignes par requête. La collecte ne
lance ni navigateur hébergé ni container. Ces bornes réduisent les coûts ; elles
ne constituent pas un plafond de facture. Les mesures de build, startup, latence
et ressources exécutées sont consignées avec la preuve de publication.

Mesure locale sur le schéma final : 11 écritures de lignes pour une première
collecte hors purge, et 1 462 lectures pour une année remplie (1 460 agrégats et
deux métadonnées). Le bundle Worker préparé pèse environ 22 Ko, moins de 8 Ko
compressé. Le plafond CPU est fixé à 50 ms par invocation ; ce plafond n’est pas
une mesure de consommation. La mémoire et le CPU hébergés restent à mesurer
dans les métriques Cloudflare, sans extrapoler les timings locaux.

La suite UI réutilisable se lance avec
`npx playwright test -c playwright.status.config.ts --project=chromium`.
Ses scénarios utilisent des réponses synthétiques et un serveur statique
limité à la boucle locale ; ils ne lancent ni collecte ni D1. La CI les conserve
avec les tests du service, de sécurité et du produit. Une mesure de production
et sa première exécution Cron demeurent des preuves distinctes.

## Publication et retour arrière

Publication observée le **10 octobre 2026** : le service et l’application
exposent le commit `c953596dc0650961a7294da622703f5edc3a764d`. Les **20 assets**
publics du statut ont été vérifiés. La première collecte Cron a terminé à
**02:45:05.570 UTC**, avec **14 contrôles publics réussis sur 14**. La lecture
à 02:45:37.358 UTC confirme une mesure enregistrée dans chacune des fenêtres
7/30/365 jours ; les jours antérieurs restent sans mesure. Ces preuves publiques
ne qualifient aucun parcours métier authentifié ni aucune livraison.

`npm run build:status` produit les fichiers statiques et leur manifeste lié aux
sources. La preuve locale est incluse uniquement si son périmètre et son empreinte
correspondent aux sources actuelles ; sinon elle apparaît indisponible. Cette
empreinte est contrôlée à nouveau avant publication, après la migration.
`npm run deploy:status` exige une branche `main` propre identique au
`origin/main` fraîchement relu, applique uniquement les migrations dédiées au
statut, puis publie le Worker. Il n’applique aucune migration métier.

Vérifier ensuite le domaine, les headers, les empreintes du manifeste, les trois
fenêtres d’historique et la première collecte Cron réelle. Les périodes vides
avant cette collecte restent inconnues. Le lien depuis le site principal est
publié par le circuit habituel `npm run deploy:live`.

Pour revenir à une version précédente, sélectionner sa version Cloudflare
vérifiée ; conserver les observations existantes et vérifier leur compatibilité.
Ne pas supprimer la base d’historique comme moyen de retour arrière.
