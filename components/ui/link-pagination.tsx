import Link, { type LinkProps } from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type LinkPaginationProps = {
  /** Current one-based page. Values outside the available range are clamped. */
  page: number;
  /** Total number of pages. Values below one are normalized to one. */
  totalPages: number;
  /** Builds the destination for an enabled page control. */
  hrefForPage: (page: number) => LinkProps["href"];
  /** Accessible label for the pagination navigation landmark. */
  label: string;
  className?: string;
  /** Passed to Next.js links. Defaults to false to preserve page context. */
  scroll?: LinkProps["scroll"];
  /** Passed to Next.js links when an explicit prefetch policy is needed. */
  prefetch?: LinkProps["prefetch"];
};

function classNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

/**
 * Server-friendly previous/next pagination. Unavailable controls are inert
 * spans, so disabled pages never remain focusable or navigable links.
 */
export function LinkPagination({
  page,
  totalPages,
  hrefForPage,
  label,
  className,
  scroll = false,
  prefetch,
}: LinkPaginationProps) {
  const normalizedTotal = Math.max(1, Math.trunc(totalPages) || 1);
  const currentPage = Math.min(
    normalizedTotal,
    Math.max(1, Math.trunc(page) || 1),
  );
  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < normalizedTotal;
  const controlClassName = "pagination-link";

  return (
    <nav className={classNames("pagination", className)} aria-label={label}>
      {hasPrevious ? (
        <Link
          className={controlClassName}
          href={hrefForPage(currentPage - 1)}
          scroll={scroll}
          prefetch={prefetch}
        >
          <ChevronLeft aria-hidden="true" /> Previous
        </Link>
      ) : (
        <span
          className={`${controlClassName} is-disabled`}
          aria-disabled="true"
        >
          <ChevronLeft aria-hidden="true" /> Previous
        </span>
      )}

      <span aria-current="page">
        Page {currentPage} of {normalizedTotal}
      </span>

      {hasNext ? (
        <Link
          className={controlClassName}
          href={hrefForPage(currentPage + 1)}
          scroll={scroll}
          prefetch={prefetch}
        >
          Next <ChevronRight aria-hidden="true" />
        </Link>
      ) : (
        <span
          className={`${controlClassName} is-disabled`}
          aria-disabled="true"
        >
          Next <ChevronRight aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}
