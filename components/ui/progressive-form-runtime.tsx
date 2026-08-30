"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

type SubmissionNotice = {
  id: number;
  kind: "error" | "status";
  message: string;
};

type SubmitControl = HTMLButtonElement | HTMLInputElement;

type SubmissionTarget = {
  action: URL;
  encType: string;
  method: string;
  submitter: SubmitControl | null;
};

const NATIVE_FORM_VALUES = new Set(["off", "false", "native"]);
const AUTH_ENTRY_PATHS = new Set(["/api/auth/steam", "/api/auth/steam/callback"]);

function submitControl(value: EventTarget | null): SubmitControl | null {
  if (value instanceof HTMLButtonElement) return value;
  if (
    value instanceof HTMLInputElement &&
    (value.type === "submit" || value.type === "image")
  ) {
    return value;
  }
  return null;
}

function submitterAttribute(
  form: HTMLFormElement,
  submitter: SubmitControl | null,
  name: "action" | "enctype" | "method" | "target",
) {
  return submitter?.getAttribute(`form${name}`) ?? form.getAttribute(name);
}

function submissionTarget(
  form: HTMLFormElement,
  event: SubmitEvent,
): SubmissionTarget | null {
  const submitter = submitControl(event.submitter);
  const progressiveMode = form.dataset.progressiveForm?.toLocaleLowerCase();
  if (progressiveMode && NATIVE_FORM_VALUES.has(progressiveMode)) return null;
  if (form.hasAttribute("data-native-submit")) return null;
  if (form.closest('[data-progressive-forms="off"], [data-native-submit]')) return null;

  const rawAction =
    submitterAttribute(form, submitter, "action")?.trim() || window.location.href;
  if (/^javascript:/i.test(rawAction)) return null;

  let action: URL;
  try {
    action = new URL(rawAction, window.location.href);
  } catch {
    return null;
  }

  if (!/^https?:$/.test(action.protocol) || action.origin !== window.location.origin) {
    return null;
  }
  // Steam authentication intentionally leaves the app and must be a document
  // navigation. Mutation forms are never retried unless an idempotent caller
  // explicitly opts into `data-progressive-retry="native"`.
  if (AUTH_ENTRY_PATHS.has(action.pathname)) return null;

  const method = (
    submitterAttribute(form, submitter, "method") || form.method || "get"
  ).toLocaleLowerCase();
  if (method === "dialog") return null;

  const target = (
    submitterAttribute(form, submitter, "target") || form.target
  ).trim();
  if (target && target.toLocaleLowerCase() !== "_self") return null;

  return {
    action,
    encType: (
      submitterAttribute(form, submitter, "enctype") ||
      form.enctype ||
      "application/x-www-form-urlencoded"
    ).toLocaleLowerCase(),
    method,
    submitter,
  };
}

function submissionData(
  form: HTMLFormElement,
  submitter: SubmitControl | null,
) {
  if (!submitter) return new FormData(form);
  try {
    // Passing the submitter preserves button name/value (and image-submit
    // coordinates) exactly like a native form submission.
    return new FormData(form, submitter);
  } catch {
    // Older engines support FormData(form) but not its submitter argument.
    const data = new FormData(form);
    if (submitter.name) data.append(submitter.name, submitter.value);
    return data;
  }
}

function appendQuery(target: URL, data: FormData) {
  target.search = "";
  for (const [name, value] of data.entries()) {
    target.searchParams.append(name, typeof value === "string" ? value : value.name);
  }
  return target;
}

function textBody(data: FormData) {
  return Array.from(data.entries(), ([name, value]) =>
    `${name}=${typeof value === "string" ? value : value.name}`,
  ).join("\r\n");
}

function urlEncodedBody(data: FormData) {
  const body = new URLSearchParams();
  for (const [name, value] of data.entries()) {
    body.append(name, typeof value === "string" ? value : value.name);
  }
  return body;
}

function requestBody(data: FormData, encType: string): BodyInit {
  if (encType.startsWith("multipart/form-data")) return data;
  if (encType.startsWith("text/plain")) return textBody(data);
  return urlEncodedBody(data);
}

function submissionLabel(submitter: SubmitControl | null) {
  if (submitter instanceof HTMLButtonElement) {
    return submitter.textContent?.replace(/\s+/g, " ").trim() || "Submitting";
  }
  return submitter?.value.trim() || "Submitting";
}

