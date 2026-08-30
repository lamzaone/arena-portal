"use client";

import {
  Check,
  Clipboard,
  Coins,
  Gift,
  Minus,
  PackagePlus,
  Pause,
  Play,
  Plus,
  Search,
  TicketCheck,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { MarketplaceItemPreview } from "@/components/economy/marketplace-item-preview";
import { PortalToast } from "@/components/success-toast";
import { AsyncButton } from "@/components/ui/async-button";
import {
  DEFAULT_SEARCH_DEBOUNCE_MS,
  SearchField,
} from "@/components/ui/search-field";
import type {
  EconomyCatalogueItem,
  EconomyRedeemCode,
} from "@/lib/data/portal-repository";
import { economyItemTypeLabel } from "@/lib/economy/item-taxonomy";

type SelectedReward = {
  catalogueId: number;
  quantity: number;
};

type RedeemCodeAdminProps = {
  csrf: string;
  catalogue: EconomyCatalogueItem[];
  codes: EconomyRedeemCode[];
  searchQuery: string;
};

type UseMode = "unlimited" | "single" | "custom";

function newIdempotencyKey() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 16)}`;
}

async function adminAction(
  csrf: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch("/api/admin/redeem-codes", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ ...payload, csrf, idempotencyKey: newIdempotencyKey() }),
  });
  const result = (await response.json().catch(() => null)) as
    | { ok?: boolean; message?: string; result?: unknown }
    | null;
  if (!response.ok || !result?.ok)
    throw new Error(result?.message ?? "The redeem-code action failed.");
  return result.result;
}

function usesLabel(code: EconomyRedeemCode) {
  if (code.maxRedemptions === null)
    return `${code.redemptionCount.toLocaleString()} claimed · Unlimited`;
  return `${code.redemptionCount.toLocaleString()} / ${code.maxRedemptions.toLocaleString()} claimed`;
}

export function RedeemCodeAdmin({
  csrf,
  catalogue,
  codes,
  searchQuery,
}: RedeemCodeAdminProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tokens, setTokens] = useState("0");
  const [useMode, setUseMode] = useState<UseMode>("unlimited");
  const [customUses, setCustomUses] = useState("10");
  const [rewards, setRewards] = useState<SelectedReward[]>([]);
  const [pickerQuery, setPickerQuery] = useState(searchQuery);
  const [pickerItems, setPickerItems] = useState(catalogue);
  const [knownCatalogueItems, setKnownCatalogueItems] = useState(() =>
    new Map(catalogue.map((item) => [item.id, item])),
  );
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState(false);
  const [activeCodeId, setActiveCodeId] = useState<number | null>(null);
  const [revealedCode, setRevealedCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const catalogueById = useMemo(
    () => knownCatalogueItems,
    [knownCatalogueItems],
  );
  const selectedRewards = rewards.flatMap((reward) => {
    const item = catalogueById.get(reward.catalogueId);
    return item ? [{ reward, item }] : [];
  });

  function addReward(catalogueId: number) {
    setRewards((current) => {
      const existing = current.find((reward) => reward.catalogueId === catalogueId);
      const totalItems = current.reduce(
        (total, reward) => total + reward.quantity,
        0,
      );
      if (totalItems >= 100) {
        setError("A code can award up to 100 items in total.");
        return current;
      }
      if (existing)
        return current.map((reward) =>
          reward.catalogueId === catalogueId
            ? { ...reward, quantity: Math.min(50, reward.quantity + 1) }
            : reward,
        );
      if (current.length >= 20) {
        setError("A code can contain up to 20 different item rewards.");
        return current;
      }
      return [...current, { catalogueId, quantity: 1 }];
    });
  }

  function setRewardQuantity(catalogueId: number, quantity: number) {
    setRewards((current) => {
      if (quantity < 1)
        return current.filter((reward) => reward.catalogueId !== catalogueId);
      const otherItems = current.reduce(
        (total, reward) =>
          reward.catalogueId === catalogueId ? total : total + reward.quantity,
        0,
      );
      const nextQuantity = Math.min(50, Math.max(1, 100 - otherItems), quantity);
      if (nextQuantity < quantity)
        setError("A code can award up to 100 items in total.");
      return current.map((reward) =>
        reward.catalogueId === catalogueId
          ? { ...reward, quantity: nextQuantity }
          : reward,
      );
    });
  }

  async function createCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const tokenAmount = Number(tokens);
    const maxRedemptions =
      useMode === "unlimited"
        ? null
        : useMode === "single"
          ? 1
          : Number(customUses);
    if (
      !Number.isSafeInteger(tokenAmount) ||
      tokenAmount < 0 ||
      !Number.isSafeInteger(maxRedemptions ?? 1) ||
      (maxRedemptions !== null && maxRedemptions < 1) ||
      (tokenAmount === 0 && rewards.length === 0)
    ) {
      setError("Add a valid Token amount or at least one item reward.");
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = (await adminAction(csrf, {
        action: "create",
        code,
        displayName,
        tokenAmount,
        maxRedemptions,
        rewards,
      })) as { revealedCode?: string };
      setRevealedCode(response?.revealedCode ?? code.trim().toUpperCase());
      setNotice("Redeem code created. Copy it now—the plain code is not stored.");
      setCode("");
      setDisplayName("");
      setTokens("0");
      setUseMode("unlimited");
      setCustomUses("10");
      setRewards([]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the code.");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    const normalizedQuery = pickerQuery.trim();
    if (!normalizedQuery) {
      setSearching(false);
      setError(null);
      setPickerItems(catalogue);
      return;
    }

    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: normalizedQuery });
      void fetch(
        `/api/admin/redeem-codes?${params.toString()}`,
        {
          credentials: "same-origin",
          headers: { accept: "application/json" },
          signal: controller.signal,
        },
      )
        .then(async (response) => {
          const result = (await response.json().catch(() => null)) as
            | { ok?: boolean; message?: string; items?: EconomyCatalogueItem[] }
            | null;
          if (!response.ok || !result?.ok || !Array.isArray(result.items))
            throw new Error(result?.message ?? "The catalogue search could not be completed.");
          return result.items;
        })
        .then((items) => {
          if (controller.signal.aborted) return;
          setError(null);
          setPickerItems(items);
          setKnownCatalogueItems((current) => {
            const next = new Map(current);
            for (const item of items) next.set(item.id, item);
            return next;
          });
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          setPickerItems([]);
          setError(cause instanceof Error ? cause.message : "The catalogue search could not be completed.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, DEFAULT_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [catalogue, pickerQuery]);

  async function toggleCode(item: EconomyRedeemCode) {
    if (activeCodeId !== null) return;
    setActiveCodeId(item.id);
    setError(null);
    try {
      await adminAction(csrf, {
        action: "set-enabled",
        codeId: item.id,
        enabled: !item.enabled,
      });
      setNotice(`${item.displayName} is now ${item.enabled ? "paused" : "live"}.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the code.");
    } finally {
      setActiveCodeId(null);
    }
  }

  async function copyRevealedCode() {
    if (!revealedCode) return;
    try {
      await navigator.clipboard.writeText(revealedCode);
      setNotice("Code copied to clipboard.");
    } catch {
      setError("Clipboard access was blocked. Copy the code manually.");
    }
  }

  return (
    <div className="redeem-admin-layout">
      <section className="redeem-admin-grid">
        <form className="panel redeem-builder" onSubmit={createCode}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                <PackagePlus aria-hidden="true" /> New campaign
              </p>
              <h2>Build a reward code</h2>
            </div>
          </div>
          <div className="redeem-builder-fields">
            <label>
              Code
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="TAPPD-SUMMER-2026"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={64}
                required
              />
              <small>4–64 characters: A–Z, numbers, - or _.</small>
            </label>
            <label>
              Internal label
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Summer event reward"
                maxLength={120}
                required
              />
            </label>
            <label>
              <Coins aria-hidden="true" /> Tokens to award
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={tokens}
                onChange={(event) => setTokens(event.target.value)}
              />
            </label>
          </div>
          <fieldset className="redeem-use-limits">
            <legend>Global usage limit</legend>
            <label className={useMode === "unlimited" ? "is-selected" : ""}>
              <input type="radio" name="uses" checked={useMode === "unlimited"} onChange={() => setUseMode("unlimited")} />
              <span>Unlimited<small>Any number of players</small></span>
            </label>
            <label className={useMode === "single" ? "is-selected" : ""}>
              <input type="radio" name="uses" checked={useMode === "single"} onChange={() => setUseMode("single")} />
              <span>One time<small>One total claim</small></span>
            </label>
            <label className={useMode === "custom" ? "is-selected" : ""}>
              <input type="radio" name="uses" checked={useMode === "custom"} onChange={() => setUseMode("custom")} />
              <span>Custom<small>Set a total count</small></span>
            </label>
            {useMode === "custom" ? (
              <label className="redeem-custom-use-input">
                Total claims
                <input type="number" min="1" max="2147483647" inputMode="numeric" value={customUses} onChange={(event) => setCustomUses(event.target.value)} required />
              </label>
            ) : null}
          </fieldset>
          <div className="redeem-selected-rewards">
            <div>
              <strong>Item rewards</strong>
              <span>{selectedRewards.length ? `${selectedRewards.length} selected` : "Optional when Tokens are set"}</span>
            </div>
            {selectedRewards.length ? (
              <ul>
                {selectedRewards.map(({ reward, item }) => (
                  <li key={item.id}>
                    <MarketplaceItemPreview
                      item={{
                        catalogueId: item.id,
                        displayName: item.displayName,
                        floatValue: null,
                        imageUrl: item.imageUrl,
                        itemType: item.itemType,
                        rarityRank: item.rarityRank,
                      }}
                      enableMarketPreview={false}
                    />
                    <span>{item.displayName}</span>
                    <div className="redeem-quantity">
                      <button type="button" onClick={() => setRewardQuantity(item.id, reward.quantity - 1)} aria-label={`Decrease ${item.displayName} quantity`}><Minus aria-hidden="true" /></button>
                      <output>{reward.quantity}</output>
                      <button type="button" onClick={() => setRewardQuantity(item.id, reward.quantity + 1)} disabled={reward.quantity >= 50} aria-label={`Increase ${item.displayName} quantity`}><Plus aria-hidden="true" /></button>
                      <button type="button" onClick={() => setRewardQuantity(item.id, 0)} aria-label={`Remove ${item.displayName}`}><X aria-hidden="true" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p>Search the catalogue below, then add cases, skins, stickers, agents, or other existing items.</p>}
          </div>
          <AsyncButton
            className="button button-primary redeem-create-button"
            type="submit"
            icon={<TicketCheck />}
            pending={pending}
            pendingLabel="Creating campaign"
          >
            Create redeem code
          </AsyncButton>
        </form>

        <aside className="panel redeem-picker">
          <div className="panel-heading">
            <div>
              <p className="eyebrow"><Search aria-hidden="true" /> Catalogue rewards</p>
              <h2>Choose items</h2>
              <p>{pickerQuery.trim() ? `Results for “${pickerQuery.trim()}”` : "Search below for a specific item."}</p>
            </div>
          </div>
          <form className="redeem-catalogue-search" onSubmit={(event) => event.preventDefault()}>
            <SearchField
              id="redeem-catalogue-search"
              label="Search catalogue"
              value={pickerQuery}
              onValueChange={setPickerQuery}
              placeholder="Skins, cases, stickers…"
              maxLength={100}
              autoComplete="off"
              pending={searching}
            />
          </form>
          <div className="redeem-picker-list">
            {pickerItems.length ? pickerItems.map((item) => {
              const selected = rewards.find((reward) => reward.catalogueId === item.id);
              return <article key={item.id} className="redeem-picker-item">
                <MarketplaceItemPreview item={{ catalogueId: item.id, displayName: item.displayName, floatValue: null, imageUrl: item.imageUrl, itemType: item.itemType, rarityRank: item.rarityRank }} enableMarketPreview={false} />
                <div><span className={`rarity-rank-${item.rarityRank}`}>{item.rarityName}</span><strong>{item.displayName}</strong><small>{economyItemTypeLabel(item.itemType)} · ID {item.id}</small></div>
                <button className="button button-secondary" type="button" onClick={() => addReward(item.id)} disabled={selected?.quantity === 50}>
                  <Plus aria-hidden="true" /> {selected ? `Add (${selected.quantity})` : "Add"}
                </button>
              </article>;
            }) : <p className="empty-copy">No catalogue entries matched. Adjust the search and try again.</p>}
          </div>
        </aside>
      </section>

      {revealedCode ? (
        <section className="redeem-code-reveal" aria-live="polite">
          <Check aria-hidden="true" />
          <div><span>Copy this code now</span><strong>{revealedCode}</strong><small>Only its secure hash is retained after this point.</small></div>
          <button className="button button-primary" type="button" onClick={copyRevealedCode}><Clipboard aria-hidden="true" /> Copy</button>
          <button className="redeem-dismiss" type="button" onClick={() => setRevealedCode(null)} aria-label="Dismiss revealed code"><X aria-hidden="true" /></button>
        </section>
      ) : null}

      <section className="redeem-code-list">
        <div className="section-heading compact">
          <p className="eyebrow"><Gift aria-hidden="true" /> Active &amp; saved campaigns</p>
          <h2>Recent redeem codes</h2>
        </div>
        {codes.length ? <div className="redeem-code-grid">{codes.map((item) => (
          <article className={`panel redeem-code-card ${item.enabled ? "is-live" : "is-paused"}`} key={item.id}>
            <header><div><span className="redeem-code-hint">{item.codeHint}</span><h3>{item.displayName}</h3></div><span className={`redeem-code-status ${item.enabled ? "" : "is-paused"}`}>{item.enabled ? "Live" : "Paused"}</span></header>
            <div className="redeem-code-meta"><span><Coins aria-hidden="true" /> {item.tokenAmount.toLocaleString()} Tokens</span><span><TicketCheck aria-hidden="true" /> {usesLabel(item)}</span></div>
            {item.rewards.length ? <ul className="redeem-card-rewards">{item.rewards.map((reward) => <li key={reward.catalogueId}><span className={`rarity-rank-${reward.rarityRank}`}>{reward.quantity}×</span>{reward.displayName}</li>)}</ul> : <p className="empty-copy">Token-only reward</p>}
            <AsyncButton
              className="button button-secondary"
              type="button"
              disabled={activeCodeId !== null && activeCodeId !== item.id}
              icon={item.enabled ? <Pause /> : <Play />}
              pending={activeCodeId === item.id}
              pendingLabel="Updating code"
              onClick={() => toggleCode(item)}
            >
              {item.enabled ? "Pause code" : "Make live"}
            </AsyncButton>
          </article>
        ))}</div> : <p className="empty-copy">No redeem campaigns have been created yet.</p>}
      </section>
      {notice ? <PortalToast message={notice} onDismiss={() => setNotice(null)} /> : null}
      {error ? <PortalToast variant="danger" message={error} onDismiss={() => setError(null)} /> : null}
    </div>
  );
}
