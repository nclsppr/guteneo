import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Check, FilePdf } from "@phosphor-icons/react";
import { scrollToSection } from "./landing-sections";
import "./landing-example.css";

type ExampleStep = "request" | "review" | "tracking";
type ExampleChannel = "fax" | "email" | "postal";

const steps: { id: ExampleStep; label: string; description: string }[] = [
  {
    id: "request",
    label: "Demande",
    description: "Vous composez dans votre assistant.",
  },
  {
    id: "review",
    label: "Vérification",
    description: "Vous relisez les détails dans Guteneo.",
  },
  {
    id: "tracking",
    label: "Suivi",
    description: "Vous retrouvez le résultat de chaque étape.",
  },
];

const channels: Record<
  ExampleChannel,
  {
    label: string;
    request: string;
    recipient: string;
    recipientDetail: string;
    costLabel: string;
    amountMinor: number;
    tracking: { title: string; detail: string; confirmed: boolean }[];
  }
> = {
  fax: {
    label: "Fax",
    request: "Prépare l’envoi de Correspondance.pdf par fax à Maison Exemple.",
    recipient: "Maison Exemple",
    recipientDetail: "Destinataire et numéro de fax fictifs",
    costLabel: "Plafond d’exemple",
    amountMinor: 20,
    tracking: [
      {
        title: "Prise en charge",
        detail: "Le prestataire a accepté la demande de fax.",
        confirmed: true,
      },
      {
        title: "Transmission terminée",
        detail: "Les 2 pages ont été transmises au télécopieur destinataire.",
        confirmed: true,
      },
      {
        title: "Réception technique confirmée",
        detail: "Cet accusé ne prouve pas la lecture du document.",
        confirmed: true,
      },
    ],
  },
  email: {
    label: "E-mail",
    request:
      "Prépare un e-mail à Maison Exemple avec Correspondance.pdf en pièce jointe.",
    recipient: "bonjour@maison-exemple.test",
    recipientDetail: "Adresse fictive réservée à cet exemple",
    costLabel: "Prix d’exemple",
    amountMinor: 4,
    tracking: [
      {
        title: "Prise en charge",
        detail: "Le prestataire a accepté le message et sa pièce jointe.",
        confirmed: true,
      },
      {
        title: "Message remis au serveur",
        detail: "Le serveur de messagerie destinataire a accepté l’e-mail.",
        confirmed: true,
      },
      {
        title: "Lecture non confirmée",
        detail: "La remise technique ne prouve pas l’ouverture ou la lecture.",
        confirmed: false,
      },
    ],
  },
  postal: {
    label: "Courrier",
    request:
      "Prépare l’envoi de Correspondance.pdf par courrier à Maison Exemple.",
    recipient: "Maison Exemple · Ville Exemple",
    recipientDetail: "Destinataire et adresse postale fictifs",
    costLabel: "Prix d’exemple",
    amountMinor: 320,
    tracking: [
      {
        title: "Prise en charge",
        detail: "Le prestataire a accepté le document pour impression.",
        confirmed: true,
      },
      {
        title: "Remise à la poste",
        detail:
          "La lettre a été imprimée, mise sous pli puis remise au réseau postal.",
        confirmed: true,
      },
      {
        title: "Livraison non confirmée",
        detail:
          "La remise à la poste ne prouve pas la réception par le destinataire.",
        confirmed: false,
      },
    ],
  },
};

const exampleCurrency = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

