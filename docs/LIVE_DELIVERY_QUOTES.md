# Devis réels e-mail et courrier

État au 17 septembre 2026 : chemins de production implémentés et testés localement sur D1 avec transports interceptés. Cette livraison ne qualifie aucun tarif réel, ne modifie aucun compte fournisseur et n’expédie rien. Migration additive `0016_live_delivery_quotes.sql` ; les devis fax v2 et les écritures historiques restent intacts.

## Engagement et autorité

`DomainService` reçoit `liveDeliveryIdentity` et le callback privé `postalQuote` via `createLiveDeliveryQuoteConfig(env)`. Aucun champ du body navigateur/MCP ne fixe un coût fournisseur. Les options et le plafond utilisateur peuvent restreindre une demande, jamais qualifier un prix. Le secret fournisseur reste dans le bridge API.

Une ligne opérateur `trusted_delivery_costs`, immuable sauf révocation, qualifie explicitement l’organisation Guteneo, l’expéditeur vérifié, le canal, le compte fournisseur, la route, les options, la source et son SHA-256, la base de coût, la devise EUR, la période et la durée du devis (30–900 secondes). Aucun endpoint public n’installe cette qualification. Compte SES : `SES_ACCOUNT_ID` ; route SES : `AWS_REGION:SES_CONFIGURATION_SET:SES_SANDBOX`. Compte et route Pingen : `PINGEN_ORGANIZATION_ID`. Un changement de compte, région, configuration SES ou mode invalide l’ancienne identité.

Le devis immuable lie cette politique au contenu normalisé, au PDF privé ID/SHA-256/taille, au destinataire, à l’expéditeur, aux options, au prix exact, au plafond, à la source et à l’expiration. Son empreinte fait partie de l’empreinte approuvée humainement. Un assistant ne peut pas approuver. Pour l’e-mail de production, l’approbation humaine exige en plus l’attestation que le destinataire a demandé ce message (migration0018) ; elle ne constitue pas une collecte de consentement marketing.

La vue SQL valide les relations de même organisation. Les gardes SQL vérifient préparation du devis, approbation, acceptation et acquisition de tentative ; l’acceptation réserve crédit/quota et écrit l’outbox atomiquement. Le bridge revalide le devis, l’expéditeur, l’arrêt du canal et la tentative avant l’appel final. Une expiration ou une révocation pendant un calcul Pingen bloque le PATCH d’envoi. Une erreur ou réponse incertaine n’autorise jamais une nouvelle tentative automatique.

## SES : formule précise et qualification

