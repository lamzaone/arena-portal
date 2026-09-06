"use client";

import { ImageOff, LoaderCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { rarityRankClass } from "./economy-view-model";
import { invalidateWeaponThumbnail, watchWeaponThumbnail, type ThumbnailState } from "./thumbnail-client";
import type { WeaponThumbnail } from "@/lib/economy/weapon-thumbnail";

// The parent keys this component by the entire configuration. A completed
// request for an old seed/float cannot remain on screen after a selection.
export function ExactWeaponThumbnail({ item, name, rarityRank, sample, overlay, className = "", fallbackImageUrls = [] }: {
  item: WeaponThumbnail; name: string; rarityRank: number; sample: boolean; overlay?: ReactNode; className?: string; fallbackImageUrls?: readonly string[];
}) {
  const [state, setState] = useState<ThumbnailState>({ status: "loading" });
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedArtwork, setFailedArtwork] = useState<string[]>([]);
  const artworkKey = fallbackImageUrls.join("|");
  useEffect(() => { setFailedArtwork([]); }, [artworkKey]);
  // Pagination bounds the page to 20 cards. Request every row together so the
  // lower rows are ready before the player scrolls to them.
  useEffect(() => watchWeaponThumbnail(item, setState), [item]);
  const shown = state.status === "ready" && state.src === loadedSrc;
  const loading = state.status === "loading" || (state.status === "ready" && !shown);
  const fallbackSrc = fallbackImageUrls.find(src => !failedArtwork.includes(src));
  // A ready ticket is not yet a painted image. Share one grid cell and retain
  // the catalogue artwork until the exact image's own load event succeeds.
  return <div data-ui="exact-item-thumbnail" className={`economy-item-preview ${rarityRankClass(rarityRank)} ${className}`.trim()} aria-busy={loading}>
    {!shown && fallbackSrc ? <img key={fallbackSrc} data-catalogue-preview src={fallbackSrc} width={640} height={360}
      loading="eager" decoding="async" referrerPolicy="no-referrer" alt={`${name}, catalogue preview`}
      style={{ gridArea: "1 / 1", padding: 10, transform: "none" }}
      onError={() => setFailedArtwork(current => current.includes(fallbackSrc) ? current : [...current, fallbackSrc])} /> : null}
    {state.status === "ready" && state.src ? <img src={state.src} width={640} height={360} loading="eager" decoding="async"
      style={{ gridArea: "1 / 1", visibility: shown ? "visible" : "hidden" }}
      alt={`${name}, float ${item.float}, seed ${item.seed}${sample ? " (sample)" : ""}`}
      onLoad={() => setLoadedSrc(state.src!)} onError={() => { setLoadedSrc(null); invalidateWeaponThumbnail(item); }} /> : null}
    {!shown && !fallbackSrc ? <div className="economy-item-preview-fallback exact-thumbnail-cover">
      {loading ? <LoaderCircle className="economy-item-preview-spinner" aria-hidden="true" /> : <ImageOff aria-hidden="true" />}
      <span>{loading ? "Preparing exact preview" : "Preview temporarily unavailable"}</span>
    </div> : null}
    <small className="economy-item-art-label" title={`${shown ? "" : "Exact preview requested: "}Float ${item.float} · Seed ${item.seed}`}>
      {shown ? <>{sample ? "Sample · " : ""}Float {item.float.toFixed(6)} · Seed {item.seed}</>
        : fallbackSrc ? <>Catalogue preview{loading ? " · Exact preview updating" : ""}</> : loading ? "Exact preview updating" : "Exact preview unavailable"}
    </small>
    {overlay ? <div className="economy-item-preview-overlay">{overlay}</div> : null}
  </div>;
}
