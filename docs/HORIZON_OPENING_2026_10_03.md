# Horizon — ouverture sur les crédits disponibles

Le 3 octobre 2026, Nicolas demande de réaliser les étapes de qualification et
d’activation d’Horizon. Il autorise le provisionnement du validateur privé, la
qualification hébergée, l’intégration dans `main` et la publication. Il reporte
les travaux de recharge et de finalisation commerciale : les comptes suffisamment
crédités pourront financer une première période avec leur solde actuel.

Cette décision ne crée ni recharge, ni facture fiscale, ni nouveau crédit. Le
prix reste 30 € par mois, débité sur les crédits disponibles après consentement
récurrent de l’administrateur dans son navigateur. Le bonus unique de 50 € peut
financer au plus une première période si au moins 30 € restent disponibles. Les
réserves d’envoi et autres consommations restent protégées. Sans solde suffisant,
le renouvellement est suspendu sans dette. Aucune date de disponibilité de la
recharge n’est promise aux utilisateurs.

Nicolas demande également d’optimiser au maximum les coûts Cloudflare, sans fixer
de budget cible ; une réécriture est autorisée si les gains mesurés la justifient.
Le dimensionnement minimal viable, la veille, les démarrages et le coût par
diagnostic font partie de la qualification. Les allocations sont partagées avec
les autres services du compte : elles ne prouvent pas une facture nulle. Voir
[les coûts et hypothèses](HORIZON_COSTS.md).

## Situation acquise avant cette ouverture

- `main` et les deux origines de production servent
  `c5cc0ddba3c8bb2bcd6fe144bc37a17d1f9cc596`.
- La CI de ce commit a 13 jobs réussis ; les migrations 0050/0051 sont appliquées.
  Le contrôle de publication a vérifié 51 migrations, 343 objets de schéma,
  l’intégrité et les soldes conservés.
- Les pages publiques et privées en quatre langues ont été contrôlées. Les
  parcours affichés ne constituent pas encore une validation réelle de PDF.
- Le scanner est raccordé. Horizon est fermé ; `PDF_VALIDATOR` n’est pas encore
  raccordé dans la configuration applicative publiée.

## Travail de ce candidat

1. Préparer la qualification du validateur privé veraPDF 1.30.2, avec références
   positives et négatives pour les six profils, empreintes exactes et provenance.
2. Déployer ce service privé et qualifier réellement ses réponses, démarrages,
   bornes, concurrence, erreurs et nettoyage avant d’ouvrir l’application.
3. Employer le même prédicat de disponibilité pour les capacités publiques,
   la souscription, les droits payés et le renouvellement. Une configuration
   incohérente ou un scanner absent doit garder Horizon fermé.
4. Présenter une disponibilité publique issue du serveur, avec état non confirmé
   en rendu statique, et expliquer le financement initial et l’absence de recharge.
   La maquette publique ne contacte aucun backend métier.
5. Qualifier les parcours selon le
   [protocole d’activation](HORIZON_ACTIVATION_RUNBOOK.md), puis raccorder le
   validateur et activer le service dans une publication de `main` validée.

Le consentement d’un administrateur client ne peut pas être remplacé par une
instruction d’un assistant. La qualification ne doit pas fabriquer des soldes,
modifier des échéances de clients ni présenter un renouvellement simulé comme
une observation de production. Un mois de renouvellement réellement écoulé ne
peut pas être attesté le jour de l’ouverture.

## Preuves et publication

Ce document décrit l’autorisation et le candidat d’ouverture. Les preuves
locales, les preuves hébergées et la publication finale doivent être distinguées.
Un drapeau configuré ou une présence de binding ne suffisent pas à attester la
qualification du service. Ne pas annoncer l’ouverture avant vérification des
manifestes, de la santé et des capacités sur les deux origines.

Les documents de cet atlas restent exclusivement dans le dépôt technique ; ils
ne sont jamais ajoutés aux assets, liens ou pages du site officiel. Une annonce
envoyée à des clients reste une action distincte de l’ouverture du service.
