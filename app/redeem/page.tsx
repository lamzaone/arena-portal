import { TicketCheck } from "lucide-react";

import { RedeemCodeForm } from "@/components/economy/redeem-code-form";
import { SignInRequired } from "@/components/sign-in-required";
import { SiteHeader } from "@/components/site-header";
import { createEconomyActionToken, getSession } from "@/lib/auth/session";

export default async function RedeemPage() {
  const session = await getSession();
  if (!session)
    return (
      <SignInRequired
        title="Redeem Token rewards"
        description="Sign in with Steam to claim Tokens, cases, skins, and other cosmetic rewards."
      />
    );
  return (
    <main>
      <div className="shell">
        <SiteHeader authenticated />
        <section className="page-heading redeem-page-heading">
          <div>
            <p className="eyebrow">
              <TicketCheck aria-hidden="true" /> Token rewards
            </p>
            <h1>Redeem</h1>
            <p>Claim a server or community reward code once, from anywhere.</p>
          </div>
        </section>
        <RedeemCodeForm csrf={createEconomyActionToken(session)} />
      </div>
    </main>
  );
}
