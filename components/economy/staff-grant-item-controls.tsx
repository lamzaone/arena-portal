"use client";

import {
  Box,
  Check,
  Crosshair,
  Crown,
  Gift,
  Layers3,
  LoaderCircle,
  PackageOpen,
  Palette,
  Plus,
  ShieldOff,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_SEARCH_DEBOUNCE_MS,
  SearchField,
} from "@/components/ui/search-field";

import type {
  EconomyCatalogueItem,
  EconomyItemType,
} from "@/lib/data/portal-repository";
import {
  ECONOMY_ITEM_TYPES,
  ECONOMY_MAX_RARITY_RANK,
  ECONOMY_RARITIES,
  ECONOMY_SPECIAL_RARITY_RANK,
  economyItemTypeLabel,
  isCustomProductItemType,
  isEconomyItemType,
} from "@/lib/economy/item-taxonomy";

export type GrantCatalogueItem = Pick<
  EconomyCatalogueItem,
  "id" | "displayName" | "itemType" | "rarityRank" | "enabled"
>;

type GrantMode = "catalogue" | "custom";
type CatalogueFilter = "featured" | "containers" | "vip" | "themes" | "all";
type SubmitState = "idle" | "submitting" | "success" | "error";

type GrantLine = {
  key: string;
  source: GrantMode;
  catalogue?: GrantCatalogueItem;
  itemType: EconomyItemType;
  displayName: string;
  definitionIndex: string;
  paintkit: string;
  rarityRank: number;
  metadata: string;
  quantity: number;
  stattrak: boolean;
  stattrakCount: string;
  souvenir: boolean;
  tradable: boolean;
  floatValue: string;
  seed: string;
  nametag: string;
  attributes: string;
  initialStickers: string;
};

type CatalogueSearchResponse = {
  ok?: boolean;
  message?: string;
  items?: unknown;
  total?: number;
};

type BatchGrantResponse = {
  ok?: boolean;
  message?: string;
  grantedCount?: number;
  lineIndex?: number;
};

const customItemTypes: EconomyItemType[] = ECONOMY_ITEM_TYPES.filter(
  (itemType) =>
    itemType !== "crate" &&
    itemType !== "capsule" &&
    !isCustomProductItemType(itemType),
);

const featuredTypes = new Set<EconomyItemType>([
  "crate",
  "capsule",
  "vip_membership",
  "profile_theme",
]);

const catalogueFilters: Array<{ value: CatalogueFilter; label: string }> = [
  { value: "featured", label: "Quick grants" },
  { value: "containers", label: "Crates" },
  { value: "vip", label: "VIP" },
  { value: "themes", label: "Themes" },
  { value: "all", label: "All loaded" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSearchItems(value: unknown): GrantCatalogueItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const id = Number(candidate.id);
    const displayName = String(candidate.displayName ?? "").trim();
    const itemType = candidate.itemType;
    const rarityRank = candidate.rarityRank;
    const enabled = candidate.enabled;
    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      !displayName ||
      !isEconomyItemType(itemType) ||
      typeof rarityRank !== "number" ||
      !Number.isSafeInteger(rarityRank) ||
      rarityRank < 0 ||
      rarityRank > ECONOMY_MAX_RARITY_RANK ||
      typeof enabled !== "boolean"
    ) {
      return [];
    }
    return [{ id, displayName, itemType, rarityRank, enabled }];
  });
}

function matchesFilter(item: GrantCatalogueItem, filter: CatalogueFilter) {
  if (filter === "featured") return featuredTypes.has(item.itemType);
  if (filter === "containers")
    return item.itemType === "crate" || item.itemType === "capsule";
  if (filter === "vip") return item.itemType === "vip_membership";
  if (filter === "themes") return item.itemType === "profile_theme";
  return true;
}

function CatalogueIcon({ itemType }: { itemType: EconomyItemType }) {
  if (itemType === "crate" || itemType === "capsule")
    return <PackageOpen aria-hidden="true" />;
  if (itemType === "vip_membership") return <Crown aria-hidden="true" />;
  if (itemType === "profile_theme") return <Palette aria-hidden="true" />;
  return <Box aria-hidden="true" />;
}

function newLineKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `grant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function newIdempotencyKey() {
  return newLineKey().replaceAll("-", "");
}

function isContainer(itemType: EconomyItemType) {
  return itemType === "crate" || itemType === "capsule";
}

function isSkinLike(itemType: EconomyItemType) {
  return itemType === "skin" || itemType === "knife" || itemType === "glove";
}

function catalogueLine(item: GrantCatalogueItem): GrantLine {
  return {
    key: newLineKey(),
    source: "catalogue",
    catalogue: item,
    itemType: item.itemType,
    displayName: item.displayName,
    definitionIndex: "",
    paintkit: "",
    rarityRank: item.rarityRank,
    metadata: "",
    quantity: 1,
    stattrak: false,
    stattrakCount: "0",
    souvenir: false,
    tradable: true,
    floatValue: "",
    seed: "",
    nametag: "",
    attributes: "",
    initialStickers: "",
  };
}

function customLine(itemType: EconomyItemType, displayName: string): GrantLine {
  return {
    key: newLineKey(),
    source: "custom",
    itemType,
    displayName,
    definitionIndex: "",
    paintkit: "",
    rarityRank: 0,
    metadata: "",
    quantity: 1,
    stattrak: false,
    stattrakCount: "0",
    souvenir: false,
    tradable: true,
    floatValue: "",
    seed: "",
    nametag: "",
    attributes: "",
    initialStickers: "",
  };
}

function parsedOptionalNumber(
  value: string,
  label: string,
  options: { integer?: boolean; minimum: number; maximum: number },
) {
  const normalized = value.trim();
  if (!normalized) return { value: undefined as number | undefined };
  const parsed = Number(normalized);
  if (
    !Number.isFinite(parsed) ||
    (options.integer && !Number.isSafeInteger(parsed)) ||
    parsed < options.minimum ||
    parsed > options.maximum
  ) {
    return {
      value: undefined,
      error: `${label} must be between ${options.minimum} and ${options.maximum}.`,
    };
  }
  return { value: parsed };
}

function parsedRecord(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized)
    return { value: undefined as Record<string, unknown> | undefined };
  try {
    const parsed: unknown = JSON.parse(normalized);
    return isRecord(parsed)
      ? { value: parsed }
      : { value: undefined, error: `${label} must be a JSON object.` };
  } catch {
    return { value: undefined, error: `${label} contains invalid JSON.` };
  }
}

function parsedStickers(value: string) {
  const normalized = value.trim();
  if (!normalized) return { value: undefined as unknown[] | undefined };
  try {
    const parsed: unknown = JSON.parse(normalized);
    return Array.isArray(parsed) && parsed.length <= 6
      ? { value: parsed }
      : {
          value: undefined,
          error: "Initial stickers must be a JSON array with at most six entries.",
        };
  } catch {
    return { value: undefined, error: "Initial stickers contain invalid JSON." };
  }
}

export function StaffGrantItemControls({
  action,
  catalogue,
  csrf,
  initialIdempotencyKey,
  steamId,
}: {
  action: string;
  catalogue: GrantCatalogueItem[];
  csrf: string;
  initialIdempotencyKey: string;
  steamId: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<GrantMode>("catalogue");
  const [filter, setFilter] = useState<CatalogueFilter>("featured");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GrantCatalogueItem[] | null>(
    null,
  );
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const [customType, setCustomType] = useState<EconomyItemType>("skin");
  const [customName, setCustomName] = useState("");
  const [lines, setLines] = useState<GrantLine[]>([]);
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(initialIdempotencyKey);
  const searchRequestRef = useRef<AbortController | null>(null);

  const visibleCatalogue = useMemo(() => {
    if (query.trim()) return searchResults ?? [];
    return catalogue.filter((item) => matchesFilter(item, filter)).slice(0, 40);
  }, [catalogue, filter, query, searchResults]);
  const selectedCatalogueCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const line of lines) {
      if (line.catalogue)
        counts.set(line.catalogue.id, (counts.get(line.catalogue.id) ?? 0) + 1);
    }
    return counts;
  }, [lines]);
  const totalInstances = lines.reduce((total, line) => total + line.quantity, 0);

  function updateLine(key: string, update: (line: GrantLine) => GrantLine) {
    setLines((current) =>
      current.map((line) => (line.key === key ? update(line) : line)),
    );
    setLineErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (submitState !== "submitting") {
      setSubmitState("idle");
      setSubmitMessage("");
    }
  }

  function addCatalogueLine(item: GrantCatalogueItem) {
    if (lines.length >= 50) {
      setSubmitState("error");
      setSubmitMessage("A bulk grant supports at most 50 selected lines.");
      return;
    }
    setLines((current) => [...current, catalogueLine(item)]);
    setSubmitState("idle");
    setSubmitMessage(`${item.displayName} added to the selected list.`);
  }

  function addCustomLine() {
    const displayName = customName.trim();
    if (!displayName) {
      setSubmitState("error");
      setSubmitMessage("Enter a display name before adding a custom item.");
      return;
    }
    if (lines.length >= 50) {
      setSubmitState("error");
      setSubmitMessage("A bulk grant supports at most 50 selected lines.");
      return;
    }
    setLines((current) => [...current, customLine(customType, displayName)]);
    setCustomName("");
    setSubmitState("idle");
    setSubmitMessage(`${displayName} added to the selected list.`);
  }

  function restoreCatalogueShortcut() {
    searchRequestRef.current?.abort();
    setQuery("");
    setSearchResults(null);
    setSearchState("idle");
    setSearchMessage("");
  }

  function updateCatalogueQuery(value: string) {
    searchRequestRef.current?.abort();
    setQuery(value);
    if (!value.trim()) {
      setSearchResults(null);
      setSearchState("idle");
      setSearchMessage("");
      return;
    }
    setSearchResults([]);
    setSearchState("loading");
    setSearchMessage("");
  }

  function selectCatalogueFilter(nextFilter: CatalogueFilter) {
    setFilter(nextFilter);
    restoreCatalogueShortcut();
  }

  useEffect(() => {
    const normalized = query.trim();
    if (mode !== "catalogue" || !normalized) return;

    const controller = new AbortController();
    searchRequestRef.current = controller;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/admin/economy/catalogue-search?q=${encodeURIComponent(normalized)}`,
            {
              cache: "no-store",
              credentials: "same-origin",
              headers: { accept: "application/json" },
              signal: controller.signal,
            },
          );
          const body = (await response.json().catch(() => null)) as
            | CatalogueSearchResponse
            | null;
          if (!response.ok || body?.ok !== true)
            throw new Error(body?.message || "Catalogue search is unavailable.");
          if (controller.signal.aborted) return;

          const items = parseSearchItems(body.items);
          const total = Number(body.total ?? items.length);
          setSearchResults(items);
          setSearchState("ready");
          setSearchMessage(
            items.length
              ? `${Number.isFinite(total) ? total.toLocaleString() : items.length} matching catalogue item${total === 1 ? "" : "s"}.`
              : "No catalogue items matched that search.",
          );
        } catch (cause) {
          if (controller.signal.aborted) return;
          setSearchResults([]);
          setSearchState("error");
          setSearchMessage(
            cause instanceof Error
              ? cause.message
              : "Catalogue search is unavailable.",
          );
        }
      })();
    }, DEFAULT_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (searchRequestRef.current === controller) searchRequestRef.current = null;
    };
  }, [mode, query]);

  function buildPayload() {
    const errors: Record<string, string> = {};
    let expandedTotal = 0;
    const payload = lines.flatMap((line) => {
      const lineLabel = line.displayName.trim() || "Selected item";
      if (!line.displayName.trim()) {
        errors[line.key] = "Enter a display name for this custom item.";
        return [];
      }
      if (!isContainer(line.itemType) && line.quantity !== 1) {
        errors[line.key] = "Only crates and capsules can use a quantity above one.";
        return [];
      }
      if (
        !Number.isSafeInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 100
      ) {
        errors[line.key] = "Quantity must be between 1 and 100.";
        return [];
      }
      expandedTotal += line.quantity;
      const floatValue = parsedOptionalNumber(line.floatValue, "Float", {
        minimum: 0,
        maximum: 1,
      });
      const seed = parsedOptionalNumber(line.seed, "Seed", {
        integer: true,
        minimum: 0,
        maximum: 1000,
      });
      const stattrakCount = parsedOptionalNumber(
        line.stattrakCount,
        "StatTrak count",
        { integer: true, minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      );
      const attributes = parsedRecord(line.attributes, "Instance attributes");
      const stickers = parsedStickers(line.initialStickers);
      const metadata = parsedRecord(line.metadata, "Custom item metadata");
      const definitionIndex = parsedOptionalNumber(
        line.definitionIndex,
        "Definition index",
        { integer: true, minimum: 0, maximum: 65_535 },
      );
      const paintkit = parsedOptionalNumber(line.paintkit, "Paintkit", {
        integer: true,
        minimum: 0,
        maximum: 2_000_000,
      });
      const firstError = [
        floatValue.error,
        seed.error,
        stattrakCount.error,
        attributes.error,
        stickers.error,
        metadata.error,
        definitionIndex.error,
        paintkit.error,
      ].find(Boolean);
      if (firstError) {
        errors[line.key] = `${lineLabel}: ${firstError}`;
        return [];
      }
      const customization = {
        ...(isSkinLike(line.itemType) && seed.value !== undefined
          ? { seed: seed.value }
          : {}),
        ...(isSkinLike(line.itemType) && floatValue.value !== undefined
          ? { floatValue: floatValue.value }
          : {}),
        stattrak:
          (line.itemType === "skin" || line.itemType === "knife") &&
          line.stattrak,
        stattrakCount:
          line.stattrak && stattrakCount.value !== undefined
            ? stattrakCount.value
            : 0,
        souvenir: line.itemType === "skin" && line.souvenir,
        ...(isSkinLike(line.itemType) && line.nametag.trim()
          ? { nametag: line.nametag.trim() }
          : {}),
        ...(attributes.value ? { attributes: attributes.value } : {}),
      };
      return [
        {
          ...(line.catalogue
            ? { catalogueId: line.catalogue.id }
            : {
                customItem: {
                  itemType: line.itemType,
                  displayName: line.displayName.trim(),
                  ...(definitionIndex.value !== undefined
                    ? { definitionIndex: definitionIndex.value }
                    : {}),
                  ...(paintkit.value !== undefined
                    ? { paintkit: paintkit.value }
                    : {}),
                  rarityRank: line.rarityRank,
                  ...(metadata.value ? { metadata: metadata.value } : {}),
                },
              }),
          customization,
          tradable: line.souvenir ? false : line.tradable,
          quantity: line.quantity,
          ...(stickers.value ? { stickers: stickers.value } : {}),
        },
      ];
    });
    if (expandedTotal > 500) {
      setSubmitMessage(
        "This grant expands to more than 500 items. Reduce one or more crate quantities.",
      );
      return { payload: null, errors };
    }
    return { payload, errors };
  }

  async function submitGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitState === "submitting") return;
    if (!lines.length) {
      setSubmitState("error");
      setSubmitMessage("Add at least one item to the selected list.");
      return;
    }
    const { payload, errors } = buildPayload();
    setLineErrors(errors);
    if (!payload || Object.keys(errors).length || payload.length !== lines.length) {
      setSubmitState("error");
      if (payload)
        setSubmitMessage("Review the highlighted selected items before granting.");
      return;
    }

    setSubmitState("submitting");
    setSubmitMessage("Validating and granting the selected items atomically…");
    const formData = new FormData(event.currentTarget);
    formData.set("grantLines", JSON.stringify(payload));
    try {
      const response = await fetch(action, {
        method: "POST",
        body: formData,
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const body = (await response.json().catch(() => null)) as
        | BatchGrantResponse
        | null;
      if (!response.ok || body?.ok !== true) {
        if (typeof body?.lineIndex === "number" && lines[body.lineIndex]) {
          setLineErrors({
            [lines[body.lineIndex].key]:
              body.message || "This selected item could not be granted.",
          });
        }
        throw new Error(body?.message || "The selected items could not be granted.");
      }
      const grantedCount = Number(body.grantedCount ?? totalInstances);
      setLines([]);
      setLineErrors({});
      setIdempotencyKey(newIdempotencyKey());
      setSubmitState("success");
      setSubmitMessage(
        body.message ||
          `${grantedCount.toLocaleString()} item${grantedCount === 1 ? "" : "s"} granted.`,
      );
      router.refresh();
    } catch (cause) {
      setSubmitState("error");
      setSubmitMessage(
        cause instanceof Error
          ? cause.message
          : "The selected items could not be granted. Nothing was added.",
      );
    }
  }

  return (
    <form
      className="form-panel economy-admin-form economy-admin-grant staff-grant-form"
      action={action}
      method="post"
      onSubmit={submitGrant}
    >
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="action" value="grant-batch" />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="steamId" value={steamId} />
      <input type="hidden" name="grantLines" value="[]" />

      <fieldset className="staff-grant-source">
        <legend>Add inventory items</legend>
        <label className={mode === "catalogue" ? "is-selected" : ""}>
          <input
            type="radio"
            checked={mode === "catalogue"}
            onChange={() => setMode("catalogue")}
          />
          <Gift aria-hidden="true" />
          <span>
            <strong>Catalogue items</strong>
            <small>Crates, VIP, themes and imported cosmetics</small>
          </span>
        </label>
        <label className={mode === "custom" ? "is-selected" : ""}>
          <input
            type="radio"
            checked={mode === "custom"}
            onChange={() => setMode("custom")}
          />
          <Wrench aria-hidden="true" />
          <span>
            <strong>Custom instance</strong>
            <small>Advanced non-product inventory items</small>
          </span>
        </label>
      </fieldset>

      {mode === "catalogue" ? (
        <section
          className="staff-grant-catalogue"
          aria-labelledby="staff-grant-catalogue-title"
        >
          <div className="staff-grant-section-heading">
            <div>
              <span>Item picker</span>
              <h3 id="staff-grant-catalogue-title">Search and add items</h3>
            </div>
            <small>
              Add the same catalogue item more than once to create differently
              configured instances.
            </small>
          </div>
          <div className="staff-grant-search-row">
            <SearchField
              id="staff-grant-catalogue-search"
              label="Search catalogue"
              value={query}
              onValueChange={updateCatalogueQuery}
              onClear={restoreCatalogueShortcut}
              pending={searchState === "loading"}
              maxLength={120}
              placeholder="Name, type or catalogue ID"
              autoComplete="off"
              aria-describedby="staff-grant-search-status"
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
            />
          </div>
          <div className="staff-grant-filters" aria-label="Catalogue shortcuts">
            {catalogueFilters.map((item) => (
              <button
                key={item.value}
                type="button"
                className={
                  filter === item.value && !query.trim() ? "is-active" : ""
                }
                aria-pressed={filter === item.value && !query.trim()}
                onClick={() => selectCatalogueFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div
            className="staff-grant-catalogue-list"
            role="group"
            aria-label="Grantable catalogue items"
          >
            {visibleCatalogue.length ? (
              visibleCatalogue.map((item) => {
                const selectedCount = selectedCatalogueCounts.get(item.id) ?? 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={selectedCount ? "is-selected" : ""}
                    onClick={() => addCatalogueLine(item)}
                    disabled={lines.length >= 50}
                    aria-label={`Add ${item.displayName} to selected items`}
                  >
                    <span className="staff-grant-item-icon">
                      <CatalogueIcon itemType={item.itemType} />
                    </span>
                    <span>
                      <strong>{item.displayName}</strong>
                      <small>
                        {economyItemTypeLabel(item.itemType)} · ID {item.id}
                        {!item.enabled ? " · Disabled in shop" : ""}
                      </small>
                    </span>
                    {selectedCount ? (
                      <span
                        className="staff-grant-added-count"
                        aria-label={`${selectedCount} selected`}
                      >
                        {selectedCount}
                      </span>
                    ) : (
                      <Plus aria-hidden="true" />
                    )}
                  </button>
                );
              })
            ) : (
              <p className="empty-copy">
                {searchState === "loading"
                  ? "Searching the catalogue..."
                  : query.trim()
                    ? "No catalogue items matched. Try another name, type or ID."
                    : "No catalogue items are available in this shortcut."}
              </p>
            )}
          </div>
          <span
            className="staff-grant-search-status"
            id="staff-grant-search-status"
            role="status"
            aria-live="polite"
          >
            {searchState === "loading" ? "Searching the catalogue." : searchMessage}
          </span>
        </section>
      ) : (
        <section
          className="staff-grant-custom"
          aria-labelledby="staff-grant-custom-title"
        >
          <div className="staff-grant-section-heading">
            <div>
              <span>Custom builder</span>
              <h3 id="staff-grant-custom-title">Add a custom instance</h3>
            </div>
            <small>
              Containers, VIP memberships and profile themes must remain
              catalogue-backed.
            </small>
          </div>
          <div className="staff-grant-custom-add">
            <label>
              Item type
              <select
                value={customType}
                onChange={(event) =>
                  setCustomType(event.currentTarget.value as EconomyItemType)
                }
              >
                {customItemTypes.map((itemType) => (
                  <option key={itemType} value={itemType}>
                    {economyItemTypeLabel(itemType)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Display name
              <input
                value={customName}
                onChange={(event) => setCustomName(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  addCustomLine();
                }}
                maxLength={180}
                placeholder="Custom item name"
              />
            </label>
            <button
              className="button button-secondary"
              type="button"
              onClick={addCustomLine}
              disabled={!customName.trim() || lines.length >= 50}
            >
              <Plus aria-hidden="true" /> Add custom item
            </button>
          </div>
        </section>
      )}

      <section
        className="staff-grant-selected"
        aria-labelledby="staff-grant-selected-title"
      >
        <div className="staff-grant-section-heading staff-grant-selected-heading">
          <div>
            <span>Selected list</span>
            <h3 id="staff-grant-selected-title">Configure each grant</h3>
          </div>
          <div className="staff-grant-selection-totals" aria-live="polite">
            <strong>{lines.length}</strong> line{lines.length === 1 ? "" : "s"}
            <span aria-hidden="true">·</span>
            <strong>{totalInstances}</strong> item{totalInstances === 1 ? "" : "s"}
          </div>
        </div>

        {lines.length ? (
          <div className="staff-grant-selected-list">
            {lines.map((line, index) => {
              const skinLike = isSkinLike(line.itemType);
              const stattrakSupported =
                line.itemType === "skin" || line.itemType === "knife";
              const souvenirSupported = line.itemType === "skin";
              return (
                <article
                  key={line.key}
                  className={`staff-grant-line${lineErrors[line.key] ? " has-error" : ""}`}
                >
                  <details open={lineErrors[line.key] ? true : undefined}>
                    <summary>
                      <span className="staff-grant-line-index">{index + 1}</span>
                      <span className="staff-grant-item-icon">
                        <CatalogueIcon itemType={line.itemType} />
                      </span>
                      <span className="staff-grant-line-summary-copy">
                        <strong>{line.displayName || "Unnamed custom item"}</strong>
                        <small>
                          {economyItemTypeLabel(line.itemType)}
                          {line.catalogue
                            ? ` · Catalogue #${line.catalogue.id}`
                            : " · Custom"}
                          {line.quantity > 1 ? ` · ×${line.quantity}` : ""}
                        </small>
                      </span>
                      {lineErrors[line.key] ? (
                        <span className="staff-grant-line-error-badge">Review</span>
                      ) : (
                        <span className="staff-grant-line-ready">
                          <Check aria-hidden="true" /> Ready
                        </span>
                      )}
                    </summary>
                    <div className="staff-grant-line-content">
                      {line.source === "custom" ? (
                        <fieldset className="staff-grant-line-section">
                          <legend>Custom item identity</legend>
                          <div className="form-grid">
                            <label>
                              Item type
                              <select
                                value={line.itemType}
                                onChange={(event) => {
                                  const itemType = event.currentTarget
                                    .value as EconomyItemType;
                                  updateLine(line.key, (current) => ({
                                    ...current,
                                    itemType,
                                    stattrak:
                                      itemType === "skin" || itemType === "knife"
                                        ? current.stattrak
                                        : false,
                                    souvenir:
                                      itemType === "skin" ? current.souvenir : false,
                                    quantity: 1,
                                  }));
                                }}
                              >
                                {customItemTypes.map((itemType) => (
                                  <option key={itemType} value={itemType}>
                                    {economyItemTypeLabel(itemType)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Display name
                              <input
                                value={line.displayName}
                                onChange={(event) =>
                                  updateLine(line.key, (current) => ({
                                    ...current,
                                    displayName: event.currentTarget.value,
                                  }))
                                }
                                maxLength={180}
                              />
                            </label>
                            <label>
                              Definition index
                              <input
                                value={line.definitionIndex}
                                onChange={(event) =>
                                  updateLine(line.key, (current) => ({
                                    ...current,
                                    definitionIndex: event.currentTarget.value,
                                  }))
                                }
                                inputMode="numeric"
                              />
                            </label>
                            <label>
                              Paintkit
                              <input
                                value={line.paintkit}
                                onChange={(event) =>
                                  updateLine(line.key, (current) => ({
                                    ...current,
                                    paintkit: event.currentTarget.value,
                                  }))
                                }
                                inputMode="numeric"
                              />
                            </label>
                            <label>
                              Rarity rank
                              <select
                                value={line.rarityRank}
                                onChange={(event) =>
                                  updateLine(line.key, (current) => ({
                                    ...current,
                                    rarityRank: Number(event.currentTarget.value),
                                  }))
                                }
                              >
                                {ECONOMY_RARITIES.map((rarity) => (
                                  <option key={rarity.rank} value={rarity.rank}>
                                    {rarity.rank} · {rarity.name}
                                    {rarity.rank === ECONOMY_SPECIAL_RARITY_RANK
                                      ? " (custom only)"
                                      : ""}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </fieldset>
                      ) : null}

                      <fieldset className="staff-grant-line-section">
                        <legend>Instance properties</legend>
                        <div className="staff-grant-toggle-grid">
                          <label
                            className={line.stattrak ? "is-selected" : ""}
                            aria-disabled={!stattrakSupported}
                          >
                            <input
                              type="checkbox"
                              checked={line.stattrak}
                              disabled={!stattrakSupported}
                              onChange={(event) =>
                                updateLine(line.key, (current) => ({
                                  ...current,
                                  stattrak: event.currentTarget.checked,
                                  souvenir: event.currentTarget.checked
                                    ? false
                                    : current.souvenir,
                                }))
                              }
                            />
                            <Crosshair aria-hidden="true" />
                            <span>
                              <strong>StatTrak™</strong>
                              <small>
                                {stattrakSupported
                                  ? "Weapon skins and knives"
                                  : "Not supported by this type"}
                              </small>
                            </span>
                          </label>
                          <label
                            className={line.souvenir ? "is-selected" : ""}
                            aria-disabled={!souvenirSupported}
                          >
                            <input
                              type="checkbox"
                              checked={line.souvenir}
                              disabled={!souvenirSupported}
                              onChange={(event) =>
                                updateLine(line.key, (current) => ({
                                  ...current,
                                  souvenir: event.currentTarget.checked,
                                  stattrak: event.currentTarget.checked
                                    ? false
                                    : current.stattrak,
                                  tradable: event.currentTarget.checked
                                    ? false
                                    : current.tradable,
                                }))
                              }
                            />
                            <Sparkles aria-hidden="true" />
                            <span>
                              <strong>Souvenir</strong>
                              <small>
                                {souvenirSupported
                                  ? "Weapon skin · always untradable"
                                  : "Weapon skins only"}
                              </small>
                            </span>
                          </label>
                          <label className={!line.tradable ? "is-selected" : ""}>
                            <input
                              type="checkbox"
                              checked={!line.tradable}
                              disabled={line.souvenir}
                              onChange={(event) =>
                                updateLine(line.key, (current) => ({
                                  ...current,
                                  tradable: !event.currentTarget.checked,
                                }))
                              }
                            />
                            <ShieldOff aria-hidden="true" />
                            <span>
                              <strong>Untradable</strong>
                              <small>Cannot be traded or sold by the player</small>
                            </span>
                          </label>
                        </div>
                        <div className="form-grid staff-grant-instance-fields">
                          {isContainer(line.itemType) ? (
                            <label>
                              Quantity
                              <input
                                type="number"
                                value={line.quantity}
                                onChange={(event) =>
                                  updateLine(line.key, (current) => ({
                                    ...current,
                                    quantity: Number(event.currentTarget.value),
                                  }))
                                }
                                min={1}
                                max={100}
                                required
                              />
                              <small>1–100 container instances</small>
                            </label>
                          ) : null}
                          <label>
                            Float
                            <input
                              value={line.floatValue}
                              onChange={(event) =>
                                updateLine(line.key, (current) => ({
                                  ...current,
                                  floatValue: event.currentTarget.value,
                                }))
                              }
                              inputMode="decimal"
                              min="0"
                              max="1"
                              step="0.000001"
                              disabled={!skinLike}
                            />
                            <small>
                              {skinLike ? "Optional wear value" : "Skin-like items only"}
                            </small>
                          </label>
                          <label>
                            Seed
                            <input
                              value={line.seed}
                              onChange={(event) =>
                                updateLine(line.key, (current) => ({
                                  ...current,
                                  seed: event.currentTarget.value,
                                }))
                              }
                              inputMode="numeric"
                              min="0"
                              max="1000"
                              disabled={!skinLike}
                            />
                            <small>
                              {skinLike ? "Optional pattern seed" : "Skin-like items only"}
                            </small>
                          </label>
                          <label>
                            StatTrak count
                            <input
                              value={line.stattrakCount}
                              onChange={(event) =>
                                updateLine(line.key, (current) => ({
                                  ...current,
                                  stattrakCount: event.currentTarget.value,
                                }))
                              }
                              inputMode="numeric"
                              min="0"
                              disabled={!line.stattrak}
                            />
                          </label>
                          <label>
                            Name tag
                            <input
                              value={line.nametag}
                              onChange={(event) =>
                                updateLine(line.key, (current) => ({
                                  ...current,
                                  nametag: event.currentTarget.value,
                                }))
                              }
                              maxLength={128}
                              disabled={!skinLike}
                            />
                          </label>
                        </div>
                      </fieldset>

                      <details className="economy-admin-edit staff-grant-line-advanced">
                        <summary>Advanced instance data</summary>
                        <div className="economy-admin-form">
                          {line.source === "custom" ? (
                            <label>
                              Custom item metadata JSON
                              <textarea
                                value={line.metadata}
                                onChange={(event) =>
                                  updateLine(line.key, (current) => ({
                                    ...current,
                                    metadata: event.currentTarget.value,
                                  }))
                                }
                                placeholder='{"supportsNametag": true, "stickerSlots": 5}'
                              />
                            </label>
                          ) : null}
                          <label>
                            Instance attributes JSON
                            <textarea
                              value={line.attributes}
                              onChange={(event) =>
                                updateLine(line.key, (current) => ({
                                  ...current,
                                  attributes: event.currentTarget.value,
                                }))
                              }
                              placeholder='{"modelPath": "..."}'
                            />
                          </label>
                          <label>
                            Initial sticker array JSON
                            <small>
                              Optional; each entry needs a slot and catalogueId or
                              customItem.
                            </small>
                            <textarea
                              value={line.initialStickers}
                              onChange={(event) =>
                                updateLine(line.key, (current) => ({
                                  ...current,
                                  initialStickers: event.currentTarget.value,
                                }))
                              }
                              placeholder='[{"slot":0,"catalogueId":123}]'
                              disabled={line.itemType !== "skin"}
                            />
                          </label>
                        </div>
                      </details>
                      {lineErrors[line.key] ? (
                        <p className="staff-grant-line-error" role="alert">
                          {lineErrors[line.key]}
                        </p>
                      ) : null}
                    </div>
                  </details>
                  <button
                    className="staff-grant-remove"
                    type="button"
                    onClick={() => {
                      setLines((current) =>
                        current.filter((candidate) => candidate.key !== line.key),
                      );
                      setLineErrors((current) => {
                        const next = { ...current };
                        delete next[line.key];
                        return next;
                      });
                    }}
                    aria-label={`Remove ${line.displayName || "custom item"}`}
                    title="Remove selected item"
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="staff-grant-empty">
            <Layers3 aria-hidden="true" />
            <strong>No items selected</strong>
            <p>Search above and add one or more items, then configure each line here.</p>
          </div>
        )}
      </section>

      <div className="staff-grant-footer">
        <label>
          Staff reason
          <input
            name="reason"
            required
            maxLength={180}
            defaultValue="Staff inventory grant"
          />
        </label>
        <div className="staff-grant-submit-row">
          <span
            className={`staff-grant-submit-status is-${submitState}`}
            role="status"
            aria-live="polite"
          >
            {submitMessage}
          </span>
          <button
            className="button button-primary staff-grant-submit"
            type="submit"
            disabled={!lines.length || submitState === "submitting"}
          >
            {submitState === "submitting" ? (
              <LoaderCircle className="staff-grant-spinner" aria-hidden="true" />
            ) : (
              <Gift aria-hidden="true" />
            )}
            {submitState === "submitting"
              ? "Granting selection"
              : `Grant ${totalInstances || "selected"} item${totalInstances === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </form>
  );
}
