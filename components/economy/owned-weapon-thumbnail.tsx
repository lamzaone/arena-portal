"use client";

import { useEffect, useState, type ReactNode } from "react";
import { rarityRankClass } from "./economy-view-model";
import { invalidateCachedWeaponThumbnail, watchCachedWeaponThumbnail, type ThumbnailState } from "./thumbnail-client";
import { invalidateBrowserWeaponThumbnail, watchBrowserWeaponThumbnail } from "./browser-thumbnail-client";
import type { WeaponThumbnail } from "@/lib/economy/weapon-thumbnail";

/** Show normal art immediately; saved or client-rendered images replace it only after loading. */
export function OwnedWeaponThumbnail({ item, name, rarityRank, fallback, overlay }: {
  item: WeaponThumbnail; name: string; rarityRank: number; fallback: ReactNode; overlay?: ReactNode;
}) {
  const [state, setState] = useState<ThumbnailState>({ status: "unavailable" });
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false, localReady = false, serverReady = false;
    let stopLocal: (() => void) | undefined;
    // Local cache hits do not wait for an API round trip. New renders have a
    // short grace period so an existing shared snapshot can win first.
    stopLocal = watchBrowserWeaponThumbnail(item, next => {
      if (disposed || serverReady) return;
      localReady = next.status === "ready";
      setState(next);
    });
    const stopServer = watchCachedWeaponThumbnail(item, next => {
      if (disposed || localReady) return;
      if (next.status === "ready") { serverReady = true; stopLocal?.(); setState(next); }
      else if (serverReady) {
        serverReady = false;
        stopLocal = watchBrowserWeaponThumbnail(item, local => { if (!disposed && !serverReady) { localReady = local.status === "ready"; setState(local); } });
      }
    });
    return () => { disposed = true; stopLocal?.(); stopServer(); };
  }, [item]);
  const shown = state.status === "ready" && state.src === loadedSrc;
  return <>
    {!shown && fallback}
    {state.status === "ready" && state.src ? <div data-ui="owned-item-snapshot"
      className={`economy-item-preview economy-weapon-artwork ${rarityRankClass(rarityRank)}`}
      style={{ display: shown ? undefined : "none" }}>
      <img src={state.src} width={640} height={360} loading="eager" decoding="async"
        alt={`${name}, float ${item.float}, seed ${item.seed}, saved item appearance`}
        onLoad={() => setLoadedSrc(state.src!)}
        onError={() => { setLoadedSrc(null); if (state.src?.startsWith("blob:")) invalidateBrowserWeaponThumbnail(item); else invalidateCachedWeaponThumbnail(item); }} />
      <small className="economy-item-art-label" title="Snapshot includes this item's finish, StatTrak, stickers and charm">
        Float {item.float.toFixed(6)} · Seed {item.seed}
      </small>
      {overlay ? <div className="economy-item-preview-overlay">{overlay}</div> : null}
    </div> : null}
  </>;
}
