import {
  CalendarClock,
  CalendarDays,
  Database,
  Gauge,
  Globe2,
  LockKeyhole,
  Network,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { PlayerIdentity } from "@/components/player-identity";
import { ThemedPlayerContainer } from "@/components/ui/themed-player-container";
import type {
  StaffAdminMembershipPlayer,
  StaffAdminMembershipRecord,
} from "@/lib/data/staff-admin-memberships";
import type { PlayerIdentityData } from "@/lib/player-identities";

import { ConfirmSubmitButton } from "./groups-controls";
import styles from "./source-aware-admin-memberships.module.css";

export type SourceAwareAdminMembershipPermissions = Readonly<{
  extend: boolean;
  remove: boolean;
}>;

export type SourceAwareAdminMembershipListProps = {
  csrf: string;
  players: readonly StaffAdminMembershipPlayer[];
  identities: Readonly<Record<string, PlayerIdentityData>>;
  permissions: SourceAwareAdminMembershipPermissions;
  action?: string;
  heading?: string;
  description?: string;
};

type RecordState =
  | "active"
  | "expired"
  | "permanent"
  | "scheduled"
  | "revoked"
  | "available"
  | "unavailable"
  | "protected";

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
  available: "Connected",
  unavailable: "Unavailable",
  protected: "Founder protected",
};

function stateLabel(
  state: RecordState,
  record: StaffAdminMembershipRecord,
) {
  if (state === "available") {
    return record.source === "native" ? "In current scope" : "Connected";
  }
  if (state === "unavailable") {
    return record.source === "native"
      ? "Out of current scope"
      : "Definition unavailable";
  }
  return stateLabels[state];
}

