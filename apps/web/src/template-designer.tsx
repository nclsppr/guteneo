import { msg } from "./messages";
import { getLocale, useLocale } from "./locale";
import luxembourgishLabels from "./locales/pdfme-lb.json";
import { useEffect, useRef, useState } from "react";
import { Designer } from "@pdfme/ui";
import type { Template } from "@pdfme/common";
import {
  templatePlugins,
  templateFonts,
} from "../../../packages/templates/pdfme";
import type { TemplateEnvelope } from "../../../packages/contracts/src/templates";
import { ErrorNotice } from "./components";

// pdfme 6.1.13 clips its measured size to the visible viewport. In a scrolling
// atelier that collapses the canvas below the toolbar. Its protected render
// extension keeps the actual container dimensions and retains the stock editor.
class EmbeddedDesigner extends Designer {
  protected override render() {
    if (this.domContainer)
      this.size = {
        width: this.domContainer.clientWidth,
        height: this.domContainer.clientHeight,
      };
    super.render();
  }
}

export default function TemplateDesigner({
  definition,
  onChange,
}: {
  definition: TemplateEnvelope["definition"];
  onChange: (definition: TemplateEnvelope["definition"]) => void;
}) {
  const locale = useLocale();
  const [desktop, setDesktop] = useState(
    () => window.matchMedia("(min-width: 768px)").matches,
  );
  const currentDefinition = useRef(definition);
  currentDefinition.current = definition;
  const container = useRef<HTMLDivElement>(null);
  const designer = useRef<Designer | null>(null);
  const last = useRef("");
  const updating = useRef(false);
  const changed = useRef(onChange);
  changed.current = onChange;
  const [error, setError] = useState<Error>();
  useEffect(() => {
    const viewport = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(viewport.matches);
    viewport.addEventListener("change", update);
    return () => viewport.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!container.current || !desktop) return;
    try {
      const instance = new EmbeddedDesigner({
        domContainer: container.current,
        template: structuredClone(currentDefinition.current) as Template,
        plugins: templatePlugins,
        options: {
          lang:
            getLocale() === "lb" ? "de" : (getLocale() as "fr" | "en" | "de"),
          labels: getLocale() === "lb" ? luxembourgishLabels : {},
          font: templateFonts,
          theme: { token: { colorPrimary: "#2450db", borderRadius: 3 } },
        },
      });
      designer.current = instance;
      last.current = JSON.stringify(currentDefinition.current);
      instance.onChangeTemplate((next) => {
        if (updating.current) return;
        const serializable = JSON.parse(
          JSON.stringify(next),
        ) as TemplateEnvelope["definition"];
        try {
          changed.current(serializable);
          last.current = JSON.stringify(serializable);
          setError(undefined);
        } catch (failure) {
          // Keep the accepted business envelope and restore its graphical state.
          updating.current = true;
          try {
            instance.updateTemplate(JSON.parse(last.current) as Template);
          } finally {
            updating.current = false;
          }
          setError(
            failure instanceof Error
              ? failure
              : new Error(msg("Modification ambiguë du modèle.")),
          );
        }
      });
      return () => {
        designer.current = null;
        instance.destroy();
      };
    } catch (e) {
      setError(
        e instanceof Error ? e : new Error(msg("Éditeur indisponible.")),
      );
    }
    // Language changes update the instance without losing selection or undo history.
  }, [desktop]);
  useEffect(() => {
    designer.current?.updateOptions({
      lang: locale === "lb" ? "de" : locale,
      labels: locale === "lb" ? luxembourgishLabels : {},
    });
  }, [locale, desktop]);
  useEffect(() => {
    const serialized = JSON.stringify(definition);
    if (designer.current && serialized !== last.current) {
      last.current = serialized;
      updating.current = true;
      try {
        designer.current.updateTemplate(
          structuredClone(definition) as Template,
        );
      } finally {
        updating.current = false;
      }
    }
  }, [definition]);
  return (
    <>
      <ErrorNotice error={error} />
      <p className="studio-mobile-help notice info">
        {msg(
          "L’édition graphique demande un écran de bureau. Vous pouvez consulter le modèle, remplir ses données et vérifier les PDF sur mobile. ",
        )}
      </p>
      <div
        className="studio-designer"
        ref={container}
        aria-label={msg("Éditeur visuel du modèle")}
      />
    </>
  );
}
