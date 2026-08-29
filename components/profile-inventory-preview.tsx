"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  PackageOpen,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { MarketplaceItemPreview } from "@/components/economy/marketplace-item-preview";
import {
  economyItems,
  rarityRankClass,
} from "@/components/economy/economy-view-model";
import type { PlayerProfileInventoryPage as InventoryPage } from "@/lib/data/portal-repository";

type ProfileInventoryPreviewProps = {
  preview: InventoryPage;
  steamId: string;
  isOwnProfile: boolean;
};

type InventoryPageResponse = InventoryPage & {
  ok?: boolean;
  message?: string;
};

function floatLabel(value: number | null) {
  return value === null ? "Not applicable" : value.toFixed(6);
}

function paginationPages(pageCount: number, currentPage: number) {
  const pages = new Set([
    1,
    2,
    currentPage - 1,
    currentPage,
    currentPage + 1,
    pageCount - 1,
    pageCount,
  ]);
  const sorted = [...pages]
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((left, right) => left - right);
  const result: Array<number | "ellipsis"> = [];
  for (const page of sorted) {
    const previous = result.at(-1);
    if (typeof previous === "number" && page > previous + 1)
      result.push("ellipsis");
    result.push(page);
  }
  return result;
}

export function ProfileInventoryPreview({
  preview,
  steamId,
  isOwnProfile,
}: ProfileInventoryPreviewProps) {
  const [inventory, setInventory] = useState(preview);
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedPage, setFailedPage] = useState<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const items = useMemo(() => economyItems(inventory.items), [inventory.items]);
  const pageCount = Math.max(1, Math.ceil(inventory.total / inventory.pageSize));
  const pageLinks = paginationPages(pageCount, inventory.page);
  const firstItem = inventory.total
    ? (inventory.page - 1) * inventory.pageSize + 1
    : 0;
  const lastItem = inventory.total
    ? Math.min(inventory.total, firstItem + items.length - 1)
    : 0;

  useEffect(() => {
    setInventory(preview);
    setPendingPage(null);
    setError(null);
    setFailedPage(null);
    return () => requestRef.current?.abort();
  }, [preview, steamId]);

  async function loadPage(page: number) {
    if (
      pendingPage !== null ||
      page === inventory.page ||
      page < 1 ||
      page > pageCount
    ) {
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setPendingPage(page);
    setError(null);
    setFailedPage(null);

    try {
      const response = await fetch(
        `/api/players/${encodeURIComponent(steamId)}/inventory?page=${page}`,
        {
          credentials: "same-origin",
          headers: { accept: "application/json" },
          signal: controller.signal,
        },
      );
      const result = (await response.json().catch(() => null)) as
        | InventoryPageResponse
        | null;
      if (!response.ok || !result?.ok) {
        throw new Error(result?.message ?? "That inventory page could not be loaded.");
      }
      setInventory(result);
      requestAnimationFrame(() => {
        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        panelRef.current?.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "start",
        });
      });
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(
        caught instanceof Error
          ? caught.message
          : "That inventory page could not be loaded.",
      );
      setFailedPage(page);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPendingPage(null);
      }
    }
  }

  return (
    <section
      className="profile-inventory-panel"
      aria-labelledby="profile-inventory-title"
      aria-busy={pendingPage !== null || undefined}
      ref={panelRef}
    >
      <header className="profile-inventory-heading">
        <div>
          <p className="eyebrow"><PackageOpen aria-hidden="true" /> Player collection</p>
          <h2 id="profile-inventory-title">Inventory</h2>
          <p aria-live="polite">
            {inventory.canView
              ? inventory.total
                ? `Showing items ${firstItem}–${lastItem} of ${inventory.total.toLocaleString("en-US")}. Hover or focus an artwork for instance details.`
                : "This inventory has no available items yet."
              : "This player has chosen to keep their inventory private."}
          </p>
        </div>
        {isOwnProfile ? (
          <Link className="button button-secondary" href="/inventory">
            Manage inventory <ArrowRight aria-hidden="true" />
          </Link>
        ) : null}
      </header>

      {error ? (
        <div className="profile-inventory-error" role="alert">
          <AlertTriangle aria-hidden="true" />
          <span>{error}</span>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => failedPage && void loadPage(failedPage)}
          >
            Try again
          </button>
        </div>
      ) : null}

      {!inventory.canView ? (
        <div className="profile-inventory-empty">
          <LockKeyhole aria-hidden="true" />
          <strong>Private inventory</strong>
          <p>Only this player and authorised staff can browse its contents.</p>
        </div>
      ) : pendingPage !== null ? (
        <>
          <span className="sr-only" role="status" aria-live="polite">
            Loading inventory page {pendingPage}.
          </span>
          <ul className="profile-inventory-grid is-loading" aria-hidden="true">
            {Array.from({ length: inventory.pageSize }, (_, index) => (
              <li key={index}>
                <span className="ui-skeleton profile-inventory-artwork-placeholder" />
              </li>
            ))}
          </ul>
        </>
      ) : items.length ? (
        <ul className="profile-inventory-grid" aria-label={`Inventory page ${inventory.page} of ${pageCount}`}>
          {items.map((item, index) => {
            const tooltipId = `profile-inventory-item-${inventory.page}-${index}`;
            return (
              <li key={item.id} className={rarityRankClass(item.rarityRank)}>
                <button
                  type="button"
                  className="profile-inventory-artwork"
                  aria-label={`Show details for ${item.displayName}`}
                  aria-describedby={tooltipId}
                >
                  <MarketplaceItemPreview item={item} enableMarketPreview={false} />
                  <span className="profile-inventory-tooltip" id={tooltipId} role="tooltip">
                    <strong>{item.displayName}</strong>
                    <span><small>Float</small><b>{floatLabel(item.floatValue)}</b></span>
                    <span><small>Seed</small><b>{item.seed ?? "Not set"}</b></span>
                    <span><small>StatTrak</small><b>{item.stattrak ? `On · ${item.stattrakCount.toLocaleString("en-US")}` : "Off"}</b></span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="profile-inventory-empty">
          <PackageOpen aria-hidden="true" />
          <strong>No available items yet</strong>
          <p>Owned items will appear here as soon as they enter this inventory.</p>
        </div>
      )}

      {inventory.canView && inventory.total > inventory.pageSize ? (
        <nav className="profile-inventory-pagination market-pagination" aria-label="Profile inventory pages">
          <button
            className="button button-secondary market-page-button"
            type="button"
            disabled={inventory.page <= 1 || pendingPage !== null}
            onClick={() => void loadPage(inventory.page - 1)}
          >
            <ChevronLeft aria-hidden="true" /> Previous
          </button>
          <div className="market-page-list">
            {pageLinks.map((page, index) =>
              page === "ellipsis" ? (
                <span className="market-page-ellipsis" key={`ellipsis-${index}`} aria-hidden="true">…</span>
              ) : (
                <button
                  type="button"
                  key={page}
                  className={`market-page-number${page === inventory.page ? " is-current" : ""}`}
                  aria-current={page === inventory.page ? "page" : undefined}
                  aria-label={`Inventory page ${page}`}
                  disabled={pendingPage !== null || page === inventory.page}
                  onClick={() => void loadPage(page)}
                >
                  {page}
                </button>
              ),
            )}
          </div>
          <button
            className="button button-secondary market-page-button"
            type="button"
            disabled={inventory.page >= pageCount || pendingPage !== null}
            onClick={() => void loadPage(inventory.page + 1)}
          >
            Next <ChevronRight aria-hidden="true" />
          </button>
        </nav>
      ) : null}
    </section>
  );
}
