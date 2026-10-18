import Link from "next/link";
import { Ban, CircleAlert, LogOut, ShieldCheck, VolumeX } from "lucide-react";
import type { AdminAccess } from "@/lib/admin/access";
import { availableProfileModerationActions } from "@/lib/moderation/profile-policy";
import { canManageWarnings } from "@/lib/moderation/warning-policy";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import styles from "./profile-staff-controls.module.css";

export function ProfileStaffControls({ steamId, displayName, access, csrf, online, writesReady, notice, error }: {
  steamId: string; displayName: string; access: AdminAccess; csrf: string;
  online: boolean; writesReady: boolean; notice?: string; error?: string;
}) {
  const actions = availableProfileModerationActions(access, online);
  const canWarn = canManageWarnings(access, "issue");
  const groups = [
    ...(access.canManageAdmins ? [{ key: "admin", label: "Admin groups" }] : []),
    ...(access.canManageVips ? [{ key: "vip", label: "VIP groups" }] : []),
    ...(access.canManageGroups ? [{ key: "custom", label: "Custom groups" }] : []),
  ];
  if (!actions.length && !canWarn && !groups.length) return null;
  const errors: Record<string, string> = {
    "immunity": "This player's immunity is higher than yours.", "player-offline": "The player is no longer online. Refresh before trying again.",
    "writes-disabled": "Server moderation is currently unavailable.", "verification": "This form expired. Refresh and try again.",
    "ban-details": "Enter a reason and a duration between 0 and 525600 minutes.",
    "Verification failed.": "This form expired. Refresh and try again.",
    "Moderation writes are disabled.": "Server moderation is currently unavailable.",
    "Your server assignment and warn/unwarn permissions do not allow this action.": "Issuing warnings requires warn permission and an active assignment on this server.",
    "The player has higher immunity.": "This player's immunity is higher than yours.",
    "Provide a reason between 2 and 500 characters.": "Enter a reason of at least 2 characters.",
    "Invalid warning details.": "Warnings require at least 1 minute and at most 525600 minutes. Check the reason and try again.",
  };
  return <section className={styles.panel} aria-labelledby="profile-staff-title">
    <header><ShieldCheck aria-hidden="true" /><div><h2 id="profile-staff-title">Staff controls</h2><p>Moderate {displayName} or update their memberships.</p></div><span data-online={online}>{online ? "On server" : "Offline"}</span></header>
    {notice && /^(ban|kick|gag|mute|silence)-queued-\d+$/.test(notice) ? <p role="status">Action queued for the server.</p> : null}
    {notice === "Warning issued. The player must acknowledge it in game." ? <p role="status">Warning issued. The player must acknowledge it in game.</p> : null}
    {error ? <p role="alert">{(Object.hasOwn(errors, error) ? errors[error] : undefined) ?? "This action could not be completed with your current access. Refresh and try again."}</p> : null}
    {actions.length || canWarn ? <form action="/api/admin/moderation" method="post">
      <input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="steamId" value={steamId} /><input type="hidden" name="playerName" value={displayName} />
      {canWarn ? <input type="hidden" name="id" value={crypto.randomUUID()} /> : null}
      <div className={styles.fields}><label>Reason<input name="reason" required minLength={2} maxLength={200} placeholder="Reason shown to the player" /></label><label>Duration (minutes)<input name="durationMinutes" aria-label="Duration (minutes)" type="number" min="0" max="525600" defaultValue="60" required /><small>{canWarn ? "Warnings require at least 1 minute. " : ""}0 = permanent for bans and communication restrictions. Kick takes effect immediately.</small></label></div>
      <div className={styles.actions}>{actions.map(action => <ConfirmSubmitButton key={action} className={action === "ban" || action === "kick" ? "staff-danger-button" : "staff-unban-button"} name="action" value={action} disabled={!writesReady} confirmation={`${action[0].toUpperCase() + action.slice(1)} ${displayName}?`}>
        {action === "ban" ? <Ban aria-hidden="true" /> : action === "kick" ? <LogOut aria-hidden="true" /> : <VolumeX aria-hidden="true" />}{action[0].toUpperCase() + action.slice(1)}
      </ConfirmSubmitButton>)}{canWarn ? <ConfirmSubmitButton className="staff-unban-button" formAction="/api/admin/warnings" name="action" value="issue" disabled={!writesReady} confirmation={`Warn ${displayName}? The warning will be saved and must be acknowledged in game.`}><CircleAlert aria-hidden="true" />Warn</ConfirmSubmitButton> : null}</div>
    </form> : null}
    {groups.length ? <div className={styles.groups}><span>Add, edit, extend or remove memberships</span>{groups.map(group => <Link className="button button-secondary" key={group.key} href={`/admin/groups?tab=${group.key}&player=${steamId}`}>{group.label}</Link>)}</div> : null}
  </section>;
}
