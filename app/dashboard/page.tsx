import { PlayerProfilePage } from "@/components/player-profile-page";
import { SignInRequired } from "@/components/sign-in-required";
import { getSession } from "@/lib/auth/session";
import { getPlayerDashboard } from "@/lib/data/portal-repository";
import { getSteamProfiles } from "@/lib/steam/profiles";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return <SignInRequired title="Your player dashboard" description="Sign in with Steam to securely view your own ARENA profile and history." />;

  const [profile, steamProfiles] = await Promise.all([
    getPlayerDashboard(session.steamId),
    getSteamProfiles([session.steamId])
  ]);

  return <PlayerProfilePage profile={profile} steamId={session.steamId} steamProfile={steamProfiles.get(session.steamId)} isOwnProfile isAuthenticated />;
}
