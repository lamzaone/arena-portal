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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MarketplaceItemPreview } from "@/components/economy/marketplace-item-preview";
import { useItemGridLayout } from "@/components/economy/item-grid";
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
  return <ProfileInventoryCollection key={steamId} preview={preview} steamId={steamId} isOwnProfile={isOwnProfile} />;
}

function ProfileInventoryCollection({
  preview,
  steamId,
  isOwnProfile,
}: ProfileInventoryPreviewProps) {
  const { gridProps, pageSize, measured } = useItemGridLayout();
  const [collection, setCollection] = useState({ source: preview, value: preview });
  const inventory = collection.source === preview ? collection.value : preview;
  const [pendingRequest, setPendingRequest] = useState<{ page: number; pageSize: number } | null>(null);
  const pendingPage = pendingRequest?.page ?? null;
  const [error, setError] = useState<string | null>(null);
  const [failedRequest, setFailedRequest] = useState<{ page: number; pageSize: number } | null>(null);
  const requestRef = useRef<{ controller: AbortController; key: string } | null>(null);
  const sourceRef = useRef(preview);
  sourceRef.current = preview;
  const anchorRef = useRef((preview.page - 1) * preview.pageSize);
  const anchor = collection.source === preview ? anchorRef.current : (preview.page - 1) * preview.pageSize;
  const panelRef = useRef<HTMLElement | null>(null);
  const items = useMemo(() => economyItems(inventory.items), [inventory.items]);
  const visibleItems = items.slice(0, pageSize);
  const pageCount = Math.max(1, Math.ceil(inventory.total / pageSize));
  const currentPage = Math.min(pageCount, Math.floor(anchor / pageSize) + 1);
  const pageLinks = paginationPages(pageCount, currentPage);
  const firstItem = inventory.total
    ? (inventory.page - 1) * inventory.pageSize + 1
    : 0;
  const lastItem = inventory.total
    ? Math.min(inventory.total, firstItem + visibleItems.length - 1)
    : 0;

  useEffect(() => {
    requestRef.current?.controller.abort();
    requestRef.current = null;
    anchorRef.current = (preview.page - 1) * preview.pageSize;
    setCollection({ source: preview, value: preview });
    setPendingRequest(null);
    setError(null);
    setFailedRequest(null);
    return () => requestRef.current?.controller.abort();
  }, [preview, steamId]);

  const loadPage = useCallback(async (page: number, requestedPageSize: number, scroll = true) => {
    if (!Number.isSafeInteger(page) || page < 1) return;
    const key = `${page}:${requestedPageSize}`;
    if (requestRef.current?.key === key) return;
    requestRef.current?.controller.abort();
    const controller = new AbortController();
    requestRef.current = { controller, key };
    if (scroll) anchorRef.current = (page - 1) * requestedPageSize;
    setPendingRequest({ page, pageSize: requestedPageSize });
    setError(null);
    setFailedRequest(null);

    try {
      const response = await fetch(
        `/api/players/${encodeURIComponent(steamId)}/inventory?page=${page}&pageSize=${requestedPageSize}`,
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
      if (result.page !== page || result.pageSize !== requestedPageSize || !Array.isArray(result.items) || !Number.isSafeInteger(result.total) || result.total < 0) {
        throw new Error("The inventory returned a different page. Please try again.");
      }
      if (controller.signal.aborted || requestRef.current?.controller !== controller || sourceRef.current !== preview) return;
      setCollection({ source: preview, value: result });
      if (scroll) requestAnimationFrame(() => {
        if (controller.signal.aborted || sourceRef.current !== preview) return;
        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        panelRef.current?.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "start",
        });
      });
    } catch (caught) {
      if (controller.signal.aborted || requestRef.current?.controller !== controller || sourceRef.current !== preview) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "That inventory page could not be loaded.",
      );
      setFailedRequest({ page, pageSize: requestedPageSize });
    } finally {
      if (requestRef.current?.controller === controller) {
        requestRef.current = null;
        setPendingRequest(null);
      }
    }
  }, [preview, steamId]);

  useEffect(() => {
    if (!measured || !inventory.canView || (inventory.pageSize === pageSize && inventory.page === currentPage)) return;
    if (failedRequest?.page === currentPage && failedRequest.pageSize === pageSize) return;
    void loadPage(currentPage, pageSize, false);
  }, [currentPage, failedRequest, inventory.canView, inventory.page, inventory.pageSize, loadPage, measured, pageSize]);

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
            onClick={() => failedRequest && void loadPage(failedRequest.page, failedRequest.pageSize)}
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
      ) : (
        <>
          {pendingPage !== null ? (
          <span className="sr-only" role="status" aria-live="polite">
            Loading inventory page {pendingPage}.
          </span>
          ) : null}
          <ul {...gridProps} className={`profile-inventory-grid${pendingPage !== null ? " is-loading" : ""}`} aria-hidden={pendingPage !== null || undefined} aria-label={`Inventory page ${currentPage} of ${pageCount}`}>
            {pendingPage !== null ? Array.from({ length: pageSize }, (_, index) => (
              <li key={index}>
                <span className="ui-skeleton profile-inventory-artwork-placeholder" />
              </li>
            )) : visibleItems.map((item, index) => {
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
          {pendingPage === null && !items.length ? (
        <div className="profile-inventory-empty">
          <PackageOpen aria-hidden="true" />
          <strong>No available items yet</strong>
          <p>Owned items will appear here as soon as they enter this inventory.</p>
        </div>
          ) : null}
        </>
      )}

      {inventory.canView && inventory.total > pageSize ? (
        <nav className="profile-inventory-pagination market-pagination" aria-label="Profile inventory pages">
          <button
            className="button button-secondary market-page-button"
            type="button"
            disabled={currentPage <= 1 || pendingPage !== null}
            onClick={() => void loadPage(currentPage - 1, pageSize)}
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
                  className={`market-page-number${page === currentPage ? " is-current" : ""}`}
                  aria-current={page === currentPage ? "page" : undefined}
                  aria-label={`Inventory page ${page}`}
                  disabled={pendingPage !== null || page === currentPage}
                  onClick={() => void loadPage(page, pageSize)}
                >
                  {page}
                </button>
              ),
            )}
          </div>
          <button
            className="button button-secondary market-page-button"
            type="button"
            disabled={currentPage >= pageCount || pendingPage !== null}
            onClick={() => void loadPage(currentPage + 1, pageSize)}
          >
            Next <ChevronRight aria-hidden="true" />
          </button>
        </nav>
      ) : null}
    </section>
  );
}
