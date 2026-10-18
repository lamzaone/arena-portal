export const commendationKinds = ["helpful", "teacher", "funny", "pro_player", "goat"] as const;
export type CommendationKind = (typeof commendationKinds)[number];
export const commendationLabels: Record<CommendationKind, string> = {
  helpful: "Helpful", teacher: "Teacher", funny: "Funny", pro_player: "Pro player", goat: "GOAT",
};
export type ProfileCommunitySummary = {
  available: boolean;
  reputation: number;
  commendationTotal: number;
  commendations: Record<CommendationKind, number>;
};
export type ProfileComment = {
  id: string;
  authorSteamId: string;
  body: string;
  createdAt: number;
  canDelete: boolean;
};
export type ProfileCommunity = ProfileCommunitySummary & {
  commentsEnabled: boolean;
  myReputation: -1 | 0 | 1;
  myCommendations: CommendationKind[];
  comments: { records: ProfileComment[]; page: number; pageSize: number; total: number };
};
export type ProfileCommunityAction =
  | { action: "reputation"; value: -1 | 0 | 1 }
  | { action: "commendations"; kinds: CommendationKind[] }
  | { action: "comment"; body: string; requestId: string }
  | { action: "delete_comment"; commentId: string }
  | { action: "comments_setting"; enabled: boolean };

export function emptyProfileCommunity(): ProfileCommunity {
  return {
    available: false, reputation: 0, commendationTotal: 0,
    commendations: { helpful: 0, teacher: 0, funny: 0, pro_player: 0, goat: 0 },
    commentsEnabled: true, myReputation: 0, myCommendations: [],
    comments: { records: [], page: 1, pageSize: 10, total: 0 },
  };
}
