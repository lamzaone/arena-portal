import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";

type PortalShellProps = {
  children: ReactNode;
  authenticated?: boolean;
  className?: string;
  navigation?: ReactNode;
};

export function PortalShell({
  children,
  authenticated = false,
  className = "",
  navigation,
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
        {navigation ? (
          <div className="portal-workspace-layout">
            {navigation}
            <div className="portal-workspace-content">{children}</div>
          </div>
        ) : children}
      </div>
    </main>
  );
}
