"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import styles from "./portal-dialog.module.css";

export type PortalDialogTone = "default" | "danger";

export type PortalDialogProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  confirmDisabled?: boolean;
  tone?: PortalDialogTone;
  onConfirm: () => void;
  onDismiss: () => void;
  onExited?: () => void;
};

type DialogPhase = "open" | "closing" | "closed";

/** A controlled native dialog with an animated, focus-safe lifecycle. */
export function PortalDialog({
  open,
  title,
  description,
  children,
  confirmLabel = "Confirm action",
  cancelLabel = "Cancel",
  confirmDisabled = false,
  tone = "default",
  onConfirm,
  onDismiss,
  onExited,
}: PortalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const backdropPressRef = useRef(false);
  const openRef = useRef(open);
  const exitedRef = useRef(onExited);
  const dismissRef = useRef(onDismiss);
  const [rendered, setRendered] = useState(open);
  const [phase, setPhase] = useState<DialogPhase>(open ? "open" : "closed");
  const titleId = useId();
  const descriptionId = useId();

  openRef.current = open;
  exitedRef.current = onExited;
  dismissRef.current = onDismiss;

  const finishClose = useCallback(() => {
    if (openRef.current) return;

    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();

    setPhase("closed");
    setRendered(false);

    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected && !opener.hasAttribute("disabled")) {
      opener.focus({ preventScroll: true });
    }
    exitedRef.current?.();
  }, []);

  useEffect(() => {
    if (open) {
      setRendered(true);
      setPhase("open");
    } else if (rendered) {
      setPhase("closing");
    }
  }, [open, rendered]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!rendered || !open || !dialog || dialog.open) return;

    const activeElement = document.activeElement;
    openerRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    dialog.showModal();
  }, [open, rendered]);

  useEffect(() => {
    if (phase !== "closing") return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = window.requestAnimationFrame(finishClose);
      return () => window.cancelAnimationFrame(frame);
    }

    const timer = window.setTimeout(finishClose, 240);
    return () => window.clearTimeout(timer);
  }, [finishClose, phase]);

  if (!rendered) return null;

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      data-ui="portal-dialog"
      data-state={phase}
      data-tone={tone}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onAnimationEnd={(event) => {
        if (event.currentTarget === event.target && phase === "closing") {
          finishClose();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (phase === "open") dismissRef.current();
      }}
      onPointerDown={(event) => {
        backdropPressRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        const startedOnBackdrop = backdropPressRef.current;
        backdropPressRef.current = false;
        if (
          phase === "open" &&
          startedOnBackdrop &&
          event.target === event.currentTarget
        ) {
          dismissRef.current();
        }
      }}
    >
      <div className={styles.surface}>
        <div className={styles.accent} aria-hidden="true" />
        <div className={styles.body}>
          <p className={styles.eyebrow}>Review required</p>
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
          {children ? <div className={styles.content}>{children}</div> : null}
        </div>
        <div className={styles.actions}>
          <button
            className={styles.cancel}
            type="button"
            autoFocus
            disabled={phase !== "open"}
            onClick={() => dismissRef.current()}
          >
            {cancelLabel}
          </button>
          <button
            className={styles.confirm}
            type="button"
            disabled={confirmDisabled || phase !== "open"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
