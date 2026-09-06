"use client";

import { useEffect, useState, type ReactNode } from "react";
import { rarityRankClass } from "./economy-view-model";
import { invalidateCachedWeaponThumbnail, watchCachedWeaponThumbnail, type ThumbnailState } from "./thumbnail-client";
import type { WeaponThumbnail } from "@/lib/economy/weapon-thumbnail";

/** A flat, already-generated item image; mounting this never starts a renderer. */
export function OwnedWeaponThumbnail({ item, name, rarityRank, fallback, overlay }: {
  item: WeaponThumbnail; name: string; rarityRank: number; fallback: ReactNode; overlay?: ReactNode;
}) {
  const [state, setState] = useState<ThumbnailState>({ status: "unavailable" });
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  useEffect(() => watchCachedWeaponThumbnail(item, setState), [item]);
  const shown = state.status === "ready" && state.src === loadedSrc;
  return <>
    {!shown && fallback}
    {state.status === "ready" && state.src ? <div data-ui="owned-item-snapshot"
      className={`economy-item-preview economy-weapon-artwork ${rarityRankClass(rarityRank)}`}
      style={{ display: shown ? undefined : "none" }}>
      <img src={state.src} width={640} height={360} loading="eager" decoding="async"
        alt={`${name}, float ${item.float}, seed ${item.seed}, saved item appearance`}
        onLoad={() => setLoadedSrc(state.src!)}
        onError={() => { setLoadedSrc(null); invalidateCachedWeaponThumbnail(item); }} />
      <small className="economy-item-art-label" title="Snapshot includes this item's finish, StatTrak, stickers and charm">
        Float {item.float.toFixed(6)} · Seed {item.seed}
      </small>
      {overlay ? <div className="economy-item-preview-overlay">{overlay}</div> : null}
    </div> : null}
  </>;
}
