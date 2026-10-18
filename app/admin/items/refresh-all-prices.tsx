"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw } from "lucide-react";

import styles from "./items-admin.module.css";

type RefreshResponse = {
  status?: string;
  scanned?: number;
  updated?: number;
  variantCached?: number;
  message?: string;
};

export function RefreshAllPrices({ csrf }: { csrf: string }) {
  const router = useRouter();
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);

  async function refresh() {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/economy/prices/refresh", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ csrf }),
      });
      const result = await response.json() as RefreshResponse;
      if (result.status === "busy") {
        setFeedback({ message: "A price refresh is already running. Try again once it finishes.", error: false });
      } else if (result.status === "unavailable") {
        setFeedback({ message: "Price refresh is unavailable. Check the economy database and try again.", error: true });
      } else if (!response.ok || result.status !== "refreshed") {
        setFeedback({ message: result.message || "The price refresh failed. Try again later.", error: true });
      } else {
        setFeedback({ message: `Checked ${result.scanned ?? 0} products; updated ${result.updated ?? 0} prices and cached ${result.variantCached ?? 0} market variants.`, error: false });
        router.refresh();
      }
    } catch {
      setFeedback({ message: "The refresh could not be completed. Check your connection and try again.", error: true });
    } finally {
      running.current = false;
      setPending(false);
    }
  }

  return (
    <div className={styles.refreshPrices}>
      <div>
        <button className="button button-secondary" type="button" disabled={pending} aria-busy={pending} onClick={refresh}>
          {pending ? <LoaderCircle className={styles.refreshSpinner} aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
          {pending ? "Refreshing all prices…" : "Refresh all prices"}
        </button>
        <p>Update public market prices across the full catalogue, including products outside this search.</p>
      </div>
      <p role="status" aria-live="polite" data-error={feedback?.error || undefined}>
        {pending ? "Refreshing the catalogue and market variants. This can take a few minutes." : feedback?.message}
      </p>
    </div>
  );
}
