import { clearEconomyLoadoutSlot, type EconomyLoadoutSlotInput } from "@/lib/data/portal-repository";
import { economyJsonError, economyJsonSuccess, economyMutationFailure, integerField, isEconomyError, readEconomyMutation } from "@/lib/economy/request";

function slotField(value: unknown): EconomyLoadoutSlotInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const slotType = record.slotType;
  const team = record.team === "T" || record.team === "CT" ? record.team : null;
  if (slotType === "music_kit") return { slotType };
  if ((slotType === "knife" || slotType === "glove" || slotType === "agent") && team) return { slotType, team };
  if (slotType === "weapon" && team) {
    const definitionIndex = integerField(record.definitionIndex, 1, 65_535);
    return definitionIndex === null ? null : { slotType, team, definitionIndex };
  }
  return null;
}

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;
  const slot = slotField(context.body.slot);
  if (!slot) return economyJsonError("Choose a valid loadout slot to clear.", 400);

  try {
    const result = await clearEconomyLoadoutSlot({ steamId: context.session.steamId, slot, idempotencyKey: context.body.idempotencyKey });
    return economyJsonSuccess({ ...result, message: "Loadout slot cleared. The server will refresh your active cosmetics." });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
