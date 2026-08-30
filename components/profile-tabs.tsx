"use client";

import { Package, Settings2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, type ReactNode, useId, useState } from "react";

import sectionStyles from "@/components/ui/section-nav.module.css";

type ProfileTab = "overview" | "inventory" | "settings";

type ProfileTabsProps = {
  children: ReactNode;
  inventory: ReactNode;
  inventoryCount: number;
  profileHref?: string;
  settings?: ReactNode;
  settingsAvailable?: boolean;
  settingsOpen?: boolean;
};

export function ProfileTabs({
  children,
  inventory,
  inventoryCount,
  profileHref,
  settings,
  settingsAvailable = false,
  settingsOpen = false,
}: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<Exclude<ProfileTab, "settings">>("overview");
  const router = useRouter();
  const id = useId();
  const overviewTabId = `${id}-overview-tab`;
  const inventoryTabId = `${id}-inventory-tab`;
  const settingsTabId = `${id}-settings-tab`;
  const overviewPanelId = `${id}-overview-panel`;
  const inventoryPanelId = `${id}-inventory-panel`;
  const settingsPanelId = "profile-settings-view";
  const selectedTab: ProfileTab = settingsOpen ? "settings" : activeTab;

  function tabId(tab: ProfileTab) {
    if (tab === "settings") return settingsTabId;
    return tab === "overview" ? overviewTabId : inventoryTabId;
  }

  function activateTab(next: ProfileTab) {
    if (next === "settings") {
      if (!profileHref) return;
      if (settingsOpen) {
        setActiveTab("overview");
        router.push(profileHref, { scroll: false });
      } else {
        router.push(`${profileHref}?settings=1`, { scroll: false });
      }
      return;
    }

    setActiveTab(next);
    if (settingsOpen && profileHref) router.push(profileHref, { scroll: false });
  }

  function selectWithKeyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    current: ProfileTab,
  ) {
    const tabs: ProfileTab[] = settingsAvailable
      ? ["overview", "inventory", "settings"]
      : ["overview", "inventory"];
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
    activateTab(next);
    document.getElementById(tabId(next))?.focus();
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
            aria-selected={selectedTab === "overview"}
            aria-controls={overviewPanelId}
            tabIndex={selectedTab === "overview" ? 0 : -1}
            onClick={() => activateTab("overview")}
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
            aria-selected={selectedTab === "inventory"}
            aria-controls={inventoryPanelId}
            tabIndex={selectedTab === "inventory" ? 0 : -1}
            onClick={() => activateTab("inventory")}
            onKeyDown={(event) => selectWithKeyboard(event, "inventory")}
          >
            <Package aria-hidden="true" />
            <span className={sectionStyles.label}>Inventory</span>
            <span className={sectionStyles.badge}>{inventoryCount.toLocaleString("en-US")}</span>
          </button>
          {settingsAvailable ? (
            <button
              className={`${sectionStyles.item} ${sectionStyles.settings} profile-content-settings-toggle`}
              data-part="item"
              type="button"
              id={settingsTabId}
              role="tab"
              aria-label={settingsOpen ? "Close Customize profile settings" : "Customize profile"}
              aria-selected={selectedTab === "settings"}
              aria-controls={settingsPanelId}
              tabIndex={selectedTab === "settings" ? 0 : -1}
              title={settingsOpen ? "Close profile settings" : "Open profile settings"}
              onClick={() => activateTab("settings")}
              onKeyDown={(event) => selectWithKeyboard(event, "settings")}
            >
              <Settings2 aria-hidden="true" />
              <span className={sectionStyles.label}>Customize</span>
            </button>
          ) : null}
        </div>
      </nav>
      <div
        id={overviewPanelId}
        role="tabpanel"
        aria-labelledby={overviewTabId}
        hidden={selectedTab !== "overview"}
      >
        {children}
      </div>
      <div
        id={inventoryPanelId}
        role="tabpanel"
        aria-labelledby={inventoryTabId}
        hidden={selectedTab !== "inventory"}
      >
        {inventory}
      </div>
      {settingsAvailable ? (
        <div
          id={settingsPanelId}
          role="tabpanel"
          aria-labelledby={settingsTabId}
          hidden={selectedTab !== "settings"}
        >
          {settings}
        </div>
      ) : null}
    </>
  );
}
