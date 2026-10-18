/** Recruitment guidance only. These baselines never block a valid application. */
export const RECRUITMENT_MINIMUM_AGE = 18;
export const RECRUITMENT_MINIMUM_PLAYTIME_SECONDS = 30 * 60 * 60;

export type RecruitmentRequirementState = "met" | "unmet" | "pending" | "unverified";
export type RecruitmentRequirement = {
  key: "age" | "playtime" | "discord_link" | "steam_group";
  label: string;
  state: RecruitmentRequirementState;
  detail: string;
};
export type RecruitmentRequirementsInput = {
  age: number | string | null;
  playtimeSeconds: number | null;
  discordLinked: boolean;
  steamGroupMember: boolean | null;
};

export function evaluateRecruitmentRequirements(input: RecruitmentRequirementsInput) {
  const ageMissing = input.age === null || typeof input.age === "string" && !input.age.trim();
  const age = Number(input.age);
  const validAge = !ageMissing && Number.isInteger(age) && age >= 1 && age <= 120 && (typeof input.age !== "string" || /^\d+$/.test(input.age.trim()));
  const playtimeVerified = input.playtimeSeconds !== null && Number.isSafeInteger(input.playtimeSeconds) && input.playtimeSeconds >= 0;
  const criteria: RecruitmentRequirement[] = [
    {
      key: "age", label: `Age ${RECRUITMENT_MINIMUM_AGE}+`,
      state: ageMissing ? "pending" : validAge && age >= RECRUITMENT_MINIMUM_AGE ? "met" : "unmet",
      detail: ageMissing ? "Enter your age below." : !validAge ? "Enter a whole age between 1 and 120." : `${age} years old${age < RECRUITMENT_MINIMUM_AGE ? ` · below ${RECRUITMENT_MINIMUM_AGE}` : ""}.`,
    },
    {
      key: "playtime", label: `${RECRUITMENT_MINIMUM_PLAYTIME_SECONDS / 3600}+ server hours`,
      state: !playtimeVerified ? "unverified" : input.playtimeSeconds! >= RECRUITMENT_MINIMUM_PLAYTIME_SECONDS ? "met" : "unmet",
      detail: playtimeVerified ? `${(input.playtimeSeconds! / 3600).toFixed(1)} hours recorded on the server.` : "Server playtime could not be verified.",
    },
    {
      key: "discord_link", label: "Steam + Discord linked",
      state: input.discordLinked ? "met" : "unmet",
      detail: input.discordLinked ? "Verified Steam and Discord account link." : "Steam and Discord are not linked.",
    },
    {
      key: "steam_group", label: "Steam group membership",
      state: input.steamGroupMember === null ? "pending" : input.steamGroupMember ? "met" : "unmet",
      detail: input.steamGroupMember === null ? "Select yes or no below." : input.steamGroupMember ? "Self-reported membership; staff may verify it." : "Not a member of the Steam group (self-reported).",
    },
  ];
  const hasUnmet = criteria.some(criterion => criterion.state === "unmet");
  const hasUnverified = criteria.some(criterion => criterion.state === "unverified");
  return { criteria, hasUnmet, hasUnverified, requiresAttention: hasUnmet || hasUnverified, allMet: criteria.every(criterion => criterion.state === "met") };
}
