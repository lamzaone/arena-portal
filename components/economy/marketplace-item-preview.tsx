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
  useState,
  type ReactNode,
} from "react";

import {
  rarityRankClass,
  type EconomyItemView,
} from "@/components/economy/economy-view-model";
import { proxiedImageUrl } from "@/lib/images/proxy-url";
import type { WeaponPreviewSource } from "@/lib/economy/weapon-preview";
import { thumbnailForSource, thumbnailSignature } from "@/lib/economy/weapon-thumbnail";
import { OwnedWeaponThumbnail } from "./owned-weapon-thumbnail";

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
  // Let the browser use the image provider's CDN and its own HTTP cache.
  // Going through shared hosting first adds a hop to every cold thumbnail.
  return [...new Set([directImageUrl, proxiedUrl].filter(Boolean))] as string[];
}

function marketPreviewUrl(catalogueId: number | null, hasStoredArtwork: boolean) {
  if (!catalogueId || !Number.isSafeInteger(catalogueId) || catalogueId < 1)
    return null;
  const params = new URLSearchParams({ catalogueId: String(catalogueId), mode: "catalogue" });
  if (hasStoredArtwork) params.set("fallback", "1");
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

export function MarketplaceItemPreview(props: MarketplaceItemPreviewProps) {
  const preview = useMemo(() => thumbnailForSource(props.item, props.floatValue, props.patternSeed), [props.item, props.floatValue, props.patternSeed]);
  const fallback = <CatalogueItemPreview key={`${props.item.catalogueId}|${props.item.imageUrl}|${props.item.itemType}`} {...props} />;
  // Owned items have a real float/seed and can read their prepared snapshot.
  // Catalogue samples stay on fast normal artwork; browsing never queues work.
  return preview && !preview.sample ? <OwnedWeaponThumbnail key={thumbnailSignature(preview.item)}
    item={preview.item} name={props.item.displayName} rarityRank={props.item.rarityRank}
    fallback={fallback} overlay={props.overlay} /> : fallback;
}

function CatalogueItemPreview({
  item,
  enableMarketPreview = true,
  overlay,
}: MarketplaceItemPreviewProps) {
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
  const previewRequestUrl = useMemo(
    () =>
      enableMarketPreview
        ? marketPreviewUrl(item.catalogueId, directImageUrls.length > 0)
        : null,
    [enableMarketPreview, item.catalogueId, directImageUrls.length],
  );
  const isWeaponArtwork = ["skin", "weapon", "knife", "glove"].includes(item.itemType);
  const Icon = fallbackIcon(item.itemType);
  const previewImageUrl = previewImageUrls.find(
    (imageUrl) => !failedPreviewImageUrls.includes(imageUrl),
  );

  useEffect(() => {
    setFailedDirectImageUrls([]);
  }, [directImageKey]);

  useEffect(() => {
    setPreviewImageUrls([]);
    setFailedPreviewImageUrls([]);
    if (
      !previewRequestUrl ||
      directImageUrl
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
    previewRequestUrl,
  ]);

  // Every row on the bounded page loads together. Catalogue art deliberately
  // does not claim to depict the selected float, seed or attachments.
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
      data-ui="item-artwork"
      className={`economy-item-preview ${rarityRankClass(item.rarityRank)}${isWeaponArtwork ? " economy-catalogue-weapon-artwork" : ""}`}
      aria-busy={loading}
    >
      {imageUrl ? (
        <>
          <img
            src={imageUrl}
            alt={`${item.displayName} ${isWeaponArtwork ? "catalogue artwork" : "preview"}`}
            width={640}
            height={360}
            loading="eager"
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
      {imageUrl && isWeaponArtwork ? <small className="economy-item-art-label" title="Open Inspect for the exact float, seed and attachments">Catalogue preview</small> : null}
      {overlay ? (
        <div className="economy-item-preview-overlay">{overlay}</div>
      ) : null}
    </div>
  );
}
