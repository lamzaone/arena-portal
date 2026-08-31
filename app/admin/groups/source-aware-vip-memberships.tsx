import {
  CalendarClock,
  CalendarDays,
  Database,
  Globe2,
  LockKeyhole,
  Server,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { PlayerIdentity } from "@/components/player-identity";
import { ThemedPlayerContainer } from "@/components/ui/themed-player-container";
import type {
  StaffVipMembershipPlayer,
  StaffVipMembershipRecord,
} from "@/lib/data/staff-vip-memberships";
import type { PlayerIdentityData } from "@/lib/player-identities";

import { ConfirmSubmitButton } from "./groups-controls";
import {
  VipMembershipConflictChooser,
  type VipMembershipConsolidationChoice,
} from "./vip-membership-conflict-chooser";
import styles from "./source-aware-vip-memberships.module.css";

export type SourceAwareVipMembershipPermissions = Readonly<{
  extend: boolean;
  remove: boolean;
  consolidate: boolean;
}>;

export type SourceAwareVipMembershipListProps = {
  csrf: string;
  players: readonly StaffVipMembershipPlayer[];
  identities: Readonly<Record<string, PlayerIdentityData>>;
  permissions: SourceAwareVipMembershipPermissions;
  action?: string;
  conversionStorageAvailable?: boolean;
  heading?: string;
  description?: string;
};

type RecordState =
  | "active"
  | "expired"
  | "permanent"
  | "scheduled"
  | "revoked"
  | "suppressed"
  | "conflict";

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const stateLabels: Record<RecordState, string> = {
  active: "Active",
  expired: "Expired",
  permanent: "Permanent",
  scheduled: "Scheduled",
  revoked: "Revoked",
  suppressed: "Suppressed",
  conflict: "Review required",
};

function fallbackIdentity(player: StaffVipMembershipPlayer): PlayerIdentityData {
  return {
    steamId: player.steamId,
    displayName: player.name || player.steamId,
    avatarUrl: null,
    presence: "unknown",
    profileThemeKey: null,
    identityGroups: [],
  };
}

function parsedTimestamp(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function Timestamp({
  value,
  emptyLabel,
}: {
  value: string | null;
  emptyLabel: string;
}) {
  const parsed = parsedTimestamp(value);
  if (!parsed) return <span>{emptyLabel}</span>;
  return (
    <time dateTime={parsed.toISOString()} title={parsed.toISOString()}>
      {dateTimeFormatter.format(parsed)} UTC
    </time>
  );
}

function primaryState(record: StaffVipMembershipRecord): RecordState {
  if (record.status === "revoked") return "revoked";
  if (record.status === "scheduled") return "scheduled";
  if (record.status === "expired") return "expired";
  if (record.permanent) return "permanent";
  return "active";
}

function recordStates(
  record: StaffVipMembershipRecord,
  hasConflict: boolean,
): RecordState[] {
  const states: RecordState[] = [primaryState(record)];
  if (record.suppressedByPortal) states.push("suppressed");
  if (hasConflict && record.status === "active") states.push("conflict");
  return states;
}

function sourceLabel(source: StaffVipMembershipRecord["source"]) {
  return source === "portal" ? "Portal" : "Native";
}

function scopeLabel(record: StaffVipMembershipRecord) {
  if (record.source === "portal") {
    return record.groupId === null
      ? "Portal-wide · group reference unavailable"
      : `Portal-wide · group #${record.groupId}`;
  }
  if (record.serverId === null) return "Native scope not recorded";
  if (record.serverId === 0) return "Shared scope · server 0";
  return `Server ${record.serverId}`;
}

function exactReferenceLabel(record: StaffVipMembershipRecord) {
  if (record.source === "portal") {
    return record.groupId === null
      ? "Missing portal group ID"
      : `Portal group ID ${record.groupId}`;
  }
  const account = record.accountId || "missing account ID";
  const server = record.serverId === null ? "missing server scope" : `server ${record.serverId}`;
  return `Account ${account} · ${server}`;
}

function hasExactMutationReference(record: StaffVipMembershipRecord) {
  if (!record.steamId.trim() || !record.group.trim()) return false;
  if (record.source === "portal") {
    return record.groupId !== null && Number.isInteger(record.groupId) && record.groupId > 0;
  }
  return Boolean(record.accountId?.trim()) && record.serverId !== null && Number.isInteger(record.serverId);
}

function ExactMembershipFields({ record }: { record: StaffVipMembershipRecord }) {
  return (
    <>
      <input type="hidden" name="steamId" value={record.steamId} />
      <input type="hidden" name="membershipSource" value={record.source} />
      {record.source === "native" ? (
        <>
          <input type="hidden" name="accountId" value={record.accountId ?? ""} />
          <input type="hidden" name="serverId" value={record.serverId ?? ""} />
          <input type="hidden" name="storedGroup" value={record.group} />
        </>
      ) : (
        <input type="hidden" name="groupId" value={record.groupId ?? ""} />
      )}
    </>
  );
}

function ExtensionForm({
  action,
  csrf,
  record,
}: {
  action: string;
  csrf: string;
  record: StaffVipMembershipRecord;
}) {
  const controlId = `vip-extension-${record.recordKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return (
    <form className={styles.extendForm} action={action} method="post">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="action" value="vip-membership-extend" />
      <ExactMembershipFields record={record} />
      <input
        type="hidden"
        name="expectedExpiresAt"
        value={record.expiresAt ?? ""}
      />
      <label htmlFor={controlId}>Add time</label>
      <span className={styles.durationControl}>
        <input
          id={controlId}
          name="durationMinutes"
          type="number"
          min={1}
          max={525600}
          step={1}
          defaultValue={1440}
          inputMode="numeric"
          required
          aria-describedby={`${controlId}-help`}
        />
        <span aria-hidden="true">minutes</span>
      </span>
      <small id={`${controlId}-help`}>
        Adds to the later of now or the current expiry.
      </small>
      <ConfirmSubmitButton
        className={styles.extendButton}
        confirmation={`Extend the exact ${sourceLabel(record.source).toLowerCase()} ${record.group} membership by the positive number of minutes entered? This adds time; it does not replace the expiry.`}
      >
        <CalendarClock aria-hidden="true" size={17} />
        Extend
      </ConfirmSubmitButton>
    </form>
  );
}

function RemoveForm({
  action,
  csrf,
  playerName,
  record,
}: {
  action: string;
  csrf: string;
  playerName: string;
  record: StaffVipMembershipRecord;
}) {
  const consequence = record.source === "portal"
    ? "Only this portal membership will be revoked."
    : "Only this exact native row will be removed.";
  return (
    <form action={action} method="post">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="action" value="vip-membership-remove" />
      <ExactMembershipFields record={record} />
      <ConfirmSubmitButton
        className={styles.removeButton}
        confirmation={`Remove ${playerName}'s exact ${sourceLabel(record.source).toLowerCase()} ${record.group} membership? ${consequence}`}
      >
        <Trash2 aria-hidden="true" size={17} />
        Remove exact
      </ConfirmSubmitButton>
    </form>
  );
}

function consolidationChoices(
  player: StaffVipMembershipPlayer,
): VipMembershipConsolidationChoice[] {
  const activeRecords = player.records.filter((record) => record.status === "active");

  return activeRecords.map((record) => {
    let disabledReason: string | null = null;
    if (!hasExactMutationReference(record)) {
      disabledReason = "This record is missing its exact mutation reference.";
    } else if (!record.consolidationEligible) {
      disabledReason = record.consolidationBlockedReason ??
        "The backend cannot keep this membership in its current state.";
    }
    return {
      recordKey: record.recordKey,
      source: record.source,
      steamId: record.steamId,
      group: record.group,
      groupId: record.groupId,
      accountId: record.accountId,
      serverId: record.serverId,
      scope: scopeLabel(record),
      expires: record.permanent
        ? "Permanent"
        : parsedTimestamp(record.expiresAt)
          ? `${dateTimeFormatter.format(parsedTimestamp(record.expiresAt) as Date)} UTC`
          : "Expiry not recorded",
      disabledReason,
    };
  });
}

function MembershipRecord({
  action,
  canExtend,
  canRemove,
  csrf,
  hasConflict,
  playerName,
  record,
}: {
  action: string;
  canExtend: boolean;
  canRemove: boolean;
  csrf: string;
  hasConflict: boolean;
  playerName: string;
  record: StaffVipMembershipRecord;
}) {
  const exactReferenceAvailable = hasExactMutationReference(record);
  const mutationScopeAvailable = record.source === "portal" || record.inConfiguredScope;
  const mutable = record.status !== "revoked";
  const states = recordStates(record, hasConflict);

  return (
    <li
      className={styles.record}
      data-part="membership-record"
      data-source={record.source}
      data-status={primaryState(record)}
    >
      <div className={styles.recordOverview}>
        <div className={styles.tierHeading}>
          <strong>{record.group}</strong>
          <span className={styles.sourceBadge} data-source={record.source}>
            {record.source === "portal" ? (
              <Globe2 aria-hidden="true" size={15} />
            ) : (
              <Database aria-hidden="true" size={15} />
            )}
            {sourceLabel(record.source)}
          </span>
        </div>
        <span className={styles.scope}>
          <Server aria-hidden="true" size={15} />
          {scopeLabel(record)}
        </span>
        <small className={styles.reference}>{exactReferenceLabel(record)}</small>
      </div>

      <ul className={styles.states} aria-label={`${record.group} membership states`}>
        {states.map((state) => (
          <li key={state} className={styles.stateBadge} data-state={state}>
            {stateLabels[state]}
          </li>
        ))}
      </ul>

      <dl className={styles.timeline}>
        <div>
          <dt>
            <CalendarDays aria-hidden="true" size={15} />
            Starts
          </dt>
          <dd>
            <Timestamp value={record.startsAt} emptyLabel="Not recorded" />
          </dd>
        </div>
        <div>
          <dt>
            <CalendarClock aria-hidden="true" size={15} />
            Expires
          </dt>
          <dd>
            {record.permanent ? (
              <span>Never · permanent</span>
            ) : (
              <Timestamp value={record.expiresAt} emptyLabel="Not recorded" />
            )}
          </dd>
        </div>
      </dl>

      {(canExtend || canRemove) ? (
        <div className={styles.actions} aria-label={`Manage exact ${record.group} membership`}>
          {!mutationScopeAvailable ? (
            <p className={styles.actionWarning} role="status">
              <ShieldAlert aria-hidden="true" size={17} />
              This membership belongs to another VIP server scope and is read-only here.
            </p>
          ) : !exactReferenceAvailable ? (
            <p className={styles.actionWarning} role="status">
              <ShieldAlert aria-hidden="true" size={17} />
              Exact source reference missing; actions are unavailable.
            </p>
          ) : (
            <>
              {canExtend &&
              mutable &&
              !record.permanent &&
              record.status !== "scheduled" &&
              !hasConflict &&
              (record.source === "portal" || record.status === "active") ? (
                <ExtensionForm action={action} csrf={csrf} record={record} />
              ) : null}
              {canExtend && hasConflict && !record.permanent ? (
                <p className={styles.actionNote}>
                  <ShieldAlert aria-hidden="true" size={16} />
                  Resolve the VIP conflict before extending a membership.
                </p>
              ) : null}
              {canExtend &&
              record.source === "native" &&
              record.status === "expired" &&
              !hasConflict ? (
                <p className={styles.actionNote}>
                  <CalendarClock aria-hidden="true" size={16} />
                  Expired native rows cannot be extended; add a current grant instead.
                </p>
              ) : null}
              {canExtend && record.permanent ? (
                <p className={styles.actionNote}>
                  <LockKeyhole aria-hidden="true" size={16} />
                  Permanent memberships cannot be extended.
                </p>
              ) : null}
              {canExtend && record.status === "scheduled" && !record.permanent ? (
                <p className={styles.actionNote}>
                  <CalendarClock aria-hidden="true" size={16} />
                  Scheduled memberships can be extended after they become active.
                </p>
              ) : null}
              {canRemove && mutable ? (
                <RemoveForm
                  action={action}
                  csrf={csrf}
                  playerName={playerName}
                  record={record}
                />
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

export function SourceAwareVipMembershipList({
  csrf,
  players,
  identities,
  permissions,
  action = "/api/admin/staff",
  conversionStorageAvailable = true,
  heading = "VIP memberships",
  description = "Every stored membership is shown separately so its source, scope, and expiry remain unambiguous.",
}: SourceAwareVipMembershipListProps) {
  const recordCount = players.reduce((total, player) => total + player.records.length, 0);
  const resolutionCount = players.filter((player) => player.needsConsolidation).length;

  return (
    <section
      className={styles.root}
      data-ui="source-aware-vip-memberships"
      aria-labelledby="source-aware-vip-heading"
    >
      <header className={styles.header} data-part="header">
        <div>
          <p className={styles.eyebrow}>Source-aware access</p>
          <h2 id="source-aware-vip-heading">{heading}</h2>
          <p>{description}</p>
        </div>
        <div className={styles.summary} aria-label="VIP membership summary">
          <span>{players.length} players</span>
          <span>{recordCount} exact records</span>
          {resolutionCount ? <span data-alert="true">{resolutionCount} need review</span> : null}
          {!permissions.extend && !permissions.remove && !permissions.consolidate ? (
            <span>
              <LockKeyhole aria-hidden="true" size={15} />
              Read only
            </span>
          ) : null}
        </div>
      </header>

      {!conversionStorageAvailable ? (
        <div className={styles.storageWarning} role="status" data-part="storage-warning">
          <ShieldAlert aria-hidden="true" size={19} />
          <div>
            <strong>Portal conversion state is unavailable</strong>
            <p>Native rows are still shown, but suppression and portal provenance may be incomplete.</p>
          </div>
        </div>
      ) : null}

      {players.length ? (
        <div className={styles.players} data-part="players">
          {players.map((player) => {
            const identity = identities[player.steamId] ?? fallbackIdentity(player);
            const choices = consolidationChoices(player);
            return (
              <ThemedPlayerContainer
                as="article"
                containerKind="management"
                ownerSteamId={player.steamId}
                profileThemeKey={identity.profileThemeKey}
                className={styles.playerCard}
                key={player.steamId}
                data-part="player-memberships"
              >
                <header className={styles.playerHeader}>
                  <PlayerIdentity
                    player={identity}
                    variant="compact"
                    showSteamId
                  />
                  <div className={styles.playerCounts}>
                    <span>{player.records.length} stored</span>
                    <span>{player.activeTierCount} active tiers</span>
                  </div>
                </header>

                {player.needsConsolidation ? (
                  <section className={styles.conflict} aria-label={`Resolve ${identity.displayName}'s VIP membership state`}>
                    <div className={styles.conflictIntro}>
                      <ShieldAlert aria-hidden="true" size={20} />
                      <div>
                        <h3>{player.activeTierCount > 1
                          ? "Multiple active VIP tiers"
                          : "Preserved native VIP needs a decision"}</h3>
                        <p>{player.activeTierCount > 1
                          ? "Choose the existing membership that should remain effective."
                          : "Choose whether to restore the preserved native membership or keep the portal tier authoritative."}</p>
                      </div>
                    </div>
                    {permissions.consolidate ? (
                      <VipMembershipConflictChooser
                        action={action}
                        csrf={csrf}
                        playerName={identity.displayName}
                        steamId={player.steamId}
                        choices={choices}
                      />
                    ) : (
                      <p className={styles.permissionNote}>
                        <LockKeyhole aria-hidden="true" size={16} />
                        You can inspect this conflict, but you do not have permission to consolidate it.
                      </p>
                    )}
                  </section>
                ) : null}

                <ul className={styles.records} aria-label={`${identity.displayName}'s exact VIP membership records`}>
                  {player.records.map((record) => (
                    <MembershipRecord
                      action={action}
                      canExtend={permissions.extend}
                      canRemove={permissions.remove}
                      csrf={csrf}
                      hasConflict={player.needsConsolidation}
                      playerName={identity.displayName}
                      record={record}
                      key={record.recordKey}
                    />
                  ))}
                </ul>
              </ThemedPlayerContainer>
            );
          })}
        </div>
      ) : (
        <div className={styles.empty} data-part="empty-state">
          <ShieldCheck aria-hidden="true" size={24} />
          <div>
            <strong>No VIP memberships found</strong>
            <p>Exact native and portal membership records will appear here.</p>
          </div>
        </div>
      )}
    </section>
  );
}
