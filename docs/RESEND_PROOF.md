# Preuves Resend et documents protégés

## Candidat du 21 septembre 2026

Le candidat est suivi dans [la PR #27](https://github.com/nclsppr/guteneo/pull/27),
qui consigne les validations et l’état de publication. Le contrat est décrit dans
[PROTECTED_EMAIL.md](PROTECTED_EMAIL.md), et les détails d’accès dans
[PROTECTED_DOCUMENTS.md](PROTECTED_DOCUMENTS.md). L’historique du 17 septembre est
conservé plus bas et ne décrit pas la publication courante.

État externe observé pendant la préparation du 21 septembre : domaine Resend `guteneo.com` vérifié, équipe personnelle
`nclsppr`, région `eu-west-1`, offre Free avec 100 e-mails/jour, 3 000/mois et
10 requêtes/seconde. Le suivi des ouvertures et des clics n’est pas configuré.
La clé d’envoi Worker existante reste restreinte au domaine. La clé AES-GCM
`PROTECTED_DOCUMENTS_KEY` a été générée en mémoire et installée dans Cloudflare ;
sa présence seule a été relue. Aucune valeur secrète n’est conservée ici.

À cette étape de préparation, le webhook applicatif à six événements est préparé
dans Resend, en attente de la
confirmation de création demandée dans cette tâche. `RESEND_WEBHOOK_SECRET` n’est
pas encore installé. La production conserve ses canaux fax/postal ; le code
Resend et les migrations 0037–0039 ne sont pas encore publiés. Aucun e-mail réel
n’a été envoyé. Les essais destinés à une boîte personnelle attendent l’adresse
et l’autorisation du titulaire.

Preuves locales : types, lint, compilation web/Worker ; migration normalisée
équivalente sur 39 migrations après intégration du parcours postal simplifié,
du choix de fenêtre et des devis fax de revue, `quick_check=ok`, aucune violation de clé étrangère.
Huit tests d’intégration Resend couvrent les trois modes, les octets exacts,
l’acceptation atomique, la révocation, l’expiration juste avant soumission et
l’absence de double débit. Les devis SES et Pingen déjà peuplés restent identiques
après migration. Dix-neuf tests de protection/configuration vérifient notamment
le compte reviewer limité à la préparation. Les tests MCP et les parcours
navigateur utilisent des données fictives et des appels fournisseurs interceptés.
La [CI complète de `590818a`](https://github.com/nclsppr/guteneo/actions/runs/35551544452)
a réussi : scanner, types/lint, migrations, tests unitaires/intégration, sécurité,
compilations et navigateurs Chromium, mobile Chromium et iPhone WebKit. Ce résultat
précède l’intégration finale de la PR #28 ; la PR #27 conserve les contrôles de la
source réconciliée. Les essais de fournisseur et de navigateur restent synthétiques.

Le candidat inclut une archive plugin 0.3.0 et les contrats ChatGPT/Claude. Cela
ne constitue ni une nouvelle soumission ni une publication dans une marketplace.

---

# Historique : préparation Resend

17 septembre 2026. Branche `feat/resend-email-connector`, base `c3798f5`.

## Configuration externe vérifiée

- Connexion Google à Resend réussie dans Safari, espace personnel `nclsppr`.
- Domaine `guteneo.com`, ID `0140c1df-a406-495d-adb7-78a1204607b3`, région
  `eu-west-1` (Irlande), ajouté dans Resend.
- Trois enregistrements DNS ajoutés via l'API Cloudflare, après lecture de
  la zone et absence de conflit. Relecture : les dix enregistrements de la
  zone comprennent les sept précédents inchangés et les trois nouveaux.
- L'interface Resend affiche **Verified** pour le domaine, le TXT DKIM,
  `rsend` et `send`. L'événement de vérification affiche le 17 septembre,
  17:19 dans le navigateur local. Lecture publique indépendante du DKIM
  et des destinations DNS effectuée.
- Réception désactivée, suivi des ouvertures/clics non configuré, aucun achat
  ou dépassement payant activé. Aucun e-mail réel envoyé.
- Après autorisation, deux clés distinctes **Sending access**, limitées à
  `guteneo.com`, ont été créées dans l'espace personnel `nclsppr` :
  `Guteneo Worker · envoi guteneo.com` et
  `Guteneo Auth0 · envoi guteneo.com`. Il ne s'agit pas d'un nouveau compte
  Resend dédié. Leurs valeurs n'ont été ni affichées ni enregistrées dans les
  fichiers, rapports ou commandes.
- Le secret Worker `RESEND_API_KEY` a été installé par le formulaire local ;
  sa présence a été relue avec la liste des secrets Wrangler. La modification
  de configuration, source **Secret Change**, porte la version
  `9698a3ae-6ec0-4f94-b464-403fefabe567`, créée le
  `2026-09-17T15:40:55.658Z`, avec 100 % du trafic.
- Le fournisseur Resend natif a été préparé dans Auth0 avec
  `no-reply@guteneo.com`, **désactivé**. La relecture finale confirme
  `nativeResend=true`, `enabled=false`, `guteneoSender=true`. Le premier
  contrôle avait signalé à tort un échec : Auth0 ne renvoie que `name` et
  `enabled` sans sélection explicite des champs. Le contrôle corrigé demande
  aussi `default_from_address`, jamais `credentials`, et confirme
  l'installation existante sans recréer de clé ni réécrire le fournisseur.
- L'écran Usage affiche les plans gratuits transactionnel et marketing ;
  il ne s'agit ni d'un tarif métier qualifié ni d'un engagement de gratuité.

Rapport sans secret : `reports/resend-domain-proof.json`.
Le DKIM est une clé publique ; seule son empreinte est conservée dans ce rapport.

Le code public reste celui de
`c3798f59cb6cff4e1dcaddb524f43d59b1009822`. Aucun nouveau code applicatif ni
migration distante n'a été déployé dans ce travail. La configuration publiée
conserve `liveSending=true` et `liveSendChannels:["fax"]` pour le fax déjà
autorisé ; **l'e-mail métier reste désactivé**. L'installation du secret ne
change ni cette sélection de canaux ni l'état du fournisseur Auth0.

## Validation locale

- Installation `npm ci` réussie ; audit npm sans vulnérabilité signalée.
- Construction `npm run build` réussie : vérification TypeScript, assets web
  et Worker en `--dry-run`, sans déploiement.
- Quatre scénarios navigateur ciblés réussis sur mobile Chromium et iPhone
  WebKit : attestation volontaire du destinataire, erreurs SES/Resend,
  résultat inconnu interdisant les doublons, aucun débordement à 320 px,
  aucune requête d'envoi.
- Tests spécifiques du client, du pont métier, des callbacks et de la
  migration exécutés sur données fictives/interceptions réseau. La migration
  vérifie la conservation de devis SES, approbations, crédit déjà décompté et
  suppressions existantes ; contrôles FK vides et `quick_check=ok`.

- Le premier résultat consolidé comprend **1 163 tests Vitest réussis dans
  57 fichiers**, suivis de **150 tests de sécurité réussis**. Rapports :
  `reports/resend-vitest.json` et `reports/resend-full-test.log`.
- Les ajustements ultérieurs du profil de clé et du contrôle des champs Auth0
  passent **14 tests ciblés**, dont le formulaire Chromium. La suite de
  sécurité finale passe ensuite **154/154 tests**, sans échec ; rapport
  `reports/resend-security-final.log`. Le total final est donc **1 163 tests
  unitaires/intégration, 154 tests de sécurité et quatre E2E ciblés** ; la
  suite Vitest complète n'est pas présentée comme réexécutée après ce correctif.
- Typecheck, lint et build réussis. Les **quatre** scénarios E2E ciblés sont
  conservés dans `reports/resend-e2e.json`. Ces preuves locales utilisent des
  clés fictives et des réponses interceptées ; elles ne prouvent pas une
  livraison Resend réelle.

## Étapes restantes

- Créer et qualifier le webhook Resend, ses événements signés et leur remise
  au Worker après déploiement autorisé.
- Qualifier l'identité du compte et les politiques de coût/limite. Ne pas
  reprendre les tarifs SES pour Resend ; prévoir la capacité partagée Auth0.
- Terminer l'installation et la qualification des templates natifs d'e-mail
  Auth0, puis activer séparément le fournisseur après autorisation ; ses
  e-mails sont indépendants des verrous métier Guteneo. Le suivi visuel du
  branding est distinct dans [AUTH0_BRANDING.md](AUTH0_BRANDING.md).
- Appliquer la migration distante et déployer uniquement après autorisation.
- Effectuer un test réel avec destinataire et contenu explicitement approuvés,
  vérifier réception et callbacks. Aucun succès de livraison n'est déduit des
  tests locaux ou du domaine vérifié.

Les changements préparés n'activent pas le moteur marketing de Guteneo.
Les Broadcasts natifs Resend demeurent un chemin opérateur distinct, sans
import d'abonnés ni publication effectués dans cette préparation.
