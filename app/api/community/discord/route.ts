import { getPublicCommunity } from "@/lib/discord/public-community";

export async function GET() {
  const community = await getPublicCommunity();
  return Response.json(community, {
    headers: {
      "Cache-Control": community.state === "available"
        ? "public, max-age=30, s-maxage=60"
        : "public, max-age=10, s-maxage=15",
    },
  });
}
