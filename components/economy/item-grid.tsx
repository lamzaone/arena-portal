"use client";

import { Children, useCallback, useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { ITEM_GRID_MAX_ROWS, itemGridColumns } from "@/lib/economy/item-grid-layout";

/** Measure the actual container, including side panels, instead of the viewport. */
export function useItemGridLayout() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [layout, setLayout] = useState({ columns: 1, measured: false });
  const ref = useCallback((node: HTMLElement | null) => setElement(node), []);

  useLayoutEffect(() => {
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const width = element.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      if (width <= 0) return;
      const columns = itemGridColumns(width);
      setLayout((current) => current.measured && current.columns === columns ? current : { columns, measured: true });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return {
    ...layout,
    pageSize: layout.columns * ITEM_GRID_MAX_ROWS,
    gridProps: {
      ref,
      "data-item-grid": "true",
      style: { "--item-grid-columns": layout.columns } as CSSProperties,
    },
  };
}

/** Local item collections keep selection in their parent while only mounting a page. */
export function PaginatedItemGrid({ children, className, label, resetKey = "", as: Tag = "div" }: {
  children: ReactNode;
  className?: string;
  label: string;
  resetKey?: string;
  as?: "div" | "ul";
}) {
  const { gridProps, pageSize } = useItemGridLayout();
  const items = Children.toArray(children);
  const [position, setPosition] = useState({ key: resetKey, offset: 0 });
  const offset = position.key === resetKey ? position.offset : 0;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(pageCount, Math.floor(offset / pageSize) + 1);
  const start = (page - 1) * pageSize;

  useEffect(() => {
    if (position.key !== resetKey || offset >= items.length && offset > 0)
      setPosition({ key: resetKey, offset: start });
  }, [items.length, offset, position.key, resetKey, start]);

  return (
    <div className="item-grid-section">
      <Tag {...gridProps} className={className} aria-label={label}>
        {items.slice(start, start + pageSize)}
      </Tag>
      {items.length > pageSize ? (
        <>
          <p className="item-grid-count" role="status">{start + 1}–{Math.min(items.length, start + pageSize)} of {items.length}</p>
          <PaginationControls page={page} pageSize={pageSize} totalItems={items.length} label={`${label} pages`}
            onPageChange={(next) => setPosition({ key: resetKey, offset: (next - 1) * pageSize })} />
        </>
      ) : null}
    </div>
  );
}
