"use client";

import {
  Children,
  Fragment,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, Check, ChevronLeft, ChevronRight, UsersRound } from "lucide-react";

import { SearchField } from "@/components/ui/search-field";

import styles from "./groups-page.module.css";

export { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

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
  const [includeDisabled, setIncludeDisabled] = useState(
    groups.some(group => group.id === initialSelectedId && group.groupType === "custom" && !group.enabled),
  );
  const [sort, setSort] = useState<GroupSort>({
    key: "name",
    direction: "ascending",
  });
  const deferredQuery = useDeferredValue(query);
  const groupRail = useRef<HTMLDivElement>(null);
  const [railScroll, setRailScroll] = useState({ previous: false, next: false });
  const panels = Children.toArray(children);
  const filteredGroups = useMemo(
    () => groups
      .filter(group => group.groupType !== "custom" || group.enabled || includeDisabled)
      .filter((group) => matches([
        group.displayName,
        group.key,
        group.source,
        groupTypeLabel(group.groupType),
        group.enabled ? "enabled active" : "disabled inactive",
      ].join(" "), deferredQuery))
      .sort((left, right) => compareGroups(left, right, sort)),
    [deferredQuery, groups, sort, includeDisabled],
  );
  const selectedGroup =
    filteredGroups.find((group) => group.id === selectedId) ??
    filteredGroups[0] ??
    null;
  const visibleSelectedId = selectedGroup?.id ?? null;
  const statusId = `${id}-status`;

  useEffect(() => {
    const rail = groupRail.current;
    if (!rail) return;
    const updateScroll = () => setRailScroll({
      previous: rail.scrollLeft > 2,
      next: rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2,
    });
    updateScroll();
    const observer = new ResizeObserver(updateScroll);
    observer.observe(rail);
    rail.addEventListener("scroll", updateScroll, { passive: true });
    return () => {
      observer.disconnect();
      rail.removeEventListener("scroll", updateScroll);
    };
  }, [filteredGroups]);

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
    <div className={styles.groupWorkspace} data-ui="group-workspace">
      <aside className={styles.groupNavigator} aria-label="Group selector">
        <div className={styles.navigatorToolbar}>
          <div className={styles.navigatorHeading}>
            <div>
              <span>Choose a group</span>
              <strong>{filteredGroups.length} of {groups.length} groups</strong>
            </div>
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
          <div className={styles.navigatorSort} role="group" aria-label="Sort groups">
            {([["name", "Group name"], ["type", "Group type"], ["members", "Member count"]] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => changeSort(key)} aria-label={sortButtonLabel(key, label)} aria-pressed={sort.key === key}>
                {key === "name" ? "Name" : key === "type" ? "Type" : "Members"} {sortIcon(key)}
              </button>
            ))}
          </div>
          {groups.some(group => group.groupType === "custom" && !group.enabled) ? <label className={styles.inactiveGroupsToggle}>
            <input type="checkbox" checked={includeDisabled} onChange={event => setIncludeDisabled(event.target.checked)} />Show disabled groups
          </label> : null}
          {railScroll.previous || railScroll.next ? <div className={styles.railControls} role="group" aria-label="Browse group cards">
            <button type="button" aria-label="Scroll groups left" aria-controls={`${id}-rail`} disabled={!railScroll.previous} onClick={() => groupRail.current?.scrollBy({ left: -280, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}><ChevronLeft aria-hidden="true" /></button>
            <button type="button" aria-label="Scroll groups right" aria-controls={`${id}-rail`} disabled={!railScroll.next} onClick={() => groupRail.current?.scrollBy({ left: 280, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}><ChevronRight aria-hidden="true" /></button>
          </div> : null}
        </div>
        <span className="sr-only" id={statusId} role="status" aria-live="polite">
          {filteredGroups.length} matching group{filteredGroups.length === 1 ? "" : "s"}.
          {selectedGroup ? ` ${selectedGroup.displayName} selected.` : " No group selected."}
          {` Sorted by ${sort.key}, ${sort.direction}.`}
        </span>
        <div className={styles.groupNavigationList} id={`${id}-rail`} ref={groupRail}>
          {filteredGroups.length ? (
            <ul className={styles.groupNavigationChoices} aria-label="Available groups">
              {filteredGroups.map((group) => {
                const selected = group.id === visibleSelectedId;
                const relatedCount = group.tagCount + group.privilegeCount + group.rewardCount;
                return (
                  <li
                    key={group.id}
                    data-group-id={group.id}
                    data-selected={selected ? "true" : "false"}
                    style={{ "--group-accent": group.accent } as CSSProperties}
                  >
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
                        <small>{group.memberCount} member{group.memberCount === 1 ? "" : "s"} · {relatedCount} linked · {group.source}</small>
                      </span>
                      <span className={styles.groupSelectionMark} aria-hidden="true">
                        {selected ? <Check /> : <ChevronRight />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.navigatorEmpty}>No groups match this search.</p>
          )}
        </div>
        {selectedGroup ? <div className={styles.selectionContext}>
          <span><span className={styles.selectionDot} aria-hidden="true" /><strong>{selectedGroup.displayName}</strong> selected</span>
          <a href={`#assignments-${selectedGroup.id}`}><UsersRound aria-hidden="true" /> Members &amp; access <ArrowUpRight aria-hidden="true" /></a>
        </div> : null}
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
