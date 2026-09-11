import type { Metadata } from "next";
import { Link2 } from "lucide-react";

import { AccountNav } from "@/components/account-nav";
import { SignInRequired } from "@/components/sign-in-required";
import { PageHeading } from "@/components/ui/page-heading";
import { PortalShell } from "@/components/ui/portal-shell";
import { createProfileActionToken, getSession } from "@/lib/auth/session";
import { getDiscordLinkForSteam } from "@/lib/discord/link-service";
import { DiscordLinkForm } from "./link-form";

export const metadata: Metadata = { title: "Link Discord", robots: { index: false, follow: false } };

export default async function DiscordLinkPage() {
  const session = await getSession();
  if (!session) return <SignInRequired title="Link your Discord account" description="Sign in with Steam, then enter the private code from the ARENA Discord bot to connect your accounts." />;
  let link = null;
  let available = true;
  try { link = await getDiscordLinkForSteam(session.steamId); } catch { available = false; }
  return (
    <PortalShell authenticated>
      <AccountNav profileHref={`/players/${session.steamId}`} themeKey={session.profileThemeKey ?? "default"} />
      <PageHeading
        eyebrow={<><Link2 aria-hidden="true" /> Your accounts</>}
        title="Link Discord"
        description="Connect your Discord account to your ARENA player profile."
      />
      <DiscordLinkForm csrf={createProfileActionToken(session)} initialLink={link} available={available} />
    </PortalShell>
  );
}
