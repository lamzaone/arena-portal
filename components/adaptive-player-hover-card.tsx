"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Placement = "above" | "below";

type CardPosition = {
  top: number;
  left: number;
  placement: Placement;
};

type AdaptivePlayerHoverCardProps = {
  children: ReactNode;
  className: string;
  themeClassName: string;
  themeKey: string;
  presence: "online" | "offline" | "unknown";
  ariaLabel: string;
};

const triggerSelector = [
  ".player-identity-avatar",
  ".player-identity-avatar-fallback",
  ".player-identity-name",
].join(",");

let dismissActivePreview: (() => void) | null = null;

function relatedTargetIsInside(
  relatedTarget: EventTarget | null,
  ...containers: Array<HTMLElement | null>
) {
  return relatedTarget instanceof Node && containers.some(
    (container) => container?.contains(relatedTarget),
  );
}

export function AdaptivePlayerHoverCard({
  children,
  className,
  themeClassName,
  themeKey,
  presence,
  ariaLabel,
}: AdaptivePlayerHoverCardProps) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationFrame = useRef<number | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CardPosition | null>(null);

  const cancelScheduledClose = useCallback(() => {
    if (!closeTimer.current) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const closeImmediately = useCallback(() => {
    cancelScheduledClose();
    setOpen(false);
    if (dismissActivePreview === closeImmediately) dismissActivePreview = null;
  }, [cancelScheduledClose]);

  const scheduleClose = useCallback(() => {
    cancelScheduledClose();
    closeTimer.current = setTimeout(closeImmediately, 1_000);
  }, [cancelScheduledClose, closeImmediately]);

  const updatePosition = useCallback(() => {
    const card = cardRef.current;
    const frame = markerRef.current?.parentElement;
    if (!card || !frame) return;

    const anchor = frame.querySelector<HTMLElement>(".player-identity") ?? frame;
    const anchorRect = anchor.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const edge = 12;
    const gap = 8;
    const cardWidth = cardRect.width;
    const cardHeight = cardRect.height;
    const aboveSpace = anchorRect.top - edge - gap;
    const belowSpace = viewportHeight - anchorRect.bottom - edge - gap;
    const placement: Placement =
      aboveSpace >= cardHeight || aboveSpace >= belowSpace ? "above" : "below";
    const unclampedTop = placement === "above"
      ? anchorRect.top - gap - cardHeight
      : anchorRect.bottom + gap;
    const maximumTop = Math.max(edge, viewportHeight - edge - cardHeight);
    const top = Math.min(Math.max(edge, unclampedTop), maximumTop);
    const maximumLeft = Math.max(edge, viewportWidth - edge - cardWidth);
    const left = Math.min(Math.max(edge, anchorRect.left), maximumLeft);

    setPosition((current) => {
      if (
        current?.top === top &&
        current.left === left &&
        current.placement === placement
      ) return current;
      return { top, left, placement };
    });
  }, []);

  const requestPositionUpdate = useCallback(() => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = requestAnimationFrame(() => {
      animationFrame.current = null;
      updatePosition();
    });
  }, [updatePosition]);

  const openPreview = useCallback(() => {
    cancelScheduledClose();
    if (dismissActivePreview && dismissActivePreview !== closeImmediately) {
      dismissActivePreview();
    }
    dismissActivePreview = closeImmediately;
    updatePosition();
    setOpen(true);
  }, [cancelScheduledClose, closeImmediately, updatePosition]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!portalReady) return;
    const frame = markerRef.current?.parentElement;
    if (!frame) return;

    const handlePointerOver = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const trigger = target.closest(triggerSelector);
      if (trigger && frame.contains(trigger)) openPreview();
    };
    const handlePointerOut = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(triggerSelector)) return;
      if (relatedTargetIsInside(event.relatedTarget, cardRef.current)) return;
      if (event.relatedTarget instanceof Element) {
        const nextTrigger = event.relatedTarget.closest(triggerSelector);
        if (nextTrigger && frame.contains(nextTrigger)) return;
      }
      scheduleClose();
    };
    const handlePointerEnter = () => {
      if (dismissActivePreview && dismissActivePreview !== closeImmediately) {
        dismissActivePreview();
      }
    };
    const handleFocusIn = () => openPreview();
    const handleFocusOut = (event: FocusEvent) => {
      if (relatedTargetIsInside(event.relatedTarget, frame, cardRef.current)) return;
      scheduleClose();
    };

    frame.addEventListener("pointerenter", handlePointerEnter);
    frame.addEventListener("pointerover", handlePointerOver);
    frame.addEventListener("pointerout", handlePointerOut);
    frame.addEventListener("focusin", handleFocusIn);
    frame.addEventListener("focusout", handleFocusOut);

    return () => {
      frame.removeEventListener("pointerenter", handlePointerEnter);
      frame.removeEventListener("pointerover", handlePointerOver);
      frame.removeEventListener("pointerout", handlePointerOut);
      frame.removeEventListener("focusin", handleFocusIn);
      frame.removeEventListener("focusout", handleFocusOut);
    };
  }, [closeImmediately, openPreview, portalReady, scheduleClose]);

  useEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    const frame = markerRef.current?.parentElement;
    const anchor = frame?.querySelector<HTMLElement>(".player-identity") ?? frame;
    const resizeObserver = new ResizeObserver(requestPositionUpdate);
    if (card) resizeObserver.observe(card);
    if (anchor) resizeObserver.observe(anchor);
    window.addEventListener("resize", requestPositionUpdate);
    window.addEventListener("scroll", requestPositionUpdate, true);
    requestPositionUpdate();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", requestPositionUpdate);
      window.removeEventListener("scroll", requestPositionUpdate, true);
    };
  }, [open, requestPositionUpdate]);

  useEffect(() => () => {
    cancelScheduledClose();
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    if (dismissActivePreview === closeImmediately) dismissActivePreview = null;
  }, [cancelScheduledClose, closeImmediately]);

  const cardStyle = position ? {
    top: position.top,
    left: position.left,
  } satisfies CSSProperties : undefined;

  return (
    <>
      <span ref={markerRef} hidden aria-hidden="true" />
      {portalReady ? createPortal(
        <span
          data-ui="player-hover-layer"
          className={`player-profile-preview-layer ${themeClassName}`}
          data-theme={themeKey}
          data-theme-surface="small-profile"
          data-profile-theme={themeKey}
          data-presence={presence}
        >
          <span
            ref={cardRef}
            data-ui="player-hover-card"
            className={className}
            role="group"
            aria-label={ariaLabel}
            data-open={open ? "true" : "false"}
            data-positioned={position ? "true" : "false"}
            data-placement={position?.placement ?? "above"}
            style={cardStyle}
            onPointerEnter={cancelScheduledClose}
            onPointerLeave={scheduleClose}
            onFocus={openPreview}
            onBlur={(event) => {
              if (relatedTargetIsInside(event.relatedTarget, markerRef.current?.parentElement ?? null, cardRef.current)) return;
              scheduleClose();
            }}
          >
            {children}
          </span>
        </span>,
        document.body,
      ) : null}
    </>
  );
}
