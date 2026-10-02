import { getSession } from '@/lib/auth/session';
import { getCasinoBootstrap } from '@/lib/data/casino-repository';
import { casinoFailure, casinoJson } from '@/lib/casino/http';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return casinoJson({ok:false,message:'Sign in with Steam to use the casino.'},401);
    return casinoJson({ok:true,...await getCasinoBootstrap(session.steamId)});
  } catch (error) { return casinoFailure(error); }
}
