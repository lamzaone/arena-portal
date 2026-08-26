"use client";

import {
  Box,
  ImageOff,
  LoaderCircle,
  Music2,
  Package,
  Sticker,
  Sword,
  Tag,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  rarityRankClass,
  type EconomyItemView,
} from "@/components/economy/economy-view-model";

type MarketplaceItemPreviewProps = {
  item: Pick<
    EconomyItemView,
    | "catalogueId"
    | "displayName"
    | "floatValue"
    | "imageUrl"
    | "itemType"
    | "rarityRank"
  >;
  enableMarketPreview?: boolean;
  floatValue?: number | null;
};

type PreviewState = "idle" | "loading" | "ready" | "unavailable";

function safeImageUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
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
    const imageUrl = typeof value === "string" ? safeImageUrl(value) : null;
    if (!imageUrl || seen.has(imageUrl)) continue;
    seen.add(imageUrl);
    imageUrls.push(imageUrl);
  }
  return imageUrls;
}

function fallbackIcon(itemType: string) {
  if (itemType === "knife") return Sword;
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
  item,
  enableMarketPreview = true,
  floatValue = null,
}: MarketplaceItemPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [directImageFailed, setDirectImageFailed] = useState(false);
  const [previewImageUrls, setPreviewImageUrls] = useState<string[]>([]);
  const [failedPreviewImageUrls, setFailedPreviewImageUrls] = useState<string[]>(
    [],
  );
  const [state, setState] = useState<PreviewState>("idle");
  const directImageUrl = useMemo(() => safeImageUrl(item.imageUrl), [item.imageUrl]);
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
  const Icon = fallbackIcon(item.itemType);
  const previewImageUrl = previewImageUrls.find(
    (imageUrl) => !failedPreviewImageUrls.includes(imageUrl),
  );

  useEffect(() => {
    setDirectImageFailed(false);
  }, [directImageUrl]);

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
      (directImageUrl && !directImageFailed)
    ) {
      setState(directImageUrl && !directImageFailed ? "ready" : "idle");
      return;
    }

    const controller = new AbortController();
    setState("loading");
    void fetch(previewRequestUrl, { signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error("Preview unavailable");
        const imageUrls = previewImageUrlsFromResponse(body).filter(
          (imageUrl) => imageUrl !== directImageUrl,
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
  }, [directImageFailed, directImageUrl, isVisible, previewRequestUrl]);

  const imageUrl =
    directImageUrl && !directImageFailed ? directImageUrl : previewImageUrl;
  const loading = !imageUrl && state === "loading";
  const label = loading
    ? "Loading item art"
    : state === "unavailable" && previewRequestUrl
      ? "Item preview unavailable"
      : "Preview unavailable";

  return (
    <div
      ref={containerRef}
      className={`economy-item-preview ${rarityRankClass(item.rarityRank)}`}
      aria-busy={loading}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={`${item.displayName} preview`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => {
            if (imageUrl === directImageUrl && !directImageFailed) {
              setDirectImageFailed(true);
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
    </div>
  );
}
