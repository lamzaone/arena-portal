import { randomUUID } from "node:crypto";

import Link from "next/link";
import type { CSSProperties } from "react";
import {
  BadgeCheck,
  Crown,
  Gift,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Star,
  Tags,
  UsersRound,
} from "lucide-react";

import { PlayerSearchField } from "@/components/player-search-field";
import { CatalogueSearchField } from "@/components/economy/catalogue-search-field";
import { SignInRequired } from "@/components/sign-in-required";
import { SiteHeader } from "@/components/site-header";
import { StaffSubmenu } from "@/components/staff-submenu";
import { PortalToast } from "@/components/success-toast";
import { getAdminAccess } from "@/lib/admin/access";
import { createAdminActionToken, getSession } from "@/lib/auth/session";
import {
  getIdentityAdminSnapshot,
  identityGroupStorageConfigured,
  type IdentityAdminSnapshot,
  type IdentityGroup,
} from "@/lib/data/identity-groups";

type GroupsPageProps = {
  searchParams: Promise<{ notice?: string; error?: string }>;
};

const chatColors = [
  "[default]",
  "[white]",
  "[silver]",
  "[red]",
  "[lightred]",
  "[orange]",
  "[gold]",
  "[yellow]",
  "[lime]",
  "[green]",
  "[blue]",
  "[lightblue]",
  "[purple]",
  "[lightpurple]",
  "[teamcolor]",
];

const noticeMessages: Record<string, string> = {
  "group-created": "Custom group created.",
  "group-updated": "Group presentation saved.",
  "group-archived": "Custom group archived and its active memberships revoked.",
  "membership-assigned": "Group membership assigned and missing rewards delivered.",
  "membership-removed": "Custom group membership revoked.",
  "tag-created": "Chat tag created.",
  "tag-updated": "Chat tag saved.",
  "group-tag-attached": "Chat tag attached to the group.",
  "group-tag-detached": "Chat tag detached from the group.",
  "player-tag-granted": "Player tag granted.",
  "player-tag-revoked": "Player tag revoked.",
  "privilege-created": "Privilege definition created.",
  "privilege-updated": "Privilege definition saved.",
  "group-privilege-attached": "Privilege granted to the group.",
  "group-privilege-detached": "Privilege removed from the group.",
  "player-privilege-granted": "Direct player privilege granted.",
  "player-privilege-revoked": "Direct player privilege revoked.",
  "reward-added": "Group reward added and delivered to current custom members.",
  "reward-retired": "Group reward retired. Previously awarded items were retained.",
};

const errorMessages: Record<string, string> = {
  verification: "The form expired. Refresh this page and try again.",
  "founder-required": "Only the externally assigned Founder can manage identity groups.",
  founder_required: "Only the externally assigned Founder can manage identity groups.",
  invalid_input: "Review the submitted fields and try again.",
  group_not_found: "That group no longer exists.",
  custom_group_required: "Only custom groups accept portal-managed memberships.",
  external_group: "External Admins.Core and VIPCore adapters cannot be archived.",
  definition_not_found: "The selected tag or privilege is unavailable.",
  reward_exists: "That catalogue item is already an active reward for this group.",
  catalogue_not_found: "The selected catalogue item is unavailable.",
  reserved_privilege: "Founder and unrestricted wildcard authority are reserved.",
  request_replayed: "That action was already submitted. Refresh before trying again.",
  storage_unavailable: "The portal identity database is not configured.",
  database: "The identity action could not be saved. Apply migration 012 and check the portal database.",
};

function MutationFields({
  csrf,
  action,
}: {
  csrf: string;
  action?: string;
}) {
  return (
    <>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="requestKey" value={randomUUID()} />
      {action ? <input type="hidden" name="action" value={action} /> : null}
    </>
  );
}

function GroupOption({ group }: { group: IdentityGroup }) {
  return (
    <option value={group.id}>
      {group.displayName} · {group.sourceType === "custom" ? "Custom" : group.sourceType}
    </option>
  );
}

