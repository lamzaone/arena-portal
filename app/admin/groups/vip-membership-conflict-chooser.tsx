"use client";

import { GitMerge, ShieldAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { ConfirmSubmitButton } from "./groups-controls";
import styles from "./source-aware-vip-memberships.module.css";

export type VipMembershipConsolidationChoice = {
  recordKey: string;
  source: "native" | "portal";
  steamId: string;
  group: string;
  groupId: number | null;
  accountId: string | null;
  serverId: number | null;
  scope: string;
  expires: string;
  disabledReason: string | null;
};

export function VipMembershipConflictChooser({
  action,
  csrf,
  playerName,
  steamId,
  choices,
}: {
  action: string;
  csrf: string;
  playerName: string;
  steamId: string;
  choices: readonly VipMembershipConsolidationChoice[];
}) {
  const fieldsetId = useId();
  const [selectedKey, setSelectedKey] = useState("");
  const selected = useMemo(
    () => choices.find((choice) => choice.recordKey === selectedKey) ?? null,
    [choices, selectedKey],
  );
  const selectableCount = choices.filter((choice) => !choice.disabledReason).length;

  if (!choices.length || !selectableCount) {
    return (
      <p className={styles.conflictUnavailable} role="status">
        <ShieldAlert aria-hidden="true" size={17} />
        No safe consolidation target is available. Remove invalid or duplicate native rows first.
      </p>
    );
  }

  return (
    <form className={styles.conflictForm} action={action} method="post">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="action" value="vip-membership-consolidate" />
      <input type="hidden" name="steamId" value={steamId} />
      {selected ? (
        <>
          <input type="hidden" name="targetSource" value={selected.source} />
          {selected.source === "native" ? (
            <>
              <input type="hidden" name="accountId" value={selected.accountId ?? ""} />
              <input type="hidden" name="serverId" value={selected.serverId ?? ""} />
              <input type="hidden" name="storedGroup" value={selected.group} />
            </>
          ) : (
            <input type="hidden" name="groupId" value={selected.groupId ?? ""} />
          )}
        </>
      ) : null}

      <fieldset aria-describedby={`${fieldsetId}-help`}>
        <legend>Keep one existing membership</legend>
        <p id={`${fieldsetId}-help`} className={styles.conflictHelp}>
          All other non-revoked portal VIP records will be revoked. Native records are preserved;
          remove extra native tiers explicitly before choosing a native target.
        </p>
        <div className={styles.conflictChoices}>
          {choices.map((choice) => {
            const inputId = `${fieldsetId}-${choice.recordKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
            const disabled = Boolean(choice.disabledReason);
            return (
              <label
                className={styles.conflictChoice}
                data-selected={selectedKey === choice.recordKey ? "true" : undefined}
                data-disabled={disabled ? "true" : undefined}
                htmlFor={inputId}
                key={choice.recordKey}
              >
                <input
                  id={inputId}
                  type="radio"
                  name="membershipTarget"
                  value={choice.recordKey}
                  checked={selectedKey === choice.recordKey}
                  disabled={disabled}
                  onChange={() => setSelectedKey(choice.recordKey)}
                />
                <span className={styles.conflictChoiceCopy}>
                  <strong>{choice.group}</strong>
                  <span>{choice.source === "portal" ? "Portal" : "Native"} · {choice.scope}</span>
                  <small>{choice.expires}</small>
                  {choice.disabledReason ? <small data-warning="true">{choice.disabledReason}</small> : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <ConfirmSubmitButton
        className={styles.consolidateButton}
        disabled={!selected}
        confirmation={selected
          ? `Keep ${playerName}'s existing ${selected.source} ${selected.group} membership and revoke every other non-revoked portal VIP membership? Native rows will remain preserved.`
          : "Choose the membership to keep before consolidating."}
      >
        <GitMerge aria-hidden="true" size={18} />
        Consolidate to selected tier
      </ConfirmSubmitButton>
    </form>
  );
}
