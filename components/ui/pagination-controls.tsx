"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  label: string;
  disabled?: boolean;
};

function pageWindow(current: number, total: number) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const ordered = [...pages]
    .filter((page) => page >= 1 && page <= total)
    .sort((left, right) => left - right);
  const result: Array<number | "ellipsis"> = [];
  for (const page of ordered) {
    const previous = result[result.length - 1];
    if (typeof previous === "number" && page - previous > 1)
      result.push("ellipsis");
    result.push(page);
  }
  return result;
}

export function PaginationControls({
  page,
  pageSize,
  totalItems,
  onPageChange,
  label,
  disabled = false,
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1) return null;
  const currentPage = Math.min(Math.max(1, page), totalPages);

  return (
    <nav className="market-pagination" aria-label={label}>
      <button
        type="button"
        className="button button-secondary market-page-button"
        disabled={disabled || currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        <ChevronLeft aria-hidden="true" /> Previous
      </button>
      <div className="market-page-list">
        {pageWindow(currentPage, totalPages).map((entry, index) =>
          entry === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="market-page-ellipsis"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              className={`market-page-number${entry === currentPage ? " is-current" : ""}`}
              aria-label={`Page ${entry}`}
              aria-current={entry === currentPage ? "page" : undefined}
              disabled={disabled}
              onClick={() => onPageChange(entry)}
            >
              {entry}
            </button>
          ),
        )}
      </div>
      <button
        type="button"
        className="button button-secondary market-page-button"
        disabled={disabled || currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        Next <ChevronRight aria-hidden="true" />
      </button>
    </nav>
  );
}
