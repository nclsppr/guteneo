# Suivi postal après remise au réseau

Correction locale du 17 septembre 2026, sans migration, activation fournisseur ni déploiement.

Le webhook Pingen signé `webhook_sent` produit `handed_to_post` : la remise au réseau postal ne prouve pas la livraison. Auparavant, le rang commun de `failed` était inférieur à celui de cette remise. Un `webhook_undeliverable` était alors conservé et marqué appliqué sans rendre l'échec visible ; un événement `sent` arrivé en retard pouvait aussi remplacer cet échec.

La projection donne désormais à l'échec postal une priorité supérieure à `printed` et `handed_to_post`, tout en conservant la priorité d'un fait explicite `delivered`. L'ordre d'arrivée, la concurrence et les replays ne restaurent donc pas la remise au réseau après non-distribution. Les règles fax/e-mail et la vérification de signature/organisation restent inchangées. Un événement contradictoire ne supprime pas les faits conservés dans le journal.

L'affranchissement déjà encouru reste consommé. Ce changement ne rembourse rien, ne recrée aucune réservation et ne déclenche aucune nouvelle soumission. Une preuve de remboursement exigerait un traitement financier distinct, absent de cette correction.

## Preuve locale

Les trois nouveaux scénarios postaux échouaient avant correction avec `handed_to_post` au lieu de `failed`. Après correction, **57 tests passent dans trois fichiers**, en 43,42 secondes : crédit de bienvenue, invariants métier et notifications fournisseurs. Les cas postaux utilisent un corps HMAC signé et traversent la réception HTTP, le reçu durable et la projection D1 réelle locale : ordre normal, ordre inversé, concurrence, replays et notification tardive distincte. Ils vérifient une seule soumission, le maintien des 302 centimes consommés, un seul débit fractionnaire et la priorité conservée d'une livraison explicite. Fax et e-mail sont aussi contrôlés dans les deux ordres livraison/échec.

Typecheck, lint ciblé et `git diff --check` passent. Rapports séparés : `reports/postal-status-before.json` et `reports/postal-status-after.json` dans le worktree de correction. Aucun compte fournisseur, courrier réel ou base distante n'a été utilisé.

La correction porte sur les nouvelles projections. Elle ne réécrit pas automatiquement les événements historiques déjà marqués appliqués ; un éventuel rapprochement de tels envois doit être explicite et conserver leur historique financier.
