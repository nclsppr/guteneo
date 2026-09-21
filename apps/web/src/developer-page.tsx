import { useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Code, FilePdf } from "@phosphor-icons/react";
import { LuxembourgFooter } from "./landing-sections";
import { Brand } from "./brand";
import "./developer.css";

const scopes = [
  ["documents:read", "Lister les PDF et consulter leurs octets validés."],
  ["documents:write", "Déposer, générer et réexaminer un document."],
  [
    "dispatches:prepare",
    "Préparer un envoi, créer une campagne, valider un CSV.",
  ],
  [
    "dispatches:send",
    "Confirmer après accord humain ou annuler avant soumission.",
  ],
  [
    "dispatches:read",
    "Lire les envois, campagnes, expéditeurs et consommation.",
  ],
];
const uploadExample = `curl 'https://guteneo.com/api/documents' \\\n  --header "Authorization: Bearer $GUTENEO_ACCESS_TOKEN" \\\n  --form 'file=@./document.pdf;type=application/pdf'`;
const prepareExample = `curl 'https://guteneo.com/api/dispatches' \\\n  --header "Authorization: Bearer $GUTENEO_ACCESS_TOKEN" \\\n  --header 'Content-Type: application/json' \\\n  --header 'Idempotency-Key: ma-preparation-unique-001' \\\n  --data '{
    "channel": "fax",
    "documentId": "doc_identifiant_recu",
    "recipient": { "phone": "+352000000000" }
  }'`;
const readExample = `curl 'https://guteneo.com/api/dispatches/dsp_identifiant_recu' \\\n  --header "Authorization: Bearer $GUTENEO_ACCESS_TOKEN"`;

function CodeExample({ title, children }: { title: string; children: string }) {
  return (
    <figure className="developer-code">
      <figcaption>{title}</figcaption>
      <pre tabIndex={0} aria-label={title}>
        <code>{children}</code>
      </pre>
    </figure>
  );
}

