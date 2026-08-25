import "server-only";

export type VipBenefit = {
  name: string;
  detail: string;
};

export type VipTier = {
  name: string;
  weight: number;
  benefits: VipBenefit[];
};

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

// Snapshot of the current VIPCore groups. Keep this alongside the live config
// when server settings change; the deployed website intentionally has no
// filesystem dependency on the game server.
const vipTiers: VipTier[] = [
  { name: "ULTIMATE", weight: 100, benefits: [
    { name: "Anti-flash", detail: "Reduced flash impact" }, { name: "Spawn armor", detail: "100 armor" }, { name: "Bhop", detail: "Max speed 300" },
    { name: "Double jump", detail: "2 jumps, boost 320" }, { name: "Fast reload", detail: "Enabled" }, { name: "Field of view", detail: "Setting 1" },
    { name: "Spawn health", detail: "125 HP" }, { name: "Spawn utilities", detail: "HE grenade, Flashbang, Smoke grenade - including pistol rounds" },
    { name: "Kill screen", detail: "1s duration" }, { name: "Spawn money", detail: "$16000" }, { name: "Rainbow model", detail: "Updates every 1.4s" },
    { name: "Round-end abilities", detail: "2x speed, 0.5x gravity" }, { name: "Smoke color", detail: "RGB(180, 0, 255)" },
    { name: "Movement speed", detail: "1.1x speed" }, { name: "Vampirism", detail: "15% health on damage" }, { name: "Zeus", detail: "Enabled" }
  ] },
  { name: "DIAMOND", weight: 80, benefits: [
    { name: "Anti-flash", detail: "Reduced flash impact" }, { name: "Spawn armor", detail: "100 armor" }, { name: "Bhop", detail: "Max speed 300" },
    { name: "Double jump", detail: "1 jump, boost 315" }, { name: "Fast reload", detail: "Enabled" }, { name: "Spawn health", detail: "120 HP" },
    { name: "Spawn utilities", detail: "HE grenade, Flashbang, Smoke grenade - including pistol rounds" }, { name: "Kill screen", detail: "0.8s duration" },
    { name: "Spawn money", detail: "$14000" }, { name: "Smoke color", detail: "RGB(0, 225, 255)" }, { name: "Movement speed", detail: "1.08x speed" },
    { name: "Vampirism", detail: "10% health on damage" }, { name: "Zeus", detail: "Enabled" }
  ] },
  { name: "GOLD", weight: 60, benefits: [
    { name: "Anti-flash", detail: "Reduced flash impact" }, { name: "Spawn armor", detail: "100 armor" }, { name: "Bhop", detail: "Max speed 290" },
    { name: "Fast reload", detail: "Enabled" }, { name: "Spawn health", detail: "115 HP" }, { name: "Spawn utilities", detail: "HE grenade, Flashbang - including pistol rounds" },
    { name: "Kill screen", detail: "0.6s duration" }, { name: "Spawn money", detail: "$12000" }, { name: "Smoke color", detail: "RGB(255, 215, 0)" },
    { name: "Movement speed", detail: "1.06x speed" }, { name: "Vampirism", detail: "8% health on damage" }, { name: "Zeus", detail: "Enabled" }
  ] },
  { name: "SILVER", weight: 40, benefits: [
    { name: "Spawn armor", detail: "75 armor" }, { name: "Bhop", detail: "Max speed 280" }, { name: "Spawn health", detail: "110 HP" },
    { name: "Spawn utilities", detail: "HE grenade, Flashbang - after pistol rounds" }, { name: "Kill screen", detail: "0.5s duration" },
    { name: "Spawn money", detail: "$10000" }, { name: "Smoke color", detail: "RGB(192, 192, 192)" }, { name: "Movement speed", detail: "1.04x speed" },
    { name: "Vampirism", detail: "5% health on damage" }
  ] },
  { name: "STANDARD", weight: 20, benefits: [
    { name: "Spawn armor", detail: "50 armor" }, { name: "Bhop", detail: "Max speed 270" }, { name: "Spawn health", detail: "105 HP" },
    { name: "Spawn utilities", detail: "Flashbang - after pistol rounds" }, { name: "Spawn money", detail: "$8000" }, { name: "Movement speed", detail: "1.02x speed" }
  ] }
];

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

export async function getVipTiers() {
  return vipTiers;
}

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