function GroupCard({
  group,
  snapshot,
  csrf,
}: {
  group: IdentityGroup;
  snapshot: IdentityAdminSnapshot;
  csrf: string;
}) {
  const BadgeIcon = group.badgeIconKey === "crown"
    ? Crown
    : group.badgeIconKey === "star"
      ? Star
      : group.badgeIconKey === "badge"
        ? BadgeCheck
        : ShieldCheck;
  return (
    <article className="staff-group-card">
      <div>
        <h3>
          <span
            className="role-badge role-badge-admin"
            style={{
              "--role-color": group.badgeColor,
              "--role-soft": group.badgeSoftColor,
            } as CSSProperties}
          >
            <BadgeIcon aria-hidden="true" /> {group.badgeLabel}
          </span>{" "}
          {group.displayName}
        </h3>
        <span>
          {group.sourceType === "custom" ? "Custom" : group.sourceType} · {group.memberCount} portal member
          {group.memberCount === 1 ? "" : "s"}
        </span>
      </div>

      <form className="staff-management-form" action="/api/admin/groups" method="post">
        <MutationFields csrf={csrf} />
        <input type="hidden" name="groupId" value={group.id} />
        <label>
          Display name
          <input name="displayName" defaultValue={group.displayName} maxLength={100} required />
        </label>
        <label>
          Description
          <input name="description" defaultValue={group.description ?? ""} maxLength={255} />
        </label>
        <label>
          Badge label
          <input name="badgeLabel" defaultValue={group.badgeLabel} maxLength={32} required />
        </label>
        <label>
          Badge icon
          <select name="badgeIconKey" defaultValue={group.badgeIconKey}>
            <option value="shield">Shield</option>
            <option value="crown">Crown</option>
            <option value="star">Star</option>
            <option value="badge">Badge</option>
          </select>
        </label>
        <label>
          Accent
          <input name="badgeColor" type="color" defaultValue={group.badgeColor} required />
        </label>
        <label>
          Badge background
          <input name="badgeSoftColor" type="color" defaultValue={group.badgeSoftColor} required />
        </label>
        <label>
          Profile priority
          <input name="profilePriority" type="number" min="-32768" max="32767" defaultValue={group.profilePriority} required />
        </label>
        <label>
          Status
          <select name="enabled" defaultValue={group.enabled ? "true" : "false"}>
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </label>
        <button className="button button-primary" name="action" value="group-update" type="submit">
          Save group
        </button>
        {group.sourceType === "custom" ? (
          <button className="staff-danger-button" name="action" value="group-archive" type="submit">
            Archive
          </button>
        ) : null}
      </form>

      <details>
        <summary>Tags, privileges, rewards, and members</summary>
        <div className="staff-group-list">
          <form className="staff-management-form" action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} />
            <input type="hidden" name="groupId" value={group.id} />
            <label>
              Chat tag
              <select name="tagId" required defaultValue="">
                <option value="" disabled>Choose a tag</option>
                {snapshot.tags.filter((tag) => tag.enabled).map((tag) => <option key={tag.id} value={tag.id}>{tag.text}</option>)}
              </select>
            </label>
            <label>
              Order
              <input name="sortOrder" type="number" min="0" max="65535" defaultValue="0" required />
            </label>
            <button className="staff-unban-button" name="action" value="group-tag-attach" type="submit">Attach tag</button>
            <button className="staff-danger-button" name="action" value="group-tag-detach" type="submit">Detach tag</button>
          </form>
          <p>{group.tags.length ? group.tags.map((tag) => tag.text).join(" · ") : "No group tag. Chat remains untagged."}</p>

          <form className="staff-management-form" action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} />
            <input type="hidden" name="groupId" value={group.id} />
            <label>
              Privilege
              <select name="privilegeId" required defaultValue="">
                <option value="" disabled>Choose a privilege</option>
                {snapshot.privileges.filter((privilege) => privilege.enabled).map((privilege) => <option key={privilege.id} value={privilege.id}>{privilege.displayName} · {privilege.scope}</option>)}
              </select>
            </label>
            <button className="staff-unban-button" name="action" value="group-privilege-attach" type="submit">Grant privilege</button>
            <button className="staff-danger-button" name="action" value="group-privilege-detach" type="submit">Remove privilege</button>
          </form>
          <p>{group.privileges.length ? group.privileges.map((privilege) => privilege.key).join(" · ") : "No additional portal-managed privileges."}</p>

          <form className="staff-management-form" action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} action="reward-add" />
            <input type="hidden" name="groupId" value={group.id} />
            <CatalogueSearchField
              id={`group-${group.id}-reward-catalogue`}
              name="catalogueId"
              label="Find a reward item"
              required
            />
            <label>
              Quantity
              <input name="quantity" type="number" min="1" max="25" defaultValue="1" required />
            </label>
            <label>
              Trade policy
              <select name="tradePolicy" defaultValue="account_bound">
                <option value="account_bound">Account-bound</option>
                <option value="tradable">Tradable</option>
              </select>
            </label>
            <button className="button button-primary" type="submit"><Gift aria-hidden="true" /> Add reward</button>
          </form>
          {group.rewards.filter((reward) => reward.enabled).map((reward) => (
            <form className="staff-admin-edit" action="/api/admin/groups" method="post" key={reward.id}>
              <MutationFields csrf={csrf} action="reward-retire" />
              <input type="hidden" name="rewardId" value={reward.id} />
              <span>{reward.quantity}× {reward.catalogueName}</span>
              <span>{reward.tradePolicy === "tradable" ? "Tradable" : "Account-bound"}</span>
              <button className="staff-danger-button" type="submit">Retire</button>
            </form>
          ))}

          {group.memberships.map((membership) => (
            <form className="staff-admin-edit" action="/api/admin/groups" method="post" key={membership.steamId}>
              <MutationFields csrf={csrf} action="membership-remove" />
              <input type="hidden" name="groupId" value={group.id} />
              <input type="hidden" name="steamId" value={membership.steamId} />
              <Link href={`/players/${membership.steamId}`}>{membership.steamId}</Link>
              <span>{membership.expiresAt ? `Until ${new Date(membership.expiresAt).toLocaleDateString()}` : "Permanent"}</span>
              <button className="staff-danger-button" type="submit">Remove</button>
            </form>
          ))}
        </div>
      </details>
    </article>
  );
}

