"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SkinViewer, type SkinViewerItem, type SkinViewerSticker, type ViewerView } from "@skinhub/viewer";
import { Box, Check, Copy, Hand, LoaderCircle, RotateCcw, Sticker } from "lucide-react";
import { itemStickerSlotCount, itemSupportsCharm, type EconomyItemView } from "./economy-view-model";
import { createEconomyIdempotencyKey, postEconomyAction } from "./economy-request";
import { mergeWeaponPlacements, previewRecord, weaponInspectLink, weaponPreviewItem } from "@/lib/economy/weapon-preview";
import { parseWeaponCustomization } from "@/lib/economy/weapon-customization";
import styles from "./weapon-customizer.module.css";

type Props = { item: EconomyItemView; inventory: EconomyItemView[]; csrf: string; disabled?: boolean; onSaved: () => void; onBusyChange?: (busy: boolean) => void };

export function WeaponCustomizer(props: Props) {
  const initial = useMemo(() => weaponPreviewItem(props.item), [props.item]);
  if (!initial) return null;
  return <WeaponCustomizerReady key={props.item.id} {...props} initial={initial} />;
}

function WeaponCustomizerReady({ item, inventory, csrf, disabled, onSaved, onBusyChange, initial }: Props & { initial: SkinViewerItem }) {
  const [draft, setDraft] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [savedStickerNames, setSavedStickerNames] = useState<Record<number, string>>({});
  const [appliedItemIds, setAppliedItemIds] = useState<string[]>([]);
  const [view, setView] = useState<ViewerView>("gun");
  const [editingSlot, setEditingSlot] = useState(-1);
  const [newStickers, setNewStickers] = useState<Record<number, string>>({});
  const [newCharm, setNewCharm] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const requestRef = useRef<{ signature: string; key: string } | null>(null);
  const rawRevision = previewRecord(item.raw.attributes).attachmentRevision;
  const incomingRevision = typeof rawRevision === "number" && Number.isSafeInteger(rawRevision) ? rawRevision : 0;
  const acknowledgedRevision = useRef(incomingRevision);
  const initialKey = JSON.stringify(initial);
  useEffect(() => {
    if (incomingRevision < acknowledgedRevision.current) return;
    acknowledgedRevision.current = incomingRevision;
    setBaseline(initial);
    // A delayed route refresh must not overwrite a placement being edited.
    if (!dirty) { setDraft(initial); setNewStickers({}); setNewCharm(""); setEditingSlot(-1); }
  }, [initialKey, incomingRevision]);
  const locked = disabled || busy;
  const slots = item.itemType === "skin" ? Math.min(5, itemStickerSlotCount(item)) : 0;
  const hasCharm = itemSupportsCharm(item);
  const stickers = inventory.filter((entry) => entry.itemType === "sticker" && entry.state === "available" && entry.definitionIndex && !appliedItemIds.includes(entry.id));
  const charms = inventory.filter((entry) => entry.itemType === "keychain" && entry.state === "available" && entry.definitionIndex && !appliedItemIds.includes(entry.id));
  const selectedSticker = draft.stickers?.find((s, index) => s && (s.slot ?? index) === editingSlot);
  const hasLegacySticker = item.stickers.some((s) => s.slot === 5);
  const inspectLink = useMemo(() => weaponInspectLink(draft), [draft]);

  function updateSticker(slot: number, patch: Partial<SkinViewerSticker>) {
    setDraft((current) => ({ ...current, stickers: current.stickers?.map((s, index) => s && (s.slot ?? index) === slot ? { ...s, ...patch } : s) }));
    setDirty(true); setNotice("");
  }
  function chooseSticker(slot: number, ownedId: string) {
    const owned = stickers.find((s) => s.id === ownedId);
    const rest = (draft.stickers ?? []).filter((s, index) => s && (s.slot ?? index) !== slot);
    setDraft({ ...draft, stickers: owned?.definitionIndex ? [...rest, { id: owned.definitionIndex, slot: slot as 0 | 1 | 2 | 3 | 4, wear: 0, rotation: 0, offsetX: 0, offsetY: 0 }] : rest });
    setNewStickers({ ...newStickers, [slot]: ownedId }); setEditingSlot(slot); setView("gun"); setDirty(true); setNotice("");
  }
  function chooseCharm(ownedId: string) {
    const owned = charms.find((s) => s.id === ownedId);
    setDraft({ ...draft, charm: owned?.definitionIndex ? { id: owned.definitionIndex, seed: owned.seed ?? 0, offset: [0, 0, 0] } : baseline.charm });
    setNewCharm(ownedId); setEditingSlot(5); setView("gun"); setDirty(true); setNotice("");
  }
  async function save() {
    if (locked) return;
    let customization;
    try {
      customization = parseWeaponCustomization({
        stickers: (draft.stickers ?? []).flatMap((s, index) => s ? [{
          slot: s.slot ?? index, id: s.id, ...(newStickers[s.slot ?? index] ? { stickerItemId: newStickers[s.slot ?? index] } : {}),
          offsetX: s.offsetX ?? 0, offsetY: s.offsetY ?? 0, rotation: s.rotation ?? 0, wear: s.wear ?? 0,
        }] : []),
        ...(draft.charm && hasCharm ? { charm: { id: draft.charm.id, ...(newCharm ? { charmItemId: newCharm } : {}),
          offsetX: draft.charm.offset?.[0] ?? 0, offsetY: draft.charm.offset?.[1] ?? 0, offsetZ: draft.charm.offset?.[2] ?? 0 } } : {}),
      });
    } catch (error) { setNotice(error instanceof Error ? error.message : "Check your placement values."); return; }
    const payload = { weaponItemId: item.id, customization };
    const signature = JSON.stringify(payload);
    if (requestRef.current?.signature !== signature) requestRef.current = { signature, key: createEconomyIdempotencyKey() };
    setBusy(true); onBusyChange?.(true); setNotice("");
    try {
      const result = await postEconomyAction("/api/economy/items/customization", csrf, payload, requestRef.current.key);
      // Only uncertain/failed requests reuse a key. Returning to this same
      // placement after another tab's edit must commit a new transaction.
      requestRef.current = null;
      if (typeof result.attachmentRevision === "number") acknowledgedRevision.current = Math.max(acknowledgedRevision.current, result.attachmentRevision);
      // Acknowledge the committed attachment identities immediately, before
      // router.refresh arrives, so another edit is a reposition, not a reapply.
      setBaseline(draft);
      setSavedStickerNames((current) => ({ ...current, ...Object.fromEntries(Object.entries(newStickers).filter(([, id]) => id).map(([slot, id]) => [slot, inventory.find((entry) => entry.id === id)?.displayName ?? "Attached sticker"])) }));
      setAppliedItemIds((current) => [...current, ...Object.values(newStickers).filter(Boolean), ...(newCharm ? [newCharm] : [])]);
      setNewStickers({}); setNewCharm("");
      setDirty(false); setNotice("Placement saved. Your equipped weapon will refresh in game."); onSaved();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save your placement."); }
    finally { setBusy(false); onBusyChange?.(false); }
  }

  return <section className={styles.editor} aria-label="3D weapon inspection and customization">
    <header className={styles.toolbar}>
      <div><span className={styles.eyebrow}>WORKBENCH</span><strong>Inspect & customize</strong></div>
      <div className={styles.viewButtons} role="group" aria-label="Inspection view">
        <button type="button" aria-pressed={view === "gun"} onClick={() => setView("gun")}><Box size={16} /> 3D</button>
        <button type="button" aria-pressed={view === "hands"} onClick={() => { setView("hands"); setEditingSlot(-1); }}><Hand size={16} /> In hands</button>
      </div>
    </header>
    <div className={styles.workspace}>
      <div className={styles.stage}>
        {/* Reconnect when changing renderer views: rapid hands/gun patches can
            otherwise leave the hosted wrapper waiting for a superseded ready event. */}
        <SkinViewer key={`${reload}:${view}`} item={draft} view={view} editingSlot={editingSlot}
          title={`${item.displayName} at float ${item.floatValue}, pattern ${item.seed}`}
          style={{ width: "100%", height: "100%", minHeight: 340 }}
          interactions={{ orbit: true, zoom: true, dragStickers: !locked && slots > 0 && view === "gun", dragCharm: !locked && hasCharm && view === "gun" }}
          settings={{ quality: { renderScale: 1, shadows: true }, environment: { background: "transparent", map: "Warehouse" }, overlays: { stickerGizmo: true, charmGizmo: true, gizmoStyle: { color: "#ff7185" } } }}
          onError={() => setFailed(true)}
          onEditingSlotChange={(slot) => { if (!locked) setEditingSlot(slot); }}
          onChange={(changed) => { if (locked) return; setDraft((current) => mergeWeaponPlacements(current, changed)); setDirty(true); setNotice(""); }}
          loading={<div className={styles.loading}><LoaderCircle size={22} /><span>Loading your exact finish…</span></div>}
          fallback={<div className={styles.loading}><span>3D preview is unavailable. Try again or inspect in CS2.</span></div>} />
        <span className={styles.stageHint}>{view === "gun" ? "Drag to rotate · Scroll to zoom · Select an attachment to place it" : "First-person inspection"}</span>
      </div>
      {(slots > 0 || hasCharm) && <fieldset className={styles.attachments} disabled={locked}>
        <legend><Sticker size={16} /> Attachments</legend>
        {Array.from({ length: slots }, (_, slot) => {
          const attached = item.stickers.find((s) => s.slot === slot);
          const attachedName = attached?.displayName ?? savedStickerNames[slot];
          return <div className={styles.slot} key={slot}>
            <button type="button" aria-label={`Edit sticker slot ${slot + 1}`} aria-pressed={editingSlot === slot} onClick={() => { setEditingSlot(slot); setView("gun"); }}>{slot + 1}</button>
            {attachedName ? <button type="button" className={styles.attachedName} onClick={() => { setEditingSlot(slot); setView("gun"); }}>{attachedName}</button> :
              <select aria-label={`Owned sticker for slot ${slot + 1}`} value={newStickers[slot] ?? ""} onChange={(event) => chooseSticker(slot, event.target.value)}>
                <option value="">Choose owned sticker</option>
                {stickers.filter((s) => !Object.entries(newStickers).some(([key, id]) => Number(key) !== slot && id === s.id)).map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
              </select>}
          </div>;
        })}
        {selectedSticker && <div className={styles.numbers}>
          {([['offsetX', 'X', -10, 10, 0.01], ['offsetY', 'Y', -10, 10, 0.01], ['rotation', 'Rotation', -360, 360, 1], ['wear', 'Wear', 0, 1, 0.01]] as const).map(([key, label, min, max, step]) =>
            <label key={key}>{label}<input type="number" min={min} max={max} step={step} value={selectedSticker[key] ?? 0} onChange={(event) => { const value = event.target.valueAsNumber; if (Number.isFinite(value)) updateSticker(editingSlot, { [key]: value }); }} /></label>)}
        </div>}
        {hasCharm && <label className={styles.charm}>Charm<select value={newCharm} onChange={(event) => chooseCharm(event.target.value)} aria-label="Owned charm">
          <option value="">{baseline.charm ? "Keep attached charm" : "Choose owned charm"}</option>
          {charms.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
        </select></label>}
        {draft.charm && hasCharm && <>
          <button type="button" className={styles.placeCharm} aria-pressed={editingSlot === 5} onClick={() => { setEditingSlot(5); setView("gun"); }}>Place charm</button>
          {editingSlot === 5 && <div className={styles.numbers}>{(["X", "Y", "Z"] as const).map((axis, index) => <label key={axis}>{axis}<input type="number" min={-64} max={64} step={0.01} value={draft.charm?.offset?.[index] ?? 0} onChange={(event) => {
            const value = event.target.valueAsNumber;
            if (!Number.isFinite(value) || !draft.charm) return;
            const offset: [number, number, number] = [...(draft.charm.offset ?? [0, 0, 0])]; offset[index] = value;
            setDraft({ ...draft, charm: { ...draft.charm, offset } }); setDirty(true);
          }} /></label>)}</div>}
        </>}
        {!stickers.length && !charms.length && !item.stickers.length && !draft.charm && <p>Owned stickers and charms appear here when available.</p>}
        {hasLegacySticker && <p>Your legacy sixth sticker is preserved. This viewer shows five slots.</p>}
      </fieldset>}
    </div>
    <div className={styles.identity}><span>Float <b>{item.floatValue}</b></span><span>Pattern <b>{item.seed}</b></span><span>StatTrak <b>{item.stattrak ? item.stattrakCount : "Off"}</b></span>{dirty && <span className={styles.unsaved}>Unsaved placement</span>}</div>
    <footer className={styles.actions}>
      {(slots > 0 || hasCharm) && <><button type="button" className="button button-primary" disabled={locked || !dirty} onClick={() => void save()}>{busy ? <LoaderCircle size={16} /> : <Check size={16} />} {busy ? "Saving…" : "Save placement"}</button>
      <button type="button" className="button button-secondary" disabled={locked || !dirty} onClick={() => { setDraft(baseline); setNewStickers({}); setNewCharm(""); setDirty(false); setNotice(""); }}><RotateCcw size={16} /> Reset</button></>}
      {inspectLink ? <a className="button button-secondary" href={inspectLink}>Inspect in CS2</a> : null}
      <button type="button" className="button button-quiet" disabled={!inspectLink} onClick={() => { if (inspectLink) void navigator.clipboard.writeText(inspectLink).then(() => setNotice("Inspect link copied.")).catch(() => setNotice("Could not copy the link. Use Inspect in CS2.")); }}><Copy size={16} /> Copy link</button>
      {failed && <button type="button" className="button button-secondary" onClick={() => { setFailed(false); setReload((count) => count + 1); }}>Retry 3D</button>}
    </footer>
    {!inspectLink && <p className={styles.notice}>This item's details cannot be encoded in a CS2 inspect link.</p>}
    {dirty && (Object.values(newStickers).some(Boolean) || newCharm) && <p className={styles.notice}>Saving applies the selected owned stickers{newCharm ? " and consumes the selected charm" : ""}. {newCharm && baseline.charm ? "Your current charm will be replaced." : ""}</p>}
    <p className={styles.notice} role="status">{notice}</p>
  </section>;
}
