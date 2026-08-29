"use client";

import { Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";

type ProfileSettingsToggleProps = {
  open: boolean;
};

/** A real button so pressed/expanded semantics and Space activation work. */
export function ProfileSettingsToggle({ open }: ProfileSettingsToggleProps) {
  const router = useRouter();
  const label = open ? "Close profile settings" : "Open profile settings";

  return (
    <button
      className={`profile-avatar-settings-toggle${open ? " is-active" : ""}`}
      type="button"
      aria-label={label}
      aria-pressed={open}
      aria-expanded={open}
      aria-controls="profile-settings-view"
      title={label}
      onClick={() => router.push(open ? "/dashboard" : "/dashboard?settings=1")}
    >
      <Settings2 aria-hidden="true" />
    </button>
  );
}