function submitControls(form: HTMLFormElement) {
  return Array.from(form.elements).filter((control): control is SubmitControl =>
    (control instanceof HTMLButtonElement && control.type === "submit") ||
    (control instanceof HTMLInputElement &&
      (control.type === "submit" || control.type === "image")),
  );
}

function setPending(
  form: HTMLFormElement,
  submitter: SubmitControl | null,
) {
  const token = crypto.randomUUID();
  const previousBusy = form.getAttribute("aria-busy");
  const previousPending = form.getAttribute("data-progressive-pending");
  form.setAttribute("aria-busy", "true");
  form.setAttribute("data-progressive-pending", "true");
  form.setAttribute("data-progressive-action", submissionLabel(submitter));

  for (const control of submitControls(form)) {
    if (control.disabled) continue;
    control.disabled = true;
    control.dataset.progressiveDisabled = token;
  }

  return () => {
    if (previousBusy === null) form.removeAttribute("aria-busy");
    else form.setAttribute("aria-busy", previousBusy);
    if (previousPending === null) form.removeAttribute("data-progressive-pending");
    else form.setAttribute("data-progressive-pending", previousPending);
    form.removeAttribute("data-progressive-action");

    for (const control of submitControls(form)) {
      // A React render may have deliberately replaced or disabled a control
      // while the request was pending. Only restore controls still carrying
      // this runtime's marker.
      if (control.dataset.progressiveDisabled !== token) continue;
      delete control.dataset.progressiveDisabled;
      control.disabled = false;
    }
  };
}

function responseMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  for (const key of ["message", "error", "detail"]) {
    if (typeof record[key] === "string" && record[key].trim()) {
      return record[key].trim().slice(0, 320);
    }
  }
  return fallback;
}

function responseNavigation(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.redirect !== "string" || !record.redirect.trim()) return null;

  try {
    return {
      refresh: record.refresh === true,
      replace: record.replace === true,
      url: new URL(record.redirect, window.location.href),
    };
  } catch {
    return null;
  }
}

function dispatchFormEvent(
  form: HTMLFormElement,
  name: "error" | "settled" | "start" | "success",
  detail: Record<string, unknown>,
) {
  form.dispatchEvent(
    new CustomEvent(`portal:form-${name}`, {
      bubbles: true,
      detail,
    }),
  );
}

/**
 * Progressively enhances otherwise-native forms after hydration. Existing
 * client onSubmit handlers run first; if they call preventDefault, this
 * runtime does nothing. The server-rendered forms therefore remain fully
 * functional without JavaScript.
 */
