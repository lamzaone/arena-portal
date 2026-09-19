export type DraftReward = { catalogueId: number; quantity: string };

export function validateRewardQuantities(drafts: DraftReward[]): {
  rewards: { catalogueId: number; quantity: number }[];
  error: string | null;
} {
  const rewards = drafts.map((draft) => ({ ...draft, quantity: Number(draft.quantity) }));
  if (drafts.some((draft, index) => !/^\d+$/.test(draft.quantity) ||
    !Number.isSafeInteger(rewards[index].quantity) || rewards[index].quantity < 1 || rewards[index].quantity > 50))
    return { rewards: [], error: "Enter a whole quantity from 1 to 50 for each item." };
  if (rewards.reduce((total, reward) => total + reward.quantity, 0) > 100)
    return { rewards: [], error: "A code can award up to 100 items in total." };
  return { rewards, error: null };
}
