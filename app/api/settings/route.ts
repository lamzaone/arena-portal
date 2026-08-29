import { NextResponse } from "next/server";

import {
  getSession,
  verifyProfileActionToken,
} from "@/lib/auth/session";
import {
  EconomyRepositoryError,
  updatePlayerSettings,
  type PlayerSettings,
} from "@/lib/data/portal-repository";

const privateNoStore = { "Cache-Control": "private, no-store" };

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: privateNoStore });
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function publicSettings(settings: PlayerSettings) {
  return {
    inventoryVisibility: settings.inventoryVisibility,
    activeThemeId: settings.activeThemeId,
    activeTheme: settings.activeTheme,
    ownedThemes: settings.ownedThemes,
  };
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session)
    return json(
      { ok: false, message: "Sign in with Steam before changing settings." },
      401,
    );

  let body: Record<string, unknown> | null;
  try {
    body = record(await request.json());
  } catch {
    body = null;
  }
  if (!body)
    return json({ ok: false, message: "The settings request was invalid." }, 400);
  if (!verifyProfileActionToken(session, typeof body.csrf === "string" ? body.csrf : "")) {
    return json(
      {
        ok: false,
        message: "Your session verification has expired. Reload and try again.",
      },
      403,
    );
  }

  const visibility = body.inventoryVisibility;
  if (visibility !== "private" && visibility !== "public") {
    return json(
      { ok: false, message: "Choose a valid inventory visibility." },
      400,
    );
  }
  const activeThemeId =
    body.activeThemeId === null
      ? null
      : typeof body.activeThemeId === "number" &&
          Number.isSafeInteger(body.activeThemeId) &&
          body.activeThemeId > 0
        ? body.activeThemeId
        : undefined;
  if (activeThemeId === undefined)
    return json({ ok: false, message: "Choose a valid profile theme." }, 400);

  try {
    const settings = await updatePlayerSettings({
      steamId: session.steamId,
      inventoryVisibility: visibility,
      activeThemeId,
    });
    return json({
      ok: true,
      message: "Your profile settings were saved.",
      settings: publicSettings(settings),
    });
  } catch (error) {
    if (error instanceof EconomyRepositoryError) {
      if (error.code === "invalid_input")
        return json({ ok: false, message: error.message }, 400);
      if (error.code === "theme_not_owned")
        return json({ ok: false, message: error.message }, 409);
      if (error.code === "storage_unavailable")
        return json({ ok: false, message: error.message }, 503);
    }
    return json(
      { ok: false, message: "Your settings could not be saved right now." },
      503,
    );
  }
}
