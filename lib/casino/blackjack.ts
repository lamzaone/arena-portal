import { assertCasinoStake, casinoRandom, casinoReturn } from './types.ts';
import type { RandomInt, Card, CardRank, CardSuit, BlackjackAction, BlackjackHand, BlackjackState, BlackjackPublicState } from './types.ts';

const RANKS: CardRank[] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS: CardSuit[] = ['clubs','diamonds','hearts','spades'];
function score(cards: Card[]): {total:number;soft:boolean} {
  let total=0,aces=0;
  for(const card of cards) {
    if(card.rank==='A') {total+=11;aces++;}
    else total += ['J','Q','K'].includes(card.rank) ? 10 : Number(card.rank);
  }
  while(total>21 && aces>0) {total-=10;aces--;}
  return {total,soft:aces>0};
}
function natural(cards: Card[]): boolean {return cards.length===2 && score(cards).total===21;}
function draw(state: BlackjackState): Card {
  const card=state.shoe.shift();
  if(!card) throw new Error('Blackjack shoe exhausted.');
  return card;
}
function hand(cards: Card[], stakeTokens: number, split=false): BlackjackHand {
  return {cards,stakeTokens,status:'playing',natural:!split && natural(cards),split,doubled:false};
}
function actions(state: BlackjackState): BlackjackAction[] {
  if(state.status==='settled') return [];
  const active=state.hands[state.currentHand];
  if(!active || active.status!=='playing') return [];
  const available:BlackjackAction[]=['hit','stand'];
  if(active.cards.length===2 && !active.doubled) {
    available.push('double');
    if(state.hands.length<4 && active.cards[0].rank===active.cards[1].rank && !(active.split && active.cards[0].rank==='A')) available.push('split');
  }
  return available;
}
function payout(state: BlackjackState): number {
  const dealer=score(state.dealer).total;
  const dealerNatural=natural(state.dealer);
  let result=0;
  for(const h of state.hands) {
    const value=score(h.cards).total;
    const amount=value>21 ? 0
      : h.natural ? casinoReturn(h.stakeTokens,dealerNatural ? 1 : 5,dealerNatural ? 1 : 2)
      : dealerNatural ? 0
      : dealer>21 || value>dealer ? casinoReturn(h.stakeTokens,2)
      : value===dealer ? h.stakeTokens : 0;
    result+=amount;
    if(!Number.isSafeInteger(result)) throw new Error('Payout exceeds the safe integer limit.');
  }
  return result;
}
function settle(state: BlackjackState, initial=false): void {
  if(!initial && state.hands.some(h=>score(h.cards).total<=21)) {
    while(score(state.dealer).total<17) state.dealer.push(draw(state));
  }
  for(const h of state.hands) if(h.status==='playing') h.status=score(h.cards).total>21 ? 'bust' : 'stood';
  state.status='settled';
  state.payoutTokens=payout(state);
}
function advance(state: BlackjackState): void {
  while(state.currentHand<state.hands.length && state.hands[state.currentHand].status!=='playing') state.currentHand++;
  if(state.currentHand>=state.hands.length) settle(state);
}
export function startBlackjack(stake: number, randomInt: RandomInt): BlackjackState {
  assertCasinoStake(stake);
  if(stake%2!==0) throw new Error('Blackjack stakes must be even.');
  const shoe:Card[]=[];
  for(let deck=0;deck<6;deck++) for(const suit of SUITS) for(const rank of RANKS) shoe.push({rank,suit});
  for(let index=shoe.length-1;index>0;index--) {
    const swap=casinoRandom(randomInt,index+1);
    [shoe[index],shoe[swap]]=[shoe[swap],shoe[index]];
  }
  const state:BlackjackState={status:'active',hands:[],currentHand:0,dealer:[],shoe,totalStakeTokens:stake,payoutTokens:null};
  const first=draw(state); state.dealer.push(draw(state));
  state.hands.push(hand([first,draw(state)],stake)); state.dealer.push(draw(state));
  // Dealer peeks at the hole card before any player action. Naturals settle without dealer draws.
  if(natural(state.dealer) || state.hands[0].natural) settle(state,true);
  return state;
}
export function actBlackjack(input: BlackjackState, action: BlackjackAction): {state:BlackjackState;additionalStake:number} {
  if(!actions(input).includes(action)) throw new Error('Blackjack action is unavailable.');
  const state:BlackjackState={...input,shoe:input.shoe.map(c=>({...c})),dealer:input.dealer.map(c=>({...c})),hands:input.hands.map(h=>({...h,cards:h.cards.map(c=>({...c}))}))};
  const active=state.hands[state.currentHand];
  let additionalStake=0;
  if(action==='hit') {
    active.cards.push(draw(state));
    const total=score(active.cards).total;
    if(total>=21) active.status=total>21 ? 'bust' : 'stood';
  } else if(action==='stand') active.status='stood';
  else if(action==='double') {
    additionalStake=active.stakeTokens;
    active.stakeTokens=casinoReturn(active.stakeTokens,2);
    active.doubled=true;
    active.cards.push(draw(state));
    active.status=score(active.cards).total>21 ? 'bust' : 'stood';
  } else {
    additionalStake=active.stakeTokens;
    const first=hand([active.cards[0],draw(state)],active.stakeTokens,true);
    const second=hand([active.cards[1],draw(state)],active.stakeTokens,true);
    for(const h of [first,second]) if(active.cards[0].rank==='A' || score(h.cards).total===21) h.status='stood';
    state.hands.splice(state.currentHand,1,first,second);
  }
  state.totalStakeTokens+=additionalStake;
  if(!Number.isSafeInteger(state.totalStakeTokens)) throw new Error('Stake exceeds the safe integer limit.');
  advance(state);
  return {state,additionalStake};
}
export function publicBlackjack(state: BlackjackState): BlackjackPublicState {
  const revealed=state.status==='settled';
  const visible= revealed ? state.dealer : state.dealer.slice(0,1);
  return {
    status:state.status,currentHand:state.currentHand,totalStakeTokens:state.totalStakeTokens,payoutTokens:revealed ? state.payoutTokens : null,
    hands:state.hands.map(h=>({...h,cards:h.cards.map(c=>({...c})),...score(h.cards)})),
    dealer:{cards:revealed ? visible.map(c=>({...c})) : [...visible.map(c=>({...c})),null],...score(visible)},
    availableActions:actions(state),
  };
}
export function blackjackPayout(state: BlackjackState): number {
  if(state.status!=='settled') throw new Error('Blackjack round is still active.');
  return payout(state);
}
