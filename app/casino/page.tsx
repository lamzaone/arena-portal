import { PortalShell } from "@/components/ui/portal-shell";
import { SignInRequired } from "@/components/sign-in-required";
import { CasinoLobby } from "@/components/casino/casino-lobby";
import { createEconomyActionToken, getSession } from "@/lib/auth/session";
import { getCasinoBootstrap } from "@/lib/data/casino-repository";
import { getTokenWallet } from "@/lib/data/portal-repository";
import { buildPageMetadata } from "@/lib/seo/site";
import "./casino.css";

export const metadata = { ...buildPageMetadata("/casino"), robots: { index: false, follow: false } };

export default async function CasinoPage() {
  const session = await getSession();
  if (!session) return <SignInRequired title="Token Casino" description="Sign in with Steam to play casino games with your existing Tokens." />;
  let initial;
  try { initial = await getCasinoBootstrap(session.steamId); }
  catch {
    const wallet = await getTokenWallet(session.steamId).catch(() => null);
    return <PortalShell authenticated><section className="casino casino-unavailable" data-theme={session.profileThemeKey || "default"} data-theme-surface="global"><p className="casino-kicker">Player economy / casino</p><h1>Tables are temporarily unavailable.</h1><p>We couldn’t open the casino right now. Please try again later.</p>{wallet && <p className="casino-wallet-fallback">Available Tokens <strong>{wallet.balance.toLocaleString("en-US")}</strong></p>}<a href="/market">Visit the Token Market →</a></section></PortalShell>;
  }
  return <PortalShell authenticated><CasinoLobby initial={initial} steamId={session.steamId} csrf={createEconomyActionToken(session)} themeKey={session.profileThemeKey} /></PortalShell>;
}