La page AWS courante distingue plusieurs plans et paliers ; elle ne permet pas de déduire le plan du compte Guteneo. Elle indique notamment un tarif sortant par destinataire et un supplément pour les données des pièces jointes. Le plan Essentials annoncé commence à 0,16 USD/1 000 messages ; l’offre à la carte présente 0,10 USD/1 000. Les pièces jointes sont annoncées à 0,12 USD/GB. Aucun de ces nombres n’est installé par migration. La qualification doit établir le plan, le palier, les promotions éventuelles, les taxes et les options payantes effectivement applicables. [Tarification officielle SES](https://aws.amazon.com/ses/pricing/).

Le helper privé `emailRateComponents()` transforme ces preuves en un tarif rationnel EUR. Pour les pièces jointes qualifiées :

```ts
{
  usdMicrosPerMessage, // 100 pour 0,10 USD/1 000 ; exemple, pas tarif actif
  usdMicrosPerGb,     // unité : millionième USD par GB facturé
  bytesPerGb,        // définition comptable explicitement qualifiée
  eurPerUsdNumerator,
  eurPerUsdDenominator,
  attachmentBasis: "raw_pdf_bytes"
}
```

Le rapport de change est fixé, documenté et gelé côté serveur ; aucun taux de change supposé, conversion flottante ou change reçu du client. Le tarif converti est réduit par PGCD en `base_numerator`, `byte_numerator`, `rate_denominator`, puis le fournisseur vaut `(base + byte × taille_originale_PDF) / denominator` **en nano-EUR**. `rate_json` conserve les unités USD et le rapport EUR/USD ; les coefficients doivent correspondre exactement à ce JSON. Les bornes protègent l’arithmétique entière de SQLite. Une qualification nécessitant une précision non représentable par les coefficients admis est refusée.

**Point à qualifier avant une pièce jointe réelle** : les documents publics consultés ne précisent pas complètement l’assiette de facturation octets bruts/encodés ni le dénominateur exact du GB. SES décrit séparément l’encodage base64 du transport JSON et l’encodage MIME final. Cela ne prouve pas l’assiette comptable. La seule assiette implémentée pour les pièces jointes est `raw_pdf_bytes` ; l’opérateur doit apporter la preuve qu’elle correspond au contrat/coût du compte, ou faire évoluer explicitement le modèle. Ne pas choisir silencieusement 10⁹, 2³⁰ ou multiplier par 4/3. Le coût sans pièce jointe reste calculable sur la base du message lorsque ce plan et le change sont qualifiés. [Documentation AWS des pièces jointes](https://docs.aws.amazon.com/ses/latest/dg/attachments.html).

Depuis la migration `0021_ses_text_only_quotes.sql`, `attachmentBasis: "no_attachments"` qualifie séparément un message sans document. Ce format omet les champs de prix par GB et ne présume aucune assiette de pièce jointe. Préparation, vue SQL, lecture et contrôle avant soumission refusent explicitement tout document, même de taille zéro. Le taux message et le change doivent toujours être qualifiés. La proposition Essentials Paris, ses sources et les preuves fiscales/monétaires restantes figurent dans [SES_TEXT_ONLY_QUOTE.md](SES_TEXT_ONLY_QUOTE.md).

Depuis `0022_ses_public_list_prices.sql`, `pricing_basis` distingue les deux contrats. `public_list_price_ex_tax` est limité à SES Essentials premier palier, un destinataire, sans pièce jointe et sans option supplémentaire : tarif public HT ×2 au change commercial fixé dans le devis. Ce mode ne demande pas une facture AWS future. Sa source datée et ses métadonnées sont conservées dans `rate_json` ; le ratio/date/source de change et la base sont signés avec le contenu. Le coût net AWS et la fiscalité éventuelle de facturation ne sont pas présentés comme établis. Le champ politique historique `fiscal_basis` est déprécié et conservé pour compatibilité ; seule `pricing_basis` détermine le contrat repris dans le snapshot.

La base `qualified_final_variable_cost` couvre le coût variable final qualifié de cet envoi, avec son traitement fiscal et de change documenté dans la source. Elle ne répartit pas automatiquement un abonnement mensuel, des IP dédiées ou un service annexe entre messages. Si ces éléments modifient le coût variable ou empêchent de connaître son total, ne pas qualifier la politique correspondante. Le mode sandbox SES envoie réellement et reste limité aux identités de destinataires vérifiées, indépendamment de la tarification et de la simulation Guteneo. Voir [SES_SEND_LIMITS.md](SES_SEND_LIMITS.md).

## Courrier : brouillon analysé et calculateur fournisseur

Le parcours crée d’abord un brouillon explicitement autorisé, avec `auto_send:false`, en conservant les octets du PDF. Il n’ajoute ni ne déplace l’adresse. `PINGEN_DEFAULT_COUNTRY` fixe le profil qualifié du compte ; une destination internationale conserve la dernière ligne de pays. Le dépôt respecte 8 000 000 octets maximum. Les contrôles de géométrie et leurs limites sont détaillés dans [PINGEN_PREFLIGHT.md](PINGEN_PREFLIGHT.md).

La préparation du devis lit le brouillon Pingen exact, vérifie pays/adresse, exige `meta.abilities.self.submit === "ok"` et ses `paper_types` analysés. Elle appelle ensuite `POST /organisations/{id}/deliveries/letters/price-calculator`, type JSON:API `letter_price_calculator`, avec pays, papier, recto/recto verso, couleur/gris et produit postal approuvés. Seule une réponse `200` EUR calculable en centimes est définitive ici ; `202` reste en attente. Les papiers spéciaux non pris en charge sont refusés. Le coût client vaut exactement deux fois ce coût fournisseur EUR ; le traitement fiscal/frais doit avoir été qualifié dans la politique du compte. [OpenAPI Pingen](https://api.pingen.com/documentation/swagger-docs).

L’empreinte de preuve comprend l’identifiant fournisseur, le pays, l’adresse normalisée, le papier analysé, les options et le montant. Juste avant `PATCH .../send`, le connecteur relit et recalcule : montant **et** preuve doivent égaler le devis approuvé, même si un nouveau prix reste sous le plafond utilisateur. Il revalide ensuite l’état local courant. Un brouillon appartient à une organisation/document/expéditeur/destinataire et ne peut être revendiqué par deux commandes. Une réponse incertaine exige un rapprochement manuel.

## Nano-EUR, réserve et débit du crédit

Un EUR vaut 1 000 000 000 nano-EUR ; un centime vaut 10 000 000 nano-EUR. Le prix fournisseur rationnel est conservé comme numérateur/dénominateur décimaux textuels. Sa projection vers le nano-EUR arrondit vers le haut de **moins d’un nano-EUR**, puis le prix client vaut exactement deux fois cette projection. L’écart à deux fois le rationnel initial reste inférieur à deux nano-EUR par envoi ; il n’est pas caché derrière la mention « exact ». Le courrier, exprimé en centimes, n’a pas cet écart.

Le plafond entier en centimes reste réservé avant tout effet externe. Le champ `estimated_minor = ceil(customer_nanoeur / 10 000 000)` représente la borne d’un envoi isolé ; il ne signifie pas qu’un centime sera facturé pour chaque e-mail.

À chaque acceptation fournisseur prouvée, la transaction ajoute une écriture immuable `delivery_charge_entries` avec montant nano-EUR et débit :

```text
ceil((total_nano_avant + prix_nano) / 10 000 000)
− ceil(total_nano_avant / 10 000 000)
```

Le total est celui de l’organisation, commun aux nouveaux devis e-mail/courrier, conservé même si les métadonnées historiques d’un envoi sont retirées. Les montants fax historiques entiers restent séparés et s’additionnent normalement. L’écart cumulé entre débit centimes et total nano-EUR est toujours inférieur à un centime, sans réinitialisation mensuelle. La réserve entière est libérée et ce seul débit est ajouté au crédit **et** au quota financier mensuel du canal courant. Le comptage des envois reste un par opération acceptée. La dernière opération reçoit éventuellement le centime de report issu de fractions antérieures ; ce n’est pas son seul prix isolé.

L’issue inconnue, y compris un callback d’échec qui ne prouve pas l’absence de coût fournisseur, conserve les réservations financières. Annulation avant tentative ou rejet certain libèrent crédit et quota. Une acceptation positive tardive après échec visible règle une fois le prix, sans faire régresser l’état affiché. Les mêmes règles empêchent de consommer deux fois le crédit de bienvenue. Réserve conservatrice et arrondi peuvent bloquer un envoi moins d’un centime avant 50 EUR de coût nano cumulé ; aucune recharge ni nouveau crédit mensuel n’est créé.

## Contrat de lecture et preuves

Les commandes `prepare`, `approve`, `confirm`, annulation et `getDispatch` enrichissent la lecture unitaire avec `quote_expires_at`, `quote_customer_nanoeur`, `quote_supplier_nanoeur`, `quote_pricing_basis` et `quote_fx` (null hors devis e-mail/courrier v1). Pour la base publique HT, `quote_supplier_nanoeur` désigne le tarif catalogue converti et `quote_fx` contient seulement `{ numerator, denominator, date, source }`, EUR par USD, extrait du contenu signé. L’ancien mode a `quote_fx: null`. Les listes brutes peuvent omettre ces champs : les clients les traitent comme optionnels. `welcomeCredit` et `usage` gardent leurs champs en centimes ; ils reflètent les débits cumulatifs effectivement comptabilisés. Ne pas afficher `estimated_minor` comme prix exact d’un petit e-mail.

Preuves locales : vraie base D1 de workerd, migrations ordonnées, tenant/compte/options, altérations SQL, délai/révocation, plafond partagé, 51 e-mails concurrents pour 2 centimes au tarif fictif de test, e-mail+postal, rejeu, échec inconnu puis acceptation tardive, conservation après suppression historique, preuve humaine du message demandé. Les bridges SES/Pingen utilisent des réponses HTTP interceptées. Aucun montant de fixture, succès local ou réponse de calculateur ne prouve un tarif qualifié, une lettre expédiée ou une activation de production.
