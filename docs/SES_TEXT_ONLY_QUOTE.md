# Qualification SES pour un test sans pièce jointe

État au 17 septembre 2026 : modèle public HT implémenté et testé localement, **aucune politique tarifaire installée, aucune activation et aucun envoi effectués par cette tranche**. Les migrations `0021_ses_text_only_quotes.sql` et `0022_ses_public_list_prices.sql` ne contiennent ni prix actif, ni expéditeur, ni organisation. Elles ne consomment aucun crédit.

## Preuves disponibles

Le 17 septembre vers 03 h 27 Europe/Paris, la console AWS du compte Guteneo, région Europe (Paris), a de nouveau affiché **Essentials**, avec Outbound Email et Virtual Deliverability Manager — SES deliverability inclus. L’identité de destination de test était vérifiée ; le dossier de sortie du sandbox restait sans nouvelle réponse. Cette observation de compte est distincte de la grille publique. Voir [SES_STATUS.md](SES_STATUS.md).

La grille Essentials facture le premier palier de 0 à 10 millions d’e-mails mensuels **0,16 USD pour 1 000 destinataires**, soit **160 micro-USD par destinataire**. Les paliers sont marginaux ; Essentials n’a pas le forfait régional des plans supérieurs. Les données de pièces jointes ont une ligne distincte à 0,12 USD/GB. Les options payantes et services connexes, dont SNS, restent à examiner selon leur utilisation. Ne pas ajouter une seconde fois la délivrabilité déjà incluse. La note tarifaire parle de pièces jointes, tandis que l’exemple emploie un volume de message : ce libellé ne prouve pas l’assiette comptable des octets. [Tarification AWS SES](https://aws.amazon.com/ses/pricing/).

La BCE publie au **16 septembre 2026** : **1 EUR = 1,1537 USD**, soit un rapport exact EUR/USD de `10000 / 11537`. Cette référence est informative ; la BCE déconseille son usage comme taux de transaction. Elle ne prouve pas le change de la facture AWS. [Publication BCE](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html), [XML officiel](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml).

La fiscalité dépend des informations de facturation et de l’entité AWS concernée. La région Paris ou le nom « Luxembourg » ne permet pas de déduire une TVA de 0 % ou de 17 %. [AWS Europe](https://aws.amazon.com/legal/aws-emea/). L’API de facturation distingue montant en devise de facture et informations de change ; elle n’établit pas un emploi du taux BCE. [InvoiceCurrencyAmount](https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_invoicing_InvoiceCurrencyAmount.html).

## Contrat commercial public HT

Le nouveau mode `public_list_price_ex_tax` applique **le tarif public SES hors taxes ×2, converti au taux commercial figé au devis**. Il ne prétend pas reproduire le coût net d’une facture AWS. La TVA éventuellement applicable à une facture Guteneo est distincte ; aucun taux ni exonération n’est déduit ici.

Pour un destinataire, un corps texte et son équivalent HTML normalisé, **sans document ni pièce jointe**, la base est calculable sans hypothèse sur un GB ou sur l’encodage MIME :

```json
{
  "pricingBasis": "public_list_price_ex_tax",
  "plan": "Essentials",
  "tier": "0-10000000",
  "unit": "recipient",
  "currency": "USD",
  "tariffSource": "https://aws.amazon.com/ses/pricing/",
  "tariffDate": "2026-09-17",
  "attachmentBasis": "no_attachments",
  "usdMicrosPerMessage": 160,
  "eurPerUsdNumerator": 10000,
  "eurPerUsdDenominator": 11537,
  "fxBasis": "commercial_fixed_reference",
  "fxSource": "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
  "fxDate": "2026-09-16"
}
```

`emailRateComponents()` produit `base_numerator=1600000000`, `byte_numerator=0`, `rate_denominator=11537`, en nano-EUR. La base publique convertie vaut environ `0,00013868423333622258 EUR`. Sa projection vaut `138685` nano-EUR ; le prix client HT vaut `277370` nano-EUR (`0,00027737 EUR`). Le plafond isolé peut être de 1 centime. Le débit reste cumulatif au niveau de l’organisation : **ce n’est pas un centime par e-mail**. L’arrondi initial fournisseur est inférieur à un nano-EUR ; voir [LIVE_DELIVERY_QUOTES.md](LIVE_DELIVERY_QUOTES.md).

Cette politique **peut être qualifiée sans attendre une facture AWS future**, après confirmation du plan, du palier et des options utilisés et choix explicite de la convention commerciale de change. Les crédits AWS, la remise éventuelle, le change de paiement ou les frais de services auxiliaires affectent la facture/coût d’exploitation ; ils ne modifient pas rétroactivement ce prix catalogue approuvé. Le prix reste présenté HT, sans inventer de fiscalité. Le champ historique API `quote_supplier_nanoeur` représente ici la base catalogue convertie, pas un montant de facture.

La future ligne privée doit contenir :

| Champ | Valeur ou preuve nécessaire |
| --- | --- |
| `organization_id`, `sender_id` | Organisation du vrai compte connecté et expéditeur vérifié de cette même organisation. |
| `channel`, `provider` | `email`, `ses`. |
| `account_id` | Compte SES constaté `982055099242`. |
| `route_id` | `eu-west-3:guteneo-production:true` pour le sandbox constaté ; relire la configuration lors de la qualification. |
| `options_json` | `{}` pour le message transactionnel de test, sans option payante ajoutée. |
| `rate_json` | JSON ci-dessus pour le plan/palier constaté et la convention commerciale choisie ; tout changement exige une nouvelle politique. |
| Coefficients | Résultat du helper, jamais saisi séparément au jugé. |
| `currency`, `pricing_basis` | `EUR`, `public_list_price_ex_tax`. |
| Ancien `fiscal_basis` de la politique | `qualified_final_variable_cost` uniquement comme valeur de compatibilité du schéma ancien, désormais dépréciée. Elle ne définit pas le prix et ne constitue aucune affirmation sur le coût réel dans ce nouveau mode. |
| `source_reference`, `source_sha256` | Référence privée et SHA-256 d’un dossier figé réunissant plan, palier, configuration, grille publique datée et convention de change. Aucune facture personnelle ni secret dans le dépôt. |
| `valid_from`, `expires_at` | Période opérateur courte, datée après vérification ; le taux du 16 septembre n’est pas permanent. |
| `quote_ttl_seconds` | `300`. |
| `status` | Ne créer `qualified` qu’après vérification ; ce document n’est pas une ligne active. |

Le mode ancien `qualified_final_variable_cost` reste inchangé pour les politiques et devis qui revendiquent le coût variable final qualifié, notamment le courrier. Il conserve ses exigences propres. Le mode public SES ne réinterprète aucun ancien devis. Si le plan, le palier, une option payante ou le périmètre de message sort du modèle public défini ici, ne pas qualifier cette politique ; étendre explicitement le modèle avant usage.

L’assiette inconnue des pièces jointes **n’empêche pas les préparatifs du message sans pièce jointe** : inscription, expéditeur, texte, dossier de preuve et destination vérifiée peuvent être préparés séparément. Les flags d’envoi et le canal restent fermés tant que qualification et autorisation du test ne sont pas réunies. Le sandbox SES envoie réellement aux destinations autorisées ; ce n’est pas la simulation Guteneo.

## Protection et preuves locales

- `no_attachments` interdit `usdMicrosPerGb` et `bytesPerGb`, même à zéro ou `null`. Aucun périmètre n’est déduit de la taille du PDF.
- La préparation refuse tout document, même de taille déclarée zéro ; aucun devis, commande ou outbox n’est créé.
- La migration vérifie insertion de politique et vue `valid_live_delivery_quotes`. Les gardes de préparation, approbation, acceptation et tentative héritent du contrôle. Une politique historique sans périmètre reconnu ne rend plus le devis utilisable ; les données historiques restent conservées.
- Une ancienne application interprétant zéro coût par octet comme une autorisation PDF est arrêtée par la transaction SQL. Le métier répète le contrôle à la lecture et avant soumission, même avec une ancienne vue SQL pendant une bascule.
- Compte, région, configuration set et mode sandbox composent l’identité SES. Changer un de ces éléments invalide l’ancien devis avant tout appel externe. Organisation, expéditeur, contenu, coût et expiration restent figés ; aucun prix client ni consentement d’assistant n’est accepté.

## Migration et données exposées

La migration `0022` ajoute uniquement la colonne `pricing_basis` aux politiques, avec défaut correspondant à l’ancien contrat, puis adapte le garde d’immuabilité et la vue. Aucun rebuild de table, désactivation de clé étrangère, `writable_schema` ou modification des migrations antérieures n’est utilisé. Les devis, approbations et écritures financières existants restent byte-identiques. Le `fiscal_basis` déjà signé **du devis** reçoit la base autoritative ; la vue exige son égalité avec `policy.pricing_basis`. Ainsi un ancien lecteur ignorant la nouvelle colonne ne peut produire un devis faussement étiqueté coût final à partir d’une politique publique.

Pour un nouveau devis public, `pricingBasis` et `fx` sont ajoutés au contenu figé avant empreinte. La vue et la validation avant soumission comparent le ratio, la date et la source au tarif immuable. La lecture unitaire retourne `quote_pricing_basis` et `quote_fx: { numerator, denominator, date, source }`, soit le nombre d’EUR pour un USD. Seules ces quatre données publiques sont projetées. Ancien devis : ancienne base et FX nul. Sans devis e-mail/courrier : base/FX nuls. Les listes peuvent omettre ces champs.

Tests : `tests/integration/live-delivery-quotes.test.ts` et `tests/unit/live-providers.test.ts`, avec D1 isolée et transports interceptés. Cas ciblés : formule rationnelle, prix ×2, refus PDF même zéro octet, qualification SQL ambiguë, ancienne interprétation du tarif, validation avant soumission, compte/route modifiés, expiration, contrat public HT, rejet d’un ancien lecteur et upgrade avec devis approuvé/crédit déjà débité, `foreign_key_check` vide et `quick_check` OK. Ces résultats ne qualifient pas le compte réel.
