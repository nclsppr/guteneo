# Heures limites de traitement du courrier

## Source et portée

Vérification documentaire effectuée le **21 septembre 2026** :

- [Pingen — Introduction to Cut-Off times](https://help.pingen.com/en/submit-and-send-letters/introduction-cut-off-times).
- [Version française concordante](https://help.pingen.com/fr/soumettre-et-envoyer-les-lettres/introduction-aux-cut-off-temps).
- [Suisse : modes d’envoi et traitement du courrier B en nombre](https://help.pingen.com/en/submit-and-send-letters/shipping-options-switzerland).

Les horaires dépendent du **pays destinataire**. Le pays de l’expéditeur et le profil postal de l’organisation ne déterminent pas ce tableau. Les horaires sont exprimés en CE(S)T, soit CET en hiver et CEST en été, comme l’heure de Paris. La source commune est `apps/web/src/postal-cutoff.ts` ; la FAQ et l’indication pendant la préparation utilisent cette même source.

## Données vérifiées

| Destination                         | Heure limite               | Impression et remise à la poste avant la limite |
| ----------------------------------- | -------------------------- | ----------------------------------------------- |
| Belgique, Luxembourg                | 01 h 00                    | Même jour ouvré                                 |
| Inde                                | 06 h 00                    | Jour ouvré suivant                              |
| Autres pays                         | 10 h 00                    | Même jour ouvré                                 |
| France, Suisse, Allemagne, Pays-Bas | 12 h 00                    | Même jour ouvré                                 |
| Autriche                            | 12 h 00 ; vendredi 10 h 00 | Même jour ouvré                                 |
| Espagne                             | 12 h 00                    | Sous deux jours ouvrés                          |
| Royaume-Uni                         | 16 h 00                    | Même jour ouvré                                 |

Le traitement ne se déroule ni le week-end ni les jours fériés. Une arrivée après l’heure limite reporte le courrier au prochain cycle de traitement ; l’interface ne promet pas une remise systématique « demain ». Les modes Economy vers l’Allemagne et courrier B en nombre vers la Suisse peuvent allonger le traitement. En Suisse, le courrier B en nombre attend notamment un regroupement suffisant selon les conditions documentées du prestataire.

## Présentation et limites

La FAQ est accessible directement par `/#postal-cutoff-faq` : l’accordéon natif s’ouvre à l’arrivée. Le tableau reste une information de délai, pas une annonce d’activation de destinations ou de modes d’envoi supplémentaires. Leur disponibilité est vérifiée lors de la préparation.

Les textes publics parlent d’heure limite, de traitement et de remise à la poste. Ils ne citent pas le prestataire ni ne renvoient vers sa documentation ; les sources et la date de vérification sont conservées ici. Le délai de distribution s’ajoute après la remise à la poste et aucune date de réception n’est garantie par ces horaires.

Un PDF importé ou un devis obtenu ne constitue pas un envoi finalisé. La limite concerne la transmission au service d’impression, pas le seul clic de confirmation ni l’acceptation locale Guteneo : le traitement asynchrone peut franchir la limite. L’indication ne calcule ni compte à rebours, ni date précise, faute de calendrier qualifié de jours fériés. Aucun changement des règles d’acceptation, de quota, de consentement, de facturation ou d’envoi fournisseur n’est nécessaire.

## Validation du candidat

Les 15 scénarios ciblés passent sur Chromium ordinateur, Chromium mobile et WebKit iPhone simulé : changement de destination, exception économique, FAQ ouverte et focalisée dans un nouvel onglet sans perte du formulaire, absence de débordement des cellules, contrôle postal et confirmation finale. Les captures ordinateur/mobile ont été inspectées ; le retour à la ligne des pays groupés est vérifié sur WebKit. TypeScript, ESLint et le build applicatif avec dry-run passent. Ce sont des fixtures locales, sans envoi réel ni nouvelle qualification d’un client MCP. La publication reste attestée séparément par la CI du commit fusionné et les preuves des deux origines publiques.
