import { NextResponse } from "next/server";

import { getSession, verifyLoadoutActionToken } from "@/lib/auth/session";
import { enqueuePortalBridgeEvent, getLoadoutCatalogue, type PortalBridgeEvent } from "@/lib/data/portal-repository";

type LoadoutRequest = {
  csrf?: unknown;
  action?: unknown;
  category?: unknown;
  team?: unknown;
  teams?: unknown;
  definitionIndex?: unknown;
  paintkit?: unknown;
  seed?: unknown;
  wear?: unknown;
  agentIndex?: unknown;
  agentIndexes?: unknown;
  musicKitIndex?: unknown;
  nametag?: unknown;
  stattrak?: unknown;
  keychain?: unknown;
  stickers?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null;
}

function team(value: unknown) {
  return value === "T" || value === "CT" ? value : null;
}

function selectedTeams(body: LoadoutRequest): Array<"T" | "CT"> | null {
  if (Array.isArray(body.teams)) {
    const teams = [...new Set(body.teams.map(team).filter((value): value is "T" | "CT" => Boolean(value)))];
    return teams.length ? teams : null;
  }
  const selectedTeam = team(body.team);
  return selectedTeam ? [selectedTeam] : null;
}

function agentIndexes(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return { T: integer(candidate.T, 1), CT: integer(candidate.CT, 1) };
}

