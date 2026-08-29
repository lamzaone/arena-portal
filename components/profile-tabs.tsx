"use client";

import { Package, UserRound } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useId, useState } from "react";

type ProfileTab = "overview" | "inventory";

type ProfileTabsProps = {
  children: ReactNode;
  inventory: ReactNode;
  inventoryCount: number;
};

export function ProfileTabs({
  children,
  inventory,
  inventoryCount,
}: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const id = useId();
  const overviewTabId = `${id}-overview-tab`;
  const inventoryTabId = `${id}-inventory-tab`;
  const overviewPanelId = `${id}-overview-panel`;
  const inventoryPanelId = `${id}-inventory-panel`;

  function selectWithKeyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    current: ProfileTab,
  ) {
    const next =
      event.key === "Home"
        ? "overview"
        : event.key === "End"
          ? "inventory"
          : event.key === "ArrowLeft" || event.key === "ArrowRight"
            ? current === "overview"
              ? "inventory"
              : "overview"
            : null;
    if (!next) return;
    event.preventDefault();
    setActiveTab(next);
    document
      .getElementById(next === "overview" ? overviewTabId : inventoryTabId)
      ?.focus();
  }

  return (
    <>
      <nav className="profile-content-tabs" aria-label="Player profile sections">
        <div role="tablist" aria-orientation="horizontal">
          <button
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
            Overview
          </button>
          <button
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
            Inventory
            <span>{inventoryCount.toLocaleString("en-US")}</span>
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
