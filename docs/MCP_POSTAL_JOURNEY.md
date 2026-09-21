# Préparer un courrier dans la conversation

Candidat du 21 septembre 2026. Les tests, la publication du serveur, le catalogue
chargé dans ChatGPT ou Claude et un véritable envoi restent des preuves distinctes.

« Envoie ce PDF par courrier » sélectionne le canal postal. Le PDF est importé une
seule fois avec `import_document`, commun aux canaux. Son identifiant est conservé
pendant l’analyse et la collecte des informations ; la préparation passe ensuite
par `preflight_postal_pdf`, jamais par un fax ou une préparation générique qui
contournerait le contrôle postal.

## Expéditeur et informations manquantes

`get_capabilities` inclut l’état postal du compte authentifié si la connexion possède
`documents:read`. Sinon, les capacités générales restent accessibles et indiquent
ce droit manquant, sans révéler l’expéditeur. `get_postal_setup`
relit cet état, l’expéditeur et les droits de configuration. L’assistant réutilise
un expéditeur existant et demande uniquement les données manquantes dans la
conversation : nom et adresse complète d’expéditeur, destinataire, options
d’impression et de distribution, plafond en euros. Il ne devine aucune adresse
et ne confond pas expéditeur et destinataire.

`configure_postal_sender` accepte le nom et l’adresse fournis. Il exige une
identité OAuth administrateur actuelle et `dispatches:prepare`, indépendamment
d’une éventuelle délégation expert. Le service métier partagé avec le navigateur
vérifie le profil fournisseur et les politiques tarifaires. Une répétition
identique réutilise l’expéditeur ; un remplacement, une désactivation, un arrêt
du canal ou une révocation de tarif ne peuvent pas être contournés. Le même outil
peut requalifier explicitement la configuration expirée, avec le même expéditeur
et le même profil. Une lecture ne renouvelle rien.

La migration `0034_postal_sender_submission.sql` conserve l’origine historique
des déclarations navigateur et distingue les soumissions OAuth. Le client et la
connexion sont dérivés de l’identité authentifiée, jamais d’un argument du chat.
L’organisation, l’utilisateur, l’émetteur OAuth, le client, l’identifiant historique
de connexion et sa révision forment un instantané immuable de l’autorité utilisée.
L’insertion vérifie cet ensemble contre la connexion active du même compte. Cet
instantané ne référence pas la ligne de connexion mutable : une réassociation
ultérieure à une autre organisation conserve la preuve historique dans son
organisation d’origine, sans bloquer le changement de compte.
La déclaration reste immuable et `physical_address_verified` reste faux. Aucun
booléen transmis par un assistant n’est présenté comme une preuve de consentement
humain. Cette configuration n’accorde ni mandat expert, ni crédits, ni permission
de transmettre un document ou d’expédier une lettre.

## Document, revue et envoi

Après l’analyse du PDF, les règles postales guident le contrôle de l’adresse du
destinataire. Sur demande explicite, la page d’adresse automatique crée un PDF
distinct ; l’original est conservé. L’adresse d’expéditeur enregistrée n’est pas
automatiquement imprimée et ne constitue pas une garantie de retour du pli.

Le parcours standard remet le `reviewUrl` du contrôle postal dans Guteneo. La
personne relit le document et autorise son transfert pour analyse fournisseur,
puis valide séparément le devis et l’envoi. Un mandat limité au fax n’empêche ni
l’import, ni la configuration postale autorisée, ni cette préparation standard.
Une délégation postale déjà active permet le parcours expert existant ; l’assistant
ne peut pas l’activer ni l’étendre.

Le prompt serveur `postal_pdf` et le skill `postal-pdf` décrivent ces étapes. Les
erreurs d’expéditeur dirigent vers `get_postal_setup`, celles d’un contrôle postal
vers le même `get_postal_preflight`. Un devis en attente ou un transfert incertain
ne doit jamais produire une nouvelle expédition. Les erreurs d’import restent
distinctes de la disponibilité des outils dans l’hôte.

## Qualification

La version de paquet et de serveur MCP est `0.2.2`. Les manifestes, le scénario
postal et les annotations doivent être redistribués ensemble. Une connexion de
développement ChatGPT doit actualiser ses métadonnées puis être testée dans une
nouvelle conversation ; un plugin publié suit son propre processus de revue.

Les preuves locales doivent couvrir le transport MCP, l’import suivi d’une
préparation postale, l’expéditeur absent/existant, les autorisations OAuth et
leur révocation pendant un appel fournisseur, l’isolation des comptes, les
répétitions identiques et les arrêts administratifs. Les fixtures ne qualifient
ni le transfert d’une pièce jointe par tous les hôtes, ni une lettre réellement
expédiée. Aucun envoi réel n’est nécessaire pour valider ce changement.

Preuves locales du candidat : 93 tests de catalogue/transport/reprise MCP et
48 tests de configuration passent, dont des appels HTTP MCP avec de vrais JWT
signés de fixture et une base D1 locale. Le typage, le lint et la construction web
passent. Les 34 migrations produisent un schéma équivalent de 217 objets, avec
`quick_check=ok` et aucune violation de clé étrangère. La revue indépendante
a fait corriger la découverte des capacités avec des scopes limités et une
consigne qui pouvait provoquer un second import. La provenance historique reste
dans son compte après une réassociation OAuth ; un aller-retour entre comptes,
même à horodatages identiques, invalide une opération devenue obsolète avant
l’écriture. Ces résultats ne prouvent pas
encore une conversation native ChatGPT ou Claude avec cette version.
