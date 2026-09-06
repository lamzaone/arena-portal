"use client";

import { useEffect, useRef, useTransition, type ReactNode, Children } from "react";
import { useRouter } from "next/navigation";
import { useItemGridLayout } from "@/components/economy/item-grid";
import { PaginationControls } from "@/components/ui/pagination-controls";

/** Server-rendered item cards with one responsive, filter-preserving pager. */
export function ServerItemGrid({ children, className, label, page, pageSize, total, href,
  pageParameter = "page", sizeParameter = "pageSize" }: {
  children: ReactNode;
  className?: string;
  label: string;
  page: number;
  pageSize: number;
  total: number;
  href: string;
  pageParameter?: string;
  sizeParameter?: string;
}) {
  const router = useRouter();
  const { gridProps, pageSize: capacity, measured } = useItemGridLayout();
  const [pending, startTransition] = useTransition();
  const requestedHref = useRef<string | null>(null);
  const items = Children.toArray(children);
  const start = (page - 1) * pageSize;
  const visibleItems = items.slice(0, capacity);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const syncing = measured && (capacity !== pageSize || page > lastPage);

  function destination(targetPage: number, targetSize: number) {
    const url = new URL(href, "https://portal.invalid");
    url.searchParams.set(pageParameter, String(targetPage));
    url.searchParams.set(sizeParameter, String(targetSize));
    return `${url.pathname}${url.search}${url.hash}`;
  }

  const targetPage = Math.min(Math.max(1, Math.ceil(total / capacity)), Math.floor(start / capacity) + 1);
  const resizeHref = syncing ? destination(targetPage, capacity) : null;
  useEffect(() => {
    if (!resizeHref) { requestedHref.current = null; return; }
    if (requestedHref.current === resizeHref) return;
    requestedHref.current = resizeHref;
    startTransition(() => router.replace(resizeHref, { scroll: false }));
  }, [resizeHref, router]);

  return (
    <div className="item-grid-section" aria-busy={pending || syncing}>
      <div {...gridProps} className={className} aria-label={label}>{visibleItems}</div>
      <p className="item-grid-count" role="status">
        {visibleItems.length ? `${start + 1}–${Math.min(total, start + visibleItems.length)} of ${total}` : syncing ? "Refreshing items…" : "No items on this page"}
      </p>
      <PaginationControls label={`${label} pages`} page={page} pageSize={pageSize} totalItems={total}
        disabled={pending || syncing}
        onPageChange={(targetPage) => startTransition(() => router.push(destination(targetPage, capacity), { scroll: false }))} />
    </div>
  );
}
