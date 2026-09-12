"use client";

import { Package, UserRound } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useId, useState } from "react";

import sectionStyles from "@/components/ui/section-nav.module.css";

type ProfileTab = "overview" | "inventory";

type ProfileTabsProps = {
  children: ReactNode;
  inventory: ReactNode;
  inventoryCount: number;
  settings?: ReactNode;
  settingsOpen?: boolean;
};

export function ProfileTabs({
  children,
  inventory,
  inventoryCount,
  settings,
  settingsOpen = false,
}: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const id = useId();
  const overviewTabId = `${id}-overview-tab`;
  const inventoryTabId = `${id}-inventory-tab`;
  const overviewPanelId = `${id}-overview-panel`;
  const inventoryPanelId = `${id}-inventory-panel`;

  function tabId(tab: ProfileTab) {
    return tab === "overview" ? overviewTabId : inventoryTabId;
  }

  function selectWithKeyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    current: ProfileTab,
  ) {
    const tabs: ProfileTab[] = ["overview", "inventory"];
    const currentIndex = tabs.indexOf(current);
    const next = event.key === "Home"
      ? tabs[0]
      : event.key === "End"
        ? tabs.at(-1)
        : event.key === "ArrowLeft"
          ? tabs[(currentIndex - 1 + tabs.length) % tabs.length]
          : event.key === "ArrowRight"
            ? tabs[(currentIndex + 1) % tabs.length]
            : null;
    if (!next) return;
    event.preventDefault();
    setActiveTab(next);
    document.getElementById(tabId(next))?.focus();
  }

  if (settingsOpen) {
    return <div id="profile-settings-view">{settings}</div>;
  }

  return (
    <>
      <nav data-ui="section-nav" className={`${sectionStyles.nav} profile-content-tabs`} aria-label="Player profile sections">
        <div className={sectionStyles.track} data-part="track" role="tablist" aria-orientation="horizontal">
          <button
            className={sectionStyles.item}
            data-part="item"
            type="button"
            id={overviewTabId}
            role="tab"
            aria-selected={activeTab === "overview"}
            aria-controls={overviewPanelId}
            tabIndex={activeTab === "overview" ? 0 : -1}
            onClick={() => setActiveTab("overview")}
            onKeyDown={(event) => selectWithKeyboard(event, "overview")}
          >
            <UserRound aria-hidden="true" />
            <span className={sectionStyles.label}>Overview</span>
          </button>
          <button
            className={sectionStyles.item}
            data-part="item"
            type="button"
            id={inventoryTabId}
            role="tab"
            aria-selected={activeTab === "inventory"}
            aria-controls={inventoryPanelId}
            tabIndex={activeTab === "inventory" ? 0 : -1}
            onClick={() => setActiveTab("inventory")}
            onKeyDown={(event) => selectWithKeyboard(event, "inventory")}
          >
            <Package aria-hidden="true" />
            <span className={sectionStyles.label}>Inventory</span>
            <span className={sectionStyles.badge}>{inventoryCount.toLocaleString("en-US")}</span>
          </button>
        </div>
      </nav>
      <div
        id={overviewPanelId}
        role="tabpanel"
        aria-labelledby={overviewTabId}
        hidden={activeTab !== "overview"}
      >
        {children}
      </div>
      <div
        id={inventoryPanelId}
        role="tabpanel"
        aria-labelledby={inventoryTabId}
        hidden={activeTab !== "inventory"}
      >
        {inventory}
      </div>
    </>
  );
}
