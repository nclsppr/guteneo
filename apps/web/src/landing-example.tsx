import { formatLocale } from "./locale";
import { msg, msgIn } from "./messages";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Check, FilePdf } from "@phosphor-icons/react";
import "./landing-example.css";

type ExampleStep = "request" | "review" | "tracking";
type ExampleChannel = "fax" | "email" | "postal";

export function GuidedExample() {
  const steps: { id: ExampleStep; label: string; description: string }[] = [
    {
      id: "request",
      label: msg("Request"),
      description: msg("Compose in your assistant."),
    },
    {
      id: "review",
      label: msg("Review"),
      description: msg("Review the details in Guteneo."),
    },
    {
      id: "tracking",
      label: msg("Tracking"),
      description: msg("See the result of each step."),
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
      label: msg("Fax"),
      request: msg("Prepare to fax Correspondence.pdf to Example Company."),
      recipient: msg("Example Company"),
      recipientDetail: msg("Fictional recipient and fax number"),
      costLabel: msg("Example spending limit"),
      amountMinor: 20,
      tracking: [
        {
          title: msg("Accepted for processing"),
          detail: msg("The provider accepted the fax request."),
          confirmed: true,
        },
        {
          title: msg("Transmission complete"),
          detail: msg(
            "The 2 pages were transmitted to the recipient’s fax machine.",
          ),
          confirmed: true,
        },
        {
          title: msg("Technical receipt confirmed"),
          detail: msg(
            "This receipt does not prove that the document was read.",
          ),
          confirmed: true,
        },
      ],
    },
    email: {
      label: msg("Email"),
      request: msg(
        "Prepare an email to Example Company with Correspondence.pdf attached.",
      ),
      recipient: "bonjour@maison-exemple.test",
      recipientDetail: msg("Fictional address reserved for this example"),
      costLabel: msg("Example price"),
      amountMinor: 4,
      tracking: [
        {
          title: msg("Accepted for processing"),
          detail: msg("The provider accepted the message and its attachment."),
          confirmed: true,
        },
        {
          title: msg("Message delivered to server"),
          detail: msg("The recipient’s mail server accepted the email."),
          confirmed: true,
        },
        {
          title: msg("Reading not confirmed"),
          detail: msg("Technical delivery does not prove opening or reading."),
          confirmed: false,
        },
      ],
    },
    postal: {
      label: msgIn("mail-channel", "Post"),
      request: msg("Prepare to post Correspondence.pdf to Example Company."),
      recipient: msg("Example Company · Example City"),
      recipientDetail: msg("Fictional recipient and postal address"),
      costLabel: msg("Example price"),
      amountMinor: 320,
      tracking: [
        {
          title: msg("Accepted for processing"),
          detail: msg("The provider accepted the document for printing."),
          confirmed: true,
        },
        {
          title: msgIn("postal-timeline", "Handed to postal service"),
          detail: msg(
            "The letter was printed, placed in an envelope and handed to the postal network.",
          ),
          confirmed: true,
        },
        {
          title: msg("Delivery not confirmed"),
          detail: msg(
            "Handover to the postal service does not prove receipt by the recipient.",
          ),
          confirmed: false,
        },
      ],
    },
  };

  const exampleCurrency = new Intl.NumberFormat(formatLocale(), {
    style: "currency",
    currency: "EUR",
  });

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
          {msg("A fictional dispatch, step by step")}
        </h2>
        <p>
          {msg(
            "This demonstration follows 3 steps: compose your request, check the details in Guteneo to give your approval, then track the dispatch.",
          )}
        </p>
        <div
          className="guided-example-tabs"
          role="tablist"
          aria-label={msg("Demo steps")}
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
          {msg("Demo — no real dispatch")}
        </p>
        <div className="guided-example-channel-row">
          <span>{msg("Choose a channel")}</span>
          <div
            className="guided-example-channels"
            role="group"
            aria-label={msg("Demo channel")}
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
              <h3>{msg("It all starts with your words.")}</h3>
              <ol className="guided-example-conversation">
                <li>
                  <span>{msg("You")}</span>
                  <p>{example.request}</p>
                </li>
                <li>
                  <span>{msg("Guteneo")}</span>
                  <p>
                    {msg(
                      "The 2-page PDF is ready. Check the recipient, channel and ",
                    )}
                    {channel === "fax"
                      ? msg("the spending limit")
                      : msg("the price")}{" "}
                    {msg(" in Guteneo before giving your approval.")}
                  </p>
                </li>
              </ol>
              <p className="guided-example-detail">
                {msg("Fictional conversation, document and recipient.")}
              </p>
              <button
                type="button"
                className="button"
                onClick={() => selectStep("review")}
              >
                {msg("View the review step")}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          )}

          {step === "review" && (
            <div className="guided-example-review">
              <h3>{msg("The proof before dispatch.")}</h3>
              <p>
                {msg(
                  "Check the document, recipient, channel and amount before giving your approval.",
                )}
              </p>
              <dl className="guided-example-fields">
                <div>
                  <dt>{msg("Document")}</dt>
                  <dd className="guided-example-document">
                    <FilePdf size={27} weight="light" aria-hidden="true" />
                    <span>
                      {msg("Correspondence.pdf")}
                      <small>{msg("2 pages · fictional document")}</small>
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{msg("Recipient")}</dt>
                  <dd>
                    {example.recipient}
                    <small>{example.recipientDetail}</small>
                  </dd>
                </div>
                <div>
                  <dt>{msg("Channel")}</dt>
                  <dd>{example.label}</dd>
                </div>
                <div className="guided-example-cost">
                  <dt>{example.costLabel}</dt>
                  <dd>
                    <strong>
                      {exampleCurrency.format(example.amountMinor / 100)}
                    </strong>
                    <small>{msg("Fictional amount, not a real rate")}</small>
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                className="button primary"
                onClick={() => selectStep("tracking")}
              >
                {msg("Simulate approval")}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          )}

          {step === "tracking" && (
            <div className="guided-example-tracking">
              <h3>{msg("Every step leaves a trace.")}</h3>
              <p className="guided-example-tracking-caption">
                {msg("Fictional tracking · ")}
                {example.label} {msg(" · Correspondence.pdf")}
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
                {msg(
                  "This result illustrates tracking. No document was transmitted.",
                )}
              </p>
            </div>
          )}
        </div>

        <div className="guided-example-next">
          <a className="text-link" href="/getting-started/">
            {msg("Prepare my first dispatch")}
            <ArrowRight size={17} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
