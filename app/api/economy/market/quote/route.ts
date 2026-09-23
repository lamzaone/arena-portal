import { NextResponse } from "next/server";
import { quoteMarketplaceFloatSelection } from "@/lib/economy/market-service";
import { EconomyRepositoryError } from "@/lib/data/portal-repository";

import { getSession } from "@/lib/auth/session";

function catalogueIdFromSearch(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function floatFromSearch(value: string | null) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null;
  return Number(parsed.toFixed(6));
}

function stattrakFromSearch(value: string | null) {
  if (value === null || value === "" || value === "0" || value === "false")
    return false;
  if (value === "1" || value === "true") return true;
  return null;
}

function seedFromSearch(value: string | null) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 1_000
    ? parsed
    : null;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json(
      { ok: false, message: "Sign in with Steam before viewing live prices." },
      { status: 401 },
    );

  const url = new URL(request.url);
  const catalogueId = catalogueIdFromSearch(
    url.searchParams.get("catalogueId"),
  );
  const floatValue = floatFromSearch(url.searchParams.get("float"));
  const seed = seedFromSearch(url.searchParams.get("seed"));
  const stattrak = stattrakFromSearch(url.searchParams.get("stattrak"));
  if (catalogueId === null || floatValue === null) {
    return NextResponse.json(
      {
        ok: false,
        message: "Choose a catalogue item and a float between 0 and 1.",
      },
      { status: 400 },
    );
  }
  if (stattrak === null) {
    return NextResponse.json(
      { ok: false, message: "Choose a valid StatTrak option." },
      { status: 400 },
    );
  }
  if (seed === null) {
    return NextResponse.json(
      { ok: false, message: "Choose a whole-number seed between 0 and 1000." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await quoteMarketplaceFloatSelection({
        catalogueId,
        floatValue,
        seed,
        stattrak,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof EconomyRepositoryError)
      return NextResponse.json(
        { ok: false, message: error.message },
        {
          status:
            error.code === "catalogue_not_found"
              ? 404
              : error.code === "price_unavailable"
                ? 409
                : 400,
        },
      );
    return NextResponse.json(
      {
        ok: false,
        message:
          "The live marketplace price could not be loaded. Try again shortly.",
      },
      { status: 503 },
    );
  }
}
