# guteneo Horizon — launch preparation

Candidate prepared on 2 October 2026. No production release, paid infrastructure,
real communication or announcement has been authorized or performed by this work.
The website calls the offer **coming soon** while the service remains disabled.
The copy below is a launch draft: replace the future tense only after the listed
production evidence exists.

## Name and offer

The shared brand is **guteneo Horizon**. Keep `guteneo` lowercase. A single name
helps people recognise the same service when changing language or using an
assistant.

| Language       | Product label      | Launch line                                                 |
| -------------- | ------------------ | ----------------------------------------------------------- |
| Français       | Forfait Horizon    | Repérez les obstacles dans vos PDF avant de les partager.   |
| English        | Horizon plan       | Find barriers in your PDFs before sharing them.             |
| Deutsch        | Horizon-Tarif      | Erkennen Sie Barrieren in Ihren PDFs, bevor Sie sie teilen. |
| Lëtzebuergesch | Horizon-Abonnement | Fannt Barrièren an Äre PDFen, ier Dir se deelt.             |

Price: **€30 per month**, deducted from available account credits. Sending still
consumes its separate existing credit. No invented tax qualification, free trial,
top-up availability or unlimited allowance is promised.

The package contains PDF/UA-1 and PDF/UA-2 automated accessibility validation,
PDF/A-1b, PDF/A-2b, PDF/A-3b and PDF/A-4 archival validation, exportable reports tied
to the immutable original PDF hash, manual review guidance, assistant access to
the same validation, and administrator billing management. The included allowance
is **100 attempts per calendar month** for PDFs up to **10 MiB and 100 pages**;
interrupted attempts count against this allowance. Checks add no per-check debit.

Only an authenticated browser administrator can subscribe or cancel after
explicit acceptance. Members can see the offer and account entitlement without
credit details or billing controls. Billing records and management require an
administrator and an active monthly entitlement. Cancellation stops the next
monthly renewal; access remains until the paid period ends. A technical pass
does not certify accessibility or legal compliance.

## Announcement drafts — preparation state

### Français

**guteneo Horizon : vos PDF, mieux préparés.**

Nous préparons Horizon, un forfait à 30 € par mois pour vérifier l’accessibilité
PDF/UA et l’archivage PDF/A, dans votre atelier ou depuis votre assistant.
100 tentatives de contrôle par mois civil seront incluses, avec des rapports
exportables liés au PDF original et des repères pour compléter la revue humaine.
La souscription sera réservée à l’administrateur ; le forfait sera prélevé sur
les crédits du compte. L’offre n’est pas encore ouverte.

### English

**guteneo Horizon: better prepared PDFs.**

We are preparing Horizon, a €30 monthly plan for PDF/UA accessibility and PDF/A
archival checks in your workspace or through your assistant. It will include
100 check attempts per calendar month, exportable reports linked to the original
PDF and guidance for completing human review. Only the administrator can
subscribe, with the plan deducted from account credits. Subscriptions are not
open yet.

### Deutsch

**guteneo Horizon: besser vorbereitete PDFs.**

Wir bereiten Horizon vor: einen Tarif für 30 € pro Monat, mit dem Sie
PDF/UA-Barrierefreiheit und PDF/A-Archivierung im Arbeitsbereich oder über Ihren
Assistenten prüfen können. Enthalten sind 100 Prüfversuche pro Kalendermonat,
exportierbare Berichte zum Original-PDF und Hinweise zur ergänzenden menschlichen
Prüfung. Nur der Administrator kann den Tarif buchen; der Betrag wird vom
Kontoguthaben abgezogen. Buchungen sind noch nicht geöffnet.

### Lëtzebuergesch

**guteneo Horizon: besser preparéiert PDFen.**

Mir preparéieren Horizon, en Abonnement fir 30 € pro Mount fir
PDF/UA-Accessibilitéit a PDF/A-Archivatioun am Atelier oder iwwer Ären Assistent
ze kontrolléieren. Et enthält 100 Kontrollversich pro Kalennermount,
exportéierbar Rapporten zum Original-PDF an Hiweiser fir déi mënschlech
Iwwerpréiwung ze ergänzen. Nëmmen den Administrateur kann abonnéieren; d’Zomm
gëtt vun de Kontkreditter ofgezunn. D’Abonnement kann nach net ofgeschloss ginn.

## Accurate legal and technical explanation

The [European Accessibility Act, Directive (EU) 2019/882](https://eur-lex.europa.eu/EN/legal-content/summary/accessibility-of-products-and-services.html)
applies from 28 June 2025 to specified consumer products and services, including
e-commerce. Its scope contains exceptions, including microenterprises providing
services. Do not turn this into a universal obligation for every PDF or claim
that every business is covered.

[Directive (EU) 2016/2102](https://eur-lex.europa.eu/legal-content/en/LSU/?uri=CELEX%3A32016L2102)
also concerns public-sector websites and mobile applications. The applicable
national law, service, document and exceptions still determine concrete duties.

[veraPDF validation documentation](https://docs.verapdf.org/validation/)
distinguishes archival PDF/A and accessibility PDF/UA profiles. Automated
machine-verifiable rules are useful evidence, with limits: reading order,
meaningful alternative text, contrast and the actual assistive-technology
experience need human review. A valid PDF/A may remain inaccessible. A favourable
PDF/UA automated result is not an accessibility certificate or legal opinion.

## Publication proof to collect

- Explicit authorization for production migration, service activation and release.
- Production validator configuration and version pin, with real reference PDFs
  covering passes and failures for every offered profile.
- Current account authorization, immutable hash binding, isolated tenants and
  fail-closed handling of validator failure or incomplete reports.
- Production credit debits, safe monthly renewal, cancellation and insufficient
  balance behaviour; simulation results remain separately labelled.
- Administrator-only billing reads and mutations, with browser consent and
  CSRF preserved. Assistant validation must not enable billing or assert consent.
- Four-language public and private UI at desktop/mobile widths, keyboard and
  screen-reader review, public legal links and source-faithful pricing terms.
- Exact released source and post-release public verification before changing
  “coming soon” to “available”.
- Separate authorization before publishing an announcement or sending it to
  customers. Prepared copy is not an actual communication.

## Useful future additions

These ideas are not delivered by this candidate and are not sold as included:
compare reports between two explicitly uploaded revisions, guided remediation
for missing tags/language/title, assistive-technology review annotations tied to
a specific PDF hash, and source-template quality checks before generating PDFs.
Keep any repaired PDF as a new immutable document and validate it again.
