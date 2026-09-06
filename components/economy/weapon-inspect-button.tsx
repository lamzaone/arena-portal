"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Box, Hand, LoaderCircle, X } from "lucide-react";
import { SkinViewer, type ViewerView } from "@skinhub/viewer";
import { weaponInspectLink, weaponPreviewItem, type WeaponPreviewSource } from "@/lib/economy/weapon-preview";
import styles from "./weapon-inspect-button.module.css";

type Props = { item: WeaponPreviewSource & { displayName: string }; samplePattern?: boolean };

/** The heavy renderer is mounted only after an explicit inspection request. */
export function WeaponInspectButton({ item, samplePattern = false }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ViewerView>("gun");
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const preview = weaponPreviewItem(item);
  const inspectLink = preview ? weaponInspectLink(preview) : null;

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => {
      element.close();
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!preview) return null;
  return <>
    <button ref={trigger} type="button" className="button button-secondary" aria-haspopup="dialog"
      onClick={() => { setView("gun"); setFailed(false); setOpen(true); }}>
      <Box size={15} /> Inspect in 3D
    </button>
    {open && <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); setOpen(false); }}>
      <header className={styles.header}>
        <h3 id={titleId}>{item.displayName}</h3>
        <button type="button" autoFocus aria-label="Close 3D inspection" onClick={() => setOpen(false)}><X size={18} /></button>
      </header>
      <div className={styles.views} role="group" aria-label="Inspection view">
        <button type="button" aria-pressed={view === "gun"} onClick={() => setView("gun")}><Box size={15} /> 3D</button>
        <button type="button" aria-pressed={view === "hands"} onClick={() => setView("hands")}><Hand size={15} /> In hands</button>
      </div>
      <div className={styles.stage}>
        <div className={styles.frame}>
        <SkinViewer key={reload} item={preview} view={view} title={`${item.displayName}, float ${preview.float}, pattern ${preview.seed}`}
          style={{ width: "100%", height: "100%" }}
          settings={{ camera: { defaultZoom: 1 }, quality: { renderScale: 1, bloom: 0, shadows: false }, environment: { background: "transparent", map: "Warehouse" } }}
          interactions={{ orbit: true, zoom: true, dragStickers: false, dragCharm: false }}
          onError={() => setFailed(true)}
          loading={<div className={styles.loading}><LoaderCircle size={18} /> Loading 3D inspection…</div>}
          fallback={<div className={styles.loading}>3D inspection is unavailable.</div>} />
        </div>
      </div>
      <footer className={styles.details}>
        <span>Float <b>{preview.float}</b></span>
        <span>{samplePattern ? "Sample pattern" : "Pattern"} <b>{preview.seed}</b></span>
        <span>StatTrak <b>{preview.statTrak === false ? "Off" : preview.statTrak}</b></span>
        {inspectLink && <a href={inspectLink}>Inspect in CS2</a>}
        {failed && <button type="button" onClick={() => { setFailed(false); setReload((value) => value + 1); }}>Retry 3D</button>}
      </footer>
      {samplePattern && <p className={styles.note}>Purchases receive a rolled pattern. This preview uses pattern 0.</p>}
    </dialog>}
  </>;
}
