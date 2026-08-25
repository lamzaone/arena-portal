"use client";

import { Crosshair, Hand, ImageOff, LoaderCircle, Music2, Shield, Sword, UserRound } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import type { LoadoutCatalogue, LoadoutCategory, LoadoutTeam, PlayerLoadout, SavedLoadoutSkin } from "@/lib/data/portal-repository";

type EditorCategory = LoadoutCategory | "agent" | "music-kit";
type SideMode = LoadoutTeam | "both";
type WeaponGroup = "rifles" | "pistols" | "snipers" | "shotguns" | "lmgs" | "smgs";
type MarketPreviewRequest =
  | { category: "weapon" | "knife"; definitionIndex: number; paintkit: number; wear: number }
  | { category: "agent"; agentIndex: number };
type SavedChoice = {
  type: string;
  team: LoadoutTeam | null;
  item: string;
  finish: string;
  color: string;
};

type LoadoutEditorProps = {
  catalogue: LoadoutCatalogue;
  loadout: PlayerLoadout;
  actionToken: string;
};

const categories: Array<{ id: EditorCategory; label: string }> = [
  { id: "weapon", label: "Weapons" },
  { id: "knife", label: "Knife" },
  { id: "glove", label: "Gloves" },
  { id: "agent", label: "Agent" },
  { id: "music-kit", label: "Music" }
];

const weaponGroups: Array<{ id: WeaponGroup; label: string }> = [
  { id: "rifles", label: "Rifles" },
  { id: "pistols", label: "Pistols" },
  { id: "snipers", label: "Snipers" },
  { id: "shotguns", label: "Shotguns" },
  { id: "lmgs", label: "LMGs" },
  { id: "smgs", label: "SMGs" }
];

const wearPresets = [
  { label: "Factory New", value: 0.03 },
  { label: "Minimal Wear", value: 0.1 },
  { label: "Field-Tested", value: 0.25 },
  { label: "Well-Worn", value: 0.55 },
  { label: "Battle-Scarred", value: 0.8 }
];

function isSkinCategory(category: EditorCategory): category is LoadoutCategory {
  return category === "weapon" || category === "knife" || category === "glove";
}

function weaponGroupFor(key: string): WeaponGroup | null {
  const name = key.toLowerCase().replace(/^weapon_/, "");
  if (["ak47", "aug", "famas", "galilar", "m4a1", "m4a1_silencer", "sg556"].includes(name)) return "rifles";
  if (["deagle", "elite", "fiveseven", "glock", "hkp2000", "p250", "tec9", "usp_silencer", "cz75a", "revolver"].includes(name)) return "pistols";
  if (["awp", "g3sg1", "scar20", "ssg08"].includes(name)) return "snipers";
  if (["mag7", "nova", "sawedoff", "xm1014"].includes(name)) return "shotguns";
  if (["m249", "negev"].includes(name)) return "lmgs";
  if (["bizon", "mac10", "mp5sd", "mp7", "mp9", "p90", "ump45"].includes(name)) return "smgs";
  return null;
}

