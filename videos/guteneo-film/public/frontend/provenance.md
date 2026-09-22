# Captures du frontend Guteneo

Capturées le 2026-09-21T23:26:46.989Z, avec Chromium Playwright, fenêtre 1920 × 1080, densité 1, français, mouvement réduit.

## homepage.png

- URL : https://guteneo.com/
- Version publique : 22c24d5235dd204e48effafabef417c9bafac213
- Construction publique : 2026-09-21T23:24:46.701Z
- Page d'accueil réellement servie, sans session ni données de compte.
- L'API publique annonce fax et courrier ouverts, e-mail fermé. Cette capture ne qualifie aucun envoi.

## atelier.png

- URL locale : http://127.0.0.1:5198/#/app
- Source locale : 22c24d5235dd204e48effafabef417c9bafac213
- Modifications locales de apps/web et packages : aucune
- Application existante démarrée avec VITE_PUBLIC_PREVIEW=true, comme prévu dans docs/PUBLIC_PREVIEW.md et apps/web/src/api.ts.
- Données fictives natives de apps/web/src/preview.ts. Les mentions d'aperçu et de simulation restent visibles.
- Aucun login, backend, document client ou envoi réel. Les données ne qualifient pas une disponibilité fournisseur.

## Reproduction

Depuis la racine du dépôt, lancer :

```sh
node videos/guteneo-film/public/frontend/capture.mjs
```

Le script démarre puis arrête son serveur Vite local sur le port 5198. Il utilise des contextes navigateur neufs, bloque les méthodes non GET et les routes de services, sauf les lectures anonymes natives /api/capabilities et /api/session de la homepage. Il attend les polices et images, conserve le frontend sans retouche de DOM ni masquage d'éléments. L'atelier ne réalise aucun appel au backend. Le détail machine est dans provenance.json.

## approval.png

- Vue native de relecture postale de la même fixture locale, 1920 × 1080.
- Le formulaire a préparé un courrier uniquement dans la mémoire du navigateur, à partir du PDF natif « Votre courrier · exemple.pdf ».
- Destinataire fictif : Maison Papier · fictive, 12 rue de l’Exemple, 75002 Paris, FR.
- Arrêt avant toute approbation, confirmation ou expédition, y compris simulée. Aucun fournisseur ou backend contacté.
- Le bandeau Simulation, le prix fictif, le destinataire et le PDF sont conservés tels que le frontend les affiche.