function wear(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function has(body: LoadoutRequest, property: keyof LoadoutRequest) {
  return Object.prototype.hasOwnProperty.call(body, property);
}

function advancedSkinPayload(body: LoadoutRequest, category: "weapon" | "knife" | "glove", catalogue: NonNullable<Awaited<ReturnType<typeof getLoadoutCatalogue>>>) {
  const payload: Record<string, unknown> = {};
  const hasNameTag = has(body, "nametag");
  const hasStatTrak = has(body, "stattrak");
  const hasKeychain = has(body, "keychain");
  const hasStickers = has(body, "stickers");

  if (category === "glove" && (hasNameTag || hasStatTrak || hasKeychain || hasStickers)) {
    return { error: "Gloves do not support these advanced item details." as const };
  }
  if (category === "knife" && (hasKeychain || hasStickers)) {
    return { error: "WeaponSkins supports charms and stickers on weapons, not knives." as const };
  }

  if (hasNameTag) {
    if (body.nametag !== null && (typeof body.nametag !== "string" || body.nametag.trim().length > 128)) {
      return { error: "A name tag must be at most 128 characters." as const };
    }
    payload.nametag = typeof body.nametag === "string" ? body.nametag.trim() || null : null;
  }
  if (hasStatTrak) {
    if (typeof body.stattrak !== "boolean") return { error: "StatTrak must be enabled or disabled." as const };
    payload.stattrak = body.stattrak;
  }
  if (category === "weapon" && hasKeychain) {
    const keychain = body.keychain === null ? null : integer(body.keychain, 1);
    if (keychain === null && body.keychain !== null) return { error: "Choose a charm from the server catalogue." as const };
    if (keychain !== null && !catalogue.keychains.some((candidate) => candidate.keychain === keychain)) {
      return { error: "Choose a charm from the server catalogue." as const };
    }
    payload.keychain = keychain;
  }
  if (category === "weapon" && hasStickers) {
    if (!Array.isArray(body.stickers) || body.stickers.length !== 6) return { error: "Provide all six sticker slots." as const };
    const stickers: Array<number | null> = [];
    for (const candidate of body.stickers) {
      const sticker = candidate === null ? null : integer(candidate, 1);
      if (sticker === null && candidate !== null) return { error: "Choose stickers from the server catalogue." as const };
      if (sticker !== null && !catalogue.stickers.some((knownSticker) => knownSticker.sticker === sticker)) {
        return { error: "Choose stickers from the server catalogue." as const };
      }
      stickers.push(sticker);
    }
    payload.stickers = stickers;
  }

  return { payload };
}

export async function POST(request: Request) {
  // Keep this endpoint as a rollback-only backup.  The replacement economy
  // validates owned item instances rather than accepting a raw paintkit.
  if (process.env.LEGACY_WEAPONSKINS_ENABLED !== "true") {
    return jsonError("The legacy WeaponSkins loadout is disabled. Use the Token Inventory instead.", 410);
  }
  const session = await getSession();
  if (!session) return jsonError("Sign in with Steam before changing your loadout.", 401);

  let body: LoadoutRequest;
  try {
    body = await request.json() as LoadoutRequest;
  } catch {
    return jsonError("The loadout request was invalid.", 400);
  }

  if (!verifyLoadoutActionToken(session, typeof body.csrf === "string" ? body.csrf : "")) {
    return jsonError("Your session verification has expired. Reload the page and try again.", 403);
  }

  const action = body.action;
  const category = body.category;
  if ((action !== "set" && action !== "reset") || !["weapon", "knife", "glove", "agent", "music-kit"].includes(String(category))) {
    return jsonError("That loadout action is not supported.", 400);
  }

  const catalogue = await getLoadoutCatalogue();
  if (!catalogue) return jsonError("The live WeaponSkins catalogue has not reached the portal yet. Reload after the server bridge syncs it.", 503);

  const actions: Array<{ eventType: PortalBridgeEvent; payload: object }> = [];

  if (category === "music-kit") {
    if (action === "reset") {
      actions.push({ eventType: "loadout.music-kit.reset", payload: {} });
    } else {
      const musicKitIndex = integer(body.musicKitIndex, 1);
      if (musicKitIndex === null || !catalogue.musicKits.some((musicKit) => musicKit.musicKitIndex === musicKitIndex)) {
        return jsonError("Choose a music kit from the server catalogue.", 400);
      }
      actions.push({ eventType: "loadout.music-kit.set", payload: { musicKitIndex } });
    }
  } else if (category === "agent") {
    const teams = selectedTeams(body);
    if (!teams) return jsonError("Choose a loadout side for this item.", 400);
    if (action === "reset") {
      actions.push(...teams.map((selectedTeam) => ({ eventType: "loadout.agent.reset" as const, payload: { team: selectedTeam } })));
    } else {
      const selectedIndexes = agentIndexes(body.agentIndexes);
      for (const selectedTeam of teams) {
        const agentIndex = selectedIndexes?.[selectedTeam] ?? integer(body.agentIndex, 1);
        if (agentIndex === null || !catalogue.agents.some((agent) => agent.agentIndex === agentIndex && agent.team === selectedTeam)) {
          return jsonError("Choose an agent that belongs to every selected team.", 400);
        }
        actions.push({ eventType: "loadout.agent.set", payload: { team: selectedTeam, agentIndex } });
      }
    }
  } else {
    const teams = selectedTeams(body);
    const definitionIndex = integer(body.definitionIndex, 1, 65_535);
    const item = definitionIndex === null ? undefined : catalogue.items.find((candidate) => candidate.definitionIndex === definitionIndex && candidate.category === category);
    if (!teams || !item) return jsonError("Choose an item from the server catalogue.", 400);

    if (action === "reset") {
      const eventType: PortalBridgeEvent = category === "weapon" ? "loadout.weapon.reset" : category === "knife" ? "loadout.knife.reset" : "loadout.glove.reset";
      actions.push(...teams.map((selectedTeam) => ({ eventType, payload: category === "weapon" ? { team: selectedTeam, definitionIndex } : { team: selectedTeam } })));
    } else {
      const paintkit = integer(body.paintkit, 0);
      const seed = integer(body.seed, 0, 1_000);
      const selectedWear = wear(body.wear);
      if (paintkit === null || !item.paintkits.some((candidate) => candidate.paintkit === paintkit) || seed === null || selectedWear === null) {
        return jsonError("Choose a valid finish, seed, and wear value.", 400);
      }
      const advanced = advancedSkinPayload(body, category as "weapon" | "knife" | "glove", catalogue);
      if ("error" in advanced) return jsonError(advanced.error ?? "The advanced item details were invalid.", 400);
      const eventType: PortalBridgeEvent = category === "weapon" ? "loadout.weapon.set" : category === "knife" ? "loadout.knife.set" : "loadout.glove.set";
      actions.push(...teams.map((selectedTeam) => ({ eventType, payload: { team: selectedTeam, definitionIndex, paintkit, seed, wear: selectedWear, ...advanced.payload } })));
    }
  }

  try {
    const jobIds = await Promise.all(actions.map((queuedAction) => enqueuePortalBridgeEvent(queuedAction.eventType, session.steamId, queuedAction.payload)));
    return NextResponse.json({ ok: true, jobId: jobIds[0], jobIds, message: `${jobIds.length} loadout change${jobIds.length === 1 ? "" : "s"} queued. The server bridge will validate and apply them.` });
  } catch {
    return jsonError("The portal could not queue that change. Check the portal bridge database configuration.", 503);
  }
}