function wearLabel(value: number) {
  if (value <= 0.07) return "Factory New";
  if (value <= 0.15) return "Minimal Wear";
  if (value <= 0.38) return "Field-Tested";
  if (value <= 0.45) return "Well-Worn";
  return "Battle-Scarred";
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function teamLabel(team: LoadoutTeam) {
  return team === "CT" ? "Counter-Terrorist" : "Terrorist";
}

function savedSkinLabel(skin: SavedLoadoutSkin, catalogue: LoadoutCatalogue) {
  const item = catalogue.items.find((candidate) => candidate.definitionIndex === skin.definitionIndex);
  const paintkit = item?.paintkits.find((candidate) => candidate.paintkit === skin.paintkit);
  return {
    item: item?.displayName ?? `Definition #${skin.definitionIndex}`,
    finish: paintkit?.displayName ?? (skin.paintkit ? `Finish #${skin.paintkit}` : "Default finish"),
    color: paintkit?.color ?? "#ff7185"
  };
}

function fallbackIcon(category: EditorCategory) {
  if (category === "weapon") return Crosshair;
  if (category === "knife") return Sword;
  if (category === "glove") return Hand;
  if (category === "agent") return UserRound;
  return Music2;
}

function previewUrl(request: MarketPreviewRequest) {
  const params = new URLSearchParams({ category: request.category });
  if (request.category === "agent") {
    params.set("agentIndex", String(request.agentIndex));
  } else {
    params.set("definitionIndex", String(request.definitionIndex));
    params.set("paintkit", String(request.paintkit));
    params.set("wear", request.wear.toFixed(6));
  }
  return `/api/loadout/preview?${params.toString()}`;
}

function MarketPreview({ request, category, alt }: { request: MarketPreviewRequest | null; category: EditorCategory; alt: string }) {
  const requestKey = request ? previewUrl(request) : "";
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const Icon = fallbackIcon(category);

  useEffect(() => {
    let active = true;
    if (!requestKey) {
      setImageUrl(null);
      setState("idle");
      return () => { active = false; };
    }

    setImageUrl(null);
    setState("loading");
    const delay = window.setTimeout(() => {
      void fetch(requestKey)
        .then(async (response) => {
          const body = await response.json() as { imageUrl?: unknown };
          if (!response.ok || typeof body.imageUrl !== "string") throw new Error("Preview unavailable");
          return body.imageUrl;
        })
        .then((nextImageUrl) => {
          if (!active) return;
          setImageUrl(nextImageUrl);
          setState("ready");
        })
        .catch(() => {
          if (!active) return;
          setState("unavailable");
        });
    }, 250);

    return () => { active = false; window.clearTimeout(delay); };
  }, [requestKey]);

  return <div className="loadout-market-preview" aria-busy={state === "loading"}>
    {imageUrl ? <img src={imageUrl} alt={alt} referrerPolicy="no-referrer" onError={() => { setImageUrl(null); setState("unavailable"); }} /> : <div className="loadout-preview-fallback">
      {state === "loading" ? <LoaderCircle aria-hidden="true" className="loadout-preview-spinner" /> : state === "unavailable" && request ? <ImageOff aria-hidden="true" /> : <Icon aria-hidden="true" />}
      <span>{state === "loading" ? "Loading official item art" : state === "unavailable" && request ? "Official preview unavailable" : "Select an item to preview"}</span>
    </div>}
  </div>;
}

function SavedChoiceCard({ choice, index }: { choice: SavedChoice; index: number }) {
  return <article key={`${choice.type}-${choice.item}-${index}`} style={{ "--saved-accent": choice.color } as CSSProperties}>
    <span>{choice.type}</span>
    <div><strong>{choice.item}</strong><small>{choice.finish}</small></div>
  </article>;
}

export function LoadoutEditor({ catalogue, loadout, actionToken }: LoadoutEditorProps) {
  const firstWeapon = catalogue.items.find((item) => item.category === "weapon" && weaponGroupFor(item.key) === "rifles")
    ?? catalogue.items.find((item) => item.category === "weapon");
  const firstAgentT = catalogue.agents.find((agent) => agent.team === "T");
  const firstAgentCt = catalogue.agents.find((agent) => agent.team === "CT");
  const [category, setCategory] = useState<EditorCategory>("weapon");
  const [weaponGroup, setWeaponGroup] = useState<WeaponGroup>("rifles");
  const [sideMode, setSideMode] = useState<SideMode>("T");
  const [definitionIndex, setDefinitionIndex] = useState(firstWeapon?.definitionIndex ?? 0);
  const [paintkit, setPaintkit] = useState(firstWeapon?.paintkits[0]?.paintkit ?? 0);
  const [agentIndexes, setAgentIndexes] = useState<Record<LoadoutTeam, number>>({ T: firstAgentT?.agentIndex ?? 0, CT: firstAgentCt?.agentIndex ?? 0 });
  const [musicKitIndex, setMusicKitIndex] = useState(catalogue.musicKits[0]?.musicKitIndex ?? 0);
  const [seed, setSeed] = useState(0);
  const [wear, setWear] = useState(0.03);
  const [nametag, setNametag] = useState("");
  const [stattrak, setStattrak] = useState(false);
  const [keychain, setKeychain] = useState<number | null>(null);
  const [stickers, setStickers] = useState<Array<number | null>>([null, null, null, null, null, null]);
  const [advancedChanged, setAdvancedChanged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const selectableItems = useMemo(() => {
    if (category === "weapon") {
      return catalogue.items.filter((item) => item.category === "weapon" && weaponGroupFor(item.key) === weaponGroup);
    }
    return catalogue.items.filter((item) => item.category === category);
  }, [catalogue.items, category, weaponGroup]);
  const weaponGroupCounts = useMemo(() => Object.fromEntries(
    weaponGroups.map((group) => [group.id, catalogue.items.filter((item) => item.category === "weapon" && weaponGroupFor(item.key) === group.id).length])
  ) as Record<WeaponGroup, number>, [catalogue.items]);
  const selectedItem = selectableItems.find((item) => item.definitionIndex === definitionIndex) ?? selectableItems[0];
  const selectedPaintkit = selectedItem?.paintkits.find((item) => item.paintkit === paintkit) ?? selectedItem?.paintkits[0];
  const selectedAgentT = catalogue.agents.find((agent) => agent.agentIndex === agentIndexes.T && agent.team === "T") ?? firstAgentT;
  const selectedAgentCt = catalogue.agents.find((agent) => agent.agentIndex === agentIndexes.CT && agent.team === "CT") ?? firstAgentCt;
  const activeTeam = sideMode === "both" ? "T" : sideMode;
  const selectedAgent = activeTeam === "T" ? selectedAgentT : selectedAgentCt;
  const selectedMusicKit = catalogue.musicKits.find((musicKit) => musicKit.musicKitIndex === musicKitIndex) ?? catalogue.musicKits[0];

  const previewName = category === "agent"
    ? sideMode === "both"
      ? `${selectedAgentT?.displayName ?? "Select T agent"} / ${selectedAgentCt?.displayName ?? "Select CT agent"}`
      : selectedAgent?.displayName ?? "Select an agent"
    : category === "music-kit"
      ? selectedMusicKit?.displayName ?? "Select a music kit"
      : selectedItem?.displayName ?? "Select an item";
  const previewFinish = category === "agent"
    ? sideMode === "both" ? "T and CT agent profiles" : selectedAgent?.rarity ?? "Agent"
    : category === "music-kit"
      ? selectedMusicKit?.rarity ?? "Music kit"
      : selectedPaintkit?.displayName ?? "Select a finish";
  const previewColor = category === "agent"
    ? selectedAgent?.color ?? "#ff7185"
    : category === "music-kit"
      ? selectedMusicKit?.color ?? "#ff7185"
      : selectedPaintkit?.color ?? "#ff7185";
  const previewRequests: Array<{ request: MarketPreviewRequest; alt: string; team: LoadoutTeam | null }> = category === "agent"
    ? (sideMode === "both"
      ? ([selectedAgentT && { request: { category: "agent" as const, agentIndex: selectedAgentT.agentIndex }, alt: `${selectedAgentT.displayName} agent`, team: "T" as const }, selectedAgentCt && { request: { category: "agent" as const, agentIndex: selectedAgentCt.agentIndex }, alt: `${selectedAgentCt.displayName} agent`, team: "CT" as const }].filter(Boolean) as Array<{ request: MarketPreviewRequest; alt: string; team: LoadoutTeam }>)
      : selectedAgent ? [{ request: { category: "agent", agentIndex: selectedAgent.agentIndex }, alt: `${selectedAgent.displayName} agent`, team: activeTeam }] : [])
    : (category === "weapon" || category === "knife") && selectedItem && selectedPaintkit
      ? [{ request: { category, definitionIndex: selectedItem.definitionIndex, paintkit: selectedPaintkit.paintkit, wear }, alt: `${selectedItem.displayName} | ${selectedPaintkit.displayName}`, team: sideMode === "both" ? null : activeTeam }]
      : [];
  const canApply = category === "agent"
    ? sideMode === "both" ? Boolean(selectedAgentT && selectedAgentCt) : Boolean(selectedAgent)
    : category === "music-kit" ? Boolean(selectedMusicKit) : Boolean(selectedItem && selectedPaintkit);

  const savedSelections = useMemo<SavedChoice[]>(() => {
    const weapons = loadout.weapons.map((skin) => ({ type: "Weapon", team: skin.team, ...savedSkinLabel(skin, catalogue) }));
    const knives = loadout.knives.map((skin) => ({ type: "Knife", team: skin.team, ...savedSkinLabel(skin, catalogue) }));
    const gloves = loadout.gloves.map((skin) => ({ type: "Gloves", team: skin.team, ...savedSkinLabel(skin, catalogue) }));
    const agents = loadout.agents.map((agent) => {
      const definition = catalogue.agents.find((candidate) => candidate.agentIndex === agent.agentIndex && candidate.team === agent.team);
      return { type: "Agent", team: agent.team, item: definition?.displayName ?? `Agent #${agent.agentIndex}`, finish: definition?.rarity ?? "Agent", color: definition?.color ?? "#ff7185" };
    });
    const music = loadout.musicKitIndex === null ? [] : (() => {
      const definition = catalogue.musicKits.find((candidate) => candidate.musicKitIndex === loadout.musicKitIndex);
      return [{ type: "Music", team: null, item: definition?.displayName ?? `Music kit #${loadout.musicKitIndex}`, finish: definition?.rarity ?? "Music kit", color: definition?.color ?? "#ff7185" }];
    })();
    return [...weapons, ...knives, ...gloves, ...agents, ...music];
  }, [catalogue, loadout]);
  const savedBySide = useMemo(() => ({
    T: savedSelections.filter((selection) => selection.team === "T"),
    CT: savedSelections.filter((selection) => selection.team === "CT"),
    shared: savedSelections.filter((selection) => selection.team === null)
  }), [savedSelections]);

  function resetAdvancedFields() {
    setNametag("");
    setStattrak(false);
    setKeychain(null);
    setStickers([null, null, null, null, null, null]);
    setAdvancedChanged(false);
  }

  function changeCategory(nextCategory: EditorCategory) {
    setCategory(nextCategory);
    setNotice(null);
    resetAdvancedFields();
    if (nextCategory === "weapon") {
      const item = catalogue.items.find((candidate) => candidate.category === "weapon" && weaponGroupFor(candidate.key) === weaponGroup);
      if (item) {
        setDefinitionIndex(item.definitionIndex);
        setPaintkit(item.paintkits[0]?.paintkit ?? 0);
      }
    } else if (isSkinCategory(nextCategory)) {
      const item = catalogue.items.find((candidate) => candidate.category === nextCategory);
      if (item) {
        setDefinitionIndex(item.definitionIndex);
        setPaintkit(item.paintkits[0]?.paintkit ?? 0);
      }
    } else if (nextCategory === "music-kit" && catalogue.musicKits[0]) {
      setMusicKitIndex(catalogue.musicKits[0].musicKitIndex);
    }
  }

  function changeWeaponGroup(nextGroup: WeaponGroup) {
    setWeaponGroup(nextGroup);
    setNotice(null);
    resetAdvancedFields();
    const item = catalogue.items.find((candidate) => candidate.category === "weapon" && weaponGroupFor(candidate.key) === nextGroup);
    if (item) {
      setDefinitionIndex(item.definitionIndex);
      setPaintkit(item.paintkits[0]?.paintkit ?? 0);
    }
  }

  async function submit(action: "set" | "reset") {
    setSubmitting(true);
    setNotice(null);
    const payload: Record<string, unknown> = { csrf: actionToken, action, category };
    if (category === "music-kit") {
      if (action === "set") payload.musicKitIndex = selectedMusicKit?.musicKitIndex;
    } else {
      payload.teams = sideMode === "both" ? ["T", "CT"] : [sideMode];
      if (category === "agent") {
        if (action === "set") payload.agentIndexes = agentIndexes;
      } else {
        payload.definitionIndex = selectedItem?.definitionIndex;
        if (action === "set") {
          payload.paintkit = selectedPaintkit?.paintkit;
          payload.seed = Math.round(seed);
          payload.wear = wear;
          if (advancedChanged && (category === "weapon" || category === "knife")) {
            payload.nametag = nametag.trim() || null;
            payload.stattrak = stattrak;
            if (category === "weapon") {
              payload.keychain = keychain;
              payload.stickers = stickers;
            }
          }
        }
      }
    }

    try {
      const response = await fetch("/api/loadout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message || "The server did not accept that loadout change.");
      setNotice({ type: "success", text: `${result.message ?? "Loadout change queued."} Refresh this page after a moment to see the saved selection.` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "The loadout change could not be queued." });
    } finally {
      setSubmitting(false);
    }
  }

  const previewStyle = { "--loadout-accent": previewColor } as CSSProperties;

  return (
    <section className="loadout-editor" aria-label="WeaponSkins loadout editor">
      <div className="loadout-editor-heading">
        <div>
          <p className="eyebrow">Live server catalogue</p>
          <h2>Build your server loadout</h2>
          <p>Every option comes from the active WeaponSkins plugin. Official Steam item art is used when available, while the game server validates every change before it is saved.</p>
        </div>
        <time dateTime={catalogue.syncedAt}>Catalogue synced {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(catalogue.syncedAt))}</time>
      </div>

      <div className="loadout-tabs" role="tablist" aria-label="Loadout category">
        {categories.map((option) => <button key={option.id} type="button" role="tab" aria-selected={category === option.id} className={category === option.id ? "active" : ""} onClick={() => changeCategory(option.id)}>{option.label}</button>)}
      </div>

      <div className="loadout-workspace">
        <div className="loadout-controls">
          {category !== "music-kit" ? <fieldset className="loadout-team-switch"><legend>Apply to</legend><div>{([{ id: "T", label: "Terrorist" }, { id: "CT", label: "Counter-Terrorist" }, { id: "both", label: "Both sides" }] as Array<{ id: SideMode; label: string }>).map((side) => <button key={side.id} type="button" className={sideMode === side.id ? "active" : ""} onClick={() => setSideMode(side.id)}><span>{side.id === "both" ? "T + CT" : side.id}</span>{side.label}</button>)}</div><small>Both sides queues one validated server action for T and one for CT.</small></fieldset> : null}

          {category === "agent" ? <div className={sideMode === "both" ? "loadout-agent-selects dual" : "loadout-agent-selects"}>{(sideMode === "both" ? (["T", "CT"] as LoadoutTeam[]) : [sideMode]).map((side) => <label key={side} className="loadout-field">{side === "T" ? "Terrorist agent" : "Counter-Terrorist agent"}<select value={agentIndexes[side]} onChange={(event) => setAgentIndexes((current) => ({ ...current, [side]: numberValue(event.target.value) }))}>{catalogue.agents.filter((agent) => agent.team === side).map((agent) => <option key={agent.agentIndex} value={agent.agentIndex}>{agent.displayName}</option>)}</select></label>)}</div> : null}

          {category === "music-kit" ? <label className="loadout-field">Music kit<select value={selectedMusicKit?.musicKitIndex ?? ""} onChange={(event) => setMusicKitIndex(numberValue(event.target.value))}>{catalogue.musicKits.map((musicKit) => <option key={musicKit.musicKitIndex} value={musicKit.musicKitIndex}>{musicKit.displayName}</option>)}</select></label> : null}

          {category === "weapon" ? <fieldset className="loadout-weapon-groups"><legend>Weapon class</legend><div role="tablist" aria-label="Weapon class">{weaponGroups.map((group) => <button key={group.id} type="button" role="tab" aria-selected={weaponGroup === group.id} className={weaponGroup === group.id ? "active" : ""} disabled={!weaponGroupCounts[group.id]} onClick={() => changeWeaponGroup(group.id)}>{group.label}<small>{weaponGroupCounts[group.id]}</small></button>)}</div></fieldset> : null}

          {isSkinCategory(category) ? <>
            <label className="loadout-field">{category === "glove" ? "Glove model" : category === "knife" ? "Knife model" : "Weapon"}<select value={selectedItem?.definitionIndex ?? ""} onChange={(event) => { const next = selectableItems.find((item) => item.definitionIndex === numberValue(event.target.value)); setDefinitionIndex(next?.definitionIndex ?? 0); setPaintkit(next?.paintkits[0]?.paintkit ?? 0); resetAdvancedFields(); }}>{selectableItems.map((item) => <option key={item.definitionIndex} value={item.definitionIndex}>{item.displayName}</option>)}</select></label>
            <label className="loadout-field">Finish<select value={selectedPaintkit?.paintkit ?? ""} onChange={(event) => setPaintkit(numberValue(event.target.value))}>{selectedItem?.paintkits.map((finish) => <option key={finish.paintkit} value={finish.paintkit}>{finish.displayName}</option>)}</select></label>
            <div className="loadout-presets"><span>Wear preset</span><div>{wearPresets.map((preset) => <button key={preset.label} type="button" className={Math.abs(wear - preset.value) < 0.001 ? "active" : ""} onClick={() => setWear(preset.value)}>{preset.label}</button>)}</div></div>
            <div className="loadout-fine-tune"><label className="loadout-field loadout-wear-slider"><span>Wear <output>{wear.toFixed(6)}</output></span><input type="range" min="0" max="1" step="0.000001" value={wear} aria-valuetext={`${wearLabel(wear)}, ${wear.toFixed(6)}`} onChange={(event) => setWear(numberValue(event.target.value))} /><small>{wearLabel(wear)}</small></label><label className="loadout-field">Pattern seed<input type="number" min="0" max="1000" step="1" value={seed} onChange={(event) => setSeed(Math.max(0, Math.min(1000, Math.round(numberValue(event.target.value)))))} /></label></div>
            {(category === "weapon" || category === "knife") ? <details className="loadout-advanced">
              <summary>Advanced item details <span>Name tag &amp; StatTrak{category === "weapon" ? ", charm &amp; stickers" : ""}</span></summary>
              <p>These values are only sent when you change one of them, so simply applying a finish keeps your existing in-game details intact.</p>
              <div className="loadout-advanced-fields">
                <label className="loadout-field">Name tag<input type="text" value={nametag} maxLength={128} placeholder="No name tag" onChange={(event) => { setNametag(event.target.value); setAdvancedChanged(true); }} /></label>
                <label className="loadout-toggle"><input type="checkbox" checked={stattrak} onChange={(event) => { setStattrak(event.target.checked); setAdvancedChanged(true); }} /><span><strong>StatTrak</strong><small>Track kills with this item</small></span></label>
                {category === "weapon" ? <>
                  <label className="loadout-field">Charm<select value={keychain ?? ""} onChange={(event) => { setKeychain(event.target.value ? numberValue(event.target.value) : null); setAdvancedChanged(true); }}><option value="">No charm</option>{catalogue.keychains.map((charm) => <option key={charm.keychain} value={charm.keychain}>{charm.displayName} · {charm.rarity}</option>)}</select></label>
                  <fieldset className="loadout-sticker-slots"><legend>Stickers <small>Six slots · empty slots remove existing stickers</small></legend><div>{stickers.map((sticker, slot) => <label key={slot} className="loadout-field">Slot {slot + 1}<select value={sticker ?? ""} onChange={(event) => { const nextSticker = event.target.value ? numberValue(event.target.value) : null; setStickers((current) => current.map((value, index) => index === slot ? nextSticker : value)); setAdvancedChanged(true); }}><option value="">No sticker</option>{catalogue.stickers.map((candidate) => <option key={candidate.sticker} value={candidate.sticker}>{candidate.displayName} · {candidate.collection}</option>)}</select></label>)}</div></fieldset>
                </> : null}
              </div>
            </details> : null}
          </> : null}

          <div className="loadout-actions"><button type="button" className="button button-primary" disabled={submitting || !canApply} onClick={() => submit("set")}>{submitting ? "Queueing..." : sideMode === "both" && category !== "music-kit" ? "Apply to T + CT" : "Apply loadout"}</button><button type="button" className="button button-secondary" disabled={submitting} onClick={() => submit("reset")}>{sideMode === "both" && category !== "music-kit" ? "Reset T + CT" : "Reset this slot"}</button></div>
          {notice ? <p className={`loadout-notice ${notice.type}`}>{notice.text}</p> : null}
        </div>

        <aside className="loadout-preview" style={previewStyle} aria-label="Selected loadout preview">
          <div className="loadout-preview-grid" aria-hidden="true"><i /><i /><i /><i /></div>
          <span className="loadout-preview-kicker">Official item preview</span>
          <div className={`loadout-preview-art ${previewRequests.length > 1 ? "dual" : ""}`}>
            {previewRequests.length ? previewRequests.map((entry) => <figure key={`${entry.request.category}-${entry.team ?? "global"}-${entry.alt}`}><MarketPreview request={entry.request} category={category} alt={entry.alt} />{entry.team ? <figcaption>{entry.team}</figcaption> : null}</figure>) : <MarketPreview request={null} category={category} alt="" />}
          </div>
          <p>{category === "music-kit" ? "Global profile" : sideMode === "both" ? "T + CT profiles" : `${activeTeam} profile`}</p>
          <h3>{previewName}</h3>
          <strong>{previewFinish}</strong>
          {isSkinCategory(category) ? <dl><div><dt>Condition</dt><dd>{wearLabel(wear)} · {wear.toFixed(6)}</dd></div><div><dt>Pattern</dt><dd>Seed {Math.round(seed)}</dd></div></dl> : <p className="loadout-preview-copy">{category === "agent" ? "Team-specific agent models are queued separately when both sides are selected." : "The selected music kit is validated and applied by WeaponSkins."}</p>}
        </aside>
      </div>

      <div className="loadout-saved-heading"><div><p className="eyebrow">Saved to WeaponSkins</p><h3>Your active choices</h3></div><span>{savedSelections.length} saved</span></div>
      {savedSelections.length ? <div className="loadout-saved-list">{savedSelections.map((selection, index) => <article key={`${selection.type}-${selection.team ?? "global"}-${selection.item}-${index}`} style={{ "--saved-accent": selection.color } as CSSProperties}><span>{selection.type}</span><div><strong>{selection.item}</strong><small>{selection.finish}{selection.team ? ` · ${selection.team}` : ""}</small></div></article>)}</div> : <p className="empty-copy">No saved cosmetic selections yet. Choose a category above and apply your first loadout item.</p>}
      {savedSelections.length ? <div className="loadout-saved-sides">{(["T", "CT"] as LoadoutTeam[]).map((side) => <section key={side} className={"loadout-saved-side " + side.toLowerCase()}><header><div><span>{side}</span><strong>{teamLabel(side)}</strong></div><small>{savedBySide[side].length} saved</small></header>{savedBySide[side].length ? <div className="loadout-saved-list">{savedBySide[side].map((choice, index) => <SavedChoiceCard key={choice.type + choice.item + index} choice={choice} index={index} />)}</div> : <p className="loadout-side-empty">No saved {side} choices yet.</p>}</section>)}{savedBySide.shared.length ? <section className="loadout-saved-shared"><header><span>Shared</span><small>Applied to both sides</small></header><div className="loadout-saved-list">{savedBySide.shared.map((choice, index) => <SavedChoiceCard key={choice.type + choice.item + index} choice={choice} index={index} />)}</div></section> : null}</div> : <p className="loadout-active-empty">No saved cosmetic selections yet. Choose a category above and apply your first loadout item.</p>}
      <p className="loadout-footnote">This editor covers skins, knives, gloves, agents, music kits, name tags, StatTrak, charms, and six sticker slots. WeaponSkins remains the final authority for every saved item.</p>
    </section>
  );
}
