import { TicketCheck } from "lucide-react";

import { RedeemCodeForm } from "@/components/economy/redeem-code-form";
import { SignInRequired } from "@/components/sign-in-required";
import { PageHeading } from "@/components/ui/page-heading";
import { PortalShell } from "@/components/ui/portal-shell";
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
    <PortalShell authenticated className="tapped-page">
      <PageHeading
        className="redeem-page-heading"
        eyebrow={<><TicketCheck aria-hidden="true" /> Token rewards</>}
        title="Redeem"
        description="Claim a server or community reward code once, from anywhere."
      />
      <RedeemCodeForm csrf={createEconomyActionToken(session)} />
    </PortalShell>
  );
}
