"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { IdentityGroupIcon } from "./identity-group-icon";
import { IDENTITY_GROUP_BADGE_ICON_OPTIONS, isCustomGroupBadgeIconKey } from "@/lib/content/identity-group-badges";
import styles from "./group-badge-symbol-picker.module.css";

export function GroupBadgeSymbolPicker({ initialIcon = "shield" }: { initialIcon?: string }) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [icon, setIcon] = useState(initialIcon);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function clearFile() {
    setFile(null);
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  }
  function choose(value: string) { setIcon(value); clearFile(); }
  const selectedLabel = IDENTITY_GROUP_BADGE_ICON_OPTIONS.find(option => option.value === icon)?.label ?? "Custom group symbol";

  return <div className={styles.picker}>
    <label className={styles.label} htmlFor={`${id}-preset`}>Badge symbol</label>
    <div className={styles.selection}>
      <span className={styles.preview} aria-hidden="true">{preview ? <img src={preview} alt="" /> : <IdentityGroupIcon icon={icon} />}</span>
      <div className={styles.selectedCopy}><strong>{file ? file.name : selectedLabel}</strong><span>{file ? "Custom image · saved with this group" : "Shown on profiles and staff cards"}</span></div>
      {file ? <button type="button" onClick={clearFile} aria-label="Remove selected custom symbol"><X aria-hidden="true" /></button> : null}
    </div>
    <select id={`${id}-preset`} name="badgeIconKey" value={icon} onChange={event => choose(event.target.value)} aria-describedby={`${id}-help`}>
      {isCustomGroupBadgeIconKey(initialIcon) ? <option value={initialIcon}>Current custom symbol</option> : null}
      {IDENTITY_GROUP_BADGE_ICON_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    <details className={styles.browse}>
      <summary>Browse {IDENTITY_GROUP_BADGE_ICON_OPTIONS.length} symbols</summary>
      <div className={styles.grid} role="group" aria-label="Preset badge symbols">
        {IDENTITY_GROUP_BADGE_ICON_OPTIONS.map(option => <button key={option.value} type="button" aria-pressed={!file && icon === option.value} onClick={() => choose(option.value)}><IdentityGroupIcon icon={option.value} /><span>{option.label}</span></button>)}
      </div>
    </details>
    <label className={styles.upload} htmlFor={`${id}-file`}><Upload aria-hidden="true" /><span>Upload a custom symbol</span></label>
    <input ref={fileInput} className={styles.file} id={`${id}-file`} name="badgeSymbol" type="file" accept="image/png,image/webp,image/jpeg" aria-describedby={`${id}-help`} onChange={event => {
      const next = event.target.files?.[0] ?? null;
      if (next && (next.size > 256 * 1024 || !["image/png", "image/webp", "image/jpeg"].includes(next.type))) {
        clearFile(); setError("Choose a PNG, WebP or JPG image up to 256 KB."); return;
      }
      setError(""); setFile(next);
    }} />
    <small id={`${id}-help`}>PNG, WebP or JPG · up to 256 KB and 512 × 512 px. A transparent PNG works best. Choose a preset to replace a custom symbol.</small>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </div>;
}
