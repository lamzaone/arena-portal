import { redirect } from "next/navigation";

export const metadata = {
  title: "Communications | Staff | TAPPED.RO",
  robots: { index: false, follow: false },
};

// Retain old bookmarks while keeping all records behind staff authorization.
export default async function CommunicationsPage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (typeof params.q === "string") query.set("q", params.q.trim().slice(0, 64));
  if (typeof params.page === "string" && /^\d{1,6}$/.test(params.page)) query.set("page", params.page);
  redirect(`/admin/communications${query.size ? `?${query}` : ""}`);
}
