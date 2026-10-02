import { playCasinoInstant } from '@/lib/data/casino-repository';
import { casinoInput, casinoPost } from '@/lib/casino/http';
import { integerField } from '@/lib/economy/request';

export async function POST(request: Request) {
  return casinoPost(request,async ({session,body}) => {
    const stake = integerField(body.stake,2);
    if (stake === null || !['roulette','plinko','slots'].includes(String(body.game))) casinoInput('Choose a game and a valid whole Token stake.');
    return playCasinoInstant({steamId:session.steamId,game:body.game as 'roulette'|'plinko'|'slots',stake,selection:body.selection,idempotencyKey:body.idempotencyKey});
  });
}
