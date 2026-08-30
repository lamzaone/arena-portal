"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";

import styles from "@/components/copy-to-clipboard-button.module.css";

type CopyState = "idle" | "copied" | "failed";

type CopyToClipboardButtonProps = {
  value: string;
  label?: string;
  className?: string;
};

async function writeToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through for browsers that expose the API but deny the request.
    }
  }

  const textarea = document.createElement("textarea");
  const focusedElement = document.activeElement;
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
    if (focusedElement instanceof HTMLElement) focusedElement.focus();
  }
  if (!copied) throw new Error("Clipboard copy was rejected.");
}

export function CopyToClipboardButton({
  value,
  label = "Copy to clipboard",
  className = "",
}: CopyToClipboardButtonProps) {
  const [state, setState] = useState<CopyState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  async function handleCopy(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (resetTimer.current) clearTimeout(resetTimer.current);

    try {
      await writeToClipboard(value);
      setState("copied");
    } catch {
      setState("failed");
    }

    resetTimer.current = setTimeout(() => setState("idle"), 1_600);
  }

  const statusLabel = state === "copied" ? "Copied" : state === "failed" ? "Retry" : "Copy";
  const accessibleLabel = state === "copied" ? `${label}: copied` : state === "failed" ? `${label}: copy failed, retry` : label;

  return (
    <button
      type="button"
      className={`${styles.button} ${className}`.trim()}
      data-copy-state={state}
      onClick={handleCopy}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      {state === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span className={styles.label} aria-live="polite">{statusLabel}</span>
    </button>
  );
}
