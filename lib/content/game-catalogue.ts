import "server-only";

export type ArenaMode = {
  id: string;
  name: string;
  teamSize: number;
  loadout: string;
  armor: boolean;
  enabledByDefault: boolean;
};

export type DuelType = {
  name: string;
  detail: string;
};

// Snapshot of the current K4-Arenas rounds. This includes all supported
// rounds and marks only the ones enabled by default in the shipped config.
const arenaModes: ArenaMode[] = [
  { id: "rifle", name: "Rifle", teamSize: 1, loadout: "Your Rifle primary preference + your secondary preference", armor: true, enabledByDefault: true },
  { id: "pistol", name: "Pistol", teamSize: 1, loadout: "Your secondary preference", armor: true, enabledByDefault: false },
  { id: "scout", name: "Scout", teamSize: 1, loadout: "Scout", armor: true, enabledByDefault: true },
  { id: "sniper", name: "Sniper", teamSize: 1, loadout: "AWP", armor: true, enabledByDefault: false },
  { id: "shotgun", name: "Shotgun", teamSize: 1, loadout: "Your Shotgun primary preference + your secondary preference", armor: true, enabledByDefault: false },
  { id: "smg", name: "SMG", teamSize: 1, loadout: "Your SMG primary preference + your secondary preference", armor: true, enabledByDefault: false },
  { id: "lmg", name: "LMG", teamSize: 1, loadout: "Your LMG primary preference + your secondary preference", armor: true, enabledByDefault: false },
  { id: "awp", name: "AWP", teamSize: 1, loadout: "AWP", armor: true, enabledByDefault: true },
  { id: "deagle", name: "Deagle", teamSize: 1, loadout: "Deagle", armor: false, enabledByDefault: true },
  { id: "knife", name: "Knife", teamSize: 1, loadout: "Knife only", armor: false, enabledByDefault: false },
  { id: "hegrenade", name: "HE Grenade", teamSize: 1, loadout: "HE grenade", armor: false, enabledByDefault: false },
  { id: "decoy", name: "Decoy", teamSize: 1, loadout: "Decoy", armor: false, enabledByDefault: false },
  { id: "2vs2", name: "2vs2", teamSize: 2, loadout: "Your primary preference + your secondary preference", armor: true, enabledByDefault: false },
  { id: "3vs3", name: "3vs3", teamSize: 3, loadout: "Your primary preference + your secondary preference", armor: true, enabledByDefault: false }
];

export async function getArenaModes() {
  return arenaModes;
}

export const duelTypes: DuelType[] = [
  { name: "Normal", detail: "Uses the players' shared enabled arena-round preference." },
  { name: "Rifle", detail: "Rifle round" }, { name: "Deagle", detail: "Deagle round" }, { name: "AWP", detail: "AWP round" },
  { name: "Scout", detail: "Scout round" }, { name: "HE Grenade", detail: "HE grenade round" }, { name: "Decoy", detail: "Decoy round" }, { name: "Knife", detail: "Knife round" }
];

export const duelLengths = ["First to 1", "First to 10", "First to 20", "Endless"];
export const duelFlow = ["Challenge with /duel", "Opponent accepts or declines", "Score is tracked across rounds", "Either player can stop with /duelstop"];
