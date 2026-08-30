"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { useTransition } from "react";

import { announceNavigationStart } from "@/components/ui/navigation-progress";
import { ThemedPlayerContainer } from "@/components/ui/themed-player-container";

type StaffInventoryPlayerRowProps = {
  href: string;
  label: string;
  ownerSteamId: string;
  profileThemeKey?: string | null;
  selected: boolean;
  children: ReactNode;
};

const interactiveSelector = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[role='button']",
  "[role='link']",
  "[data-prevent-row-navigation]",
].join(",");

/**
 * Makes the complete directory card select an inventory without wrapping the
 * PlayerIdentity profile links in another anchor. The portalled hover card can
 * therefore keep its independent profile navigation and copy controls.
 */
export function StaffInventoryPlayerRow({
  href,
  label,
  ownerSteamId,
  profileThemeKey,
  selected,
  children,
}: StaffInventoryPlayerRowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate() {
    if (selected || pending) return;
    announceNavigationStart();
    startTransition(() => router.push(href, { scroll: false }));
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return;
    const target = event.target;
    if (target instanceof Element) {
      const interactiveTarget = target.closest(interactiveSelector);
      if (interactiveTarget && interactiveTarget !== event.currentTarget) return;
    }
    navigate();
  }

  return (
    <ThemedPlayerContainer
      className={`staff-player-result-row${selected ? " is-selected" : ""}${pending ? " is-loading" : ""}`}
      containerKind="selection"
      ownerSteamId={ownerSteamId}
      profileThemeKey={profileThemeKey}
      role="link"
      tabIndex={0}
      aria-label={label}
      aria-current={selected ? "page" : undefined}
      aria-busy={pending || undefined}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        navigate();
      }}
      onPointerEnter={() => router.prefetch(href)}
    >
      {children}
    </ThemedPlayerContainer>
  );
}
