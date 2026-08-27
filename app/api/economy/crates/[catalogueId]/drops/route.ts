import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getEconomyCrateDropPreview } from "@/lib/data/portal-repository";

type RouteContext = { params: Promise<{ catalogueId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session)
    return NextResponse.json(
      { message: "Sign in with Steam before viewing crate odds." },
      { status: 401 },
    );

  const { catalogueId: rawCatalogueId } = await params;
  if (!/^\d+$/.test(rawCatalogueId))
    return NextResponse.json({ message: "Invalid crate." }, { status: 400 });
  const catalogueId = Number(rawCatalogueId);
  if (!Number.isSafeInteger(catalogueId) || catalogueId < 1)
    return NextResponse.json({ message: "Invalid crate." }, { status: 400 });

  try {
    const preview = await getEconomyCrateDropPreview(catalogueId);
    if (!preview)
      return NextResponse.json(
        { message: "No enabled drops are available for this crate." },
        { status: 404 },
      );
    return NextResponse.json(preview, {
      // Catalogue syncs can replace a generated case table immediately. Never
      // leave an old generic pool in the browser for five minutes after that.
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { message: "Crate odds are temporarily unavailable." },
      { status: 503 },
    );
  }
}
