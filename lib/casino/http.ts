import 'server-only';
import { NextResponse } from 'next/server';
import { economyMutationFailure, isEconomyError, readEconomyMutation, type EconomyMutationContext } from '@/lib/economy/request';
import { CasinoError } from './settings.ts';

export function casinoNoStore(response: NextResponse) { response.headers.set('Cache-Control','private, no-store'); return response; }
export function casinoJson(result: unknown, status = 200) { return NextResponse.json(result,{status,headers:{'Cache-Control':'private, no-store'}}); }
export function casinoFailure(error: unknown) {
  const code = (error as {code?:string})?.code;
  if (['casino_disabled','casino_unavailable','slots_unavailable'].includes(code ?? '')) return casinoJson({ok:false,message:error instanceof Error ? error.message : 'Casino is currently unavailable.'},503);
  if (['round_active','round_unavailable','bet_exists'].includes(code ?? '')) return casinoJson({ok:false,message:error instanceof Error ? error.message : 'This casino round is unavailable.'},409);
  return casinoNoStore(economyMutationFailure(error));
}
export function casinoInput(message: string): never { throw new CasinoError('invalid_input',message); }
export async function casinoPost(request: Request, work: (context: EconomyMutationContext) => Promise<unknown>) {
  try {
    const context = await readEconomyMutation(request);
    if (isEconomyError(context)) return casinoNoStore(context);
    const result = await work(context);
    return casinoJson({ok:true,...result as Record<string,unknown>});
  } catch (error) { return casinoFailure(error); }
}
