import { handleHeartbeat } from "@/lib/server-link/ingest";
import { saveHeartbeat } from "@/lib/server-link/repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleHeartbeat(request, {
    secret: process.env.SERVER_LINK_SECRET,
    serverId: process.env.GAME_SERVER_GUID,
    save: saveHeartbeat,
    now: Date.now,
  });
}
