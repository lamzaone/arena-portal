"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";

import { proxiedImageUrl } from "@/lib/images/proxy-url";

type ResilientRemoteImageProps = {
  src: string | null | undefined;
  alt: string;
  fallback: ReactNode;
  className?: string;
  loading?: "eager" | "lazy";
  referrerPolicy?: ImgHTMLAttributes<HTMLImageElement>["referrerPolicy"];
};

/**
 * Remote avatars are served through the same-origin allow-listed image proxy.
 * If Steam/CDN delivery fails, callers receive their supplied text/icon
 * fallback instead of a broken image glyph.
 */
export function ResilientRemoteImage({
  src,
  alt,
  fallback,
  className,
  loading,
  referrerPolicy,
}: ResilientRemoteImageProps) {
  const imageUrls = useMemo(() => {
    if (!src) return [];
    try {
      const directImageUrl = new URL(
        src.startsWith("//") ? `https:${src}` : src,
      );
      if (directImageUrl.protocol !== "https:") return [];
      const direct = directImageUrl.toString();
      return [...new Set([proxiedImageUrl(direct), direct].filter(Boolean))] as string[];
    } catch {
      return [];
    }
  }, [src]);
  const imageKey = imageUrls.join("|");
  const [failedImageUrls, setFailedImageUrls] = useState<string[]>([]);
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  const imageUrl = imageUrls.find(
    (candidate) => !failedImageUrls.includes(candidate),
  );
  const loaded = Boolean(imageUrl && loadedImageUrl === imageUrl);

  useEffect(() => {
    setFailedImageUrls([]);
    setLoadedImageUrl(null);
  }, [imageKey]);

  if (!imageUrl) return <>{fallback}</>;
  return (
    <img
      src={imageUrl}
      alt={alt}
      className={`${className ?? ""} ui-remote-image${loaded ? "" : " is-loading"}`.trim()}
      loading={loading}
      referrerPolicy={referrerPolicy}
      aria-busy={!loaded}
      onLoad={() => setLoadedImageUrl(imageUrl)}
      onError={() => {
        setLoadedImageUrl(null);
        setFailedImageUrls((current) =>
          current.includes(imageUrl) ? current : [...current, imageUrl],
        )
      }}
    />
  );
}
