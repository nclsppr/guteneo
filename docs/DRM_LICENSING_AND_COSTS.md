# Adobe et FileOpen : licences et coûts pour Guteneo

**Décision ultérieure du 24 octobre 2026 : solution maison sans DRM PDF retenue. Voir le [plan de consultation sécurisée web](SECURE_WEB_DOCUMENTS_PLAN.md). Cette étude de licences reste documentaire ; aucune négociation Adobe/FileOpen n’est nécessaire pour le périmètre retenu.**

Étude approfondie du **24 octobre 2026**. Complément à [l’étude technique DRM](SECURE_DOCUMENT_DISTRIBUTION_STUDY.md).

Périmètre : Guteneo vend une fonctionnalité SaaS à plusieurs entreprises indépendantes, appelées ateliers. Chaque atelier protège ses propres PDF confidentiels et les distribue à des destinataires externes. Ces destinataires ne sont pas nécessairement clients de Guteneo et peuvent être occasionnels ou communs à plusieurs ateliers.

Recherche sur sources officielles publiques. Aucun éditeur contacté, formulaire soumis, essai activé, SDK sous licence téléchargé ou achat effectué. Aucun devis propre à Guteneo ni contrat signé n’est disponible. Les montants de scénario ci-dessous sont des calculs de viabilité, **pas des tarifs Adobe/FileOpen**.

## 1. Conclusion et changement de priorité

**Ne pas choisir le moteur avant d’avoir obtenu le droit SaaS multi-ateliers et deux devis réellement comparables.** Une licence permettant à une entreprise de protéger ses documents ne prouve pas le droit de vendre cette capacité à des entreprises tierces.

La priorité commerciale recommandée devient **FileOpen OEM**, avec Adobe étudié en parallèle dans une configuration auto-hébergée/OEM et, séparément, Managed Services. Cette préférence de négociation vient de la modularité documentée de FileOpen et de son parcours OEM explicite ; elle ne signifie pas que son prix sera inférieur ni que son offre sera acceptée pour Guteneo.

Adobe reste une référence technique pertinente. Sa structure contractuelle et la gestion de destinataires nominatifs présentent cependant un risque économique pour une diffusion à beaucoup de personnes occasionnelles. Une offre Adobe où chaque grand atelier apporte sa propre licence reste une option distincte.

**Aucun prix public officiel exploitable n’a été trouvé pour le service exact envisagé**, chez l’un ou l’autre. Les abonnements Acrobat, Adobe PDF Services, Forms Designer, les tarifs d’annuaires logiciels et l’offre FileOpen Sharebot ne permettent pas de budgéter un contrat DRM/OEM Guteneo.

## 2. Adobe : identifier la bonne route commerciale

### Les documents publics ne portent pas tous la même date

