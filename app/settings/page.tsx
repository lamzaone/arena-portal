import { redirect } from "next/navigation";

import { SignInRequired } from "@/components/sign-in-required";
import { getSession } from "@/lib/auth/session";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) {
    return (
      <SignInRequired
        title="Profile settings"
        description="Sign in with Steam to manage your profile settings."
      />
    );
  }

  redirect(`/players/${session.steamId}?settings=1`);
}
