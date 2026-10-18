"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PortalToast, type PortalToastVariant } from "@/components/success-toast";

type Notice = { message: string; variant: PortalToastVariant };

/** Queue acceptance is separate from the CS2 server confirming an action. */
export function ModerationActionRuntime() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const notice = params.get("notice") ?? "";
  const [feedback, setFeedback] = useState<Notice | null>(null);
  const feedbackPath = useRef(pathname);
  const refreshDestination = useRef<string | null>(null);

  useEffect(() => {
    const current = `${pathname}${params.size ? `?${params}` : ""}`;
    if (refreshDestination.current !== current) return;
    refreshDestination.current = null;
    startTransition(() => router.refresh());
  }, [pathname, params, router]);

  useEffect(() => {
    const match = /^(ban|unban|kick|gag|mute|silence)-queued-([1-9]\d*)$/.exec(notice);
    if (!match || !/^\/(?:admin\/|players\/)/.test(pathname)) return;
    const [, action, job] = match;
    feedbackPath.current = pathname;
    const controller = new AbortController();
    let timer = 0;
    const deadline = Date.now() + 40_000;
    setFeedback({ variant: "info", message: "Action queued. Waiting for the server to confirm…" });

    async function check() {
      if (controller.signal.aborted) return;
      if (Date.now() >= deadline) {
        setFeedback({ variant: "warning", message: "The server has not confirmed this action yet. Check the current records before trying again." });
        return;
      }
      try {
        const response = await fetch(`/api/admin/moderation/status?job=${job}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]) });
        if (!response.ok) {
          if ([401, 403, 404].includes(response.status)) {
            setFeedback({ variant: "warning", message: "This action's confirmation is unavailable. Check the current records before trying again." });
            return;
          }
          throw new Error("temporarily unavailable");
        }
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (result.status === "completed" || result.status === "failed") {
          const completed = result.status === "completed";
          setFeedback({ variant: completed ? "success" : "danger", message: completed
            ? `${action[0].toUpperCase() + action.slice(1)} confirmed by the server.`
            : "The server could not apply this action. Check the refreshed records before trying again." });
          const url = new URL(window.location.href);
          url.searchParams.delete("notice");
          const query = url.searchParams.toString();
          refreshDestination.current = `${url.pathname}${query ? `?${query}` : ""}`;
          startTransition(() => {
            router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
          });
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      timer = window.setTimeout(check, 1_000);
    }
    void check();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [notice, pathname, router]);

  const visible = feedback && feedbackPath.current === pathname && (feedback.variant !== "info" || /-queued-\d+$/.test(notice));
  return visible ? <PortalToast message={feedback.message} variant={feedback.variant} durationMs={feedback.variant === "info" ? 45_000 : 8_000} onDismiss={() => setFeedback(null)} /> : null;
}