| Document officiel | Version/date publiée | Utilisation dans l’étude |
| --- | --- | --- |
| [Conditions générales entreprise FR](https://www.adobe.com/fr/cc-shared/assets/pdf/legal/terms/enterprise/generalterms-fr-2025v1.pdf) | 2025v1 ; catalogue : 3 octobre 2025 | Droits de fourniture à des tiers, architecture du contrat, secours et sortie |
| [PSLT AEM On-premise](https://www.adobe.com/cc-shared/assets/pdf/legal/terms/enterprise/pdfs/pslt-aem-onprem-ww-2025v1.pdf) | 2025v1 ; catalogue : 3 novembre 2025 | Développement/QA et exécution du logiciel |
| [Description AEM On-premise](https://helpx.adobe.com/legal/product-descriptions/adobe-experience-manager-on-premise-1.html) | 11 mai 2023 | Métriques Document Security et définitions |
| [Description AEM Managed Services](https://helpx.adobe.com/legal/product-descriptions/adobe-experience-manager-managed-services-1.html) | 22 septembre 2025 | Prérequis et périmètre du DRM géré par Adobe |
| [Catalogue des conditions particulières](https://www.adobe.com/legal/terms/enterprise-licensing/product-specific-terms.html) | Consulté le 24 octobre 2026 | Confirme les versions PSLT actuellement publiées |

La documentation technique LTS de 2026 ne remplace pas automatiquement ces descriptions commerciales. Le futur devis devra nommer les références exactes, la version LTS supportée et les documents incorporés. Une page encore publiée n’est pas à elle seule le contrat de Guteneo.

### Droit de fournir le SaaS

Les conditions entreprise §4.3(B)-(C) limitent notamment hébergement, sous-licence et service pour des tiers sauf autorisation expresse. Le préambule donne priorité au bon de commande sur les conditions particulières, puis générales. La possibilité d’employer un prestataire (§5.2) ne démontre pas un droit SaaS mutualisé. Demander une autorisation écrite propre au modèle Guteneo. [Conditions entreprise FR](https://www.adobe.com/fr/cc-shared/assets/pdf/legal/terms/enterprise/generalterms-fr-2025v1.pdf).

Le statut de revendeur ne règle pas automatiquement la question : l’addendum partenaire prévoit la revente au client pour son propre usage. Il peut soutenir un montage atelier par atelier, sans établir une autorisation OEM de plateforme partagée. [Reseller Addendum 2025v1, §2.1](https://www.adobe.com/cc-shared/assets/pdf/legal/terms/enterprise/pdfs/experiencecloud-partnerreselleraddendum-ww-2025v1.pdf).

**Exigence proposée pour Guteneo :** l’autorisation doit couvrir les documents appartenant aux ateliers, la création de leurs destinataires externes, l’administration des politiques depuis Guteneo, la facturation du service et l’hébergement par les sous-traitants nommés. L’accès par API ne doit pas rester une zone grise.

### Métrique destinataire et différence On-premise / Managed Services

| Route | Ce que les documents publics établissent | Ce qui reste à faire chiffrer/confirmer |
| --- | --- | --- |
| **On-premise** | Add-on par destinataire individuel, affecté à un déploiement. Réaffectation limitée au remplacement d’un ancien destinataire ayant cessé sa relation, ou à un accord écrit. | Socle minimal, SKU OEM éventuel, minimum, période du compteur, réaffectation des invités occasionnels, coût et périmètre du runtime |
| **Managed Services** | Forms Enterprise préalable ; minimum **1 000 destinataires** ; une instance de traitement de production ; disponibilité minimum propre au DRM **99,5 %**. | Prix total du socle + DRM, recette DRM, capacité supplémentaire, disponibilité renforcée, droit multi-ateliers |

Sources : [On-premise, add-on et définitions](https://helpx.adobe.com/legal/product-descriptions/adobe-experience-manager-on-premise-1.html), [Managed Services, section Document Security](https://helpx.adobe.com/legal/product-descriptions/adobe-experience-manager-managed-services-1.html).

**Ne pas appliquer le minimum de 1 000 à On-premise : il n’a pas été établi sur cette route.** De même, le meilleur engagement de disponibilité affiché pour un socle Forms ne remplace pas celui de l’add-on DRM.

Notre modèle financier ne peut donc pas traiter les licences comme des lecteurs simultanés ou des utilisateurs actifs mensuels sans disposition négociée. Ni un compteur remis à zéro au renouvellement, ni un coût seulement au premier clic ne sont démontrés. La définition d’User dans la description produit On-premise inclut aussi l’accès programmatique : faire confirmer si les émetteurs des ateliers comptent, au-delà des seuls opérateurs Guteneo. [Définitions On-premise](https://helpx.adobe.com/legal/product-descriptions/adobe-experience-manager-on-premise-1.html).

Le logiciel Reader gratuit n’élimine pas une éventuelle licence destinataire du serveur DRM. Il faut distinguer **coût du lecteur**, **droit de protéger**, **droit d’attribuer une licence** et **droit de vendre le service**. [Adobe Reader](https://www.adobe.com/acrobat/pdf-reader.html).

### Environnements, SDK et continuité

Le PSLT On-premise autorise un nombre raisonnable de copies pour développement/tests/QA, hors production. Les conditions générales définissent un secours froid strict ; un secours chaud ou une seconde production ne doit pas être considéré inclus. [PSLT §1](https://www.adobe.com/cc-shared/assets/pdf/legal/terms/enterprise/pdfs/pslt-aem-onprem-ww-2025v1.pdf), [conditions générales §4.2](https://www.adobe.com/fr/cc-shared/assets/pdf/legal/terms/enterprise/generalterms-fr-2025v1.pdf).

Le droit aux copies de développement/QA ne démontre pas que tous les destinataires, consommations et modules additionnels y sont inclus.

Le SDK Java et l’obtention de PPL/C++ sont documentés, mais cette disponibilité ne constitue pas une licence de redistribution ou d’autoscaling illimité. Faire chiffrer séparément runtime Guteneo, processus de préparation, environnements et éventuelle installation chez un atelier. [Offre Document Security LTS](https://experienceleague.adobe.com/en/docs/experience-manager-65-lts/content/forms/use-document-security/document-security-offerings).

À la fin de la licence, les conditions générales prévoient la fin des droits et la suppression du logiciel. Un régime permettant de continuer à ouvrir les anciens PDF doit donc être négocié. Elles limitent aussi certains traitements de données personnelles sensibles dans les services cloud sans accord écrit : faire vérifier notamment les données financières personnelles, sans assimiler tout document financier d’entreprise à cette catégorie. [Conditions générales §13.3 et §6.3(C)](https://www.adobe.com/fr/cc-shared/assets/pdf/legal/terms/enterprise/generalterms-fr-2025v1.pdf).

La page commerciale Forms ne fournit pas de montant unitaire DRM/OEM ; elle renvoie à un devis. Il serait trompeur de transformer les prix d’un autre produit Adobe en estimation AEM Document Security. [Tarification Adobe Forms](https://business.adobe.com/products/experience-manager/forms/pricing.html).

## 3. FileOpen : un accord OEM à définir, pas un forfait standard à extrapoler

### Faits publiés à retenir

La FAQ indique ne pas autoriser la revente du chiffrement via une instance unique d’un produit standard et prévoit des accords OEM/VAR négociés. Elle cite administrateurs, destinataires, documents et authentifications comme facteurs de prix. Certaines publications un-vers-plusieurs évitent des frais par siège, tandis que les usages entreprise peuvent en avoir. Le support annuel vise l’équipe licenciée, pas ses destinataires ; réponse annoncée sous un jour ouvré, sans délai public de rétablissement établi. [FAQ officielle](https://www.fileopen.com/subscription-plans).

L’offre Enterprise affiche des utilisateurs finaux illimités. Cette mention ne définit pas une licence OEM, un nombre illimité d’ateliers ou un volume illimité de requêtes. Les documents confidentiels de plusieurs clients ne sont pas automatiquement assimilables à un éditeur diffusant son propre catalogue. [Plans FileOpen](https://www.fileopen.com/subscription-plans).

La page partenaires confirme les parcours OEM/VAR et l’intégration par bibliothèque/API. Elle ne constitue pas en elle-même une autorisation de marque blanche, de redistribution des clients ou de traitement des documents de tiers pour Guteneo. [Partenariats](https://www.fileopen.com/partnering-opportunities).

### Quelle offre demander

Demander un **moteur PDF portable en accord OEM**, accompagné du serveur de permissions adapté, des clients nécessaires et des interfaces d’audit. Browser UX doit être chiffré comme option distincte : un devis limité au lecteur web ne répondrait pas au besoin de protection après téléchargement.

Le site distingue historiquement RightsManager, RightsServer et Developer Toolkit, mais plusieurs liens des anciennes gammes redirigent désormais vers des pages générales. Ne pas les traiter comme des références de commande actuelles ni établir une équivalence automatique avec Basic/Pro/Enterprise. [Gammes publiées](https://www.fileopen.com/document-security-drm-products).

Les pages techniques actuelles décrivent des modules Windows/Linux et un serveur de permissions personnalisable ; le SDK et les interfaces permettent une intégration dans une application existante. **Inférence pour Guteneo :** cette modularité justifie d’explorer Workers pour les permissions et un Container Linux pour le chiffrement, sous réserve du protocole, du support, de l’architecture CPU et de la licence de runtime. Aucun support Cloudflare spécifique n’est établi. [Composants](https://www.fileopen.com/system-components), [développement](https://www.fileopen.com/developers).

Faire préciser si le prix est par processus, serveur, conteneur, région ou déploiement, si les redémarrages et l’autoscaling consomment des licences, et si la clé d’exécution supporte des instances éphémères. Ce sont des demandes contractuelles/techniques, pas des coûts annoncés par l’éditeur.

### Destinataires, données et sortie

Les clients sont proposés gratuitement ; cela ne rend pas gratuite la licence du fournisseur de service. L’identité peut être gérée par le licencié, sans compte émis par FileOpen. Le parcours exact d’un invité Guteneo dans le plugin devra néanmoins être testé. [Clients](https://plugin.fileopen.com/all.aspx), [architecture d’identité](https://www.fileopen.com/technology-overview).

Le contrat client PDF public porte une révision du **25 octobre 2005** ; ce n’est pas le contrat éditeur/OEM et sa date d’indexation récente ne le modernise pas. Obtenir les textes applicables aux binaires effectivement distribués. [Client EULA](https://www.fileopen.com/hubfs/docs/fileopenclientlicense.pdf).

La politique de confidentialité publique est datée du **25 mai 2018**, indique des traitements américains et cite encore Privacy Shield. Elle distingue également les données adressées au serveur du licencié et certaines télémétries FileOpen. Elle ne fournit pas à elle seule un dossier actuel de sous-traitance UE pour Guteneo. Demander DPA, transferts, sous-traitants, télémétrie, support, sauvegardes et rétention pour la variante retenue. [Politique publiée](https://www.fileopen.com/privacy-and-cookie-policy).

Aucun minimum annuel, grille OEM, tarif de dépassement ni engagement complet de continuité après résiliation n’a été trouvé dans les sources officielles consultées. Les chiffres repris par des comparateurs pour Basic ne sont pas utilisables comme budget Guteneo. Les conditions de Sharebot concernent un autre service et ne doivent pas être appliquées au SDK. [Offre Sharebot distincte](https://www.fileopen.com/sharebot_terms_of_service).

## 4. Définir les compteurs avant de comparer les prix

Cette grille contient nos exigences de devis, pas des droits déjà accordés.

| Compteur | Question à résoudre par écrit | Risque sinon |
| --- | --- | --- |
| Atelier | Entité juridique, tenant technique, domaine, filiale ou contrat ? | Un forfait partagé peut devenir un contrat/licence par client |
| Émetteur | Opérateur Guteneo, admin d’atelier ou toute personne protégeant via l’API ? | Sous-estimation des sièges indirects |
| Destinataire | Personne invitée, document mis à disposition, compte activé, première ouverture ? | Consommation de licence avant usage réel |
| Période | Simultanés, actifs mensuels, uniques annuels, stock nominatif, durée du contrat ? | Accumulation invisible des invités occasionnels |
| Réaffectation | Expiration d’un document, inactivité ou départ d’un atelier libèrent-ils une licence ? | Coût permanent pour une lecture ponctuelle |
| Déduplication | Même personne chez plusieurs ateliers, adresses ou appareils ? | Facturation multipliée ou annuaire partagé excessif |
| Déploiement | Cluster, région, environnement, instance ou ensemble d’ateliers ? | Deuxième licence pour le même destinataire |
| Document | Source, version, résultat chiffré, variante filigranée ou attribution ? | Trois destinataires peuvent produire trois unités facturées |
| Requête | Authentification, licence, impression, audit, administration, échec, retry ? | Une ouverture peut consommer plusieurs opérations |
| Stock actif | PDF conservés, licences toujours valides, historiques consultables ? | Coûts plusieurs années après l’envoi initial |
| Débit | Protections/minute, authentifications/seconde et lecteurs simultanés ? | Volume mensuel conforme mais service saturé |

Pour Adobe comme FileOpen, le décompte commercial d’une personne ne doit pas exposer son existence ou ses activités entre ateliers. Une adresse email n’est pas toujours une personne unique : alias, adresses partagées et changement d’adresse nécessitent une règle contractuelle exploitable. Ne pas bâtir un annuaire transversal uniquement pour réduire la facture.

## 5. Trois montages à faire chiffrer

| Montage | Intérêt pour Guteneo | Limites à prévoir |
| --- | --- | --- |
| **Licence OEM mutualisée** | Un contrat moteur, isolation logique par atelier, coûts fixes partagés | Permission expresse, métriques agrégées, cloisonnement, hausse du nombre d’ateliers et quotas négociés |
| **Déploiement dédié par atelier** | Adapté à des exigences d’isolation ou contrats particuliers | Coûts fixes, recette, secours et exploitation répétés ; le droit de fournir le service reste nécessaire |
| **Licence apportée par le client — BYOL** | Guteneo facture connecteur et service ; le grand compte finance son moteur | Droit d’intervention/hébergement par Guteneo, API et externes à confirmer ; maintenance de plusieurs environnements |

Le BYOL est une offre entreprise possible, pas un moyen de rendre la licence standard mutualisable. Une installation par atelier peut également multiplier les couples personne/déploiement lorsque plusieurs ateliers adressent le même cabinet ou partenaire.

**Demande proposée :** devis FileOpen OEM mutualisé et dédié ; devis Adobe auto-hébergé/OEM, Adobe Managed Services et option client licencié. Si une route n’est pas commercialement disponible, demander une réponse explicite plutôt qu’une substitution silencieuse à un autre produit.

## 6. Scénarios identiques pour les deux fournisseurs

Hypothèses de comparaison uniquement ; aucune mesure de trafic Guteneo. Chaque source compte 10 pages, 3 destinataires et 2 ouvertures par attribution. Deux émetteurs par atelier et deux opérateurs centraux sont distingués.

| Variable | Pilote | Croissance | Échelle |
| --- | ---: | ---: | ---: |
| Ateliers | 10 | 100 | 1 000 |
| Sources PDF nouvelles/mois | 1 000 | 10 000 | 100 000 |
| Attributions document-destinataire/mois | 3 000 | 30 000 | 300 000 |
| Personnes distinctes actives/mois | 500 | 5 000 | 50 000 |
| Nouvelles personnes nettes/mois après M1 | 100 | 1 000 | 10 000 |
| Ouvertures/mois | 6 000 | 60 000 | 600 000 |
| Émetteurs dans les ateliers | 20 | 200 | 2 000 |
| Opérateurs Guteneo | 2 | 2 | 2 |
| Personnes rencontrées à M12 | 1 600 | 16 000 | 160 000 |
| Personnes rencontrées à M36 | 4 000 | 40 000 | 400 000 |

Les deux dernières lignes sont l’arithmétique `personnes M1 + (mois − 1) × personnes nouvelles`, sans réaffectation. Elles ne prétendent pas que ces effectifs seront nécessairement facturés : elles testent le risque d’un stock nominatif croissant. Les « nouvelles personnes » sont nouvelles dans le déploiement entier, pas seulement absentes le mois précédent.

Exiger deux prix par scénario :

- **Usage court** : accès expirant à 30 jours, PDF protégés/politiques retirés selon une procédure définie ; journaux selon politique séparée. Le fournisseur doit dire si cela libère les unités licenciées.
- **Usage durable** : accès maintenu 36 mois. Au palier Croissance, jusqu’à 360 000 sources protégées peuvent rester actives après 36 mois ; si le système personnalise chaque destinataire, jusqu’à 1 080 000 artefacts. Les ouvertures ultérieures doivent être ajoutées à celles des nouvelles publications, avec une hypothèse explicitement renseignée.

Ajouter des variantes de stress : 25 % de destinataires communs entre ateliers ; doublement des nouvelles personnes ; multiplication par trois des ouvertures à effectif constant ; 10 % d’échecs/réessais techniques ; deuxième région et migration en double exploitation. Chacune doit changer seulement les compteurs concernés pour comprendre le prix.

Ces scénarios permettent un premier devis de licence. Pour le chiffrage d’infrastructure, compléter avec tailles moyenne/maximale des PDF, rétention des journaux, événements par ouverture et débit de pointe. Ces valeurs ne sont pas encore mesurées ; le devis doit expliciter ses hypothèses plutôt que les supposer nulles.

## 7. Modèle de coût total

### Entrées à obtenir, sans remplacer les inconnues par zéro

| Poste | À demander dans le devis |
| --- | --- |
| Droit SaaS/OEM | Montant, minimum, ateliers inclus, contrat annuel/pluriannuel, éventuelle redevance sur revenu |
| Socle produit | SKU et fonctions obligatoires ; distinguer le socle du module DRM |
| Destinataires/sièges | Unité, période, inclusions, réaffectation, prorata, hausse et baisse |
| Production et secours | Runtime, instances, régions, licences secours chaud/froid et bascules |
| Développement/recette | Droits d’évaluation, CI, staging, essais de restauration et données autorisées |
| API/SDK/PPL | Modules requis, processus, limites d’exécution et droits de redistribution |
| Variables | Documents, versions, artefacts, authentifications, audit, stockage et dépassements |
| Support fournisseur | Horaires, urgence, délai de réponse/rétablissement, responsabilité sur les lecteurs |
| Installation/intégration | Services obligatoires, formation, accompagnement, validation et éventuels frais fixes |
| Sortie | Lecture seule, maintien du serveur de licences, export, migration, double exploitation |

Ajouter les coûts propres à Guteneo : hébergement supporté, base et sauvegardes, exploitation/correctifs, tests des lecteurs, Cloudflare, email/identité, sécurité, assistance aux ateliers et aux destinataires. L’autohébergement peut réduire certains frais fournisseur tout en transférant ces charges à Guteneo.

```text
Licence annuelle = forfait contractuel
                 + somme(max(0, unité facturable - allocation incluse) × dépassement)

TCO 36 mois = intégration + mise en service + frais initiaux
            + somme des coûts récurrents et variables sur 36 mois
            + migration et sortie

Coût support destinataires = incidents × durée moyenne en heures × coût horaire chargé
```

Adapter la première formule au devis : un minimum garanti peut déjà inclure le forfait ou être un crédit de consommation. Ne pas compter deux fois le même engagement. Distinguer charges annuelles prépayées, frais uniques, coûts mensuels et consommation à régulariser.

Calculer les dépassements sur la période contractuelle applicable : une allocation mensuelle non consommée ne compense pas un autre mois sans report explicitement prévu. Affecter chaque coût à une seule ligne ; support, hébergement Managed Services, SDK/runtime ou prestations déjà inclus ne doivent pas être ajoutés une seconde fois.

Comparer trois résultats : **trésorerie année 1**, **coût récurrent à charge stabilisée**, **TCO sur 36 mois**. Pour le pilotage produit, calculer aussi coût par atelier, publication, nouveau destinataire, ouverture et mois de conservation. Les coûts historiques de Guteneo déjà payés ne doivent pas masquer le coût complet à long terme ; présenter l’incrémental et le complet séparément.

### Une limite de budget calculable avant tout devis

Exemple purement illustratif : 100 ateliers, supplément DRM hypothétique, marge brute cible de 80 %. Il ne s’agit ni d’un tarif Guteneo décidé ni d’une estimation des prix fournisseurs.

| Supplément hypothétique par atelier/mois HT | Revenu annuel | Budget maximal de tous les coûts directs/an |
| --- | ---: | ---: |
| 50 € | 60 000 € | 12 000 € |
| 100 € | 120 000 € | 24 000 € |
| 250 € | 300 000 € | 60 000 € |

`Budget coûts directs = revenu additionnel × (1 − marge cible)`.

`Plafond de licence = budget coûts directs − infrastructure − exploitation/support − autres coûts directs`.

Dans le cas central, **24 000 €/an est le plafond de tous les coûts directs**, pas le budget disponible pour une licence seule. Les frais de développement et la trésorerie initiale doivent encore être évalués séparément selon la politique de rentabilité retenue.

Si un contrat facturait annuellement toute la cohorte de personnes rencontrées, ce plafond représenterait au maximum 1,50 €/personne/an à 16 000 personnes, puis 0,60 € à 40 000, avant les autres coûts. Cette sensibilité ne décrit pas un prix Adobe : elle montre pourquoi la définition des destinataires inactifs peut décider de la viabilité du SaaS.

Ces ratios appliquent la capacité de fin d’année à une année entière sans prorata. Si le contrat prévoit un prorata, recalculer sur les personnes-mois effectivement facturées ; ce ne sont pas des coûts moyens observés.

Pour une facturation Guteneo à l’usage, refaire le même calcul avec le nombre d’unités réellement facturées : document, destinataire, période d’hébergement ou atelier. Ne pas reconduire automatiquement le prix historique du lien protégé à une offre DRM.

## 8. Clauses à négocier avant engagement

| Sujet | Position proposée pour Guteneo |
| --- | --- |
| Périmètre SaaS | Autorisation explicite de protéger les documents d’ateliers indépendants et de leur facturer le service |
| Mutualisation | Un contrat maître, croissance des ateliers sans requalification automatique à chaque inscription |
| Destinataires occasionnels | Définition de la libération/réaffectation ou forfait avec capacité et dépassement plafonné |
| Comptage | Règles écrites pour alias, boîtes partagées, personnes communes, versions, refus et retries |
| Prix | Minimum, inclusions, dépassements, devise, taxes, indexation et plafond de hausse au renouvellement |
| Engagement | Période d’essai autorisée, critères de réception, montée en charge et réduction possible des volumes |
| Non-production / secours | Environnements nommés, bascules et restauration sans mauvaise surprise de licence |
| Runtime Cloudflare | Architecture, conteneurs éphémères, régions et autoscaling explicitement autorisés et supportés |
| Support | Chaîne Guteneo/éditeur, correctifs sécurité/Reader, horaires d’urgence et service de rétablissement |
| Sous-traitance | Données réellement transmises, régions, support distant, télémétrie, DPA et suppression |
| Réversibilité | Export des politiques/journaux, continuité du domaine de licence, droit de lecture des anciens fichiers et phase de transition |
| Contrôle de licence | Mesures vérifiables et auditables sans exposer contenus, destinataires ou activités entre ateliers |

Ne pas accepter « notre API permet cela » comme réponse au droit contractuel. Demander le document qui l’accorde et les limites associées. De même, une mention « illimité » doit nommer précisément ce qui ne sera pas facturé.

## 9. Brief de devis prêt à transmettre

Document de préparation uniquement ; **aucun envoi n’a été effectué**.

> Guteneo souhaite intégrer un moteur de protection persistante de PDF dans son SaaS. Plusieurs entreprises clientes indépendantes utilisent la plateforme pour protéger leurs propres documents confidentiels et les distribuer à des destinataires externes. Guteneo facture cette fonctionnalité. Les données, identités, politiques et journaux sont isolés par atelier ; certains destinataires peuvent être communs à plusieurs ateliers sans visibilité croisée.
>
> L’offre doit couvrir le PDF téléchargé et ouvert dans un lecteur compatible, ainsi que les API de préparation, de droits, de révocation et d’audit. Une solution de lecteur web seule n’est pas équivalente. Nous souhaitons garder l’application sur Cloudflare et qualifier les composants natifs nécessaires, leur hébergement et leurs licences.
>
> Merci de répondre pour les scénarios Pilote, Croissance et Échelle de la section 6, en distinguant année 1, années 2 et 3, coûts uniques, minimums et dépassements. Confirmez la disponibilité d’un accord OEM/service provider mutualisé, et proposez séparément les variantes dédiées ou client titulaire de sa licence. Indiquez toute incompatibilité avec ce modèle avant de proposer un produit de remplacement.

Réponse attendue de chaque fournisseur :

1. **Oui/non et référence contractuelle** pour le SaaS multi-ateliers, traitement des documents de tiers et facturation du service.
2. Références produit/SKU, version supportée, socle, modules, clients et options incluses.
3. Tableau des unités facturables et définitions de la section 4, y compris destinataires occasionnels et usages via API.
4. Montants pour les trois scénarios et deux durées d’accès ; minimum, dépassements, hausse annuelle et paiements.
5. Capacités et coûts de recette, production, secours, migration et autoscaling.
6. Responsabilités de support atelier/destinataire, disponibilité du service de licences et délais de correction.
7. DPA, régions, données transmises et garanties d’isolation applicables à la variante proposée.
8. Fonctionnement et coût après arrêt des nouvelles protections ou résiliation : ouverture/révocation des anciens fichiers, export et transition.
9. Conditions d’un essai sur documents synthétiques : coût, durée, droits de test, absence d’envois automatiques non autorisés et critères de validation.

Le brief ne doit pas transmettre documents clients, listes réelles de destinataires ou secrets. Les conditions à faire accepter doivent être incorporées au contrat final ; une réponse commerciale vague ne remplace pas cet accord.

## 10. Décision après réception des offres

Rejeter une offre qui ne couvre pas explicitement le SaaS demandé, dont les unités ne permettent pas de prévoir la facture, ou dont la sortie empêcherait de tenir les engagements envers les ateliers sans solution de transition.

Comparer ensuite :

1. Coût complet et trésorerie des scénarios, avec sensibilité aux destinataires nouveaux et aux anciens documents.
2. Parcours des destinataires externes et charge de support.
3. Audit réellement disponible, délais et révocation mesurés par prototype.
4. Hébergement/support Cloudflare ou coût accepté d’une composante externe.
5. Continuité, sécurité, réversibilité et engagement contractuel.

**Priorité commerciale : FileOpen OEM ; comparaison technique et devis Adobe maintenus.** Adobe peut convenir à une offre entreprise financée par un atelier ou à un contrat SaaS négocié favorablement. FileOpen peut mieux correspondre à une plateforme intégrée, sous réserve de son accord et de son prix. Aucune solution n’est encore choisie pour implémentation.