export function ProgressiveFormRuntime() {
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);
  const [notice, setNotice] = useState<SubmissionNotice | null>(null);
  const noticeId = useRef(0);
  const noticeTimer = useRef<number | null>(null);

  const showNotice = useCallback((message: string, kind: SubmissionNotice["kind"]) => {
    noticeId.current += 1;
    setNotice({ id: noticeId.current, kind, message });
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), kind === "error" ? 8_000 : 5_000);
  }, []);

  useEffect(() => () => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  useEffect(() => {
    const inFlight = new WeakSet<HTMLFormElement>();
    const nativeRetry = new WeakSet<HTMLFormElement>();

    function navigate(url: URL, scroll: boolean, replace = false, refresh = false) {
      if (url.origin !== window.location.origin || AUTH_ENTRY_PATHS.has(url.pathname)) {
        window.location.assign(url.href);
        return;
      }
      const href = `${url.pathname}${url.search}${url.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      startTransition(() => {
        if (href === current) router.refresh();
        else if (replace) router.replace(href, { scroll });
        else router.push(href, { scroll });
        if (refresh && href !== current) router.refresh();
      });
    }

    function settleAfterNavigation(
      form: HTMLFormElement,
      previousHref: string,
      settle: () => void,
    ) {
      const startedAt = performance.now();
      const check = () => {
        // App Router navigation keeps the old form mounted while its server
        // result streams in. Keep actions disabled until the old UI is gone
        // (or the URL commits), with a fail-safe for an interrupted transition.
        if (
          !form.isConnected ||
          window.location.href !== previousHref ||
          performance.now() - startedAt >= 12_000
        ) {
          settle();
          return;
        }
        window.setTimeout(check, 100);
      };
      window.setTimeout(check, 100);
    }

    async function handleSubmit(event: SubmitEvent) {
      if (event.defaultPrevented || !(event.target instanceof HTMLFormElement)) return;
      const form = event.target;
      if (nativeRetry.has(form)) {
        nativeRetry.delete(form);
        return;
      }

      const target = submissionTarget(form, event);
      if (!target) return;
      if (inFlight.has(form)) {
        event.preventDefault();
        return;
      }

      const data = submissionData(form, target.submitter);
      event.preventDefault();

      if (target.method === "get") {
        navigate(appendQuery(new URL(target.action), data), true);
        return;
      }

      inFlight.add(form);
      const restore = setPending(form, target.submitter);
      setPendingCount((count) => count + 1);
      dispatchFormEvent(form, "start", {
        action: target.action.href,
        method: target.method,
        submitter: target.submitter,
      });

      let deferredSettlement = false;
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        restore();
        inFlight.delete(form);
        setPendingCount((count) => Math.max(0, count - 1));
        dispatchFormEvent(form, "settled", {
          action: target.action.href,
          method: target.method,
        });
      };
      try {
        const headers = new Headers({
          accept: "application/json, text/html, application/xhtml+xml",
          "x-requested-with": "XMLHttpRequest",
        });
        const body = requestBody(data, target.encType);
        if (target.encType.startsWith("text/plain")) {
          headers.set("content-type", "text/plain;charset=UTF-8");
        }

        const response = await fetch(target.action, {
          method: target.method.toLocaleUpperCase(),
          body,
          credentials: "same-origin",
          headers,
          redirect: "follow",
        });
        const contentType = response.headers.get("content-type") ?? "";
        let payload: unknown = null;
        if (contentType.includes("application/json")) {
          payload = await response.json().catch(() => null);
        }

        if (!response.ok) {
          const message = responseMessage(
            payload,
            `The server returned an error after receiving this action (${response.status}). Check its current state before trying again.`,
          );
          showNotice(message, "error");
          dispatchFormEvent(form, "error", {
            action: target.action.href,
            message,
            response,
          });
          return;
        }

        dispatchFormEvent(form, "success", {
          action: target.action.href,
          payload,
          response,
        });

        const payloadNavigation = responseNavigation(payload);
        if (response.redirected || payloadNavigation) {
          const redirectUrl = payloadNavigation?.url ?? new URL(response.url, window.location.href);
          // Keep the pending state until the App Router starts replacing the
          // server-rendered result. This also blocks accidental double actions.
          deferredSettlement = true;
          const previousHref = window.location.href;
          navigate(
            redirectUrl,
            form.dataset.progressiveScroll === "top",
            payloadNavigation?.replace,
            payloadNavigation?.refresh,
          );
          settleAfterNavigation(form, previousHref, settle);
          return;
        }

        const successMessage = responseMessage(payload, "Action completed.");
        showNotice(successMessage, "status");
        startTransition(() => router.refresh());
      } catch (error) {
        // A request can fail after the server has already committed its
        // mutation. Never retry automatically: repeating grants, sanctions,
        // transfers or replies would be unsafe. A specifically idempotent
        // legacy form may explicitly opt into a one-time native retry.
        const allowNativeRetry =
          error instanceof TypeError &&
          navigator.onLine &&
          form.dataset.progressiveRetry === "native" &&
          form.isConnected;
        if (allowNativeRetry) {
          settle();
          nativeRetry.add(form);
          if (target.submitter?.isConnected) form.requestSubmit(target.submitter);
          else form.requestSubmit();
          return;
        }

        const message = navigator.onLine
          ? "The connection ended before the result was confirmed. Check the current state before retrying; your input has been kept."
          : "You appear to be offline. Reconnect and try again; your input has been kept.";
        showNotice(message, "error");
        dispatchFormEvent(form, "error", {
          action: target.action.href,
          error,
          message,
        });
      } finally {
        if (!deferredSettlement) settle();
      }
    }

    function onSubmit(event: Event) {
      void handleSubmit(event as SubmitEvent);
    }

    // Bubble phase is deliberate: React and other client handlers get the
    // first chance to prevent the native submission.
    document.addEventListener("submit", onSubmit);
    return () => document.removeEventListener("submit", onSubmit);
  }, [router, showNotice]);

  return (
    <>
      <div
        className="progressive-form-progress"
        data-active={pendingCount > 0 ? "true" : "false"}
        aria-hidden="true"
      />
      <p className="progressive-form-announcer" role="status" aria-live="polite">
        {pendingCount > 0 ? "Submitting action. Please wait." : ""}
      </p>
      {notice ? (
        <div
          className="progressive-form-notice"
          data-kind={notice.kind}
          role={notice.kind === "error" ? "alert" : "status"}
          aria-live={notice.kind === "error" ? "assertive" : "polite"}
          key={notice.id}
        >
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification">
            <X aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </>
  );
}
