import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";

type PortalShellProps = {
  children: ReactNode;
  authenticated?: boolean;
  className?: string;
};

export function PortalShell({
  children,
  authenticated = false,
  className = "",
}: PortalShellProps) {
  const rootClassName = [
    ...new Set(["tapped-page", "portal-page", ...className.split(/\s+/)]),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className={rootClassName} data-page-shell="portal" data-ui="portal-page">
      <div className="shell">
        <SiteHeader authenticated={authenticated} />
        {children}
      </div>
    </main>
  );
}
