"use client";

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect, useState } from "react";

export type PortalToastVariant = "success" | "danger" | "warning" | "info";

type PortalToastProps = {
  message: string;
  variant?: PortalToastVariant;
  onDismiss?: () => void;
  durationMs?: number;
};

/** A shared, short-lived portal notification for player and staff actions. */
export function PortalToast({
  message,
  variant = "success",
  onDismiss,
  durationMs,
}: PortalToastProps) {
  const [visible, setVisible] = useState(true);
  const timeout = durationMs ?? (variant === "danger" ? 5_000 : 4_000);

  useEffect(() => {
    setVisible(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, timeout);
    return () => window.clearTimeout(timer);
  }, [message, timeout]);

  if (!visible) return null;
  const Icon =
    variant === "success"
      ? CheckCircle2
      : variant === "info"
        ? Info
        : AlertTriangle;
  const liveRole = variant === "danger" ? "alert" : "status";

  return (
    <aside
      className={`portal-toast is-${variant}`}
      role={liveRole}
      aria-live={variant === "danger" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <Icon aria-hidden="true" />
      <span>{message}</span>
      <button
        type="button"
        onClick={() => {
          setVisible(false);
          onDismiss?.();
        }}
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