function fallbackIdentity(
  player: StaffAdminMembershipPlayer,
): PlayerIdentityData {
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

function isFounderGroup(group: string) {
  return group.normalize("NFKC").trim().toLocaleLowerCase("en-US") === "founder";
}

function sourceLabel(source: StaffAdminMembershipRecord["source"]) {
  return source === "portal" ? "Portal" : "Native";
}

function primaryState(record: StaffAdminMembershipRecord): RecordState {
  if (record.status === "revoked") return "revoked";
  if (record.status === "scheduled") return "scheduled";
  if (record.status === "expired") return "expired";
  if (record.permanent) return "permanent";
  return "active";
}

function recordStates(record: StaffAdminMembershipRecord): RecordState[] {
  const states: RecordState[] = [primaryState(record)];
  states.push(record.enabled ? "available" : "unavailable");
  if (isFounderGroup(record.group)) states.push("protected");
  return states;
}

function exactReferenceAvailable(record: StaffAdminMembershipRecord) {
  if (!record.steamId.trim() || !record.group.trim()) return false;
  if (record.source === "portal") {
    return record.groupId !== null &&
      Number.isSafeInteger(record.groupId) &&
      record.groupId > 0 &&
      Boolean(record.membershipUuid) &&
      record.scopeId !== null &&
      Number.isSafeInteger(record.scopeId) &&
      record.scopeId > 0 &&
      record.rowVersion !== null &&
      Number.isSafeInteger(record.rowVersion) &&
      record.rowVersion > 0;
  }
  return record.adminId !== null &&
    Number.isSafeInteger(record.adminId) &&
    record.adminId > 0 &&
    Boolean(record.storedGroup?.length);
}

function exactReferenceLabel(record: StaffAdminMembershipRecord) {
  if (record.source === "portal") {
    return record.groupId === null || !record.membershipUuid || record.scopeId === null
      ? "Arena membership reference unavailable"
      : `Arena membership ${record.membershipUuid} · scope #${record.scopeId}`;
  }
  return record.adminId === null
    ? "Native admin row reference unavailable"
    : `Admin row #${record.adminId} · stored group ${record.storedGroup ?? record.group}`;
}

function Scope({ record }: { record: StaffAdminMembershipRecord }) {
  if (record.source === "portal") {
    return (
      <span className={styles.portalScope}>
        <Globe2 aria-hidden="true" size={15} />
        {record.scopeName ?? (record.scopeType === "global"
          ? "Global Arena scope"
          : `Arena scope #${record.scopeId ?? "?"}`)}
      </span>
    );
  }
  if (!record.serverGuids.length) {
    return (
      <span className={styles.portalScope}>
        <Network aria-hidden="true" size={15} />
        No server GUID recorded
      </span>
    );
  }
  return (
    <ul className={styles.serverScopes} aria-label="Native server GUIDs">
      {record.serverGuids.map((serverGuid) => (
        <li key={serverGuid} title={serverGuid}>
          <Network aria-hidden="true" size={14} />
          <code>{serverGuid}</code>
        </li>
      ))}
    </ul>
  );
}

function ExactMembershipFields({
  record,
}: {
  record: StaffAdminMembershipRecord;
}) {
  return (
    <>
      <input type="hidden" name="steamId" value={record.steamId} />
      <input type="hidden" name="membershipSource" value={record.source} />
      {record.source === "native" ? (
        <>
          <input type="hidden" name="adminId" value={record.adminId ?? ""} />
          <input
            type="hidden"
            name="storedGroup"
            value={record.storedGroup ?? ""}
          />
        </>
      ) : (
        <>
          <input type="hidden" name="groupId" value={record.groupId ?? ""} />
          <input type="hidden" name="membershipUuid" value={record.membershipUuid ?? ""} />
          <input type="hidden" name="scopeId" value={record.scopeId ?? ""} />
          <input type="hidden" name="rowVersion" value={record.rowVersion ?? ""} />
        </>
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
  record: StaffAdminMembershipRecord;
}) {
  const controlId = `admin-extension-${record.recordKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return (
    <form className={styles.extendForm} action={action} method="post">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="action" value="admin-membership-extend" />
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
        confirmation={`Extend ${record.group} for ${record.name} by the entered number of minutes? This adds time to this exact portal record.`}
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
  record: StaffAdminMembershipRecord;
}) {
  const consequence = record.source === "native"
    ? "Only this stored group will be detached from the native admin row."
    : "Only this portal membership will be revoked.";
  return (
    <form action={action} method="post">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="action" value="admin-membership-remove" />
      <ExactMembershipFields record={record} />
      <ConfirmSubmitButton
        className={styles.removeButton}
        confirmation={`Remove ${playerName}'s exact ${sourceLabel(record.source).toLowerCase()} ${record.group} assignment? ${consequence}`}
      >
        <Trash2 aria-hidden="true" size={17} />
        Remove exact
      </ConfirmSubmitButton>
    </form>
  );
}

function ActionExplanation({
  record,
}: {
  record: StaffAdminMembershipRecord;
}) {
  if (isFounderGroup(record.group)) {
    return (
      <p className={styles.actionWarning}>
        <LockKeyhole aria-hidden="true" size={16} />
        Founder authority is protected and cannot be changed here.
      </p>
    );
  }
  if (!exactReferenceAvailable(record)) {
    return (
      <p className={styles.actionWarning} role="status">
        <ShieldAlert aria-hidden="true" size={17} />
        Exact source reference missing; actions are unavailable.
      </p>
    );
  }
  if (record.source === "native" && !record.enabled) {
    return (
      <p className={styles.actionWarning}>
        <Network aria-hidden="true" size={16} />
        This native row is outside the configured server scope.
      </p>
    );
  }
  if (record.status === "revoked") {
    return (
      <p className={styles.actionNote}>
        <LockKeyhole aria-hidden="true" size={16} />
        This portal assignment has already been revoked.
      </p>
    );
  }
  return null;
}

function MembershipRecord({
  action,
  canExtend,
  canRemove,
  csrf,
  playerName,
  record,
}: {
  action: string;
  canExtend: boolean;
  canRemove: boolean;
  csrf: string;
  playerName: string;
  record: StaffAdminMembershipRecord;
}) {
  const hasReference = exactReferenceAvailable(record);
  const founderProtected = isFounderGroup(record.group);
  const mutable = record.status !== "revoked" && !founderProtected && hasReference;
  const canExtendRecord = mutable &&
    record.source === "portal" &&
    record.enabled &&
    !record.permanent;
  const canRemoveRecord = mutable &&
    (record.source === "portal" || record.enabled);
  const showExplanation = founderProtected ||
    !hasReference ||
    record.status === "revoked" ||
    (record.source === "native" && !record.enabled);

  return (
    <li
      className={styles.record}
      data-part="membership-record"
      data-source={record.source}
      data-status={primaryState(record)}
    >
      <div className={styles.recordOverview}>
        <div className={styles.groupHeading}>
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
        <Scope record={record} />
        <small className={styles.reference}>{exactReferenceLabel(record)}</small>
      </div>

      <ul
        className={styles.states}
        aria-label={`${record.group} assignment states`}
      >
        {recordStates(record).map((state) => (
          <li key={state} className={styles.stateBadge} data-state={state}>
            {stateLabel(state, record)}
          </li>
        ))}
      </ul>

      <dl className={styles.details}>
        <div>
          <dt>
            <CalendarDays aria-hidden="true" size={15} />
            Starts
          </dt>
          <dd>
            <Timestamp value={record.startsAt} emptyLabel="Native record" />
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
        <div>
          <dt>
            <Gauge aria-hidden="true" size={15} />
            Immunity
          </dt>
          <dd>
            {record.immunity === null
              ? "Runtime managed"
              : record.immunity.toLocaleString("en-US")}
          </dd>
        </div>
      </dl>

      {(canExtend || canRemove) ? (
        <div
          className={styles.actions}
          aria-label={`Manage exact ${record.group} assignment`}
        >
          {showExplanation ? <ActionExplanation record={record} /> : null}
          {canExtend && canExtendRecord ? (
            <ExtensionForm action={action} csrf={csrf} record={record} />
          ) : null}
          {canExtend &&
          record.source === "native" &&
          mutable &&
          record.enabled ? (
            <p className={styles.actionNote}>
              <LockKeyhole aria-hidden="true" size={16} />
              Native Admins.Core assignments are permanent; timed extension is
              available only for portal records.
            </p>
          ) : null}
          {canExtend &&
          record.source === "portal" &&
          mutable &&
          record.permanent &&
          record.enabled ? (
            <p className={styles.actionNote}>
              <LockKeyhole aria-hidden="true" size={16} />
              Permanent portal assignments cannot be extended.
            </p>
          ) : null}
          {canExtend &&
          record.source === "portal" &&
          mutable &&
          !record.enabled ? (
            <p className={styles.actionWarning}>
              <ShieldAlert aria-hidden="true" size={16} />
              Reconnect and enable this group before extending it.
            </p>
          ) : null}
          {canRemove && canRemoveRecord ? (
            <RemoveForm
              action={action}
              csrf={csrf}
              playerName={playerName}
              record={record}
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function SourceAwareAdminMembershipList({
  csrf,
  players,
  identities,
  permissions,
  action = "/api/admin/staff",
  heading = "Admin memberships",
  description = "Every Admins.Core and portal assignment is shown with its exact source, scope, status, and expiry.",
}: SourceAwareAdminMembershipListProps) {
  const recordCount = players.reduce(
    (total, player) => total + player.records.length,
    0,
  );
  const activeGroupCount = players.reduce(
    (total, player) => total + player.activeGroupCount,
    0,
  );
  const readOnly = !permissions.extend && !permissions.remove;

  return (
    <section
      className={styles.root}
      data-ui="source-aware-admin-memberships"
      aria-labelledby="source-aware-admin-heading"
    >
      <header className={styles.header} data-part="header">
        <div>
          <p className={styles.eyebrow}>Source-aware authority</p>
          <h2 id="source-aware-admin-heading">{heading}</h2>
          <p>{description}</p>
        </div>
        <div className={styles.summary} aria-label="Admin membership summary">
          <span>{players.length} players</span>
          <span>{recordCount} exact records</span>
          <span>{activeGroupCount} active groups</span>
          {readOnly ? (
            <span>
              <LockKeyhole aria-hidden="true" size={15} />
              Read only
            </span>
          ) : null}
        </div>
      </header>

      {players.length ? (
        <div className={styles.players} data-part="players">
          {players.map((player) => {
            const identity = identities[player.steamId] ?? fallbackIdentity(player);
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
                    <span>{player.activeGroupCount} active groups</span>
                  </div>
                </header>

                <ul
                  className={styles.records}
                  aria-label={`${identity.displayName}'s exact Admin membership records`}
                >
                  {player.records.map((record) => (
                    <MembershipRecord
                      action={action}
                      canExtend={permissions.extend}
                      canRemove={permissions.remove}
                      csrf={csrf}
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
            <strong>No Admin memberships found</strong>
            <p>Exact native and portal Admin assignment records will appear here.</p>
          </div>
        </div>
      )}
    </section>
  );
}
