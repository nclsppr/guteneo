# Resend pour Guteneo

Historique de préparation du 17 septembre 2026, branche `feat/resend-email-connector`.

Le candidat courant du 21 septembre utilise les migrations **0034–0035** et le
contrat décrit dans [PROTECTED_EMAIL.md](PROTECTED_EMAIL.md). Les données de
publication du 17 septembre ci-dessous sont historiques ; le suivi courant est
dans [RESEND_PROOF.md](RESEND_PROOF.md).
Le connecteur et sa migration sont un candidat local. Aucun déploiement de code,
envoi de test, campagne, achat ou activation Auth0 n'est réalisé par ce travail.
Le domaine et les deux clés d'envoi ont été configurés après autorisation ;
le secret Worker est installé et le fournisseur Auth0 relu désactivé.

## Les trois usages

| Usage                                                         | Chemin                                                                                                   | Autorisation et suivi                                                                                                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vérification de compte, réinitialisation, notifications Auth0 | Fournisseur Resend natif dans Auth0 ; clé dédiée ; `Guteneo <no-reply@guteneo.com>` proposé              | Paramétrage du tenant Auth0, indépendant des verrous d'envoi du Worker. Voir [AUTH0_RESEND.md](AUTH0_RESEND.md).                                         |
| Documents et campagnes transactionnelles Guteneo              | `ResendEmailProvider` derrière les opérations communes REST/MCP et les files existantes                  | Un destinataire par commande, contenu immuable, approbation, devis qualifié, crédit et contrôle des suppressions.                                        |
| Newsletters et campagnes marketing de Guteneo                 | [Broadcasts Resend](https://resend.com/broadcasts), contacts abonnés, segments et désinscriptions Resend | Le compte et le domaine peuvent servir cet usage. Aucun contact ni campagne réelle n'est créé. Le moteur marketing de l'application Guteneo reste fermé. |

Les campagnes existantes de documents restent bornées à 500 lignes avec
approbation individuelle. Ce connecteur ne prétend pas livrer un moteur
d'automatisation marketing dans Guteneo. Les Broadcasts sont un outil distinct,
avec leur propre audience, revue avant publication et gestion des abonnements.
Les destinataires de documents et les comptes Auth0 ne deviennent jamais
automatiquement des abonnés marketing.

## Compte et domaine réels

La connexion Google dans Safari a ouvert l'espace Resend personnel `nclsppr`.
Guteneo.com a été ajouté en région **Ireland (`eu-west-1`)**, domaine Resend
`0140c1df-a406-495d-adb7-78a1204607b3`. L'interface ne montrait aucune clé API
ni aucun e-mail envoyé avant cette préparation. Deux clés ont depuis été
créées après autorisation : `Guteneo Worker · envoi guteneo.com` et
`Guteneo Auth0 · envoi guteneo.com`, chacune en **Sending access** limitée à
`guteneo.com`. Elles appartiennent à cet espace personnel, sans création d'un
compte dédié. Leurs valeurs ont été transférées par les formulaires locaux,
sans affichage ni stockage dans le dépôt.

La présence de `RESEND_API_KEY` dans le Worker a été relue avec Wrangler.
Le fournisseur Auth0 natif et son expéditeur `no-reply@guteneo.com` sont
installés mais **désactivés**. Aucun envoi réel n'a été effectué.

Trois enregistrements ont été ajoutés dans la zone Cloudflare Guteneo.com après
vérification de l'absence de conflit, avec TTL 300 et proxy désactivé :

| Type  | Nom                             | Destination / contenu                                                                         |
| ----- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| TXT   | `resend._domainkey.guteneo.com` | Clé DKIM publique exacte fournie par ce domaine Resend ; empreinte conservée dans le rapport. |
| CNAME | `rsend.guteneo.com`             | `rsend-euw1.forge.rmta.net`                                                                   |
| CNAME | `send.guteneo.com`              | `send.forge.rmta.net`                                                                         |

Ces valeurs proviennent du compte courant : ne pas leur substituer les anciens
exemples Resend reposant sur un MX Amazon. Les trois CNAME DKIM SES, le MAIL FROM
SES `bounce.guteneo.com`, le SPF correspondant et le DMARC existant sont
conservés. La réception d'e-mails Resend reste désactivée. La région d'envoi
n'est pas une garantie de résidence européenne de toutes les données du service.

L'état final de vérification et les contrôles locaux figurent dans
[RESEND_PROOF.md](RESEND_PROOF.md). Un domaine vérifié ne prouve ni un envoi,
ni sa remise en boîte de réception.

## Configuration applicative

`EMAIL_PROVIDER` accepte `resend` ou `ses`. Son omission conserve SES pour les
déploiements existants ; une valeur inconnue bloque le transport. Le modèle de
configuration de production présente désormais Resend, avec l'envoi fermé.
Le fichier `wrangler.live.jsonc` et la sélection des canaux du Worker publié ne
sont pas modifiés par ce candidat. Seule l'installation du secret est une
écriture de configuration distante : version
`9698a3ae-6ec0-4f94-b464-403fefabe567`, source **Secret Change**, 100 % du trafic.
Le code public reste
`c3798f59cb6cff4e1dcaddb524f43d59b1009822`. Son état
`liveSending=true`, `liveSendChannels:["fax"]` autorise le fax existant ;
l'e-mail n'est pas activé.

| Paramètre                                  | Rôle                                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`                           | Clé d'envoi serveur réservée à Guteneo et au domaine ; stockage en secret Cloudflare.                    |
| `RESEND_WEBHOOK_SECRET`                    | Secret Svix du webhook applicatif, jamais la clé API.                                                    |
| `RESEND_ACCOUNT_ID`                        | Identité stable du compte qualifiée par l'opérateur ; ne pas inventer un identifiant à partir d'une clé. |
| `RESEND_DOMAIN_ID`                         | Identifiant réel du domaine Resend ci-dessus.                                                            |
| `RESEND_VERIFIED_DOMAIN`                   | Exactement `guteneo.com` pour ce raccordement.                                                           |
| `RESEND_SENDS_ENABLED`                     | `true` uniquement après qualification et autorisation de l'activation.                                   |
| `LIVE_SENDS_ENABLED`, `LIVE_SEND_CHANNELS` | Verrous généraux existants, également nécessaires pour les commandes métier.                             |

`npm run setup:email` ouvre le formulaire local de stockage des secrets Resend ;
`npm run setup:email:ses` conserve le chemin SES. Installer des secrets ne
change pas le fournisseur sélectionné et n'ouvre pas les envois. Les outils
ne doivent être exécutés contre les ressources publiées qu'avec l'autorisation
correspondante. Lire [SECURE_CONFIGURATION.md](SECURE_CONFIGURATION.md).
L'installation effectuée dans cette préparation utilise le profil limité à
`RESEND_API_KEY` : les identifiants de compte et de webhook ne sont pas inventés
pour remplir les autres champs. Ils restent à qualifier séparément.

Le webhook applicatif est `https://guteneo.com/webhooks/resend`. Qualifier au
minimum les événements `email.sent`, `email.delivered`, `email.failed`,
`email.bounced`, `email.complained` et `email.suppressed`. Les signatures portent
sur le corps brut et les en-têtes Svix ; une signature invalide n'atteint pas la
projection. Les événements d'Auth0/Broadcasts sans commande Guteneo correspondante
ne créent jamais une commande métier.

La lecture privée `node scripts/provider-readiness.mjs resend` inspecte le
domaine sans envoyer. Une clé limitée à l'envoi peut refuser cette lecture ; ce
refus est explicite, et n'autorise pas à élargir automatiquement ses droits.

## Migration et tarification

La migration `0030_resend_email_transport.sql` étend les qualifications et
devis par fournisseur, et ajoute les limites/reservations Resend. Elle n'est
appliquée qu'aux bases locales de test pendant cette préparation. Avant toute
application distante : sauvegarde/Time Travel, revue du schéma, migration
coordonnée avec le code, `foreign_key_check` et `quick_check`.

Une politique de prix SES n'autorise jamais un devis Resend. Le nouveau
fournisseur requiert sa propre qualification de coût, de compte, de domaine,
d'expéditeur et de limites. Les plafonds gratuits affichés par Resend ne sont
pas un tarif de revente ni un engagement de coût nul durable. Les envois Auth0
consomment aussi la capacité du compte ; réserver une marge appropriée dans
les limites métier après qualification. Un changement de fournisseur interdit
de router vers Resend une commande approuvée pour SES, ou l'inverse.

Chaque tentative transmet exactement le contenu approuvé et ses octets PDF.
La clé d'idempotence Resend suit la commande ; sa fenêtre de 24 heures n'autorise
aucun renvoi automatique après un résultat inconnu. L'acceptation et la remise
sont deux faits séparés. Les logs ne contiennent ni contenu, ni destinataire,
ni secret.

## Revenir à Amazon SES

Conserver les ressources AWS et DNS existantes. Après qualification SES,
sélectionner explicitement `EMAIL_PROVIDER=ses` et ses contrôles habituels.
Les commandes préparées sous un autre fournisseur doivent recevoir un nouveau
devis et une nouvelle approbation. Les commandes incertaines restent à
rapprocher chez leur fournisseur original. Aucun basculement automatique.

## Sources officielles vérifiées

- [Resend natif dans Auth0](https://resend.com/docs/send-with-auth0)
- [Vérification des domaines](https://resend.com/docs/dashboard/domains/introduction)
- [API d'envoi](https://resend.com/docs/api-reference/emails/send-email)
- [Clés d'idempotence](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Vérification des webhooks](https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests)
- [Broadcasts et audiences](https://resend.com/docs/dashboard/broadcasts/introduction)
