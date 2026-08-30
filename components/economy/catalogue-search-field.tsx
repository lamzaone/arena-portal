"use client";

import { useEffect, useId, useState } from "react";

import {
  DEFAULT_SEARCH_DEBOUNCE_MS,
  SearchField,
} from "@/components/ui/search-field";
import { economyItemTypeLabel } from "@/lib/economy/item-taxonomy";

type CatalogueSearchItem = {
  id: number;
  displayName: string;
  itemType: string;
};

type CatalogueSearchResponse = {
  ok?: boolean;
  message?: string;
  items?: unknown;
  total?: number;
};

type CatalogueSearchFieldProps = {
  name: string;
  label?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseItems(value: unknown): CatalogueSearchItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const id = Number(candidate.id);
    const displayName = String(candidate.displayName ?? "").trim();
    const itemType = String(candidate.itemType ?? "").trim();
    if (!Number.isSafeInteger(id) || id < 1 || !displayName || !itemType) return [];
    return [{ id, displayName, itemType }];
  });
}

export function CatalogueSearchField({
  name,
  label = "Catalogue item",
  id,
  required = false,
  disabled = false,
}: CatalogueSearchFieldProps) {
  const generatedId = useId().replaceAll(":", "");
  const inputId = id ?? `catalogue-search-${generatedId}`;
  const resultId = `${inputId}-result`;
  const statusId = `${inputId}-status`;
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CatalogueSearchItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const normalized = query.trim();
    setSelectedId("");
    if (disabled || !normalized) {
      setItems([]);
      setState("idle");
      setMessage("");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState("loading");
      setMessage("");
      void fetch(
        `/api/admin/economy/catalogue-search?q=${encodeURIComponent(normalized)}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
          signal: controller.signal,
        },
      )
        .then(async (response) => {
          const body = (await response.json().catch(() => null)) as
            | CatalogueSearchResponse
            | null;
          if (!response.ok || body?.ok !== true) {
            throw new Error(body?.message || "Catalogue search is unavailable.");
          }
          return body;
        })
        .then((body) => {
          if (controller.signal.aborted) return;
          const nextItems = parseItems(body.items);
          setItems(nextItems);
          setSelectedId(nextItems.length === 1 ? String(nextItems[0].id) : "");
          setState("ready");
          setMessage(
            nextItems.length
              ? `${Number(body.total ?? nextItems.length).toLocaleString()} matching catalogue item${Number(body.total ?? nextItems.length) === 1 ? "" : "s"}.`
              : "No catalogue items matched that search.",
          );
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setItems([]);
          setState("error");
          setMessage(
            error instanceof Error
              ? error.message
              : "Catalogue search is unavailable.",
          );
        });
    }, DEFAULT_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [disabled, query]);

  return (
    <>
      <SearchField
        id={inputId}
        label={label}
        value={query}
        onValueChange={setQuery}
        onClear={() => {
          setQuery("");
          setItems([]);
          setSelectedId("");
          setState("idle");
          setMessage("");
        }}
        placeholder="Name, type, or catalogue ID"
        maxLength={120}
        autoComplete="off"
        pending={state === "loading"}
        disabled={disabled}
        aria-describedby={statusId}
      />
      <label htmlFor={resultId}>
        Matching item
        <select
          id={resultId}
          name={name}
          value={selectedId}
          required={required}
          disabled={disabled}
          onChange={(event) => setSelectedId(event.currentTarget.value)}
        >
          <option value="">
            {state === "loading"
              ? "Searching..."
              : items.length
                ? "Choose an item"
                : "Search above first"}
          </option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.displayName} · {economyItemTypeLabel(item.itemType)} · ID {item.id}
            </option>
          ))}
        </select>
      </label>
      <span className="sr-only" id={statusId} role="status" aria-live="polite">
        {state === "loading" ? "Searching the catalogue." : message}
      </span>
    </>
  );
}
