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

function slotsField(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  if (values.length < 1 || values.length > 2) return null;
  const slots = values.map(slotField);
  return slots.every((slot): slot is EconomyLoadoutSlotInput => slot !== null)
    ? slots
    : null;
}

export async function POST(request: Request) {
  const context = await readEconomyMutation(request);
  if (isEconomyError(context)) return context;
  const slots = slotsField(context.body.slots ?? context.body.slot);
  if (!slots) return economyJsonError("Choose a valid loadout slot to clear.", 400);

  try {
    const result = await clearEconomyLoadoutSlot({ steamId: context.session.steamId, slots, idempotencyKey: context.body.idempotencyKey });
    const scope = result.slots[0]?.team === null
      ? "Global loadout slot"
      : result.slots.length === 2
        ? "Both selected loadout slots"
        : "Loadout slot";
    return economyJsonSuccess({ ...result, message: `${scope} cleared. The server will refresh your active cosmetics.` });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
