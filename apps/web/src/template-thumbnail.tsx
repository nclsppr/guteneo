import { useEffect, useRef, useState } from "react";
import { FileText } from "@phosphor-icons/react";
import type { TemplateView } from "../../../packages/contracts/src/template-workflow";

// Only one decorative render runs at a time, including across library visits.
// The queue retains no result and skipped jobs never import the renderer.
let queue = Promise.resolve();
function enqueue(task: () => Promise<void>) {
  queue = queue.then(task, task).catch(() => undefined);
}

function idle() {
  return new Promise<void>((resolve) => {
    if ("requestIdleCallback" in window)
      window.requestIdleCallback(() => resolve(), { timeout: 1000 });
    else setTimeout(resolve, 0);
  });
}

/** A disposable local sample, never a stored PDF or a verified generation. */
export function TemplateThumbnail({ model }: { model: TemplateView }) {
  const frame = useRef<HTMLSpanElement>(null);
  const { id, revision, envelope } = model;
  const scope = `${id}:${revision}`;
  const [image, setImage] = useState<{ scope: string; url: string }>();
  useEffect(() => {
    const element = frame.current;
    if (!element || !("IntersectionObserver" in window)) return;
    let closed = false;
    let visible = false;
    let running = false;
    let finished = false;
    let address: string | undefined;
    const start = () => {
      if (closed || !visible || running || finished) return;
      running = true;
      enqueue(async () => {
        try {
          if (closed || !visible) return;
          await idle();
          if (closed || !visible) return;
          const { renderTemplateThumbnail } =
            await import("./template-thumbnail-render");
          if (closed || !visible) return;
          const blob = await renderTemplateThumbnail(envelope, () => !closed);
          finished = true;
          if (closed || !blob) return;
          address = URL.createObjectURL(blob);
          setImage({ scope, url: address });
        } catch {
          // Decoration must never interrupt the library or retry a bad model.
          finished = true;
        } finally {
          running = false;
          if (!closed && visible && !finished) start();
        }
      });
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      start();
    });
    observer.observe(element);
    return () => {
      closed = true;
      observer.disconnect();
      if (address) URL.revokeObjectURL(address);
    };
  }, [id, revision, envelope, scope]);
  return (
    <span className="studio-template-thumbnail" ref={frame} aria-hidden="true">
      <FileText size={24} weight="light" />
      {image?.scope === scope && <img src={image.url} alt="" />}
    </span>
  );
}
