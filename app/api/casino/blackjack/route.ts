import { actCasinoBlackjack, startCasinoBlackjack } from '@/lib/data/casino-repository';
import { casinoInput, casinoPost } from '@/lib/casino/http';
import { integerField, textField } from '@/lib/economy/request';
import type { BlackjackAction } from '@/lib/casino/types';

export async function POST(request: Request) {
  return casinoPost(request,async ({session,body}) => {
    if (body.action === 'start') {
      const stake = integerField(body.stake,2);
      if (stake === null) casinoInput('Choose a valid even Token stake.');
      return startCasinoBlackjack({steamId:session.steamId,stake,idempotencyKey:body.idempotencyKey});
    }
    const roundId = textField(body.roundId,36);
    if (!roundId || !['hit','stand','double','split'].includes(String(body.action))) casinoInput('Choose a round and an available Blackjack action.');
    return actCasinoBlackjack({steamId:session.steamId,roundId,action:body.action as BlackjackAction,idempotencyKey:body.idempotencyKey});
  });
}
