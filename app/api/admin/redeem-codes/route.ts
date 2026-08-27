import { getAdminAccess } from "@/lib/admin/access";
import { getSession, verifyAdminActionToken } from "@/lib/auth/session";
import {
  createEconomyRedeemCode,
  setEconomyRedeemCodeEnabled,
} from "@/lib/data/portal-repository";
import { economyMutationFailure } from "@/lib/economy/request";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function positiveInteger(value: unknown, maximum: number) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum
    ? parsed
    : null;
}

function optionalInteger(value: unknown, maximum: number) {
  if (value === null || value === undefined || value === "") return null;
  return positiveInteger(value, maximum);
}

function stringField(value: unknown, maximum: number) {
  return typeof value === "string" && value.trim() && value.trim().length <= maximum
    ? value.trim()
    : null;
}

function idempotencyKey(value: unknown) {
  const key = stringField(value, 128);
  return key && /^[A-Za-z0-9][A-Za-z0-9._:/-]{15,127}$/.test(key)
    ? key
    : null;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session)
    return Response.json(
      { ok: false, message: "Sign in before managing redeem codes." },
      { status: 401 },
    );
  let body: Record<string, unknown> | null = null;
  try {
    body = record(await request.json());
  } catch {
    // Handled below with the same safe response as a malformed object.
  }
  if (!body)
    return Response.json(
      { ok: false, message: "The redeem-code request was invalid." },
      { status: 400 },
    );
  if (!verifyAdminActionToken(session, String(body.csrf ?? "")))
    return Response.json(
      { ok: false, message: "Your staff verification expired. Reload and try again." },
      { status: 403 },
    );
  const access = await getAdminAccess(session.steamId);
  if (!access.canManageEconomy)
    return Response.json(
      { ok: false, message: "Your staff role cannot manage redeem codes." },
      { status: 403 },
    );
  const action = stringField(body.action, 32);
  const key = idempotencyKey(body.idempotencyKey);
  if (!action || !key)
    return Response.json(
      { ok: false, message: "The request is missing a valid action key." },
      { status: 400 },
    );

  try {
    if (action === "create") {
      const code = stringField(body.code, 64);
      const displayName = stringField(body.displayName, 120);
      const tokenAmount =
        typeof body.tokenAmount === "number" &&
        Number.isSafeInteger(body.tokenAmount) &&
        body.tokenAmount >= 0 &&
        body.tokenAmount <= Number.MAX_SAFE_INTEGER
          ? body.tokenAmount
          : null;
      const maxRedemptions = optionalInteger(body.maxRedemptions, 2_147_483_647);
      if (
        !code ||
        !displayName ||
        tokenAmount === null ||
        (body.maxRedemptions !== null &&
          body.maxRedemptions !== undefined &&
          body.maxRedemptions !== "" &&
          maxRedemptions === null)
      ) {
        return Response.json(
          { ok: false, message: "Review the code name, Token amount, and usage limit." },
          { status: 400 },
        );
      }
      if (!Array.isArray(body.rewards) || body.rewards.length > 20)
        return Response.json(
          { ok: false, message: "Choose up to 20 item rewards." },
          { status: 400 },
        );
      const rewards = body.rewards.map((entry) => {
        const item = record(entry);
        return {
          catalogueId: positiveInteger(item?.catalogueId, Number.MAX_SAFE_INTEGER),
          quantity: positiveInteger(item?.quantity, 50),
        };
      });
      if (rewards.some((reward) => !reward.catalogueId || !reward.quantity))
        return Response.json(
          { ok: false, message: "Each item reward needs a catalogue item and quantity." },
          { status: 400 },
        );
      const result = await createEconomyRedeemCode({
        actorSteamId: session.steamId,
        code,
        displayName,
        tokenAmount,
        maxRedemptions,
        rewards: rewards as Array<{ catalogueId: number; quantity: number }>,
        idempotencyKey: key,
      });
      return Response.json({ ok: true, result });
    }
    if (action === "set-enabled") {
      const codeId = positiveInteger(body.codeId, Number.MAX_SAFE_INTEGER);
      if (!codeId || typeof body.enabled !== "boolean")
        return Response.json(
          { ok: false, message: "Choose a valid code and status." },
          { status: 400 },
        );
      const result = await setEconomyRedeemCodeEnabled({
        actorSteamId: session.steamId,
        codeId,
        enabled: body.enabled,
        idempotencyKey: key,
      });
      return Response.json({ ok: true, result });
    }
    return Response.json(
      { ok: false, message: "Unknown redeem-code action." },
      { status: 400 },
    );
  } catch (error) {
    return economyMutationFailure(error);
  }
}
