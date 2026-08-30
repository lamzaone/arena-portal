import { createElement, type ComponentPropsWithoutRef, type ElementType } from "react";

import { resolvePortalThemeSurface } from "@/lib/themes/registry";

export type PlayerContainerKind =
  | "case"
  | "management"
  | "message"
  | "record"
  | "search-result"
  | "selection";

type ThemedPlayerContainerOwnProps<Element extends ElementType> = {
  as?: Element;
  containerKind?: PlayerContainerKind;
  enabled?: boolean;
  ownerSteamId?: string | null;
  profileThemeKey?: string | null;
};

export type ThemedPlayerContainerProps<Element extends ElementType = "div"> =
  ThemedPlayerContainerOwnProps<Element> &
  Omit<ComponentPropsWithoutRef<Element>, keyof ThemedPlayerContainerOwnProps<Element>>;

function classNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

/**
 * Establishes a theme boundary owned by the represented player. This is the
 * reusable layer for results, records, messages and management cards; nested
 * player containers deliberately override an outer viewer or case theme.
 */
export function ThemedPlayerContainer<Element extends ElementType = "div">({
  as,
  containerKind = "record",
  enabled = true,
  ownerSteamId,
  profileThemeKey,
  className,
  ...elementProps
}: ThemedPlayerContainerProps<Element>) {
  if (!enabled) {
    return createElement(as ?? "div", {
      ...elementProps,
      className,
    });
  }

  const { surface, theme } = resolvePortalThemeSurface(
    profileThemeKey,
    "playerContainer",
  );

  return createElement(as ?? "div", {
    ...elementProps,
    className: classNames(
      "player-owned-container",
      surface.className,
      className,
    ),
    "data-ui": "player-owned-container",
    "data-theme": theme.key,
    "data-theme-owner": "player",
    "data-theme-surface": "player-container",
    "data-player-container-kind": containerKind,
    ...(ownerSteamId ? { "data-player-owner": ownerSteamId } : {}),
  });
}
