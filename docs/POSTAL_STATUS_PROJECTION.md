# Suivi postal après remise au réseau

Correction publiée le 17 septembre 2026 dans la source `44d1d5bb64418372c5174faa1ce5601681fcc813`, sans migration ni activation des envois. Les preuves de publication et de CI sont distinctes de la recette locale décrite ci-dessous ; aucun courrier réel n'est qualifié par cette correction.

Le webhook Pingen signé `webhook_sent` produit `handed_to_post` : la remise au réseau postal ne prouve pas la livraison. Auparavant, le rang commun de `failed` était inférieur à celui de cette remise. Un `webhook_undeliverable` était alors conservé et marqué appliqué sans rendre l'échec visible ; un événement `sent` arrivé en retard pouvait aussi remplacer cet échec.

La projection donne désormais à l'échec postal une priorité supérieure à `printed` et `handed_to_post`, tout en conservant la priorité d'un fait explicite `delivered`. L'ordre d'arrivée, la concurrence et les replays ne restaurent donc pas la remise au réseau après non-distribution. Les règles fax/e-mail et la vérification de signature/organisation restent inchangées. Un événement contradictoire ne supprime pas les faits conservés dans le journal.

L'affranchissement déjà encouru reste consommé. Ce changement ne rembourse rien, ne recrée aucune réservation et ne déclenche aucune nouvelle soumission. Une preuve de remboursement exigerait un traitement financier distinct, absent de cette correction.

## Preuve locale

Les trois nouveaux scénarios postaux échouaient avant correction avec `handed_to_post` au lieu de `failed`. Après correction, **57 tests passent dans trois fichiers**, en 43,42 secondes : crédit de bienvenue, invariants métier et notifications fournisseurs. Les cas postaux utilisent un corps HMAC signé et traversent la réception HTTP, le reçu durable et la projection D1 réelle locale : ordre normal, ordre inversé, concurrence, replays et notification tardive distincte. Ils vérifient une seule soumission, le maintien des 302 centimes consommés, un seul débit fractionnaire et la priorité conservée d'une livraison explicite. Fax et e-mail sont aussi contrôlés dans les deux ordres livraison/échec.

Typecheck, lint ciblé et `git diff --check` passent. Rapports séparés : `reports/postal-status-before.json` et `reports/postal-status-after.json` dans le worktree de correction. Cette recette locale n'a utilisé aucun compte fournisseur, courrier réel ou base distante.

## Preuve de publication

Les CI [PR 35180968830](https://github.com/nclsppr/guteneo/actions/runs/35180968830) et [push 35180966623](https://github.com/nclsppr/guteneo/actions/runs/35180966623) ont toutes deux réussi au premier essai sur cette source exacte. La validation intégrée comprend 675 tests Vitest dans 41 fichiers, 78 tests de sécurité, six tests Worker et huit tests Python du scanner, 75 cas navigateur applicatifs avec trois exclusions intentionnelles, et 30 cas de prévisualisation avec quatre exclusions intentionnelles. Les rapports et le journal sont référencés dans [TEST_RESULTS.md](TEST_RESULTS.md).

Le rapport `reports/published-44d1d5b-release-proof.json` consigne la publication à 04:22:44 UTC, version Worker `bb332483-fd95-4b72-9b19-f967fbe492e0`, avec 100 % du trafic applicatif. Les 56 ressources publiques correspondent sur chacun des hôtes canonique et de repli ; `/api/health` répond HTTP 200 en production avec `liveSending:false`. Les scénarios signés restent des fixtures locales : cette publication ne prouve ni une notification émise par Pingen, ni un affranchissement ou une distribution réelle.

La correction porte sur les nouvelles projections. Elle ne réécrit pas automatiquement les événements historiques déjà marqués appliqués ; un éventuel rapprochement de tels envois doit être explicite et conserver leur historique financier.
