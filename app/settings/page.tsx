import { Settings2 } from "lucide-react";

import { ProfileSettingsForm } from "@/components/profile-settings-form";
import { SignInRequired } from "@/components/sign-in-required";
import { PageHeading } from "@/components/ui/page-heading";
import { PortalShell } from "@/components/ui/portal-shell";
import {
  createProfileActionToken,
  getSession,
} from "@/lib/auth/session";
import { getPlayerSettings } from "@/lib/data/portal-repository";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session)
    return (
      <SignInRequired
        title="Profile settings"
        description="Sign in with Steam to manage inventory privacy and profile customisation."
      />
    );

  const settings = await getPlayerSettings(session.steamId);
  return (
    <PortalShell authenticated className="tapped-page settings-page">
      <PageHeading
        eyebrow={
          <>
            <Settings2 aria-hidden="true" /> Account preferences
          </>
        }
        title="Settings & customisation"
        description="Control who can browse your inventory and choose the profile presentation attached to your account."
      />
      <ProfileSettingsForm
        csrf={createProfileActionToken(session)}
        initialSettings={{
          inventoryVisibility: settings.inventoryVisibility,
          activeThemeId: settings.activeThemeId,
          ownedThemes: settings.ownedThemes,
        }}
      />
    </PortalShell>
  );
}