export function DeveloperPage() {
  const [reference, setReference] = useState<
    "closed" | "loading" | "open" | "error"
  >("closed");
  const explorer = useRef<HTMLDivElement>(null);
  async function openReference() {
    if (reference === "loading" || reference === "open") return;
    setReference("loading");
    try {
      const { mountSwagger } = await import("./swagger-loader");
      if (!explorer.current) return;
      await mountSwagger(explorer.current);
      setReference("open");
    } catch {
      setReference("error");
    }
  }
  return (
    <div className="landing developer-page">
      <a className="skip-link" href="#developer-main">
        Aller à la documentation
      </a>
      <header className="site-header developer-header">
        <Brand />
        <nav aria-label="Navigation principale">
          <a href="/#installation">Les intégrations</a>
          <a href="/openapi.json" download="guteneo-openapi.json">
            OpenAPI <ArrowDown size={16} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main id="developer-main">
        <div className="developer-intro">
          <p className="developer-kicker">L’ATELIER / DÉVELOPPEURS</p>
          <h1>
            Vos documents.
            <br />
            <em>Votre façon de les envoyer.</em>
          </h1>
          <p className="developer-dek">
            Reliez votre application à Guteneo : un PDF fidèle à l’original, une
            préparation vérifiable et le dernier mot laissé à la personne qui
            l’envoie.
          </p>
          <div className="developer-intro-links">
            <a className="button" href="#premiers-pas">
              Lire le guide <ArrowDown size={17} aria-hidden="true" />
            </a>
            <a href="/openapi.json" download="guteneo-openapi.json">
              Télécharger le contrat OpenAPI{" "}
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </div>
          <p className="developer-beta">
            <strong>Bêta en préparation.</strong> Cette référence décrit le code
            disponible. Guteneo héberge la bêta ; consultez les capacités du
            service pour connaître les canaux activés. La démonstration séparée
            utilise des données fictives. Le crédit de bienvenue de 50 € ne
            remplace pas l’activation des transports ; aucune recharge n’est
            proposée.
          </p>
          <dl className="developer-facts">
            <div>
              <dt>Contrat</dt>
              <dd>REST · OpenAPI 3.0.3</dd>
            </div>
            <div>
              <dt>Accès</dt>
              <dd>OAuth 2.0 · PKCE</dd>
            </div>
            <div>
              <dt>Documents</dt>
              <dd>PDF privés · SHA-256</dd>
            </div>
          </dl>
        </div>
        <div className="developer-layout">
          <nav
            className="developer-contents"
            aria-label="Sommaire de la documentation"
          >
            <span>Dans ce guide</span>
            <a href="#premiers-pas">01 — Préparer un envoi</a>
            <a href="#authentification">02 — Se connecter</a>
            <a href="#documents">03 — Garder l’original</a>
            <a href="#fiabilite">04 — Suivre sans doubler</a>
            <a href="#limites">05 — Limites et erreurs</a>
            <a href="#reference">06 — Référence API</a>
          </nav>
          <div className="developer-copy">
            <section id="premiers-pas">
              <p className="developer-kicker">01 / LE PARCOURS</p>
              <h2>Préparer. Vérifier. Confirmer.</h2>
              <p>
                Le dépôt et la préparation ne déclenchent aucune communication.
                Après l’ouverture de la bêta, commencez par créer votre espace
                Guteneo dans le navigateur et vérifier votre adresse e-mail.
                Connectez ensuite un client OAuth enregistré avec les droits
                nécessaires.
              </p>
              <ol className="developer-steps">
                <li>
                  <strong>Déposez le PDF.</strong> Envoyez le fichier original
                  dans le champ <code>file</code>. Attendez son état{" "}
                  <code>ready</code> : une réponse 201 peut encore désigner un
                  document en quarantaine.
                </li>
                <li>
                  <strong>Préparez l’envoi.</strong> Choisissez le document et
                  le destinataire. Conservez la réponse, son <code>id</code>,
                  son empreinte et les montants retournés. Votre plafond
                  éventuel est exprimé en centimes EUR.
                </li>
                <li>
                  <strong>Validation standard.</strong> Orientez la personne
                  vers{" "}
                  <code>https://guteneo.com/#/app/dispatch/&#123;id&#125;</code>
                  . Elle vérifie le PDF, le destinataire, les options et le
                  coût, puis approuve dans sa session Guteneo. Le mode expert
                  facultatif suit un mandat limité, activé au préalable dans Mon
                  compte pour l’assistant concerné.
                </li>
                <li>
                  <strong>Confirmez et suivez.</strong> Le client peut alors
                  appeler{" "}
                  <code>POST /api/dispatches/&#123;id&#125;/confirm</code>, avec
                  une clé d’idempotence propre à cette confirmation. Relisez
                  ensuite l’état de l’envoi.
                </li>
              </ol>
              <CodeExample title="1. Déposer le fichier original">
                {uploadExample}
              </CodeExample>
              <CodeExample title="2. Préparer un fax — identifiants et numéro fictifs à remplacer">
                {prepareExample}
              </CodeExample>
              <p className="developer-note">
                Ces exemples sont des modèles de requête, pas des accès fournis.
                La variable d’environnement contient un jeton d’accès obtenu par
                votre client OAuth ; ne le placez jamais dans une URL ou dans un
                dépôt de code. Aucun exemple n’est exécuté depuis cette page.
              </p>
              <p>
                Le résultat REST est l’envoi brut. Le champ{" "}
                <code>approvalUrl</code> appartient à la réponse MCP ; en REST,
                construisez le lien navigateur avec l’identifiant retourné. Un «
                oui » dans une conversation et une autorisation d’outil ne
                créent ni approbation humaine ni mandat expert. Le parcours MCP
                expert utilise une revue récente puis l’approbation déléguée ;
                il respecte les limites du mandat et les confirmations de votre
                assistant.
              </p>
              <p>
                Pour le courrier, lisez d’abord le gabarit avec{" "}
                <code>GET /api/postal/requirements?country=LU</code>, en
                indiquant le pays du destinataire. Après avoir créé et importé
                le PDF, utilisez <code>POST /api/postal/preflights</code> :
                Guteneo contrôle le PDF exact et retourne un{" "}
                <code>reviewUrl</code>. En mode standard, la personne ouvre ce
                lien pour relire les pages et autoriser le dépôt chez le
                prestataire d’impression. Le mode expert exige un mandat postal
                couvrant séparément ce transfert de données ; il ne déclenche
                aucune expédition. Après l’analyse du brouillon, demandez
                <code> POST /api/postal/preflights/&#123;id&#125;/quote</code>,
                puis faites approuver le devis. Ces étapes restent distinctes de
                l’expédition ; un transfert incertain ne doit jamais être
                relancé automatiquement.
              </p>
            </section>
            <section id="authentification">
              <p className="developer-kicker">02 / AUTHENTIFICATION</p>
              <h2>Des permissions précises.</h2>
              <p>
                Les clients utilisent Authorization Code avec PKCE{" "}
                <code>S256</code>, une URI de retour enregistrée exactement et
                un paramètre <code>state</code> vérifié. L’audience est{" "}
                <code>https://guteneo.com/mcp</code>, aussi pour les routes REST
                documentées. Il n’existe pas de clé API personnelle ni de mot de
                passe à transmettre à un assistant.
              </p>
              <dl className="developer-endpoints">
                <dt>Autorisation</dt>
                <dd>
                  <code>https://pieper.eu.auth0.com/authorize</code>
                </dd>
                <dt>Échange du code</dt>
                <dd>
                  <code>https://pieper.eu.auth0.com/oauth/token</code>
                </dd>
                <dt>Jeton HTTP</dt>
                <dd>
                  <code>Authorization: Bearer &lt;access_token&gt;</code>
                </dd>
              </dl>
              <p>
                Utilisez un jeton d’accès, jamais un ID token. Un client public
                ne contient aucun secret client. L’organisation est déterminée
                par l’adhésion et la connexion autorisée ; aucun paramètre ne
                permet de choisir librement un autre espace. Avec plusieurs
                espaces, l’association se fait dans les connexions du tableau de
                bord. Le rôle de lecteur interdit les écritures, même avec un
                scope. Pendant la bêta, un compte vérifié est requis pour tous
                les rôles ; la double authentification n’est pas obligatoire.
              </p>
              <div
                className="developer-table-scroll"
                tabIndex={0}
                aria-label="Permissions OAuth"
              >
                <table>
                  <caption>Demandez uniquement les permissions utiles.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Scope</th>
                      <th scope="col">Permission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scopes.map(([scope, description]) => (
                      <tr key={scope}>
                        <th scope="row">
                          <code>{scope}</code>
                        </th>
                        <td>{description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                <strong>Aucun scope n’autorise l’approbation humaine.</strong>{" "}
                La route navigateur d’approbation, l’administration et la
                facturation ne font pas partie de cette API développeurs. Les
                droits accordés par OAuth ne remplacent pas les contrôles de
                rôle, d’expéditeur, de crédit ou de canal.
              </p>
              <p>
                Pour les assistants, le transport prévu est MCP Streamable HTTP
                sur <code>https://guteneo.com/mcp</code>. Les fichiers
                d’intégration sont disponibles depuis{" "}
                <a href="/#installation">les instructions d’installation</a>.
                Chaque client doit encore être enregistré et testé dans son
                environnement réel.
              </p>
            </section>
            <section id="documents">
              <p className="developer-kicker">03 / DOCUMENTS</p>
              <h2>Un original reste un original.</h2>
              <p>
                <code>POST /api/documents</code> conserve les octets déposés. Le
                PDF est privé, identifié par son SHA-256 et soumis à une analyse
                ainsi qu’à une validation dans un environnement isolé.{" "}
                <code>GET /api/documents/&#123;id&#125;/content</code> restitue
                uniquement un document prêt, avec l’en-tête{" "}
                <code>X-Document-SHA256</code> et sans cache public.
              </p>
              <p>
                <code>POST /api/documents/render</code> fabrique un nouveau PDF
                A4 à partir de HTML nettoyé. Les scripts, styles fournis et
                ressources externes sont retirés. Ce rendu ne doit pas servir à
                reconstruire un original à partir de son texte. L’import d’une
                URL est réservé à l’outil MCP <code>import_document</code>, sur
                tout domaine public en HTTPS, sans redirection ; ce n’est pas
                une route REST.
              </p>
              <p>
                Le champ <code>analysis</code> indique si la vérification est en
                cours, terminée, à relancer ou bloquée, avec une explication et
                une prochaine action. Pendant une vérification en cours,
                consultez <code>GET /api/documents/&#123;id&#125;</code> toutes
                les 15 secondes au maximum. Le serveur gère les reprises
                automatiques limitées. Proposez une relance explicite via{" "}
                <code>POST /api/documents/&#123;id&#125;/rescan</code> seulement
                lorsque l’action retournée est <code>rescan</code>. Conservez le
                même document : aucun nouveau dépôt n’est nécessaire.
              </p>
            </section>
            <section id="fiabilite">
              <p className="developer-kicker">04 / FIABILITÉ</p>
              <h2>Une demande, un envoi.</h2>
              <p>
                L’en-tête <code>Idempotency-Key</code> est obligatoire pour
                préparer et confirmer : 1 à 200 caractères, sans retour à la
                ligne ni caractère NUL. Gardez une clé stable par opération
                logique ; utilisez une autre clé pour la confirmation.
                Réutiliser une clé avec un contenu différent produit{" "}
                <code>IDEMPOTENCY_CONFLICT</code>.
              </p>
              <p>
                L’empreinte <code>fingerprint</code> lie le contenu, le
                destinataire, le document, les options et le coût approuvés.
                L’accord dure au maximum 15 minutes et peut expirer plus tôt
                avec le devis. La confirmation réserve le plafond et inscrit le
                travail à effectuer dans la même transaction.
              </p>
              <CodeExample title="Lire l’état avant de décider d’une nouvelle action">
                {readExample}
              </CodeExample>
              <ul className="developer-states">
                <li>
                  <code>prepared</code> : préparation enregistrée, pas encore
                  mise en file.
                </li>
                <li>
                  <code>queued</code> : confirmation acceptée, travail en
                  attente.
                </li>
                <li>
                  <code>submitting</code> / <code>submission_unknown</code> : le
                  fournisseur peut déjà avoir reçu la demande. Aucune relance
                  automatique ni nouvel envoi de remplacement.
                </li>
                <li>
                  <code>accepted</code> : accepté par le fournisseur ; ce n’est
                  pas une preuve de livraison. Consultez les événements
                  suivants.
                </li>
              </ul>
              <p>
                Après un délai d’attente HTTP, relisez d’abord l’envoi. Une
                annulation est possible seulement avant le début de la
                soumission, pour <code>prepared</code> ou <code>queued</code>.{" "}
                <code>CANCELLATION_TOO_LATE</code> signifie que l’annulation
                n’est plus garantie.
              </p>
              <p>
                Les réponses distinguent toujours <code>mode: simulation</code>{" "}
                et <code>production</code>. Les soldes et plafonds sont des
                entiers en centimes EUR. Un devis fractionnaire expose aussi
                <code> quote_customer_nanoeur</code> : 1 EUR vaut un milliard de
                nanoEUR. Le débit en centimes suit le cumul exact de
                l’organisation, sans arrondir chaque e-mail à un centime. Ces
                champs peuvent être absents des listes ou null ; cela ne
                signifie pas un prix nul.
              </p>
              <p>
                Pour le fax v3, <code>faxPricing</code> fournit la fourchette HT
                en nanoEUR et le plafond ferme en centimes. Le plafond est
                réservé à la confirmation. Consultez ensuite
                <code> settlement.status</code> : une livraison peut être
                terminée alors que le décompte est encore <code>reserved</code>.
                Seul <code>settled</code> fournit la consommation validée et le
                débit du solde. Le tarif qualifié limite le fax à dix pages au
                maximum, même si le PDF a pu être importé.
              </p>
              <p>
                En production, chaque canal exige une tarification privée
                qualifiée et un devis encore valide. Aucun montant fournisseur
                fourni par le client ne peut les remplacer. Les tarifs
                indicatifs de la page d’accueil ne constituent pas un devis API.
              </p>
            </section>
            <section id="limites">
              <p className="developer-kicker">05 / LIMITES ET ERREURS</p>
              <h2>Prévoir les cas d’attente.</h2>
              <dl className="developer-limits">
                <div>
                  <dt>PDF</dt>
                  <dd>10 Mio · 100 pages maximum</dd>
                </div>
                <div>
                  <dt>HTML et texte e-mail</dt>
                  <dd>128 Kio UTF-8 par contenu</dd>
                </div>
                <div>
                  <dt>CSV</dt>
                  <dd>256 Kio · 500 lignes maximum</dd>
                </div>
                <div>
                  <dt>Listes</dt>
                  <dd>30 éléments par défaut · 100 maximum</dd>
                </div>
                <div>
                  <dt>API authentifiée</dt>
                  <dd>180 requêtes par minute et organisation</dd>
                </div>
                <div>
                  <dt>Réexamens PDF</dt>
                  <dd>10 par jour et organisation</dd>
                </div>
              </dl>
              <p>
                Les dépôts et rendus ont aussi des quotas quotidiens propres à
                l’organisation. Les listes renvoient <code>items</code> et{" "}
                <code>nextCursor</code> ; renvoyez ce curseur opaque sans le
                modifier. Les réponses de validation CSV séparent{" "}
                <code>rows</code>, <code>errors</code> et{" "}
                <code>duplicates</code> : un succès HTTP ne signifie pas que
                chaque ligne est valide.
              </p>
              <p>
                Une erreur contient{" "}
                <code>
                  &#123; "error": &#123; "code", "message" &#125; &#125;
                </code>
                , parfois une liste <code>fields</code>. Conservez le code et{" "}
                <code>X-Correlation-ID</code> pour le diagnostic, sans
                journaliser le document, le destinataire ou le jeton.
              </p>
              <ul>
                <li>
                  <strong>401 / 403 :</strong> authentification ou permission ;{" "}
                  <code>ONBOARDING_REQUIRED</code> demande d’abord une connexion
                  au navigateur.
                </li>
                <li>
                  <strong>409 :</strong> approbation, devis, crédit, quota ou
                  état incompatible. Corrigez la cause ; ne changez pas de clé
                  pour forcer l’envoi.
                </li>
                <li>
                  <strong>413 / 423 :</strong> contenu trop volumineux ou
                  document non consultable.
                </li>
                <li>
                  <strong>429 :</strong> ralentissez. La limite HTTP renvoie{" "}
                  <code>Retry-After: 60</code> ; les quotas documentaires n’ont
                  pas nécessairement cet en-tête.
                </li>
                <li>
                  <strong>503 :</strong> configuration ou service requis
                  indisponible. La démonstration publique répond quant à elle{" "}
                  <code>403 PREVIEW_ONLY</code>.
                </li>
              </ul>
              <p>
                <code>GET /api/usage</code> distingue le crédit de bienvenue,
                les réservations et les plafonds mensuels. Le crédit ne se
                renouvelle pas. Une issue fournisseur inconnue conserve la
                réservation ; elle ne justifie jamais une nouvelle expédition
                automatique.
              </p>
            </section>
          </div>
        </div>
        <section
          className="developer-reference"
          id="reference"
          aria-labelledby="reference-title"
        >
          <div className="developer-reference-heading">
            <div>
              <p className="developer-kicker">06 / LE CONTRAT COMPLET</p>
              <h2 id="reference-title">Chaque route, chaque réponse.</h2>
            </div>
            <FilePdf size={38} weight="thin" aria-hidden="true" />
          </div>
          <p>
            23 opérations : documents, contrôle postal, envois, campagnes,
            destinataires, expéditeurs, consommation et état du service.
            Explorez les schémas en lecture seule. Aucun bouton d’exécution,
            aucune connexion OAuth, aucun jeton envoyé depuis l’explorateur.
          </p>
          <div className="developer-reference-actions">
            <button
              className="button"
              type="button"
              onClick={openReference}
              disabled={reference === "loading" || reference === "open"}
              aria-controls="swagger-reference"
              aria-expanded={reference === "open"}
            >
              <Code size={19} aria-hidden="true" />{" "}
              {reference === "loading"
                ? "Chargement de la référence…"
                : reference === "open"
                  ? "Référence ouverte"
                  : "Ouvrir la référence Swagger"}
            </button>
            <a href="/openapi.json" download="guteneo-openapi.json">
              Télécharger OpenAPI (.json){" "}
              <ArrowDown size={17} aria-hidden="true" />
            </a>
          </div>
          <noscript>
            <p>
              Le guide est disponible sans JavaScript. Pour explorer les
              schémas, téléchargez le contrat OpenAPI ci-dessus.
            </p>
          </noscript>
          <p role="status" className="developer-reference-status">
            {reference === "error"
              ? "La référence n’a pas pu être chargée. Réessayez ou téléchargez le fichier OpenAPI."
              : reference === "open"
                ? "Référence chargée. Vous pouvez déplier les opérations ci-dessous."
                : reference === "loading"
                  ? "Chargement des schémas en lecture seule."
                  : "L’explorateur se charge uniquement à votre demande."}
          </p>
          <div
            id="swagger-reference"
            ref={explorer}
            aria-busy={reference === "loading"}
          />
        </section>
      </main>
      <LuxembourgFooter />
    </div>
  );
}
