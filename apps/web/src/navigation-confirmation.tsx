import { useEffect, useId, useRef, useState } from "react";
import { sessionAuthorityKey, subscribeSessionAuthority } from "./api";
import {
  BEFORE_WORKSPACE_NAVIGATION,
  clientNavigationRevision,
  deferWorkspaceSwitch,
  routeNavigationIntent,
  subscribeClientNavigation,
} from "./client-navigation";
import { createNavigationConfirmationController } from "./navigation-confirmation-state";
import { msg } from "./messages";
import { t } from "./locale";
import "./navigation-confirmation.css";

/** Return the dialog alongside the editor; keep its synchronous route veto. */
export function useUnsavedNavigation({
  dirty,
  scope,
  question,
  completed = () => false,
}: {
  dirty: boolean;
  scope: string;
  question: string;
  completed?: () => boolean;
}) {
  const latest = useRef({ dirty, scope, completed });
  latest.current = { dirty, scope, completed };
  const [, changed] = useState(0);
  const mounted = useRef(false);
  const [controller] = useState(() =>
    createNavigationConfirmationController({
      snapshot: () => ({
        authority: sessionAuthorityKey(),
        revision: clientNavigationRevision(),
        href: window.location.href,
        scope: latest.current.scope,
      }),
      navigate: (href) => {
        window.location.hash = new URL(href).hash;
      },
      changed: () => {
        if (mounted.current) changed((value) => value + 1);
      },
    }),
  );
  useEffect(() => {
    mounted.current = true;
    const protectedView = () =>
      latest.current.dirty && !latest.current.completed();
    const guard = (event: Event) => {
      if (!protectedView()) return;
      if (
        deferWorkspaceSwitch(event, () =>
          !mounted.current
            ? Promise.resolve(false)
            : protectedView()
              ? controller.workspace()
              : Promise.resolve(true),
        )
      )
        return;
      const intent = routeNavigationIntent(event);
      if (!intent || !controller.route(intent)) event.preventDefault();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (!protectedView()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const unsubscribeNavigation = subscribeClientNavigation(() =>
      controller.cancel(),
    );
    const unsubscribeAuthority = subscribeSessionAuthority(() =>
      controller.cancel(),
    );
    window.addEventListener(BEFORE_WORKSPACE_NAVIGATION, guard);
    window.addEventListener("beforeunload", unload);
    return () => {
      mounted.current = false;
      controller.cancel(false);
      unsubscribeNavigation();
      unsubscribeAuthority();
      window.removeEventListener(BEFORE_WORKSPACE_NAVIGATION, guard);
      window.removeEventListener("beforeunload", unload);
    };
  }, [controller]);
  useEffect(() => {
    controller.cancel();
  }, [controller, scope]);
  useEffect(() => {
    if (!dirty) controller.cancel();
  }, [controller, dirty]);
  return (
    <UnsavedNavigationDialog
      open={Boolean(controller.pending)}
      question={question}
      onCancel={() => controller.cancel()}
      onConfirm={() => controller.confirm()}
    />
  );
}

function UnsavedNavigationDialog({
  open,
  question,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  question: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const restore = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      restore.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (!dialog.current?.open) dialog.current?.showModal();
      keep.current?.focus();
    } else if (dialog.current?.open) {
      dialog.current.close();
      const target =
        restore.current?.isConnected && restore.current.getClientRects().length
          ? restore.current
          : document.getElementById("main-content");
      target?.focus({ preventScroll: true });
    }
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="navigation-confirmation"
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={() => {
        if (open) onCancel();
      }}
    >
      <h2 id={title}>{question}</h2>
      <div className="actions">
        <button ref={keep} type="button" className="button" onClick={onCancel}>
          {t.cancel}
        </button>
        <button type="button" className="button danger" onClick={onConfirm}>
          {msg("Discard")}
        </button>
      </div>
    </dialog>
  );
}
