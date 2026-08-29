import { redirect } from "next/navigation";

import { SignInRequired } from "@/components/sign-in-required";
import { getSession } from "@/lib/auth/session";

type DashboardPageProps = {
  searchParams: Promise<{ settings?: string | string[] }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await getSession();
  if (!session) return <SignInRequired title="Your player profile" description="Sign in with Steam to view your ARENA profile and share its player URL." />;
  const query = await searchParams;
  redirect(`/players/${session.steamId}${query.settings === "1" ? "?settings=1" : ""}`);
}
