import { equipEconomyItem, type EconomyLoadoutSlotInput } from "@/lib/data/portal-repository";
import { economyJsonError, economyJsonSuccess, economyMutationFailure, integerField, isEconomyError, readEconomyMutation, textField } from "@/lib/economy/request";

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
  const itemId = textField(context.body.itemId, 128);
  const slot = slotField(context.body.slot);
  if (!itemId || !slot) return economyJsonError("Choose a valid owned item and loadout slot.", 400);

  try {
    const result = await equipEconomyItem({ steamId: context.session.steamId, itemId, slot, idempotencyKey: context.body.idempotencyKey });
    return economyJsonSuccess({ ...result, message: "Loadout change saved. The server bridge will apply the owned item." });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
