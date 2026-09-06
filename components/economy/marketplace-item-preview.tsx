"use client";

import {
  Box,
  Hand,
  ImageOff,
  LoaderCircle,
  Music2,
  Package,
  Sticker,
  Sword,
  Tag,
  UserRound,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  rarityRankClass,
  type EconomyItemView,
} from "@/components/economy/economy-view-model";
import { proxiedImageUrl } from "@/lib/images/proxy-url";
import { SkinViewer, type SkinViewerItem } from "@skinhub/viewer";
import { weaponPreviewItem, type WeaponPreviewSource } from "@/lib/economy/weapon-preview";
import { weaponPreviewBudget } from "@/lib/economy/preview-budget";

type MarketplaceItemPreviewProps = {
  item: Pick<
    EconomyItemView,
    | "catalogueId"
    | "displayName"
    | "floatValue"
    | "imageUrl"
    | "itemType"
    | "rarityRank"
  > & Partial<WeaponPreviewSource>;
  enableMarketPreview?: boolean;
  floatValue?: number | null;
  patternSeed?: number | null;
  overlay?: ReactNode;
};

type PreviewState = "idle" | "loading" | "ready" | "unavailable";

function safeImageUrl(value: string | null | undefined) {
  if (!value) return null;
  // Staff-managed artwork lives in the portal's public image directory. It
  // must be used directly rather than sent through the remote-image proxy.
  if (
    value.startsWith("/images/economy/") &&
    !value.includes("\\") &&
    !value.includes("..") &&
    !value.includes("?") &&
    !value.includes("#")
  ) {
    return value;
  }
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function imageCandidates(value: string | null | undefined) {
  const directImageUrl = safeImageUrl(value);
  if (!directImageUrl) return [];
  if (directImageUrl.startsWith("/")) return [directImageUrl];
  const proxiedUrl = proxiedImageUrl(directImageUrl);
  return [...new Set([proxiedUrl, directImageUrl].filter(Boolean))] as string[];
}

function marketPreviewUrl(catalogueId: number | null, floatValue: number | null) {
  if (!catalogueId || !Number.isSafeInteger(catalogueId) || catalogueId < 1)
    return null;
  const params = new URLSearchParams({ catalogueId: String(catalogueId) });
  if (
    floatValue !== null &&
    Number.isFinite(floatValue) &&
    floatValue >= 0 &&
    floatValue <= 1
  ) {
    params.set("float", floatValue.toFixed(6));
  }
  return `/api/economy/market/preview?${params.toString()}`;
}

function previewImageUrlsFromResponse(body: unknown) {
  if (typeof body !== "object" || body === null) return [];
  const response = body as { imageUrl?: unknown; imageUrls?: unknown };
  const values = [
    ...(Array.isArray(response.imageUrls) ? response.imageUrls : []),
    response.imageUrl,
  ];
  const seen = new Set<string>();
  const imageUrls: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    for (const imageUrl of imageCandidates(value)) {
      if (seen.has(imageUrl)) continue;
      seen.add(imageUrl);
      imageUrls.push(imageUrl);
    }
  }
  return imageUrls;
}

function fallbackIcon(itemType: string) {
  if (itemType === "knife") return Sword;
  if (itemType === "glove") return Hand;
  if (itemType === "sticker") return Sticker;
  if (itemType === "agent") return UserRound;
  if (itemType === "music_kit") return Music2;
  if (
    itemType === "crate" ||
    itemType === "case" ||
    itemType === "capsule"
  )
    return Package;
  if (itemType === "nametag" || itemType === "keychain" || itemType === "patch")
    return Tag;
  return Box;
}

export function MarketplaceItemPreview({
  item, enableMarketPreview = true, floatValue = null, patternSeed = null, overlay,
}: MarketplaceItemPreviewProps) {
  const preview = weaponPreviewItem({ ...item, floatValue: floatValue ?? item.floatValue, seed: patternSeed ?? item.seed });
  const artwork = <CatalogueItemPreview item={item} enableMarketPreview={enableMarketPreview} floatValue={floatValue} />;
  if (preview) return <InstanceItemPreview item={preview} label={item.displayName} rarityRank={item.rarityRank} artwork={artwork} overlay={overlay} />;
  return <CatalogueItemPreview item={item} enableMarketPreview={enableMarketPreview} floatValue={floatValue} overlay={overlay} />;
}

