import { betCasinoCrash } from '@/lib/data/casino-repository';
import { casinoInput, casinoPost } from '@/lib/casino/http';
import { integerField, textField } from '@/lib/economy/request';

export async function POST(request: Request) {
  return casinoPost(request,async ({session,body}) => {
    const roundId = textField(body.roundId,36); const stake = integerField(body.stake,2);
    const autoCashout = body.autoCashout === null || body.autoCashout === undefined ? null : integerField(body.autoCashout,101,9999);
    if (!roundId || stake === null || (body.autoCashout !== null && body.autoCashout !== undefined && autoCashout === null)) casinoInput('Choose a round, valid stake and automatic target between 1.01x and 99.99x.');
    return betCasinoCrash({steamId:session.steamId,roundId,stake,autoCashout,idempotencyKey:body.idempotencyKey});
  });
}
