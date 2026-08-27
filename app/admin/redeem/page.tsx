import Link from "next/link";
import { LockKeyhole, TicketCheck } from "lucide-react";

import { RedeemCodeAdmin } from "@/components/economy/redeem-code-admin";
import { SignInRequired } from "@/components/sign-in-required";
import { SiteHeader } from "@/components/site-header";
import { getAdminAccess } from "@/lib/admin/access";
import { createAdminActionToken, getSession } from "@/lib/auth/session";
import {
  getEconomyCatalogue,
  getEconomyRedeemCodes,
} from "@/lib/data/portal-repository";

type RedeemCodeAdminPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function RedeemCodeAdminPage({
  searchParams,
}: RedeemCodeAdminPageProps) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session)
    return (
      <SignInRequired
        title="Redeem-code administration"
        description="Sign in with a staff account to build and manage Token reward codes."
      />
    );
  const access = await getAdminAccess(session.steamId);
  if (!access.canManageEconomy)
    return (
      <main className="tapped-page">
        <div className="shell">
          <SiteHeader authenticated />
          <section className="staff-denied">
            <LockKeyhole aria-hidden="true" />
            <p className="tapped-kicker">Restricted area</p>
            <h1>Economy management required.</h1>
            <p>Your staff role cannot create or alter Token redeem campaigns.</p>
            <Link className="button button-secondary" href="/admin/items">Back to item management</Link>
          </section>
        </div>
      </main>
    );
  const searchQuery = (params.q ?? "").trim().slice(0, 100);
  const [catalogue, codePage] = await Promise.all([
    getEconomyCatalogue({ query: searchQuery || undefined, pageSize: 100 }),
    getEconomyRedeemCodes({ pageSize: 100 }),
  ]);
  return (
    <main className="tapped-page">
      <div className="shell">
        <SiteHeader authenticated />
        <nav className="staff-tabs" aria-label="Economy administration">
          <Link href="/admin">Staff panel</Link>
          <Link href="/admin/items">Items</Link>
          <Link className="active" href="/admin/redeem"><TicketCheck aria-hidden="true" /> Redeem codes</Link>
        </nav>
        <RedeemCodeAdmin
          csrf={createAdminActionToken(session)}
          catalogue={catalogue.items}
          codes={codePage.codes}
          searchQuery={searchQuery}
        />
      </div>
    </main>
  );
}
