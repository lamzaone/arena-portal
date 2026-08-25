import "server-only";

export type LevelRank = {
  name: string;
  tag: string;
  hex: string;
  points: number;
};

// Current K4 LevelRanks rank ladder from ranks.json. The rank is derived from
// points, which remains reliable even when the database's leaderboard index is
// recalculated asynchronously.
const ranks: LevelRank[] = [
  { name: "Silver I", tag: "S1", hex: "#808080", points: 0 },
  { name: "Silver II", tag: "S2", hex: "#808080", points: 100 },
  { name: "Silver III", tag: "S3", hex: "#808080", points: 200 },
  { name: "Silver IV", tag: "S4", hex: "#808080", points: 350 },
  { name: "Silver Elite", tag: "SE", hex: "#808080", points: 500 },
  { name: "Silver Elite Master", tag: "SEM", hex: "#808080", points: 750 },
  { name: "Gold Nova I", tag: "GN1", hex: "#FFD700", points: 1000 },
  { name: "Gold Nova II", tag: "GN2", hex: "#FFD700", points: 1250 },
  { name: "Gold Nova III", tag: "GN3", hex: "#FFD700", points: 1500 },
  { name: "Gold Nova Master", tag: "GNM", hex: "#FFD700", points: 1750 },
  { name: "Master Guardian I", tag: "MG1", hex: "#87CEEB", points: 2000 },
  { name: "Master Guardian II", tag: "MG2", hex: "#87CEEB", points: 2500 },
  { name: "Master Guardian Elite", tag: "MGE", hex: "#87CEEB", points: 3000 },
  { name: "Distinguished Master Guardian", tag: "DMG", hex: "#0000FF", points: 3500 },
  { name: "Legendary Eagle", tag: "LE", hex: "#800080", points: 4000 },
  { name: "Legendary Eagle Master", tag: "LEM", hex: "#800080", points: 5000 },
  { name: "Supreme Master First Class", tag: "SMFC", hex: "#FF6B6B", points: 6000 },
  { name: "Global Elite", tag: "GE", hex: "#FF0000", points: 7500 }
];

export function getLevelRank(points: number) {
  return ranks.reduce<LevelRank>((current, candidate) => points >= candidate.points ? candidate : current, ranks[0]);
}

export function getNextLevelRank(points: number) {
  const current = getLevelRank(points);
  return ranks.find((rank) => rank.points > current.points) ?? null;
}

export function getRankProgress(points: number) {
  const current = getLevelRank(points);
  const next = getNextLevelRank(points);
  if (!next) return 100;
  return Math.max(0, Math.min(100, ((points - current.points) / (next.points - current.points)) * 100));
}
