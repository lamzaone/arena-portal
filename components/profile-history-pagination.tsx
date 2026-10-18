import { LinkPagination } from "@/components/ui/link-pagination";

export type ProfileHistoryPages = { warnings: number; bans: number; comms: number };

export function ProfileHistoryPagination({ steamId, kind, pages, page, pageSize, total }: { steamId: string; kind: keyof ProfileHistoryPages; pages: ProfileHistoryPages; page: number; pageSize: number; total: number }) {
  if (total <= pageSize) return null;
  const anchor = kind === "warnings" ? "warning-history-title" : kind === "bans" ? "moderation-bans-title" : "moderation-comms-title";
  return <LinkPagination page={page} totalPages={Math.ceil(total / pageSize)} label={`${kind === "comms" ? "Gags and mutes" : kind === "bans" ? "Ban" : "Warning"} history pages`} prefetch={false} hrefForPage={(nextPage) => {
    const query = new URLSearchParams();
    for (const key of ["warnings", "bans", "comms"] as const) query.set(`${key}Page`, String(key === kind ? nextPage : pages[key]));
    return `/players/${steamId}?${query.toString()}#${anchor}`;
  }} />;
}
