import { NextResponse } from "next/server";

export const runtime = "nodejs";

const maximumImageBytes = 8 * 1024 * 1024;

function trustedImageUrl(value: string | null) {
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLocaleLowerCase("en-US");
    const steamHost =
      host === "steamstatic.com" ||
      host.endsWith(".steamstatic.com") ||
      host === "steamcdn-a.akamaihd.net";
    const trackedCatalogueImage =
      host === "raw.githubusercontent.com" &&
      url.pathname.startsWith("/ByMykel/counter-strike-image-tracker/");
    return url.protocol === "https:" && (steamHost || trackedCatalogueImage)
      ? url
      : null;
  } catch {
    return null;
  }
}

function safeContentType(value: string | null) {
  const contentType = (value ?? "").split(";", 1)[0].trim().toLocaleLowerCase("en-US");
  return contentType.startsWith("image/") && contentType !== "image/svg+xml"
    ? contentType
    : null;
}

export async function GET(request: Request) {
  const requested = trustedImageUrl(new URL(request.url).searchParams.get("src"));
  if (!requested) return new NextResponse(null, { status: 404 });

  try {
    const response = await fetch(requested, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/png,image/jpeg,image/*;q=0.8",
        "User-Agent": "TAPPED.RO Portal Image Proxy/1.0",
      },
      redirect: "follow",
      next: { revalidate: 60 * 60 * 12 },
    });
    const finalUrl = trustedImageUrl(response.url);
    const contentType = safeContentType(response.headers.get("content-type"));
    const length = Number(response.headers.get("content-length"));
    if (
      !response.ok ||
      !finalUrl ||
      !contentType ||
      (Number.isFinite(length) && length > maximumImageBytes)
    ) {
      return new NextResponse(null, { status: 404 });
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumImageBytes)
      return new NextResponse(null, { status: 413 });
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
