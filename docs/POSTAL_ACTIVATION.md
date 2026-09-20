# Ouverture du courrier à tous les comptes

Contrat de la livraison du 20 septembre 2026. L’utilisateur a demandé l’ouverture
sur `guteneo.com` pour **tous les comptes**, confirmé que Pingen a été alimenté
et réservé le premier essai d’expédition de bout en bout à son intervention.
La mise à disposition du parcours n’est donc pas une preuve de livraison postale.

## Parcours des comptes existants et futurs

Dans **Expéditeurs**, un administrateur connecté déclare le nom et l’adresse de
l’expéditeur de son organisation, puis confirme son autorisation de les utiliser.
Le formulaire fonctionne pour les organisations déjà inscrites comme pour les
nouvelles. Un membre ou un lecteur doit passer par un administrateur.

`GET /api/postal/setup` est une lecture. `POST /api/postal/setup` exige une session
navigateur valide, l’origine et le CSRF, un administrateur actuel et une déclaration
explicite. Un jeton assistant ne donne pas accès à cette opération. Aucun mandat
expert n’est créé ou étendu. Les coordonnées ne sont pas ajoutées au PDF.

Le serveur vérifie le profil du compte Pingen par OAuth en lecture seule : compte
configuré, devise EUR, pays attendu et fenêtre d’adresse. Il enregistre atomiquement
l’expéditeur, sa déclaration, les huit politiques d’impression/distribution et
l’ouverture du canal de l’organisation. Les crédits et quotas existants ne sont
pas augmentés. L’organisation, le compte fournisseur et les prix ne viennent
jamais du formulaire. La transaction recontrôle les droits et la session.

Le statut interne `senders.status='verified'` indique ici l’autorisation déclarée
par l’administrateur authentifié. La preuve dédiée conserve
`physical_address_verified=0` et l’interface affiche **Déclaré par l’administrateur**.
Il ne s’agit ni d’une vérification physique de l’adresse ni d’une vérification par
Pingen. Les autres canaux gardent leurs vérifications propres.

Une répétition identique ne crée pas un nouvel expéditeur. Un expéditeur révoqué,
un arrêt explicite du canal ou une politique révoquée ne sont pas réactivés par
ce formulaire. Les politiques expirent après 90 jours ; leur renouvellement
explicite conserve la déclaration et ne prolonge aucun devis déjà approuvé.

Après activation : import du PDF exact, analyse antivirus, contrôle postal,
revue et consentement au transfert, brouillon Pingen `auto_send:false`, devis,
approbation et confirmation d’envoi. Les destinations actuellement supportées
restent France, Luxembourg et Allemagne, avec les règles du profil Pingen lu.
Les retours physiques ne sont pas promis.

## Prix postal et preuve fournisseur

Le tarif postal utilise le calculateur Pingen pour le brouillon exact : papier
analysé, pays, recto/verso, couleur et vitesse. Le prix client est le double du
montant EUR retourné ; les montants restent entiers en centimes pour ce canal.
Les huit combinaisons proposées ont une politique distincte. Aucun prix fictif
ou montant fixe de l’ancien essai LU n’est installé.

La base publique est `public_list_price_ex_tax`, avec la méthode explicite
`pingen_price_calculator`, sans conversion de devises. Pingen indique que les
prix d’expédition excluent la TVA et que celle-ci est traitée lors de l’achat des
crédits. Sources relues le 20 septembre :
[crédits et TVA](https://help.pingen.com/en/credits-and-billing/introduction-balance-and-credits),
[justificatifs TVA](https://help.pingen.com/en/credits-and-billing/vat-statements),
[contrat du calculateur](https://api.pingen.com/documentation/swagger-docs).
Ce prix HT n’est pas une affirmation sur la fiscalité ou la facture finale de
Guteneo. La recharge payante reste désactivée.

La migration `0030_postal_public_pricing.sql` étend les contrôles SQL de la base
HT au contrat postal EUR et préserve les devis historiques et SES. La migration
`0031_postal_sender_declarations.sql` conserve la déclaration liée à l’organisation.
L’empreinte approuvée inclut la base HT. Le connecteur reconstruit cette empreinte
depuis le devis validé puis relit le prix et la preuve Pingen avant le PATCH final.
Un changement, une expiration ou une révocation bloque l’envoi.

## Publication et niveau de preuve

La configuration source ouvre `fax,postal` et laisse l’e-mail fermé. Le garde de
publication contrôle cette liste et son manifeste ; les sources sont publiées
depuis le commit fusionné et vérifié de `main`. Les migrations sont appliquées et
contrôlées avant publication. La preuve finale doit rapprocher le commit,
`release.json`, les assets publics, les capacités par canal et le trafic Cloudflare.

L’inspection privée du 20 septembre confirme OAuth Pingen, EUR, profil LU et fenêtre
gauche. Le contrôle du scanner publié a retourné `SIGNATURES_STALE` ; une nouvelle
image locale a été construite avec la base ClamAV 28129 du 20 septembre à 06:26:26
UTC. PDF propre, EICAR, limites et absence de fichiers temporaires ont été vérifiés
localement. La preuve distante après déploiement reste nécessaire ; une image
locale ne constitue pas une correction de production.

La maintenance quotidienne des signatures reste une obligation opérationnelle ;
la limite de 72 heures n’est pas augmentée. Le nettoyage des brouillons clients
abandonnés chez Pingen et les résultats de soumission incertains restent gérés
par intervention opérateur : aucun renvoi ni remboursement automatique n’est
autorisé par l’incertitude. Les quatre abonnements Pingen sont configurés ; la
preuve d’un suivi réel accompagnera le premier essai de l’utilisateur.

Les tests locaux et CI utilisent des comptes et transports interceptés. Ils
doivent couvrir l’isolation, l’autorité navigateur, la concurrence, les huit
politiques, les prix gelés, les révocations et l’interface sur ordinateur/mobile.
Aucun de ces tests n’est une lettre réellement expédiée.
