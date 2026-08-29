import type { ComponentPropsWithoutRef, ReactNode } from "react";

type NativeTableProps = Omit<
  ComponentPropsWithoutRef<"table">,
  "children" | "className"
>;

export type DataTableProps = NativeTableProps & {
  children: ReactNode;
  /** Classes applied to the horizontal scrolling frame. */
  className?: string;
  /** Classes appended to the shared leaderboard table presentation. */
  tableClassName?: string;
  /** Accessible table caption. It is visually hidden by default. */
  caption?: ReactNode;
};

function classNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

/**
 * Shared semantic table frame. Callers keep ownership of native table
 * children (`thead`, `tbody`, rows, and cells) while the frame provides the
 * established responsive leaderboard presentation.
 */
export function DataTable({
  children,
  className,
  tableClassName,
  caption,
  ...tableProps
}: DataTableProps) {
  return (
    <div className={classNames("leaderboard-scroll", className)}>
      <table
        {...tableProps}
        className={classNames("leaderboard-table", tableClassName)}
      >
        {caption !== undefined && caption !== null ? (
          <caption className="sr-only">{caption}</caption>
        ) : null}
        {children}
      </table>
    </div>
  );
}
