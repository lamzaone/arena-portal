"use client";

import {
  Children,
  Fragment,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";

import { SearchField } from "@/components/ui/search-field";

import styles from "./groups-page.module.css";

export type PermissionCatalogueOption = {
  id: number;
  key: string;
  displayName: string;
  description: string | null;
  scope: "portal" | "game";
  sensitive: boolean;
};

export type SearchableCatalogueEntry = {
  id: string;
  searchText: string;
  content: ReactNode;
};

export type GroupWorkspaceEntry = {
  id: number;
  key: string;
  displayName: string;
  source: string;
  groupType: "admin" | "vip" | "custom";
  enabled: boolean;
  accent: string;
  memberCount: number;
  tagCount: number;
  privilegeCount: number;
  rewardCount: number;
};

type GroupSortKey = "name" | "type" | "members";
type GroupSort = { key: GroupSortKey; direction: "ascending" | "descending" };

const groupTypeOrder: Record<GroupWorkspaceEntry["groupType"], number> = {
  admin: 0,
  vip: 1,
  custom: 2,
};

function groupTypeLabel(value: GroupWorkspaceEntry["groupType"]) {
  if (value === "admin") return "Admin";
  if (value === "vip") return "VIP";
  return "Custom";
}

function compareGroups(
  left: GroupWorkspaceEntry,
  right: GroupWorkspaceEntry,
  sort: GroupSort,
) {
  let difference = 0;
  if (sort.key === "type") {
    const typeDifference =
      groupTypeOrder[left.groupType] - groupTypeOrder[right.groupType];
    if (typeDifference) difference = typeDifference;
  }
  if (!difference && sort.key === "members") {
    difference = left.memberCount - right.memberCount;
  }
  if (!difference) {
    difference = left.displayName.localeCompare(right.displayName, "en", {
      sensitivity: "base",
      numeric: true,
    });
  }
  if (!difference) difference = left.id - right.id;
  return sort.direction === "ascending" ? difference : -difference;
}

export function ConfirmSubmitButton({
  confirmation,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { confirmation: string }) {
  return (
    <button
      {...props}
      type="submit"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !window.confirm(confirmation)) event.preventDefault();
      }}
    />
  );
}

function searchable(value: string) {
  return value.normalize("NFKD").toLocaleLowerCase("en-US").trim();
}

function matches(value: string, query: string) {
  if (!query) return true;
  const words = searchable(query).split(/\s+/).filter(Boolean);
  const candidate = searchable(value);
  return words.every((word) => candidate.includes(word));
}

function replaceSelectedGroupUrl(groupId: number) {
  const url = new URL(window.location.href);
  url.searchParams.set("group", String(groupId));
  url.hash = `group-${groupId}`;
  window.history.replaceState(window.history.state, "", url);
}

