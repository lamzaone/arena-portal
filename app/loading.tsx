import { LoaderCircle, ShieldCheck } from "lucide-react";

import { SiteHeader } from "@/components/site-header";

export default function Loading() {
  return (
    <main className="portal-route-loading" aria-busy="true">
      <div className="shell">
        <div className="portal-route-loading-navigation">
          <SiteHeader authenticated />
        </div>

        <div className="portal-route-loading-body">
          <section className="portal-route-loading-status" role="status" aria-live="polite">
            <span className="portal-route-loading-emblem" aria-hidden="true">
              <ShieldCheck />
              <LoaderCircle />
            </span>
            <div>
              <p className="eyebrow">Arena portal</p>
              <h1>Loading your arena</h1>
            <p>Syncing the latest player data, listings, and server state…</p>
            </div>
          </section>

          <div className="portal-route-loading-skeleton" aria-hidden="true">
            <span className="portal-route-loading-card portal-route-loading-card-featured" />
            <span className="portal-route-loading-card" />
            <span className="portal-route-loading-card" />
          </div>
        </div>
      </div>
    </main>
  );
}
