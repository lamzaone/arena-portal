import { getServerStatus } from "@/lib/server-status";

export async function GET() {
  return Response.json(await getServerStatus(), {
    headers: { "Cache-Control": "no-store" }
  });
}
