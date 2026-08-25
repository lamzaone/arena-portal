import Link from "next/link";
import { LogIn } from "lucide-react";

import { SiteHeader } from "@/components/site-header";

export function SignInRequired({ title, description }: { title: string; description: string }) {
  return (
    <main>
      <div className="shell">
        <SiteHeader />
        <section className="empty-state">
          <p className="eyebrow">Private account area</p>
          <h1>{title}</h1>
          <p>{description}</p>
          <Link className="button button-primary" href="/api/auth/steam"><LogIn aria-hidden="true" /> Sign in with Steam</Link>
        </section>
      </div>
    </main>
  );
}