export function GuidedExample() {
  const instanceId = useId();
  const [step, setStep] = useState<ExampleStep>("review");
  const [channel, setChannel] = useState<ExampleChannel>("fax");
  const tabRefs = useRef<
    Partial<Record<ExampleStep, HTMLButtonElement | null>>
  >({});
  const example = channels[channel];
  const panelId = `${instanceId}-example-panel`;

  function selectStep(nextStep: ExampleStep) {
    setStep(nextStep);
    tabRefs.current[nextStep]?.focus({ preventScroll: true });
  }

  function navigateSteps(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (index + 1) % steps.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (index + steps.length - 1) % steps.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = steps.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    selectStep(steps[nextIndex].id);
  }

  return (
    <section
      className="guided-example"
      id="how"
      tabIndex={-1}
      aria-labelledby="guided-example-title"
    >
      <div className="guided-example-intro">
        <h2 id="guided-example-title">
          Une demande.
          <br />
          Une vérification.
          <br />
          <em>Un envoi.</em>
        </h2>
        <p>
          Vous composez. Guteneo réunit les détails pour votre accord, puis vous
          permet de suivre chaque étape.
        </p>
        <div
          className="guided-example-tabs"
          role="tablist"
          aria-label="Étapes de la démonstration"
        >
          {steps.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => {
                tabRefs.current[item.id] = element;
              }}
              type="button"
              role="tab"
              id={`${instanceId}-tab-${item.id}`}
              aria-label={item.label}
              aria-describedby={`${instanceId}-description-${item.id}`}
              aria-selected={step === item.id}
              aria-controls={panelId}
              tabIndex={step === item.id ? 0 : -1}
              onClick={() => setStep(item.id)}
              onKeyDown={(event) => navigateSteps(event, index)}
            >
              <span className="guided-example-step-number" aria-hidden="true">
                {index + 1}
              </span>
              <span className="guided-example-step-copy">
                <span>{item.label}</span>
                <small id={`${instanceId}-description-${item.id}`}>
                  {item.description}
                </small>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <div className="guided-example-proof">
        <p className="guided-example-notice">
          Démonstration — aucun envoi réel
        </p>
        <div className="guided-example-channel-row">
          <span>Choisir un canal</span>
          <div
            className="guided-example-channels"
            role="group"
            aria-label="Canal de démonstration"
          >
            {(["fax", "email", "postal"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={channel === item}
                onClick={() => setChannel(item)}
              >
                {channels[item].label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="guided-example-panel"
          id={panelId}
          role="tabpanel"
          aria-labelledby={`${instanceId}-tab-${step}`}
          tabIndex={0}
        >
          {step === "request" && (
            <div className="guided-example-request">
              <h3>Tout commence avec vos mots.</h3>
              <ol className="guided-example-conversation">
                <li>
                  <span>Vous</span>
                  <p>{example.request}</p>
                </li>
                <li>
                  <span>Guteneo</span>
                  <p>
                    Le PDF de 2 pages est prêt. Vérifiez le destinataire, le
                    canal et {channel === "fax" ? "le plafond" : "le prix"} dans
                    Guteneo avant de donner votre accord.
                  </p>
                </li>
              </ol>
              <p className="guided-example-detail">
                Conversation, document et destinataire fictifs.
              </p>
              <button
                type="button"
                className="button"
                onClick={() => selectStep("review")}
              >
                Voir la vérification
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          )}

          {step === "review" && (
            <div className="guided-example-review">
              <h3>L’épreuve avant l’envoi.</h3>
              <dl className="guided-example-fields">
                <div>
                  <dt>Document</dt>
                  <dd className="guided-example-document">
                    <FilePdf size={27} weight="light" aria-hidden="true" />
                    <span>
                      Correspondance.pdf
                      <small>2 pages · document fictif</small>
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Destinataire</dt>
                  <dd>
                    {example.recipient}
                    <small>{example.recipientDetail}</small>
                  </dd>
                </div>
                <div>
                  <dt>Canal</dt>
                  <dd>{example.label}</dd>
                </div>
                <div className="guided-example-cost">
                  <dt>{example.costLabel}</dt>
                  <dd>
                    <strong>
                      {exampleCurrency.format(example.amountMinor / 100)}
                    </strong>
                    <small>Montant fictif, aucun tarif réel</small>
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                className="button primary"
                onClick={() => selectStep("tracking")}
              >
                Simuler la validation
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          )}

          {step === "tracking" && (
            <div className="guided-example-tracking">
              <h3>Chaque étape laisse une trace.</h3>
              <p className="guided-example-tracking-caption">
                Suivi fictif · {example.label} · Correspondance.pdf
              </p>
              <ol className="guided-example-timeline">
                {example.tracking.map((item) => (
                  <li key={item.title} data-confirmed={item.confirmed}>
                    <span
                      className="guided-example-timeline-mark"
                      aria-hidden="true"
                    >
                      {item.confirmed ? (
                        <Check size={16} weight="bold" />
                      ) : null}
                    </span>
                    <div>
                      <h4>{item.title}</h4>
                      <p>{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="guided-example-detail">
                Ce résultat illustre le suivi. Aucun document n’a été transmis.
              </p>
            </div>
          )}
        </div>

        <div className="guided-example-next">
          <a
            className="text-link"
            href="#installation"
            onClick={(event) => scrollToSection(event, "installation")}
          >
            Préparer mon premier envoi
            <ArrowRight size={17} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
