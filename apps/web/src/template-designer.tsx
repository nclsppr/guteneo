import { msg } from "./messages";
import { getLocale, useLocale } from "./locale";
import luxembourgishLabels from "./locales/pdfme-lb.json";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Image as ImageIcon } from "@phosphor-icons/react";
import { Designer } from "@pdfme/ui";
import type { Template } from "@pdfme/common";
import {
  templatePlugins,
  templateFonts,
} from "../../../packages/templates/pdfme";
import {
  TemplateError,
  type TemplateEnvelope,
} from "../../../packages/contracts/src/templates";
import { ErrorNotice } from "./components";
import { addDesignerImage } from "../../../packages/templates/designer-images";

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

function fieldValue(block: Record<string, unknown>, key: string) {
  if (key === "editable")
    return { known: true, value: block.readOnly !== true };
  if (key === "required")
    return { known: true, value: block.required === true };
  let value: unknown = block;
  for (const part of key.split("_"))
    value =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)[part]
        : undefined;
  return {
    known:
      value === undefined
        ? ["rotate", "opacity"].includes(key)
        : ["string", "number", "boolean"].includes(typeof value),
    value,
  };
}

export default function TemplateDesigner({
  definition,
  onChange,
  onPendingChange,
}: {
  definition: TemplateEnvelope["definition"];
  onChange: (definition: TemplateEnvelope["definition"]) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const locale = useLocale();
  const imageId = useId();
  const imageInput = useRef<HTMLInputElement>(null);
  const imageSelection = useRef<
    { name: string; pageIndex: number } | undefined
  >(undefined);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageNotice, setImageNotice] = useState("");
  const [nativePending, setNativePending] = useState(false);
  const pendingCallback = useRef(onPendingChange);
  pendingCallback.current = onPendingChange;
  const pendingFields = useRef(
    new Map<
      HTMLInputElement | HTMLTextAreaElement,
      { name: string; key: string }
    >(),
  );
  const [desktop, setDesktop] = useState(
    () => window.matchMedia("(min-width: 768px)").matches,
  );
  const currentDefinition = useRef(definition);
  currentDefinition.current = definition;
  const container = useRef<HTMLDivElement>(null);
  const designer = useRef<Designer | null>(null);
  const last = useRef("");
  const updating = useRef(false);
  const interacted = useRef(false);
  const changed = useRef(onChange);
  changed.current = onChange;
  const [error, setError] = useState<Error>();
  const checkPending = useCallback((accepted = currentDefinition.current) => {
    const blocks = [
      ...accepted.schemas.flat(),
      ...(accepted.basePdf.staticSchema ?? []),
    ];
    for (const [input, field] of pendingFields.current) {
      const block = blocks.find(
        (item) =>
          item.name === field.name ||
          (field.key === "name" && item.name === input.value),
      );
      if (!input.isConnected || !block) {
        pendingFields.current.delete(input);
        continue;
      }
      const expected = fieldValue(block, field.key).value;
      const actual =
        input instanceof HTMLInputElement && input.type === "checkbox"
          ? input.checked
          : typeof expected === "number"
            ? input.value.trim()
              ? Number(input.value)
              : Number.NaN
            : input.value;
      if (actual === expected || (expected === undefined && actual === ""))
        pendingFields.current.delete(input);
    }
    const pending = pendingFields.current.size > 0;
    setNativePending(pending);
    pendingCallback.current?.(pending);
  }, []);
  function trackNativeInput(target: EventTarget) {
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) ||
      !target.id ||
      (target instanceof HTMLInputElement && target.type === "search")
    )
      return;
    const schema = designer.current?.getSelectedSchemas()[0]?.schema;
    if (!schema || !fieldValue(schema, target.id).known) return;
    pendingFields.current.set(target, { name: schema.name, key: target.id });
    checkPending();
  }
  async function importImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const pageIndex = designer.current?.getPageCursor() ?? 0;
    setImageLoading(true);
    pendingCallback.current?.(true);
    setImageNotice("");
    setError(undefined);
    try {
      if (file.size > 250 * 1024)
        throw new Error(msg("The image exceeds 250 KB."));
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error(msg("The file could not be read.")));
        reader.readAsDataURL(file);
      });
      const next = addDesignerImage(
        currentDefinition.current,
        content,
        pageIndex,
      );
      changed.current(next.definition);
      imageSelection.current = { name: next.name, pageIndex: next.pageIndex };
      interacted.current = true;
      setImageNotice(
        msg(
          "{0} added to page {1}. Move or resize it directly in the editor, then save your draft.",
          file.name,
          next.pageIndex + 1,
        ),
      );
    } catch (failure) {
      setError(
        new Error(
          msg(
            failure instanceof TemplateError &&
              failure.code === "TEMPLATE_IMAGE_INVALID"
              ? "Choose a valid PNG or JPEG image."
              : failure instanceof Error
                ? failure.message
                : "The image could not be added.",
          ),
        ),
      );
    } finally {
      setImageLoading(false);
      checkPending();
    }
  }
  useEffect(() => {
    const viewport = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(viewport.matches);
    viewport.addEventListener("change", update);
    return () => viewport.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!container.current || !desktop) return;
    const trackedFields = pendingFields.current;
    try {
      interacted.current = false;
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
        // Native renderers measure their layout on mount (notably table height).
        // Those notifications are not author edits and must not dirty a saved draft.
        if (updating.current || !interacted.current) return;
        const serializable = JSON.parse(
          JSON.stringify(next),
        ) as TemplateEnvelope["definition"];
        try {
          changed.current(serializable);
          last.current = JSON.stringify(serializable);
          // pdfme debounces property-panel edits. Keep saving unavailable until
          // its committed model matches the actual authoring inputs, including
          // corrections back to the original value and invalid numeric fields.
          checkPending(serializable);
          setError(undefined);
        } catch (failure) {
          // Keep the accepted business envelope and restore its graphical state.
          updating.current = true;
          try {
            instance.updateTemplate(JSON.parse(last.current) as Template);
          } finally {
            updating.current = false;
          }
          pendingFields.current.clear();
          checkPending();
          setError(
            failure instanceof Error
              ? failure
              : new Error(msg("The template change is ambiguous.")),
          );
        }
      });
      return () => {
        designer.current = null;
        trackedFields.clear();
        pendingCallback.current?.(false);
        instance.destroy();
      };
    } catch (e) {
      setError(e instanceof Error ? e : new Error(msg("Editor unavailable.")));
    }
    // Language changes update the instance without losing selection or undo history.
  }, [desktop, checkPending]);
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
    if (designer.current && imageSelection.current) {
      const selection = imageSelection.current;
      if (
        !definition.schemas[selection.pageIndex]?.some(
          (block) => block.name === selection.name,
        )
      ) {
        imageSelection.current = undefined;
        return;
      }
      let frame = 0;
      const deadline = performance.now() + 3_000;
      const selectWhenReady = () => {
        const instance = designer.current;
        if (!instance || imageSelection.current !== selection) return;
        if (performance.now() > deadline) {
          imageSelection.current = undefined;
          return;
        }
        if (
          instance
            .getSelectedSchemas()
            .some(
              (item) =>
                item.pageIndex === selection.pageIndex &&
                item.name === selection.name,
            )
        ) {
          imageSelection.current = undefined;
          return;
        }
        instance.selectSchemas(selection, {
          pageIndex: selection.pageIndex,
          scroll: true,
        });
        // Safari may commit pdfme's React tree after the first frame. Wait for
        // its public selection model to acknowledge the new block.
        frame = requestAnimationFrame(selectWhenReady);
      };
      frame = requestAnimationFrame(selectWhenReady);
      return () => cancelAnimationFrame(frame);
    }
  }, [definition, desktop]);
  return (
    <>
      <ErrorNotice error={error} />
      <div className="studio-image-toolbar" aria-busy={imageLoading}>
        <button
          type="button"
          className="button"
          disabled={imageLoading || nativePending}
          onClick={() => imageInput.current?.click()}
          aria-describedby={`${imageId}-hint`}
        >
          <ImageIcon size={19} aria-hidden="true" />
          {imageLoading ? msg("Adding image…") : msg("Add an image")}
        </button>
        <input
          ref={imageInput}
          type="file"
          accept="image/png,image/jpeg"
          hidden
          aria-label={msg("Choose an image for the template")}
          onChange={(event) => void importImage(event)}
        />
        <p id={`${imageId}-hint`} className="field-hint">
          {msg(
            "Logo, photo or illustration. PNG or JPEG, up to 250 KB and 4 megapixels. The image is embedded in this template.",
          )}
        </p>
      </div>
      {imageNotice ? (
        <p className="studio-image-notice" role="status">
          {imageNotice}
        </p>
      ) : null}
      <p className="studio-mobile-help notice info">
        {msg(
          "Visual editing requires a desktop screen. On mobile, you can view the template, enter data and check PDFs. ",
        )}
      </p>
      <div
        className="studio-designer"
        ref={container}
        aria-label={msg("Visual template editor")}
        onPointerDownCapture={() => {
          interacted.current = true;
          imageSelection.current = undefined;
        }}
        onKeyDownCapture={() => {
          interacted.current = true;
          imageSelection.current = undefined;
        }}
        onClickCapture={() => {
          interacted.current = true;
        }}
        onInputCapture={(event) => {
          interacted.current = true;
          trackNativeInput(event.target);
        }}
        onBlurCapture={() => queueMicrotask(() => checkPending())}
      />
    </>
  );
}
