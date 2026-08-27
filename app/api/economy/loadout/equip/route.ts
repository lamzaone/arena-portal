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
  const itemId = textField(context.body.itemId, 128);
  // Accept the old single-slot body too, so existing portal pages keep
  // working while the Inventory can select T and CT together.
  const slots = slotsField(context.body.slots ?? context.body.slot);
  if (!itemId || !slots) return economyJsonError("Choose a valid owned item and one or both loadout teams.", 400);

  try {
    const result = await equipEconomyItem({ steamId: context.session.steamId, itemId, slots, idempotencyKey: context.body.idempotencyKey });
    const scope = result.slots[0]?.team === null
      ? "the global loadout"
      : result.slots.length === 2
        ? "both selected teams"
        : "the selected team";
    return economyJsonSuccess({ ...result, message: `Loadout change saved for ${scope}. The server bridge will apply the owned item.` });
  } catch (error) {
    return economyMutationFailure(error);
  }
}
