"use client";

import {
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  useDeferredValue,
  useId,
  useMemo,
  useState,
} from "react";

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

function searchable(value: string) {
  return value.normalize("NFKD").toLocaleLowerCase("en-US").trim();
}

function matches(value: string, query: string) {
  if (!query) return true;
  const words = searchable(query).split(/\s+/).filter(Boolean);
  const candidate = searchable(value);
  return words.every((word) => candidate.includes(word));
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
              {permission.displayName} · {permission.key} · {permission.scope}
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
