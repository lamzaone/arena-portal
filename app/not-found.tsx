import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { PortalShell } from "@/components/ui/portal-shell";

export default function NotFoundPage() {
  return (
    <PortalShell className="tapped-page ui-error-page">
      <EmptyState
        headingLevel="h1"
        className="ui-route-error-state"
        icon={<SearchX aria-hidden="true" />}
        title="That portal page does not exist."
        description="The address may be outdated, or the page may have moved to another part of the ARENA portal."
        actions={
          <Link className="button button-primary" href="/">
            <ArrowLeft aria-hidden="true" /> Back home
          </Link>
        }
      />
    </PortalShell>
  );
}
