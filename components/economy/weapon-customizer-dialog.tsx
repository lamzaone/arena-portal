"use client";

import { Expand, Sword, X } from "lucide-react";
import { type ComponentProps, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WeaponCustomizer } from "./weapon-customizer";
import styles from "./weapon-customizer-dialog.module.css";

type Props = ComponentProps<typeof WeaponCustomizer> & { triggerDisabled?: boolean };

export function WeaponCustomizerDialog({ triggerDisabled, ...props }: Props) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.documentElement.style.overflow = previousOverflow;
      triggerRef.current?.focus({ preventScroll: true });
    };
  }, [open]);

  return <>
    <button
      ref={triggerRef}
      type="button"
      className={`button button-secondary ${styles.trigger}`}
      aria-haspopup="dialog"
      disabled={triggerDisabled}
      onClick={() => { setHasOpened(true); setOpen(true); }}
    >
      <Sword aria-hidden="true" /> 3D inspection & attachments <Expand aria-hidden="true" />
    </button>
    {hasOpened ? createPortal(<dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!busy) setOpen(false); }}
      onClose={() => setOpen(false)}
    >
      <header className={styles.header}>
        <div><p>3D inspection & attachments</p><h2 id={titleId}>{props.item.displayName}</h2></div>
        <button type="button" className="button button-secondary" autoFocus disabled={busy} onClick={() => setOpen(false)} aria-label="Close 3D inspection">
          <X aria-hidden="true" /> Close
        </button>
      </header>
      {/* Keep the editor mounted after closing so attachment drafts survive reopening. */}
      <WeaponCustomizer {...props} expanded onBusyChange={(value) => { setBusy(value); props.onBusyChange?.(value); }} />
    </dialog>, document.body) : null}
  </>;
}
