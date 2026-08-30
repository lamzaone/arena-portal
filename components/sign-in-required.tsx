import { LogIn } from "lucide-react";

import { PortalShell } from "@/components/ui/portal-shell";

export function SignInRequired({ title, description }: { title: string; description: string }) {
  return (
    <PortalShell className="tapped-page">
      <section className="empty-state">
        <p className="eyebrow">Private account area</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <a className="button button-primary" href="/api/auth/steam"><LogIn aria-hidden="true" /> Sign in with Steam</a>
      </section>
    </PortalShell>
  );
}
