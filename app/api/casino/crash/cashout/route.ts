import { cashoutCasinoCrash } from '@/lib/data/casino-repository';
import { casinoInput, casinoPost } from '@/lib/casino/http';
import { textField } from '@/lib/economy/request';

export async function POST(request: Request) {
  return casinoPost(request,async ({session,body}) => {
    const roundId = textField(body.roundId,36);
    if (!roundId) casinoInput('Choose a valid Crash round.');
    return cashoutCasinoCrash({steamId:session.steamId,roundId,idempotencyKey:body.idempotencyKey});
  });
}
