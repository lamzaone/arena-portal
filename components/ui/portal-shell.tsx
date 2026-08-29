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
  return (
    <main className={className}>
      <div className="shell">
        <SiteHeader authenticated={authenticated} />
        {children}
      </div>
    </main>
  );
}