export default async function GroupsPage({ searchParams }: GroupsPageProps) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session) {
    return <SignInRequired title="Identity groups" description="Sign in with the Founder Steam account to manage groups, tags, privileges, and rewards." />;
  }
  const access = await getAdminAccess(session.steamId);
  if (!access.isAdmin || !access.isFounder || !access.canManageGroups) {
    return (
      <main className="tapped-page">
        <div className="shell">
          <SiteHeader authenticated />
          <section className="staff-denied">
            <LockKeyhole aria-hidden="true" />
            <p className="tapped-kicker">Founder restricted</p>
            <h1>Identity group access denied.</h1>
            <p>Only the exact Founder assignment from Admins.Core on this server can open this control surface.</p>
            <Link className="button button-secondary" href={`/players/${session.steamId}`}>Back to profile</Link>
          </section>
        </div>
      </main>
    );
  }

  let snapshot: IdentityAdminSnapshot = {
    groups: [],
    tags: [],
    privileges: [],
    directTagGrants: [],
    directPrivilegeGrants: [],
  };
  let storageError = !identityGroupStorageConfigured();
  if (!storageError) {
    try {
      snapshot = await getIdentityAdminSnapshot();
    } catch {
      storageError = true;
    }
  }
  const csrf = createAdminActionToken(session);
  const customGroups = snapshot.groups.filter((group) => group.sourceType === "custom" && group.enabled);
  const notice = params.notice ? noticeMessages[params.notice] : null;
  const error = params.error ? errorMessages[params.error] ?? "The identity action could not be completed." : null;

  return (
    <main className="tapped-page staff-page">
      <div className="shell">
        <SiteHeader authenticated />
        <section className="staff-hero">
          <div>
            <p className="tapped-kicker"><UsersRound aria-hidden="true" /> Identity control</p>
            <h1>Groups &amp;<br /><span>privileges.</span></h1>
            <p>Create custom identities, connect stable chat tags, assign tightly scoped privileges, and deliver catalogue-backed rewards.</p>
          </div>
          <aside className="staff-access-card">
            <span>ROOT AUTHORITY</span>
            <strong>FOUNDER</strong>
            <small>Anchored to Admins.Core · Portal groups cannot grant this role</small>
          </aside>
        </section>
        <StaffSubmenu access={access} active="groups" />
        {notice ? <PortalToast message={notice} /> : null}
        {error ? <PortalToast variant="danger" message={error} /> : null}
        {storageError ? <PortalToast variant="danger" message="Identity storage is unavailable. Apply db/012_identity_groups.sql to the portal database." /> : null}

        <section className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><ShieldCheck aria-hidden="true" /> Custom identity</p><h2>Create a group</h2></div><span>{customGroups.length} custom groups</span></div>
          <form className="staff-management-form" action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} action="group-create" />
            <label>Stable key<input name="groupKey" pattern="[a-z0-9][a-z0-9._:-]{0,63}" maxLength={64} required placeholder="beta_testers" /></label>
            <label>Display name<input name="displayName" maxLength={100} required placeholder="Beta Testers" /></label>
            <label>Description<input name="description" maxLength={255} placeholder="What this group represents" /></label>
            <label>Badge label<input name="badgeLabel" maxLength={32} required placeholder="BETA" /></label>
            <label>Badge icon<select name="badgeIconKey" defaultValue="shield"><option value="shield">Shield</option><option value="crown">Crown</option><option value="star">Star</option><option value="badge">Badge</option></select></label>
            <label>Accent<input name="badgeColor" type="color" defaultValue="#f0b35a" required /></label>
            <label>Badge background<input name="badgeSoftColor" type="color" defaultValue="#ffe4b8" required /></label>
            <label>Profile priority<input name="profilePriority" type="number" min="-32768" max="32767" defaultValue="0" required /></label>
            <button className="button button-primary" type="submit">Create group</button>
          </form>
        </section>

        <section className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><UsersRound aria-hidden="true" /> Membership</p><h2>Assign a custom group</h2></div><span>Founder audited</span></div>
          <form className="staff-management-form" action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} />
            <PlayerSearchField name="steamId" label="Player" mode="target" required includeSelf />
            <label>Custom group<select name="groupId" required defaultValue=""><option value="" disabled>Choose a group</option>{customGroups.map((group) => <GroupOption key={group.id} group={group} />)}</select></label>
            <label>Duration (minutes)<input name="durationMinutes" type="number" min="0" max="525600" defaultValue="0" required /><small>0 is permanent.</small></label>
            <label>Reason<input name="reason" maxLength={180} placeholder="Optional internal reason" /></label>
            <button className="button button-primary" name="action" value="membership-assign" type="submit">Assign group</button>
            <button className="staff-danger-button" name="action" value="membership-remove" type="submit">Remove group</button>
          </form>
        </section>

        <section className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><Tags aria-hidden="true" /> GlobalChatTags</p><h2>Tag definitions</h2></div><span>{snapshot.tags.length} tags</span></div>
          <form className="staff-management-form" action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} action="tag-create" />
            <label>Stable key<input name="tagKey" pattern="[a-z0-9][a-z0-9._:-]{0,63}" required placeholder="group.beta" /></label>
            <label>Tag text<input name="tagText" maxLength={64} required placeholder="[BETA]" /></label>
            <label>Tag color<select name="colorToken" defaultValue="[gold]">{chatColors.map((color) => <option key={color}>{color}</option>)}</select></label>
            <label>Name color<select name="nameColorToken" defaultValue=""><option value="">Inherit</option>{chatColors.map((color) => <option key={color}>{color}</option>)}</select></label>
            <label>Message color<select name="messageColorToken" defaultValue=""><option value="">Inherit</option>{chatColors.map((color) => <option key={color}>{color}</option>)}</select></label>
            <button className="button button-primary" type="submit">Create tag</button>
          </form>
          <div className="staff-group-list">
            {snapshot.tags.map((tag) => <form className="staff-admin-edit" action="/api/admin/groups" method="post" key={tag.id}><MutationFields csrf={csrf} action="tag-update" /><input type="hidden" name="tagId" value={tag.id} /><input name="tagText" defaultValue={tag.text} maxLength={64} required aria-label={`Text for ${tag.key}`} /><select name="colorToken" defaultValue={tag.colorToken} aria-label={`Color for ${tag.key}`}>{chatColors.map((color) => <option key={color}>{color}</option>)}</select><select name="nameColorToken" defaultValue={tag.nameColorToken ?? ""} aria-label={`Name color for ${tag.key}`}><option value="">Inherit</option>{chatColors.map((color) => <option key={color}>{color}</option>)}</select><select name="messageColorToken" defaultValue={tag.messageColorToken ?? ""} aria-label={`Message color for ${tag.key}`}><option value="">Inherit</option>{chatColors.map((color) => <option key={color}>{color}</option>)}</select><select name="enabled" defaultValue={tag.enabled ? "true" : "false"} aria-label={`Status for ${tag.key}`}><option value="true">Enabled</option><option value="false">Disabled</option></select><button className="staff-unban-button" type="submit">Save</button></form>)}
          </div>
        </section>

        <section className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><KeyRound aria-hidden="true" /> Authorization</p><h2>Privilege definitions</h2></div><span>{snapshot.privileges.length} privileges</span></div>
          <form className="staff-management-form" action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} action="privilege-create" />
            <label>Privilege key<input name="privilegeKey" maxLength={96} required placeholder="portal.showcase.manage" /></label>
            <label>Display name<input name="displayName" maxLength={100} required placeholder="Manage showcases" /></label>
            <label>Description<input name="description" maxLength={255} placeholder="What this privilege allows" /></label>
            <label>Scope<select name="scope" defaultValue="portal"><option value="portal">Portal</option><option value="game">Game server</option></select></label>
            <label>Sensitivity<select name="sensitive" defaultValue="false"><option value="false">Standard</option><option value="true">Sensitive</option></select></label>
            <button className="button button-primary" type="submit">Create privilege</button>
          </form>
          <div className="staff-group-list">
            {snapshot.privileges.map((privilege) => <form className="staff-admin-edit" action="/api/admin/groups" method="post" key={privilege.id}><MutationFields csrf={csrf} action="privilege-update" /><input type="hidden" name="privilegeId" value={privilege.id} /><strong>{privilege.key}</strong><input name="displayName" defaultValue={privilege.displayName} maxLength={100} required aria-label={`Name for ${privilege.key}`} /><input name="description" defaultValue={privilege.description ?? ""} maxLength={255} aria-label={`Description for ${privilege.key}`} /><select name="sensitive" defaultValue={privilege.sensitive ? "true" : "false"} aria-label={`Sensitivity for ${privilege.key}`}><option value="false">Standard</option><option value="true">Sensitive</option></select><select name="enabled" defaultValue={privilege.enabled ? "true" : "false"} aria-label={`Status for ${privilege.key}`}><option value="true">Enabled</option><option value="false">Disabled</option></select><button className="staff-unban-button" type="submit">Save</button></form>)}
          </div>
        </section>

        <section className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><KeyRound aria-hidden="true" /> Direct awards</p><h2>Player-specific tag or privilege</h2></div><span>Optional expiry</span></div>
          <form className="staff-management-form" action="/api/admin/groups" method="post">
            <MutationFields csrf={csrf} />
            <PlayerSearchField name="steamId" label="Player" mode="target" required includeSelf />
            <label>Chat tag<select name="tagId" defaultValue=""><option value="">No tag selected</option>{snapshot.tags.filter((tag) => tag.enabled).map((tag) => <option key={tag.id} value={tag.id}>{tag.text}</option>)}</select></label>
            <label>Privilege<select name="privilegeId" defaultValue=""><option value="">No privilege selected</option>{snapshot.privileges.filter((privilege) => privilege.enabled).map((privilege) => <option key={privilege.id} value={privilege.id}>{privilege.displayName}</option>)}</select></label>
            <label>Duration (minutes)<input name="durationMinutes" type="number" min="0" max="525600" defaultValue="0" required /></label>
            <label>Reason<input name="reason" maxLength={180} placeholder="Optional internal reason" /></label>
            <button className="staff-unban-button" name="action" value="player-tag-grant" type="submit">Grant tag</button>
            <button className="staff-danger-button" name="action" value="player-tag-revoke" type="submit">Revoke tag</button>
            <button className="staff-unban-button" name="action" value="player-privilege-grant" type="submit">Grant privilege</button>
            <button className="staff-danger-button" name="action" value="player-privilege-revoke" type="submit">Revoke privilege</button>
          </form>
          <div className="staff-group-list">
            {snapshot.directTagGrants.map((grant) => (
              <form className="staff-admin-edit" action="/api/admin/groups" method="post" key={`${grant.steamId}:${grant.tag.id}`}>
                <MutationFields csrf={csrf} action="player-tag-revoke" />
                <input type="hidden" name="steamId" value={grant.steamId} />
                <input type="hidden" name="tagId" value={grant.tag.id} />
                <Link href={`/players/${grant.steamId}`}>{grant.steamId}</Link>
                <strong>{grant.tag.text}</strong>
                <span>{grant.expiresAt ? `Until ${new Date(grant.expiresAt).toLocaleDateString()}` : "Permanent"}</span>
                <button className="staff-danger-button" type="submit">Revoke tag</button>
              </form>
            ))}
            {snapshot.directPrivilegeGrants.map((grant) => (
              <form className="staff-admin-edit" action="/api/admin/groups" method="post" key={`${grant.steamId}:${grant.privilege.id}`}>
                <MutationFields csrf={csrf} action="player-privilege-revoke" />
                <input type="hidden" name="steamId" value={grant.steamId} />
                <input type="hidden" name="privilegeId" value={grant.privilege.id} />
                <Link href={`/players/${grant.steamId}`}>{grant.steamId}</Link>
                <strong>{grant.privilege.displayName}</strong>
                <span>{grant.expiresAt ? `Until ${new Date(grant.expiresAt).toLocaleDateString()}` : "Permanent"}</span>
                <button className="staff-danger-button" type="submit">Revoke privilege</button>
              </form>
            ))}
            {!snapshot.directTagGrants.length && !snapshot.directPrivilegeGrants.length ? (
              <p className="empty-copy">No active direct player tags or privileges.</p>
            ) : null}
          </div>
        </section>

        <section className="staff-record-section">
          <div className="staff-section-heading"><div><p className="tapped-kicker"><ShieldCheck aria-hidden="true" /> Registry</p><h2>All identity groups</h2></div><span>{snapshot.groups.length} definitions</span></div>
          {snapshot.groups.length ? snapshot.groups.map((group) => <GroupCard key={group.id} group={group} snapshot={snapshot} csrf={csrf} />) : <p className="empty-copy">No groups are available. Apply migration 012 to seed the external adapters.</p>}
        </section>
      </div>
    </main>
  );
}
