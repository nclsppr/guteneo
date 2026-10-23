# Guteneo 1.0.0 — candidat de qualification

Ce chantier prépare la version web, le serveur MCP et les paquets d’intégration
1.0.0 à partir de `5e4c758`. Les preuves exécutées et les limites externes doivent
être consignées avant la revue ; la préparation ne constitue pas une publication.

## Contrat de version

`package.json` porte la version de l’application. Les capacités HTTP et le
`serverInfo` MCP la lisent via `packages/contracts/src/release.ts` ; le build
public utilise la même source. La version du protocole MCP et les empreintes
immuables de source/paquet restent des informations distinctes. Le vérificateur
de publication compare aussi la version annoncée par `release.json`.

Le build refuse une divergence entre le manifeste portable, ses surcouches
Claude/Cursor et la version applicative. Il refuse aussi une liaison privée
d’application dans les manifestes de l’upload public, ou un endpoint différent
dans la configuration MCP de compatibilité. L’identité publique OpenAI existante
est conservée. Les paquets ne prouvent pas que le serveur de production exécute
déjà cette version.

## Périmètre de qualité

- Corriger les réponses web tardives et l’affichage de ressources après un
  changement de chemin, de compte ou d’atelier.
- Recontrôler les droits et le consentement aux données après le retour d’une
  proposition IA, avant de restituer le contenu du modèle.
- Qualifier les mises à jour de sécurité des dépendances et borner les entrées
  MCP au niveau du transport et de la validation.
- Construire des archives reproductibles ChatGPT et Claude, avec leurs propres
  instructions et une qualification explicite de leurs prérequis.

Les quatre rôles humains, le tenant authentifié, les plafonds et approbations
immuables, la fermeture des services non qualifiés et l’absence de renvoi
automatique après résultat inconnu restent les invariants de référence.

## Dépendances et protections MCP

L’audit npm du 23 octobre a conduit à mettre à jour les SDK MCP client/serveur
vers 2.3.1, le SDK de compatibilité vers 1.32.1, Agents vers 0.30.0, Hono vers
4.13.13, sanitize-html vers 2.18.1, ainsi que DOMPurify, ip-address, Vite et
Vitest dans le lockfile. L’audit complet après mise à jour ne signale aucune
vulnérabilité connue. La CI refuse désormais les alertes high/critical avec
`npm run audit:dependencies`. Cette vérification est datée et dépend du registre.

Le [correctif MCP sur la validation des entrées](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-46jr-4wx8-v453)
nécessite aussi des limites explicites. Le candidat borne les arguments à
120 000 éléments pour conserver les 100 000 cellules métier, leurs lignes et
leur enveloppe ; le corps MCP reste limité à 2 Mio. Les serveurs sont créés par
requête, comme le demande le
[contrat d’isolation du SDK](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-jm63-cq47-j5jp).
L’authentification et le budget de requêtes restent appliqués avant les opérations.
Aucune configuration d’instance, activation de service ou hypothèse de coût
gratuit n’est ajoutée par ces corrections.

## Preuves et disponibilité

Les tests locaux utilisent des environnements et fixtures synthétiques. Ils ne
valent ni envoi réel, ni preuve de renouvellement OAuth, ni essai d’un compte
Claude ou ChatGPT après publication. Les erreurs, contrôles non exécutés et
services non activés doivent conserver leur statut réel.

Le suivi autorisé de la soumission OpenAI 0.3.5 continue sur son archive
existante. La 1.0.0 est un candidat distinct ; elle ne remplace pas silencieusement
une soumission existante. La configuration du plugin public OpenAI nécessite
encore la restauration de ses commandes dans le portail. La préparation Claude
distingue le connecteur hébergé Claude.ai, le paquet Claude Code et la publication
dans un annuaire Anthropic.

## Qualification locale exécutée le 23 octobre 2026

`npm test` termine avec 2 125 cas Vitest dans 111 fichiers et 328 cas de sécurité
Node réussis, sans échec ni skip. Le typage, le lint, l’audit des 67 annotations,
la synchronisation de l’atlas et le build applicatif avec dry-run Worker ont
réussi. Les neuf régressions navigateur ciblées passent sur desktop Chromium,
Android Chromium et iPhone WebKit ; leurs données sont synthétiques.
Les comptes de tests ciblés sont inclus ou recoupent ces suites, et ne sont pas
additionnés aux totaux. La CI du commit final reste une preuve indépendante.

Les qualifications externes restent explicites : configuration OpenAI existante,
OAuth Claude Code réel, version servie après déploiement, canaux/facturation selon
leurs gardes et restauration de sauvegarde distante. Une preuve locale de
restauration et la préparation d’une archive ne valent pas une recette de ces
services. Voir [TEST_RESULTS.md](TEST_RESULTS.md), [CLAUDE_PLUGIN.md](CLAUDE_PLUGIN.md)
et [MAIN_RELEASE.md](MAIN_RELEASE.md).

## Passage en production

Après revue et CI du commit exact : autorisation de fusion/publication de ce
candidat, build depuis un main propre égal à origin/main, publication par le
chemin normal et vérification des octets/empreintes publics. Puis qualification
dans chaque hôte avec les droits réellement consentis, sans élargissement
d’autorité ni activation implicite d’un mandat expert.

La validation stricte du format par Claude Code 2.1.309 réussit sur les deux
archives dédiées. Le profil de publication dans l’annuaire Anthropic exige encore
un choix de licence du propriétaire : le contrôle retourne `LICENSE_MISSING`.
Aucune licence de dépôt n’a été inventée ; le chargement local et la connexion
OAuth sont distincts de cette soumission publique.

Les communications réelles, l’achat ou la création de services payants, la
configuration de nouveaux accès et les attestations légales restent des décisions
distinctes. Aucun contrôle automatisé ne peut garantir une absence absolue de
défaut ou l’acceptation par un annuaire.