function InstanceItemPreview({ item, label, rarityRank, artwork, overlay }: {
  item: SkinViewerItem; label: string; rarityRank: number; artwork: ReactNode; overlay?: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [granted, setGranted] = useState(false);
  const budgetId = useRef(Symbol());
  const identity = JSON.stringify(item);
  useEffect(() => setFailed(false), [identity]);
  useEffect(() => {
    if (!visible || failed) { setGranted(false); return; }
    return weaponPreviewBudget.register(budgetId.current, setGranted);
  }, [visible, failed]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let intersecting = false;
    const update = () => setVisible(intersecting && document.visibilityState === "visible");
    const observer = new IntersectionObserver(([entry]) => { intersecting = entry.isIntersecting; update(); }, { threshold: 0.05 });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  const fallback = <div className="economy-instance-fallback">{artwork}<small className="economy-instance-art-label">Catalogue artwork · {failed ? "3D unavailable" : "Hover or inspect for 3D"}</small></div>;
  return <div ref={container} data-ui="item-artwork" onMouseEnter={() => weaponPreviewBudget.prioritize(budgetId.current)} className={`economy-item-preview economy-instance-preview ${rarityRankClass(rarityRank)}`}>
    {visible && granted && !failed ? <div className="economy-instance-canvas" inert>
      <SkinViewer item={item} title={`${label}, float ${item.float}, pattern ${item.seed}`} style={{ width: "100%", height: "100%" }}
        settings={{ quality: { renderScale: 0.5, bloom: 0, shadows: false }, environment: { background: "transparent", map: "Warehouse" } }}
        interactions={{ orbit: false, zoom: false, dragStickers: false, dragCharm: false }}
        onError={() => setFailed(true)}
        loading={<div className="economy-instance-loading"><LoaderCircle size={18} /><small>Rendering float & pattern…</small></div>}
        fallback={fallback} />
    </div> : failed || visible ? fallback : <div className="economy-instance-loading"><small>3D item preview</small></div>}
    {overlay ? <div className="economy-item-preview-overlay">{overlay}</div> : null}
  </div>;
}

function CatalogueItemPreview({
  item,
  enableMarketPreview = true,
  floatValue = null,
  overlay,
}: MarketplaceItemPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [failedDirectImageUrls, setFailedDirectImageUrls] = useState<string[]>(
    [],
  );
  const [previewImageUrls, setPreviewImageUrls] = useState<string[]>([]);
  const [failedPreviewImageUrls, setFailedPreviewImageUrls] = useState<string[]>(
    [],
  );
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  const [state, setState] = useState<PreviewState>("idle");
  const directImageUrls = useMemo(() => imageCandidates(item.imageUrl), [item.imageUrl]);
  const directImageKey = directImageUrls.join("|");
  const directImageUrl = directImageUrls.find(
    (imageUrl) => !failedDirectImageUrls.includes(imageUrl),
  );
  const previewFloat =
    floatValue !== null &&
    Number.isFinite(floatValue) &&
    floatValue >= 0 &&
    floatValue <= 1
      ? floatValue
      : item.floatValue;
  const previewRequestUrl = useMemo(
    () =>
      enableMarketPreview
        ? marketPreviewUrl(item.catalogueId, previewFloat)
        : null,
    [enableMarketPreview, item.catalogueId, previewFloat],
  );
  const prefersWearPreview =
    previewFloat !== null &&
    ["skin", "knife", "glove"].includes(item.itemType);
  const Icon = fallbackIcon(item.itemType);
  const previewImageUrl = previewImageUrls.find(
    (imageUrl) => !failedPreviewImageUrls.includes(imageUrl),
  );

  useEffect(() => {
    setFailedDirectImageUrls([]);
  }, [directImageKey]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPreviewImageUrls([]);
    setFailedPreviewImageUrls([]);
    if (
      !isVisible ||
      !previewRequestUrl ||
      (!prefersWearPreview && directImageUrl)
    ) {
      setState(directImageUrl ? "ready" : "idle");
      return;
    }

    const controller = new AbortController();
    setState("loading");
    void fetch(previewRequestUrl, { signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error("Preview unavailable");
        const imageUrls = previewImageUrlsFromResponse(body).filter(
          (imageUrl) => !directImageUrls.includes(imageUrl),
        );
        if (!imageUrls.length) throw new Error("Preview unavailable");
        return imageUrls;
      })
      .then((imageUrls) => {
        if (controller.signal.aborted) return;
        setPreviewImageUrls(imageUrls);
        setState("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setPreviewImageUrls([]);
        setState("unavailable");
      });

    return () => controller.abort();
  }, [
    directImageKey,
    directImageUrl,
    isVisible,
    prefersWearPreview,
    previewRequestUrl,
  ]);

  // A selected float gets Steam's exterior-specific art whenever it is
  // available; the startup-cached catalogue image stays on screen while that
  // request resolves and remains the reliable fallback when Steam is down.
  const imageUrl = previewImageUrl ?? directImageUrl;
  const imageLoading = Boolean(imageUrl && loadedImageUrl !== imageUrl);
  const requestLoading = !imageUrl && state === "loading";
  const loading = imageLoading || requestLoading;
  const label = requestLoading
    ? "Loading item art"
    : state === "unavailable" && previewRequestUrl
      ? "Item preview unavailable"
      : "Preview unavailable";

  return (
    <div
      ref={containerRef}
      data-ui="item-artwork"
      className={`economy-item-preview ${rarityRankClass(item.rarityRank)}`}
      aria-busy={loading}
    >
      {imageUrl ? (
        <>
          <img
            src={imageUrl}
            alt={`${item.displayName} preview`}
            className={imageLoading ? "is-loading" : undefined}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setLoadedImageUrl(imageUrl)}
            onError={() => {
              setLoadedImageUrl(null);
              if (directImageUrls.includes(imageUrl)) {
                setFailedDirectImageUrls((current) =>
                  current.includes(imageUrl) ? current : [...current, imageUrl],
                );
                return;
              }
              const hasAnotherCandidate = previewImageUrls.some(
                (candidate) =>
                  candidate !== imageUrl &&
                  !failedPreviewImageUrls.includes(candidate),
              );
              setFailedPreviewImageUrls((current) =>
                current.includes(imageUrl) ? current : [...current, imageUrl],
              );
              if (!hasAnotherCandidate) {
                setState("unavailable");
              }
            }}
          />
          {imageLoading ? (
            <span className="economy-item-preview-loading" aria-hidden="true">
              <LoaderCircle />
            </span>
          ) : null}
        </>
      ) : (
        <div className="economy-item-preview-fallback">
          {loading ? (
            <LoaderCircle
              aria-hidden="true"
              className="economy-item-preview-spinner"
            />
          ) : state === "unavailable" ? (
            <ImageOff aria-hidden="true" />
          ) : (
            <Icon aria-hidden="true" />
          )}
          <span>{label}</span>
        </div>
      )}
      {overlay ? (
        <div className="economy-item-preview-overlay">{overlay}</div>
      ) : null}
    </div>
  );
}
