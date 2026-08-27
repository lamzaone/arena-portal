import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { refreshAllEconomyPublicPrices } from "@/lib/economy/price-refresh";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: Request) {
  const secret = process.env.ECONOMY_PRICE_REFRESH_SECRET?.trim();
  if (!secret) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request))
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    const result = await refreshAllEconomyPublicPrices();
    return NextResponse.json(result, {
      status: result.status === "busy" ? 202 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "The public price refresh failed." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
