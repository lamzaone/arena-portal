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
  RotateCcw,
  Search,
  TicketCheck,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { MarketplaceItemPreview } from "@/components/economy/marketplace-item-preview";
import { PaginatedItemGrid } from "@/components/economy/item-grid";
import { PortalToast } from "@/components/success-toast";
import { AsyncButton } from "@/components/ui/async-button";
import { PortalDialog } from "@/components/ui/portal-dialog";
import { type DraftReward, validateRewardQuantities } from "./redeem-code-quantities";
import {
  DEFAULT_SEARCH_DEBOUNCE_MS,
  SearchField,
} from "@/components/ui/search-field";
import type {
  EconomyCatalogueItem,
  EconomyRedeemCode,
} from "@/lib/data/portal-repository";
import { economyItemTypeLabel } from "@/lib/economy/item-taxonomy";

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
  idempotencyKey: string,
) {
  const response = await fetch("/api/admin/redeem-codes", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ ...payload, csrf, idempotencyKey }),
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
  const [rewards, setRewards] = useState<DraftReward[]>([]);
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState(searchQuery);
  const [campaignQuery, setCampaignQuery] = useState("");
  const [campaignStatus, setCampaignStatus] = useState("all");
  const [pickerItems, setPickerItems] = useState(catalogue);
  const [knownCatalogueItems, setKnownCatalogueItems] = useState(() =>
    new Map(catalogue.map((item) => [item.id, item])),
  );
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState(false);
  const [activeCodeId, setActiveCodeId] = useState<number | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ action: "restart" | "remove"; item: EconomyRedeemCode } | null>(null);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const actionKeys = useRef(new Map<string, string>());
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
  const visibleCodes = codes.filter((campaign) => {
    const matchesStatus = campaignStatus === "all" ||
      (campaignStatus === "live" ? campaign.enabled : !campaign.enabled);
    const query = campaignQuery.trim().toLocaleLowerCase();
    return matchesStatus && (!query ||
      `${campaign.displayName} ${campaign.codeHint}`.toLocaleLowerCase().includes(query));
  });

  async function performAction(payload: Record<string, unknown>) {
    const fingerprint = JSON.stringify(payload);
    const key = actionKeys.current.get(fingerprint) ?? newIdempotencyKey();
    actionKeys.current.set(fingerprint, key);
    const result = await adminAction(csrf, payload, key);
    actionKeys.current.delete(fingerprint);
    return result;
  }

  function addReward(catalogueId: number) {
    const validated = validateRewardQuantities(rewards);
    if (validated.error) {
      setQuantityError(validated.error);
      return;
    }
    setQuantityError(null);
    setRewards((current) => {
      const existing = current.find((reward) => reward.catalogueId === catalogueId);
      const totalItems = current.reduce(
        (total, reward) => total + Number(reward.quantity),
        0,
      );
      if (totalItems >= 100) {
        setError("A code can award up to 100 items in total.");
        return current;
      }
      if (existing)
        return current.map((reward) =>
          reward.catalogueId === catalogueId
            ? { ...reward, quantity: String(Math.min(50, Number(reward.quantity) + 1)) }
            : reward,
        );
      if (current.length >= 20) {
        setError("A code can contain up to 20 different item rewards.");
        return current;
      }
      return [...current, { catalogueId, quantity: "1" }];
    });
  }

  function setRewardQuantity(catalogueId: number, quantity: string) {
    setQuantityError(null);
    setRewards((current) => current.map((reward) =>
      reward.catalogueId === catalogueId ? { ...reward, quantity } : reward));
  }

  async function createCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const validatedRewards = validateRewardQuantities(rewards);
    if (validatedRewards.error) {
      setQuantityError(validatedRewards.error);
      return;
    }
    setQuantityError(null);
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
      const response = (await performAction({
        action: "create",
        code,
        displayName,
        tokenAmount,
        maxRedemptions,
        rewards: validatedRewards.rewards,
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
    setActiveAction("set-enabled");
    setCampaignError(null);
    try {
      await performAction({
        action: "set-enabled",
        codeId: item.id,
        enabled: !item.enabled,
      });
      setNotice(`${item.displayName} is now ${item.enabled ? "paused" : "live"}.`);
      router.refresh();
    } catch (cause) {
      setCampaignError(cause instanceof Error ? cause.message : "Could not update the code.");
    } finally {
      setActiveCodeId(null);
      setActiveAction(null);
    }
  }

  async function confirmCampaignAction() {
    if (!confirmation || activeCodeId !== null) return;
    const { action, item } = confirmation;
    setActiveCodeId(item.id);
    setActiveAction(action);
    setCampaignError(null);
    try {
      await performAction({ action, codeId: item.id });
      setNotice(action === "restart"
        ? `${item.displayName} restarted. Everyone can claim the code again.`
        : `${item.displayName} removed.`);
      setConfirmation(null);
      router.refresh();
    } catch (cause) {
      setCampaignError(cause instanceof Error ? cause.message : `Could not ${action} the code.`);
    } finally {
      setActiveCodeId(null);
      setActiveAction(null);
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
              <PaginatedItemGrid as="ul" label="Selected item rewards">
                {selectedRewards.map(({ reward, item }) => (
                  <li key={item.id}>
                    <MarketplaceItemPreview
                      item={{
                        ...item,
                        raw: { catalogue: item },
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
                      <button type="button" onClick={() => setRewardQuantity(item.id, String(Math.max(1, Number(reward.quantity) - 1)))} disabled={!reward.quantity || Number(reward.quantity) <= 1} aria-label={`Decrease ${item.displayName} quantity`}><Minus aria-hidden="true" /></button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={reward.quantity}
                        aria-label={`Quantity for ${item.displayName}`}
                        aria-invalid={quantityError ? true : undefined}
                        aria-describedby="redeem-quantity-help"
                        onChange={(event) => setRewardQuantity(item.id, event.target.value)}
                        onBlur={() => setQuantityError(validateRewardQuantities(rewards).error)}
                      />
                      <button type="button" onClick={() => setRewardQuantity(item.id, String(Math.min(50, Number(reward.quantity || 0) + 1)))} disabled={Number(reward.quantity) >= 50} aria-label={`Increase ${item.displayName} quantity`}><Plus aria-hidden="true" /></button>
                      <button type="button" onClick={() => { setRewards((current) => current.filter((entry) => entry.catalogueId !== item.id)); setQuantityError(null); }} aria-label={`Remove ${item.displayName}`}><X aria-hidden="true" /></button>
                    </div>
                  </li>
                ))}
              </PaginatedItemGrid>
            ) : <p>Use the item catalogue to add cases, skins, stickers, agents, or other existing items.</p>}
            <p id="redeem-quantity-help">1–50 per item · 100 items total.</p>
            {quantityError ? <p className="redeem-action-error" role="alert">{quantityError}</p> : null}
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
          <PaginatedItemGrid className="redeem-picker-list" label="Catalogue rewards" resetKey={pickerQuery}>
            {pickerItems.length ? pickerItems.map((item) => {
              const selected = rewards.find((reward) => reward.catalogueId === item.id);
              return <article key={item.id} className="redeem-picker-item">
                <MarketplaceItemPreview item={{ ...item, raw: { catalogue: item }, catalogueId: item.id, displayName: item.displayName, floatValue: null, imageUrl: item.imageUrl, itemType: item.itemType, rarityRank: item.rarityRank }} enableMarketPreview={false} />
                <div><span className={`rarity-rank-${item.rarityRank}`}>{item.rarityName}</span><strong>{item.displayName}</strong><small>{economyItemTypeLabel(item.itemType)} · ID {item.id}</small></div>
                <button className="button button-secondary" type="button" onClick={() => addReward(item.id)} disabled={Number(selected?.quantity) >= 50}>
                  <Plus aria-hidden="true" /> {selected ? `Add (${selected.quantity})` : "Add"}
                </button>
              </article>;
            }) : <p className="empty-copy">No catalogue entries matched. Adjust the search and try again.</p>}
          </PaginatedItemGrid>
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
        <div className="staff-section-heading">
          <div><p className="eyebrow"><Gift aria-hidden="true" /> Saved campaigns</p><h2>Recent redeem codes</h2></div>
          <span aria-live="polite">{visibleCodes.length} of {codes.length} campaigns</span>
        </div>
        {campaignError && !confirmation ? <p className="redeem-action-error" role="alert">{campaignError}</p> : null}
        {codes.length ? <div className="staff-campaign-filters">
          <SearchField id="staff-campaign-search" label="Find a campaign" value={campaignQuery} onValueChange={setCampaignQuery} placeholder="Campaign label or code hint" />
          <label>Status<select value={campaignStatus} onChange={(event) => setCampaignStatus(event.target.value)}><option value="all">All campaigns</option><option value="live">Live</option><option value="paused">Paused</option></select></label>
        </div> : null}
        {visibleCodes.length ? <PaginatedItemGrid className="redeem-code-grid" label="Redeem codes" resetKey={`${campaignQuery}:${campaignStatus}`}>{visibleCodes.map((item) => (
          <article className={`panel redeem-code-card ${item.enabled ? "is-live" : "is-paused"}`} key={item.id}>
            <header><div><span className="redeem-code-hint">{item.codeHint}</span><h3>{item.displayName}</h3></div><span className={`redeem-code-status ${item.enabled ? "" : "is-paused"}`}>{item.enabled ? "Live" : "Paused"}</span></header>
            <div className="redeem-code-meta"><span><Coins aria-hidden="true" /> {item.tokenAmount.toLocaleString()} Tokens</span><span><TicketCheck aria-hidden="true" /> {usesLabel(item)}</span></div>
            {item.rewards.length ? <ul className="redeem-card-rewards">{item.rewards.map((reward) => <li key={reward.catalogueId}><span className={`rarity-rank-${reward.rarityRank}`}>{reward.quantity}×</span><span>{reward.displayName}</span></li>)}</ul> : <p className="empty-copy">Token-only reward</p>}
            <div className="redeem-code-actions">
            <AsyncButton
              className="button button-secondary"
              type="button"
              disabled={activeCodeId !== null}
              icon={item.enabled ? <Pause /> : <Play />}
              pending={activeCodeId === item.id && activeAction === "set-enabled"}
              pendingLabel="Updating code"
              onClick={() => toggleCode(item)}
            >
              {item.enabled ? "Pause code" : "Make live"}
            </AsyncButton>
            <AsyncButton
              className="button button-secondary"
              disabled={activeCodeId !== null}
              icon={<RotateCcw />}
              pending={activeCodeId === item.id && activeAction === "restart"}
              pendingLabel="Restarting"
              onClick={() => { setCampaignError(null); setConfirmation({ action: "restart", item }); }}
            >Restart code</AsyncButton>
            <AsyncButton
              className="button button-secondary redeem-remove-button"
              disabled={activeCodeId !== null}
              icon={<Trash2 />}
              pending={activeCodeId === item.id && activeAction === "remove"}
              pendingLabel="Removing"
              onClick={() => { setCampaignError(null); setConfirmation({ action: "remove", item }); }}
            >Remove code</AsyncButton>
            </div>
          </article>
        ))}</PaginatedItemGrid> : <p className="empty-copy">{codes.length ? "No campaigns match these filters. Try a different label or status." : "No redeem campaigns have been created yet."}</p>}
      </section>
      <PortalDialog
        open={confirmation !== null}
        title={confirmation?.action === "restart" ? "Restart this redeem code?" : "Remove this redeem code?"}
        description={confirmation?.action === "restart"
          ? `Restart “${confirmation.item.displayName}” with zero claims and make it live. Everyone, including previous claimants, can redeem the same code again. Rewards and the usage limit stay the same; previous rewards and claim history are kept.`
          : confirmation ? `Remove “${confirmation.item.displayName}” from campaigns and stop future claims. Previously awarded rewards and claim history are kept.` : undefined}
        tone={confirmation?.action === "remove" ? "danger" : "default"}
        confirmLabel={activeCodeId !== null
          ? (confirmation?.action === "restart" ? "Restarting…" : "Removing…")
          : (confirmation?.action === "restart" ? "Restart code" : "Remove code")}
        confirmDisabled={activeCodeId !== null}
        onConfirm={() => void confirmCampaignAction()}
        onDismiss={() => { if (activeCodeId === null) { setConfirmation(null); setCampaignError(null); } }}
      >
        {campaignError ? <p className="redeem-action-error" role="alert">{campaignError}</p> : null}
      </PortalDialog>
      {notice ? <PortalToast message={notice} onDismiss={() => setNotice(null)} /> : null}
      {error ? <PortalToast variant="danger" message={error} onDismiss={() => setError(null)} /> : null}
    </div>
  );
}
