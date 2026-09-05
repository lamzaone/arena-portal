"use client";

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import styles from "./success-toast.module.css";

export type PortalToastVariant = "success" | "danger" | "warning" | "info";

export type PortalToastProps = {
  message: string;
  variant?: PortalToastVariant;
  onDismiss?: () => void;
  durationMs?: number;
};

/** A shared, short-lived portal notification for player and staff actions. */
export function PortalToast(props: PortalToastProps) {
  // A replacement message owns a fresh lifetime. Reusing an active timer's
  // remaining time can dismiss a new notification before it can be read.
  return <ToastContent key={JSON.stringify([props.message, props.variant, props.durationMs])} {...props} />;
}

function ToastContent({
  message,
  variant = "success",
  onDismiss,
  durationMs,
}: PortalToastProps) {
  const timeout = durationMs ?? (variant === "danger" ? 5_000 : 4_000);
  const [phase, setPhase] = useState<"entering" | "visible" | "exiting" | "hidden">("entering");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const phaseRef = useRef(phase);
  const onDismissRef = useRef(onDismiss);
  const remainingRef = useRef(Math.max(0, timeout));
  const startedAtRef = useRef(0);
  const dismissedRef = useRef(false);
  const paused = hovered || focused;

  phaseRef.current = phase;
  onDismissRef.current = onDismiss;

  const beginDismiss = useCallback(() => {
    if (phaseRef.current === "exiting" || phaseRef.current === "hidden") return;
    setPhase("exiting");
  }, []);

  const finishDismiss = useCallback(() => {
    if (phaseRef.current !== "exiting") return;
    phaseRef.current = "hidden";
    setPhase("hidden");
    if (!dismissedRef.current) {
      dismissedRef.current = true;
      onDismissRef.current?.();
    }
  }, []);

  useEffect(() => {
    dismissedRef.current = false;
    remainingRef.current = Math.max(0, timeout);
    setHovered(false);
    setFocused(false);
    setPhase("entering");
    const frame = window.requestAnimationFrame(() => setPhase("visible"));
    return () => window.cancelAnimationFrame(frame);
  }, [message, timeout]);

  useEffect(() => {
    if (phase !== "visible" || paused) return;

    startedAtRef.current = performance.now();
    const timer = window.setTimeout(beginDismiss, remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      const elapsed = performance.now() - startedAtRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    };
  }, [beginDismiss, paused, phase]);

  useEffect(() => {
    if (phase !== "exiting") return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = window.requestAnimationFrame(finishDismiss);
      return () => window.cancelAnimationFrame(frame);
    }

    const timer = window.setTimeout(finishDismiss, 240);
    return () => window.clearTimeout(timer);
  }, [finishDismiss, phase]);

  if (phase === "hidden") return null;
  const Icon =
    variant === "success"
      ? CheckCircle2
      : variant === "info"
        ? Info
        : AlertTriangle;
  const liveRole = variant === "danger" ? "alert" : "status";
  const variantClass =
    variant === "danger"
      ? styles.danger
      : variant === "warning"
        ? styles.warning
        : variant === "info"
          ? styles.info
          : "";

  return (
    <aside
      data-ui="toast"
      data-state={phase}
      data-paused={paused ? "true" : undefined}
      className={`portal-toast is-${variant} ${styles.toast} ${variantClass}`.trim()}
      role={liveRole}
      aria-live={variant === "danger" ? "assertive" : "polite"}
      aria-atomic="true"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onAnimationEnd={(event) => {
        if (event.currentTarget === event.target && phase === "exiting") {
          finishDismiss();
        }
      }}
    >
      <Icon className={styles.icon} aria-hidden="true" />
      <span className={styles.message}>{message}</span>
      <button
        className={styles.dismiss}
        type="button"
        onClick={beginDismiss}
        aria-label="Dismiss notification"
      >
        <X aria-hidden="true" />
      </button>
    </aside>
  );
}

/** Compatibility wrapper for the original success-only call sites. */
export function SuccessToast(
  props: Omit<PortalToastProps, "variant">,
) {
  return <PortalToast {...props} variant="success" />;
}
