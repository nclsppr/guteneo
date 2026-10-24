# Prix de distribution sécurisée

Prix client choisis pour le candidat du 24 octobre 2026, **en EUR HT, par PDF et par destinataire nommé**. Ce sont les montants du catalogue serveur, pas des prix Cloudflare ni un devis de sous-traitant. Version immuable : `secure-distribution-2026-10-24-v1`.

| Conservation du partage | Prix |
| --- | ---: |
| 7 jours | 0,49 € |
| 30 jours | 0,99 € |
| 90 jours | 1,99 € |
| 365 jours | 4,99 € |

| Option prépayée de remise personnelle | Supplément |
| --- | ---: |
| Conservation autonome pendant 365 jours | 1,99 € |
| Conservation autonome pendant 1 095 jours | 4,99 € |

L'option finance une capacité de remise au destinataire prévu, jusqu'à l'expiration du partage. Elle est facturée dès l'activation, même si le destinataire ne demande finalement pas sa copie. Si la copie est remise, sa durée propre commence à cette remise. La préparation affiche le partage, l'option et le transport de l'invitation séparément, avec total et plafond, avant approbation. Aucune facturation ultérieure n'est cachée au destinataire.

Exemple : partage de trente jours, copie personnelle d'un an et transport coté à 0,01 € donnent 2,99 € HT. Le centime de cet exemple représente un devis de transport hypothétique ou simulé, pas une promesse tarifaire fournisseur. Le prix réel de l'email utilise le contrat de devis qualifié déjà présent dans Guteneo.

**La révocation ne rembourse ni la durée engagée ni l'option de remise prépayée.** Le débit de service est conservé séparément du transport. Un échec ou résultat inconnu du fournisseur suit les règles de réservation et réconciliation du transport ; il ne recrée pas le service. Les reprises idempotentes, confirmations répétées et demandes de copie répétées ne créent pas un deuxième débit. Aucune carte de paiement ni débit externe n'est déclenché par les tests.

## Coûts techniques et limites de l'estimation

Tarifs publics consultés le 24 octobre 2026, hors taxes, en USD. Quotas inclus partagés à l'échelle du compte existant : ne pas les réattribuer intégralement à chaque atelier ou document.

| Ressource | Dépassement public |
| --- | --- |
| R2 Standard | 0,015 USD/Go-mois ; 4,50 USD/million d'écritures de classe A ; 0,36 USD/million de lectures de classe B |
| Workers Standard | 0,30 USD/million de requêtes et 0,02 USD/million de millisecondes CPU, après inclusions du compte |
| D1 Paid | 0,001 USD/million de lignes lues ; 1 USD/million de lignes écrites ; 0,75 USD/Go-mois, après inclusions |
| Queues Paid | 0,40 USD/million d'opérations après inclusion ; normalement écriture, lecture et suppression par message |
| Browser Run Paid | 0,09 USD/heure au-delà de dix heures mensuelles incluses ; concurrence facturée séparément au-delà de l'inclusion |

Sources officielles : [R2](https://developers.cloudflare.com/r2/pricing/), [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [Queues](https://developers.cloudflare.com/queues/platform/pricing/), [Browser Run](https://developers.cloudflare.com/browser-run/pricing/).

Les plafonds de sérialisation du candidat donnent environ **40,6 Mo par namespace chiffré** au maximum : original de 10 Mio, cent images de 268 800 octets décodés maximum et cent couches texte de 32 000 octets UTF-8 maximum, plus enveloppes. La source initiale de l'atelier ajoute au plus 10 Mio. Une copie personnelle est un second namespace complet, sans dépendance de conservation envers le premier.

À ces plafonds, le stockage R2 d'un partage d'un an avec sa source représente environ **0,0094 USD**, et celui d'une copie de trois ans environ **0,0223 USD**, avant arrondi global et sans compter les autres ressources. Ce calcul de volume n'est pas le coût complet. Le rendu comporte jusqu'à 34 lots de trois pages ; un budget hypothétique de trente secondes par lot représente 0,0255 USD d'heures navigateur avant concurrence. Ce budget n'est pas une mesure de durée réelle.

Le script `scripts/benchmark-secure-storage.ts` mesure séparément le chiffrement local, ses lectures/écritures et ses volumes avec des buffers synthétiques maximaux ; son rapport `test-results/secure-storage-capacity.json` étiquette explicitement cet environnement. Le CPU et la mémoire Node ne représentent pas les métriques facturées par Workers. Le test e2e fait réellement rendre et copier un PDF de quatre pages, sans extrapoler sa durée à tous les PDF.

Les coûts décisifs incluent aussi Auth0, les sessions et comptes actifs, les index/événements du journal, l'exploitation, le support, la récupération d'identité, la sécurité et les sauvegardes indépendantes. La grille d'[Auth0](https://auth0.com/pricing) dépend notamment des utilisateurs actifs, fonctions de sécurité et contrats. Le choix des passkeys et le coût de la méthode de sécurité définitive sont différés ; poursuivre l'interface ne qualifie aucun coût d'identité supplémentaire et n'active aucun abonnement. Aucun tarif par destinataire Auth0 n'est inventé. Les quotas GitHub Actions et la surveillance sont également partagés avec les pipelines existants.

La grille client est un choix produit exécutable, pas une marge garantie par le seul coût R2. L'activation commerciale nécessite une mesure de trafic représentatif, un budget de journalisation et d'abus, la qualification du coût d'identité et une politique de conservation des événements. Ne pas promettre des consultations intensives illimitées ou une facture d'infrastructure plafonnée tant que ces budgets ne sont pas éprouvés. Une évolution de prix concernera de nouvelles préparations avec nouvelle version ; elle ne réécrit pas les commandes approuvées.
