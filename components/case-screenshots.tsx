"use client";

import { ChevronLeft, ChevronRight, ImageIcon, X } from "lucide-react";
import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";

import type { CaseAttachment } from "@/lib/data/portal-repository";
import styles from "./case-screenshots.module.css";

const ScreenshotContext = createContext<((attachmentId: number) => void) | null>(null);

/** One viewer per case lets every post browse the complete evidence gallery. */
export function CaseScreenshotProvider({ attachments, label = "Case screenshots", children }: {
  attachments: CaseAttachment[];
  label?: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const captionId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedImageId, setFailedImageId] = useState<number | null>(null);
  const activeImage = attachments[activeIndex];

  function openScreenshot(attachmentId: number) {
    const index = attachments.findIndex((attachment) => attachment.id === attachmentId);
    if (index < 0) return;
    setActiveIndex(index);
    setFailedImageId(null);
    dialogRef.current?.showModal();
  }

  function browse(direction: number) {
    setFailedImageId(null);
    setActiveIndex((index) => (index + direction + attachments.length) % attachments.length);
  }

  return <ScreenshotContext.Provider value={openScreenshot}>
    {children}
    {activeImage ? <dialog
      ref={dialogRef}
      className={styles.modal}
      aria-label={label}
      aria-describedby={captionId}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
      onKeyDown={(event) => {
        if (attachments.length < 2) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          browse(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <div className={styles.panel}>
        <header className={styles.toolbar}>
          <span><ImageIcon aria-hidden="true" /> {label}</span>
          <button type="button" className={styles.control} aria-label="Close screenshots" onClick={() => dialogRef.current?.close()}>
            <X aria-hidden="true" />
          </button>
        </header>
        <figure className={styles.figure}>
          <div className={styles.imageStage}>
            <img
              key={activeImage.id}
              className={styles.fullImage}
              src={`/api/case-attachments/${activeImage.id}`}
              alt={activeImage.fileName}
              hidden={failedImageId === activeImage.id}
              onError={() => setFailedImageId(activeImage.id)}
            />
            {failedImageId === activeImage.id ? <p className={styles.error} role="alert">This screenshot could not be loaded. Try another screenshot or reopen the viewer.</p> : null}
            {attachments.length > 1 ? <>
              <button type="button" className={`${styles.control} ${styles.previous}`} aria-label="Previous screenshot" onClick={() => browse(-1)}><ChevronLeft aria-hidden="true" /></button>
              <button type="button" className={`${styles.control} ${styles.next}`} aria-label="Next screenshot" onClick={() => browse(1)}><ChevronRight aria-hidden="true" /></button>
            </> : null}
          </div>
          <figcaption id={captionId} className={styles.caption} aria-live="polite">
            <span>{activeImage.fileName}</span><span>{activeIndex + 1} / {attachments.length}</span>
          </figcaption>
        </figure>
      </div>
    </dialog> : null}
  </ScreenshotContext.Provider>;
}

export function CaseAttachments({ attachments }: { attachments: CaseAttachment[] }) {
  const openScreenshot = useContext(ScreenshotContext);
  if (!attachments.length) return null;

  return <div className={`case-message-attachments ${styles.attachments}`} aria-label="Attached screenshots">
    {attachments.map((attachment) => <button
      key={attachment.id}
      type="button"
      className={styles.thumbnail}
      aria-label={`View screenshot: ${attachment.fileName}`}
      aria-haspopup="dialog"
      onClick={() => openScreenshot?.(attachment.id)}
    >
      <span className={styles.preview}><ImageIcon aria-hidden="true" /><img src={`/api/case-attachments/${attachment.id}`} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} /></span>
      <span className={styles.fileName}>{attachment.fileName}</span>
    </button>)}
  </div>;
}
