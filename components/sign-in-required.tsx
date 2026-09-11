import { LogIn } from "lucide-react";

import { PortalShell } from "@/components/ui/portal-shell";
import { EmptyState } from "@/components/ui/empty-state";

export function SignInRequired({ title, description }: { title: string; description: string }) {
  return (
    <PortalShell className="tapped-page">
      <EmptyState
        headingLevel="h1"
        icon={<LogIn aria-hidden="true" />}
        title={title}
        description={description}
        actions={<a className="button button-primary" href="/api/auth/steam"><LogIn aria-hidden="true" /> Sign in with Steam</a>}
      />
    </PortalShell>
  );
}
