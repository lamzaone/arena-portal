"use client";

import {
  type ButtonHTMLAttributes,
  type MouseEvent,
  useRef,
  useState,
} from "react";

import { PortalDialog } from "./portal-dialog";

export type ConfirmSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  confirmation: string;
};

type PendingDecision = "cancel" | "submit" | null;

/** A submit button that confirms without losing native submitter semantics. */
export function ConfirmSubmitButton({
  confirmation,
  onClick,
  children,
  ...props
}: ConfirmSubmitButtonProps) {
  const submitterRef = useRef<HTMLButtonElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const pendingRef = useRef(false);
  const decisionRef = useRef<PendingDecision>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMessage, setDialogMessage] = useState(confirmation);

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (pendingRef.current) {
      event.preventDefault();
      return;
    }

    onClick?.(event);
    if (event.defaultPrevented) return;

    const submitter = event.currentTarget;
    const form = submitter.form;
    if (!form) return;

    event.preventDefault();

    const shouldValidate = !submitter.formNoValidate && !form.noValidate;
    if (shouldValidate && !form.reportValidity()) return;

    pendingRef.current = true;
    decisionRef.current = null;
    submitterRef.current = submitter;
    formRef.current = form;
    setDialogMessage(confirmation);
    setDialogOpen(true);
  }

  function dismissDialog() {
    if (!pendingRef.current || decisionRef.current) return;
    decisionRef.current = "cancel";
    setDialogOpen(false);
  }

  function confirmSubmission() {
    if (!pendingRef.current || decisionRef.current) return;
    decisionRef.current = "submit";
    setDialogOpen(false);
  }

  function handleDialogExited() {
    const decision = decisionRef.current;
    const submitter = submitterRef.current;
    const form = formRef.current;

    decisionRef.current = null;
    submitterRef.current = null;
    formRef.current = null;
    pendingRef.current = false;

    if (
      decision === "submit" &&
      submitter?.isConnected &&
      form?.isConnected &&
      submitter.form === form
    ) {
      form.requestSubmit(submitter);
    }
  }

  return (
    <>
      <button {...props} type="submit" onClick={handleClick}>
        {children}
      </button>
      <PortalDialog
        open={dialogOpen}
        title="Confirm action"
        description={dialogMessage}
        confirmLabel={children ?? "Confirm action"}
        tone="danger"
        onConfirm={confirmSubmission}
        onDismiss={dismissDialog}
        onExited={handleDialogExited}
      />
    </>
  );
}