export function GroupWorkspace({
  id,
  groups,
  initialSelectedId,
  children,
}: {
  id: string;
  groups: GroupWorkspaceEntry[];
  initialSelectedId?: number | null;
  children: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState(
    groups.some((group) => group.id === initialSelectedId)
      ? initialSelectedId ?? null
      : groups[0]?.id ?? null,
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<GroupSort>({
    key: "name",
    direction: "ascending",
  });
  const deferredQuery = useDeferredValue(query);
  const panels = Children.toArray(children);
  const filteredGroups = useMemo(
    () => groups
      .filter((group) => matches([
        group.displayName,
        group.key,
        group.source,
        groupTypeLabel(group.groupType),
        group.enabled ? "enabled active" : "disabled inactive",
      ].join(" "), deferredQuery))
      .sort((left, right) => compareGroups(left, right, sort)),
    [deferredQuery, groups, sort],
  );
  const selectedGroup =
    filteredGroups.find((group) => group.id === selectedId) ??
    filteredGroups[0] ??
    null;
  const visibleSelectedId = selectedGroup?.id ?? null;
  const statusId = `${id}-status`;

  useEffect(() => {
    if (visibleSelectedId === null || visibleSelectedId === selectedId) return;
    setSelectedId(visibleSelectedId);
    replaceSelectedGroupUrl(visibleSelectedId);
  }, [selectedId, visibleSelectedId]);

  function selectGroup(groupId: number) {
    setSelectedId(groupId);
    replaceSelectedGroupUrl(groupId);
  }

  function changeSort(key: GroupSortKey) {
    setSort((current) => ({
      key,
      direction:
        current.key === key
          ? current.direction === "ascending"
            ? "descending"
            : "ascending"
          : key === "members"
            ? "descending"
            : "ascending",
    }));
  }

  function ariaSort(key: GroupSortKey): GroupSort["direction"] | undefined {
    return sort.key === key ? sort.direction : undefined;
  }

  function sortButtonLabel(key: GroupSortKey, label: string) {
    const defaultDirection = key === "members" ? "descending" : "ascending";
    if (sort.key !== key) {
      return `${label}, not sorted. Activate to sort ${defaultDirection}.`;
    }
    const nextDirection = sort.direction === "ascending" ? "descending" : "ascending";
    return `${label}, sorted ${sort.direction}. Activate to sort ${nextDirection}.`;
  }

  function sortIcon(key: GroupSortKey) {
    const Icon = sort.key !== key
      ? ArrowUpDown
      : sort.direction === "ascending"
        ? ArrowUp
        : ArrowDown;
    return <Icon aria-hidden="true" data-active={sort.key === key ? "true" : "false"} />;
  }

  return (
    <div className={styles.groupWorkspace}>
      <aside className={styles.groupNavigator} aria-label="Group selector">
        <div className={styles.navigatorHeading}>
          <div>
            <span>Group browser</span>
            <strong>{groups.length} available</strong>
          </div>
          <output htmlFor={`${id}-search`}>{filteredGroups.length}</output>
        </div>
        <div className={styles.navigatorSearch}>
          <SearchField
            id={`${id}-search`}
            label="Find a group"
            value={query}
            onValueChange={setQuery}
            onClear={() => setQuery("")}
            placeholder="Name, key, source, or status"
            autoComplete="off"
            maxLength={100}
            pending={query !== deferredQuery}
            aria-describedby={statusId}
          />
        </div>
        <span className="sr-only" id={statusId} role="status" aria-live="polite">
          {filteredGroups.length} matching group{filteredGroups.length === 1 ? "" : "s"}.
          {selectedGroup ? ` ${selectedGroup.displayName} selected.` : " No group selected."}
          {` Sorted by ${sort.key}, ${sort.direction}.`}
        </span>
        <div className={styles.groupNavigationList}>
          {filteredGroups.length ? (
            <table className={styles.groupNavigationTable}>
              <caption className="sr-only">Connected groups. Select a column heading to sort.</caption>
              <thead>
                <tr>
                  <th scope="col" aria-sort={ariaSort("name")}>
                    <button type="button" onClick={() => changeSort("name")} aria-label={sortButtonLabel("name", "Group name")}>
                      Group {sortIcon("name")}
                    </button>
                  </th>
                  <th scope="col" aria-sort={ariaSort("type")}>
                    <button type="button" onClick={() => changeSort("type")} aria-label={sortButtonLabel("type", "Group type")}>
                      Type {sortIcon("type")}
                    </button>
                  </th>
                  <th scope="col" aria-sort={ariaSort("members")}>
                    <button type="button" onClick={() => changeSort("members")} aria-label={sortButtonLabel("members", "Member count")}>
                      Members {sortIcon("members")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((group) => {
                  const selected = group.id === visibleSelectedId;
                  const relatedCount = group.tagCount + group.privilegeCount + group.rewardCount;
                  return (
                    <tr
                      key={group.id}
                      data-selected={selected ? "true" : "false"}
                      style={{ "--group-accent": group.accent } as CSSProperties}
                    >
                      <td>
                        <button
                          className={styles.groupNavigationItem}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => selectGroup(group.id)}
                        >
                          <span className={styles.groupNavigationAccent} aria-hidden="true" />
                          <span className={styles.groupNavigationCopy}>
                            <span>
                              <strong>{group.displayName}</strong>
                              <i data-enabled={group.enabled ? "true" : "false"}>
                                {group.enabled ? "Active" : "Disabled"}
                              </i>
                            </span>
                            <code>{group.key}</code>
                            <small>{relatedCount} linked</small>
                          </span>
                          <ChevronRight aria-hidden="true" />
                        </button>
                      </td>
                      <td>
                        <span className={styles.groupTypeBadge} data-group-type={group.groupType}>
                          {groupTypeLabel(group.groupType)}
                        </span>
                        <small>{group.source}</small>
                      </td>
                      <td data-column="members">{group.memberCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className={styles.navigatorEmpty}>No groups match this search.</p>
          )}
        </div>
      </aside>

      <div className={styles.groupWorkspacePanels}>
        {panels.map((panel, index) => (
          <div
            key={groups[index]?.id ?? index}
            hidden={groups[index]?.id !== visibleSelectedId}
          >
            {panel}
          </div>
        ))}
        {!selectedGroup ? (
          <div className={styles.groupWorkspaceEmpty}>
            <strong>No matching group to edit.</strong>
            <span>Adjust the group search or clear it to return to the current selection.</span>
            <button className="button button-secondary" type="button" onClick={() => setQuery("")}>
              Clear search
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PermissionPicker({
  id,
  name = "privilegeId",
  label = "Permission catalogue",
  permissions,
  required = false,
}: {
  id: string;
  name?: string;
  label?: string;
  permissions: PermissionCatalogueOption[];
  required?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const deferredQuery = useDeferredValue(query);
  const resultId = `${id}-result`;
  const statusId = `${id}-status`;
  const filteredPermissions = useMemo(
    () => permissions.filter((permission) => matches([
      permission.key,
      permission.displayName,
      permission.description ?? "",
      permission.scope,
      permission.sensitive ? "sensitive" : "standard",
    ].join(" "), deferredQuery)),
    [deferredQuery, permissions],
  );

  function preventSearchSubmit(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.preventDefault();
  }

  return (
    <div className={styles.permissionPicker} role="group" aria-labelledby={`${id}-label`}>
      <span className={styles.controlLabel} id={`${id}-label`}>{label}</span>
      <SearchField
        id={id}
        label="Search permissions"
        value={query}
        onValueChange={(value) => {
          setQuery(value);
          setSelectedId("");
        }}
        onClear={() => {
          setQuery("");
          setSelectedId("");
        }}
        onKeyDown={preventSearchSubmit}
        placeholder="Key, name, scope, or description"
        autoComplete="off"
        maxLength={120}
        pending={query !== deferredQuery}
        aria-describedby={statusId}
      />
      <label className={styles.permissionResult} htmlFor={resultId}>
        Matching permission
        <select
          id={resultId}
          name={name}
          value={selectedId}
          required={required}
          onChange={(event) => setSelectedId(event.currentTarget.value)}
        >
          <option value="">
            {filteredPermissions.length
              ? "Choose a permission"
              : "No matching permissions"}
          </option>
          {filteredPermissions.map((permission) => (
            <option key={permission.id} value={permission.id}>
              {permission.displayName} · {permission.key} · {permission.scope}{permission.sensitive ? " · sensitive" : ""}
            </option>
          ))}
        </select>
      </label>
      <span className="sr-only" id={statusId} role="status" aria-live="polite">
        {filteredPermissions.length} matching permission{filteredPermissions.length === 1 ? "" : "s"}.
      </span>
    </div>
  );
}

export function SearchableCatalogue({
  id,
  label,
  placeholder,
  entries,
  emptyMessage,
}: {
  id?: string;
  label: string;
  placeholder: string;
  entries: SearchableCatalogueEntry[];
  emptyMessage: string;
}) {
  const generatedId = useId().replaceAll(":", "");
  const inputId = id ?? `catalogue-search-${generatedId}`;
  const statusId = `${inputId}-status`;
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const filteredEntries = useMemo(
    () => entries.filter((entry) => matches(entry.searchText, deferredQuery)),
    [deferredQuery, entries],
  );

  return (
    <div className={styles.searchableCatalogue}>
      <div className={styles.catalogueToolbar}>
        <SearchField
          id={inputId}
          label={label}
          value={query}
          onValueChange={setQuery}
          placeholder={placeholder}
          autoComplete="off"
          maxLength={120}
          pending={query !== deferredQuery}
          aria-describedby={statusId}
        />
        <output className={styles.resultCount} htmlFor={inputId}>
          <strong>{filteredEntries.length}</strong>
          <span>of {entries.length}</span>
        </output>
      </div>
      <span className="sr-only" id={statusId} role="status" aria-live="polite">
        {filteredEntries.length} of {entries.length} catalogue entries shown.
      </span>
      <div className={styles.catalogueList}>
        {filteredEntries.length ? filteredEntries.map((entry) => (
          <Fragment key={entry.id}>{entry.content}</Fragment>
        )) : (
          <p className={styles.catalogueEmpty}>{emptyMessage}</p>
        )}
      </div>
    </div>
  );
}
