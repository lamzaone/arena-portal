"use client";

import {
  BadgePercent,
  CalendarClock,
  CircleDollarSign,
  PackageSearch,
  Power,
  Save,
  ShieldCheck,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type {
  EconomyCatalogueItem,
  EconomyDiscountRule,
  EconomyItemType,
} from "@/lib/data/portal-repository";
import {
  SearchField,
  SearchSubmitButton,
} from "@/components/ui/search-field";
import {
  ECONOMY_ITEM_TYPES,
  economyItemTypeLabel,
  economyItemTypePluralLabel,
} from "@/lib/economy/item-taxonomy";

import styles from "./discount-rule-admin.module.css";

type DiscountCatalogueOption = Pick<
  EconomyCatalogueItem,
  "id" | "displayName" | "itemType"
>;

type DiscountRuleAdminProps = {
  rules: EconomyDiscountRule[];
  catalogue: DiscountCatalogueOption[];
  csrf: string;
  returnTab?: "marketplace" | "discount";
  canManage?: boolean;
  initialQuery?: string;
  initialTotal?: number;
};

type CatalogueSearchResponse = {
  ok?: boolean;
  total?: number;
  items?: DiscountCatalogueOption[];
  message?: string;
};

const itemTypes: Array<{ value: EconomyItemType; label: string }> =
  ECONOMY_ITEM_TYPES.map((itemType) => ({
    value: itemType,
    label: economyItemTypePluralLabel(itemType),
  }));

function percentageValue(basisPoints: number) {
  return (basisPoints / 100).toFixed(basisPoints % 100 === 0 ? 0 : 2);
}

function utcInputValue(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}

function statusFor(rule: EconomyDiscountRule) {
  if (!rule.enabled) return { label: "Disabled", tone: styles.disabled };
  const now = Date.now();
  if (rule.startsAt && new Date(rule.startsAt).getTime() > now)
    return { label: "Scheduled", tone: styles.scheduled };
  if (rule.endsAt && new Date(rule.endsAt).getTime() <= now)
    return { label: "Ended", tone: styles.ended };
  return { label: "Active", tone: styles.active };
}

function targetLabel(
  rule: EconomyDiscountRule,
  catalogueById: Map<number, DiscountCatalogueOption>,
) {
  if (rule.targetType === "catalogue_item") {
    const item = rule.catalogueId
      ? catalogueById.get(rule.catalogueId)
      : undefined;
    return item
      ? `${item.displayName} (#${item.id})`
      : `Catalogue item #${rule.catalogueId ?? "unknown"}`;
  }
  return (
    itemTypes.find((itemType) => itemType.value === rule.itemType)?.label ??
    rule.itemType ??
    "Unknown category"
  );
}

function RuleFields({
  rule,
}: {
  rule?: EconomyDiscountRule;
}) {
  return (
    <>
      <div className={styles.primaryFields}>
        <label>
          Rule name
          <input
            name="discountName"
            required
            maxLength={120}
            defaultValue={rule?.displayName ?? ""}
            placeholder="Weekend crates"
          />
        </label>
        <label>
          Target
          <select
            name="discountTargetType"
            defaultValue={rule?.targetType ?? "catalogue_item"}
          >
            <option value="catalogue_item">Single catalogue item</option>
            <option value="item_type">Item category</option>
          </select>
        </label>
        <label>
          Catalogue item ID
          <input
            name="discountCatalogueId"
            inputMode="numeric"
            min={1}
            list="discount-catalogue-options"
            defaultValue={rule?.catalogueId ?? ""}
            placeholder="Search by ID or use the lookup"
          />
        </label>
        <label>
          Item category
          <select
            name="discountItemType"
            defaultValue={rule?.itemType ?? "crate"}
          >
            {itemTypes.map((itemType) => (
              <option key={itemType.value} value={itemType.value}>
                {itemType.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.adjustmentFields}>
        <label>
          Percentage off
          <span className={styles.inputSuffix}>
            <input
              name="discountPercentage"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              defaultValue={percentageValue(rule?.percentageBps ?? 0)}
            />
            <span aria-hidden="true">%</span>
          </span>
        </label>
        <label>
          Fixed Tokens off
          <input
            name="discountFixedTokens"
            inputMode="numeric"
            min={0}
            max={10_000_000_000}
            defaultValue={rule?.fixedTokens ?? 0}
          />
        </label>
        <label>
          Priority
          <input
            name="discountPriority"
            inputMode="numeric"
            min={-32_768}
            max={32_767}
            defaultValue={rule?.priority ?? 0}
          />
          <small>Higher wins between rules with the same target scope.</small>
        </label>
      </div>

      <div className={styles.scheduleFields}>
        <label>
          Starts at <span>UTC</span>
          <input
            type="datetime-local"
            name="discountStartsAt"
            defaultValue={utcInputValue(rule?.startsAt ?? null)}
          />
        </label>
        <label>
          Ends at <span>UTC</span>
          <input
            type="datetime-local"
            name="discountEndsAt"
            defaultValue={utcInputValue(rule?.endsAt ?? null)}
          />
        </label>
      </div>

      <label className={styles.exclusions}>
        Category exclusions
        <textarea
          name="discountExclusions"
          rows={2}
          maxLength={5_500}
          defaultValue={rule?.excludedCatalogueIds.join(", ") ?? ""}
          placeholder="Catalogue IDs separated by commas, for example: 42, 108, 310"
        />
        <small>
          Used only for category rules. Every ID must belong to that category.
        </small>
      </label>

      <label className={styles.enabledControl}>
        <input
          type="checkbox"
          name="discountEnabled"
          value="true"
          defaultChecked={rule?.enabled ?? true}
        />
        <span>
          <strong>Enabled</strong>
          <small>Date bounds still decide whether an enabled rule is active.</small>
        </span>
      </label>
    </>
  );
}

export function DiscountRuleAdmin({
  rules,
  catalogue,
  csrf,
  returnTab = "marketplace",
  canManage = true,
  initialQuery = "",
  initialTotal = catalogue.length,
}: DiscountRuleAdminProps) {
  const action = `/api/admin/economy?returnTab=${returnTab}`;
  const [query, setQuery] = useState(initialQuery);
  const [matches, setMatches] = useState(catalogue);
  const [knownCatalogue, setKnownCatalogue] = useState(catalogue);
  const [resultTotal, setResultTotal] = useState(initialTotal);
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [searchMessage, setSearchMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const catalogueById = useMemo(
    () => new Map(knownCatalogue.map((item) => [item.id, item])),
    [knownCatalogue],
  );

  async function searchCatalogue(value: string) {
    const normalized = value.trim();
    requestRef.current?.abort();
    if (!normalized) {
      setMatches(catalogue);
      setResultTotal(initialTotal);
      setSearchState("idle");
      setSearchMessage("");
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    setSearchState("loading");
    setSearchMessage("");
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
      const body = (await response.json()) as CatalogueSearchResponse;
      if (!response.ok || body.ok !== true || !Array.isArray(body.items))
        throw new Error(body.message || "Catalogue search failed.");
      if (controller.signal.aborted) return;

      const items = body.items.filter(
        (item) =>
          Number.isSafeInteger(item.id) &&
          item.id > 0 &&
          typeof item.displayName === "string" &&
          typeof item.itemType === "string",
      );
      setMatches(items);
      setResultTotal(
        Number.isSafeInteger(body.total) && (body.total ?? 0) >= 0
          ? (body.total as number)
          : items.length,
      );
      setKnownCatalogue((current) => {
        const merged = new Map(current.map((item) => [item.id, item]));
        for (const item of items) merged.set(item.id, item);
        return [...merged.values()];
      });
      setSearchState("ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      setSearchState("error");
      setSearchMessage(
        error instanceof Error
          ? error.message
          : "Catalogue search is temporarily unavailable.",
      );
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void searchCatalogue(query);
    }, 300);
    return () => window.clearTimeout(timer);
    // Search only when the user changes the lookup value. The initial
    // catalogue prop is stable for this mounted editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void searchCatalogue(query);
  }

  return (
    <section className={styles.panel} aria-labelledby="discount-settings-title">
      <datalist id="discount-catalogue-options">
        {knownCatalogue.map((item) => (
          <option key={item.id} value={item.id}>
            {item.displayName} · {economyItemTypeLabel(item.itemType)}
          </option>
        ))}
      </datalist>

      <header className={styles.header}>
        <div className={styles.headingIcon}>
          <BadgePercent aria-hidden="true" />
        </div>
        <div>
          <p className={styles.eyebrow}>Discount</p>
          <h2 id="discount-settings-title">Explicit price rules</h2>
          <p>
            Base prices never change. One active rule may reduce the final Token
            price; item rules always outrank category rules and promotions never
            stack.
          </p>
        </div>
        <div className={styles.securityMark}>
          <ShieldCheck aria-hidden="true" />
          <span>Rechecked at purchase</span>
        </div>
      </header>

      <section className={styles.lookup} aria-labelledby="discount-catalogue-lookup-title">
        <div className={styles.lookupHeading}>
          <PackageSearch aria-hidden="true" />
          <div>
            <p className={styles.eyebrow}>Catalogue lookup</p>
            <h3 id="discount-catalogue-lookup-title">
              Find rule targets and exclusions
            </h3>
          </div>
        </div>
        <form className={styles.lookupForm} role="search" onSubmit={submitSearch}>
          <SearchField
            id="staff-discount-lookup"
            label="Product name, type, or catalogue ID"
            value={query}
            onValueChange={setQuery}
            onClear={() => setQuery("")}
            pending={searchState === "loading"}
            maxLength={120}
            placeholder="Find an item to target or exclude…"
            autoComplete="off"
          />
          <SearchSubmitButton pending={searchState === "loading"}>
            Search catalogue
          </SearchSubmitButton>
        </form>
        <p
          className={`${styles.lookupStatus} ${searchState === "error" ? styles.lookupError : ""}`}
          aria-live="polite"
        >
          {searchState === "error"
            ? searchMessage
            : query.trim()
              ? `${resultTotal} product${resultTotal === 1 ? "" : "s"} match “${query.trim()}”.`
              : `Showing ${matches.length} of ${resultTotal} products for rule selection.`}
        </p>
        {matches.length ? (
          <div className={styles.lookupMatches} aria-label="Matching catalogue IDs">
            {matches.slice(0, 12).map((item) => (
              <span key={item.id}>
                <strong>#{item.id}</strong>
                <span>{item.displayName}</span>
                <small>{economyItemTypeLabel(item.itemType)}</small>
              </span>
            ))}
          </div>
        ) : searchState === "ready" ? (
          <p className={styles.lookupEmpty}>
            No catalogue products matched. Try a broader name, item type, or exact ID.
          </p>
        ) : null}
      </section>

      {canManage ? <details className={styles.createRule}>
        <summary>
          <span><BadgePercent aria-hidden="true" /> Add discount rule</span>
          <small>Single item or category</small>
        </summary>
        <form action={action} method="post" className={styles.form}>
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="action" value="discount-rule-create" />
          <RuleFields />
          <div className={styles.formFooter}>
            <p>
              Percentage is applied first, then fixed Tokens. The total deduction
              cannot reduce the item below zero.
            </p>
            <button className="button button-primary" type="submit">
              <Save aria-hidden="true" /> Create rule
            </button>
          </div>
        </form>
      </details> : (
        <p className={styles.readOnlyNotice}>
          Your staff role can review discounts but cannot create or change rules.
        </p>
      )}

      <div className={styles.ruleList}>
        {rules.length ? (
          rules.map((rule) => {
            const status = statusFor(rule);
            const excludedNames = rule.excludedCatalogueIds.map((id) =>
              catalogueById.get(id)?.displayName
                ? `${catalogueById.get(id)?.displayName} (#${id})`
                : `#${id}`,
            );
            return (
              <article className={styles.ruleCard} key={rule.id}>
                <div className={styles.ruleSummary}>
                  <div>
                    <div className={styles.ruleTitleLine}>
                      <h3>{rule.displayName}</h3>
                      <span className={`${styles.status} ${status.tone}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className={styles.target}>
                      <PackageSearch aria-hidden="true" />
                      {targetLabel(rule, catalogueById)}
                    </p>
                  </div>
                  <div className={styles.ruleNumbers}>
                    <span>
                      <BadgePercent aria-hidden="true" />
                      <strong>{percentageValue(rule.percentageBps)}%</strong>
                      percentage
                    </span>
                    <span>
                      <CircleDollarSign aria-hidden="true" />
                      <strong>{rule.fixedTokens.toLocaleString()}</strong>
                      fixed Tokens
                    </span>
                    <span>
                      <CalendarClock aria-hidden="true" />
                      <strong>{rule.priority}</strong>
                      priority
                    </span>
                  </div>
                </div>

                {(rule.startsAt || rule.endsAt || excludedNames.length) && (
                  <div className={styles.ruleMeta}>
                    <span>
                      {rule.startsAt
                        ? `Starts ${new Date(rule.startsAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`
                        : "Starts immediately"}
                    </span>
                    <span>
                      {rule.endsAt
                        ? `Ends ${new Date(rule.endsAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`
                        : "No end date"}
                    </span>
                    {excludedNames.length ? (
                      <span title={excludedNames.join(", ")}>
                        {excludedNames.length} excluded item
                        {excludedNames.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                )}

                {canManage ? <div className={styles.ruleActions}>
                  <details className={styles.editRule}>
                    <summary>Edit rule</summary>
                    <form action={action} method="post" className={styles.form}>
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="action" value="discount-rule-update" />
                      <input type="hidden" name="discountRuleId" value={rule.id} />
                      <RuleFields rule={rule} />
                      <div className={styles.formFooter}>
                        <p>Saving is audited and affects only future purchases.</p>
                        <button className="button button-primary" type="submit">
                          <Save aria-hidden="true" /> Save changes
                        </button>
                      </div>
                    </form>
                  </details>
                  <form action={action} method="post">
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="action" value="discount-rule-enabled-set" />
                    <input type="hidden" name="discountRuleId" value={rule.id} />
                    <input
                      type="hidden"
                      name="discountEnabled"
                      value={rule.enabled ? "false" : "true"}
                    />
                    <button className="button button-secondary" type="submit">
                      <Power aria-hidden="true" />
                      {rule.enabled ? "Disable" : "Enable"}
                    </button>
                  </form>
                </div> : null}
              </article>
            );
          })
        ) : (
          <div className={styles.empty}>
            <BadgePercent aria-hidden="true" />
            <div>
              <h3>No discount rules yet</h3>
              <p>All catalogue items currently sell at their immutable base price.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
