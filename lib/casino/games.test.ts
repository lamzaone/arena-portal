import assert from 'node:assert/strict';
import test from 'node:test';
import { playRoulette, playRouletteMulti, normalizeRouletteBets, rouletteMaximumReturn } from './roulette.ts';
import { playPlinko, playPlinkoBatch, plinkoBatchExposure, plinkoPaytable } from './plinko.ts';
import { getCasinoSettings } from './settings.ts';
import { startBlackjack, actBlackjack, publicBlackjack, blackjackPayout } from './blackjack.ts';
import { crashPoint, crashMultiplier, crashDuration } from './crash.ts';
import type { BlackjackState, Card, CardRank, RouletteSelection } from './types.ts';

const card = (rank: CardRank): Card => ({ rank, suit: 'spades' });
test('one pocket settles the whole board and normalizes repeated placements', () => {
  let draws = 0;
  const bets = [{selection:{kind:'number' as const,value:0},stakeTokens:4},{selection:{kind:'color' as const,value:'red' as const},stakeTokens:20},{selection:{kind:'number' as const,value:0},stakeTokens:6}];
  const result = playRouletteMulti(30,bets,() => { draws++; return 0; });
  assert.equal(draws,1); assert.equal(result.stakeTokens,30); assert.equal(result.payoutTokens,360);
  assert.equal(result.bets.length,2); assert.equal(result.bets.find(bet=>bet.selection.kind==='number')!.stakeTokens,10);
  assert.deepEqual(normalizeRouletteBets(30,bets),normalizeRouletteBets(30,[...bets].reverse()));
  assert.equal(rouletteMaximumReturn([{selection:{kind:'color',value:'red'},stakeTokens:10},{selection:{kind:'color',value:'black'},stakeTokens:10}]),20);
});
test('multi Roulette rejects invalid totals, unbounded arrays and exposure before drawing', () => {
  let draws=0; const draw=()=>{draws++;return 0;};
  const bet={selection:{kind:'number' as const,value:0},stakeTokens:2};
  for (const [stake,bets] of [[3,[bet]],[2,[]],[2000,Array(1000).fill(bet)],[2,[{...bet,stakeTokens:1}]],[Number.MAX_SAFE_INTEGER,[{...bet,stakeTokens:Number.MAX_SAFE_INTEGER}]]] as const) {
    assert.throws(()=>playRouletteMulti(stake,bets,draw));
  }
  assert.throws(()=>playRouletteMulti(Number.MAX_SAFE_INTEGER,[{...bet,stakeTokens:Number.MAX_SAFE_INTEGER},bet],draw));
  assert.throws(()=>playRouletteMulti(2200000000000000,[{selection:{kind:'number',value:1},stakeTokens:200000000000000},{selection:{kind:'color',value:'red'},stakeTokens:2000000000000000}],draw));
  assert.equal(draws,0);
});
test('Plinko batches draw independent paths and sum individually floored payouts', () => {
  let draws=0;
  const result=playPlinkoBatch(3,8,'low',2,()=>draws++<8?0:1);
  assert.equal(draws,16); assert.equal(result.stakeTokens,6); assert.equal(result.stakePerBall,3); assert.equal(result.ballCount,2);
  assert.deepEqual(result.balls.map(ball=>ball.bin),[0,8]);
  assert.notEqual(result.balls[0].path,result.balls[1].path);
  assert.equal(result.payoutTokens,result.balls.reduce((sum,ball)=>sum+ball.payoutTokens,0));
  assert.equal(result.payoutTokens,2*Math.floor(3*result.paytable[0]/10000));
  assert.equal(plinkoBatchExposure(3,8,'low',2).maximumReturn,result.payoutTokens);
  let alternating=0;
  const rounded=playPlinkoBatch(2,8,'low',2,()=>alternating++%2);
  assert.equal(rounded.payoutTokens,0); // Two floor(0.6086) returns, not floor(1.2172).
  assert.equal(Math.floor(rounded.stakeTokens*rounded.paytable[4]/10000),1);
});
test('Plinko rejects invalid count and unsafe aggregate stake or return before any draw', () => {
  let draws=0;const draw=()=>{draws++;return 0;};
  for(const count of [0,21,1.5,NaN]) assert.throws(()=>playPlinkoBatch(2,8,'low',count,draw));
  assert.throws(()=>playPlinkoBatch(Number.MAX_SAFE_INTEGER,8,'low',2,draw));
  assert.throws(()=>playPlinkoBatch(100000000000000,16,'high',20,draw));
  assert.equal(draws,0);
});
test('default casino max is exactly 100000 Tokens', () => {
  const previous=process.env.CASINO_MAX_BET;delete process.env.CASINO_MAX_BET;
  try {assert.equal(getCasinoSettings().maxBet,100000);} finally {if(previous!==undefined) process.env.CASINO_MAX_BET=previous;}
});
function table(player: CardRank[], dealer: CardRank[], draws: CardRank[] = [], stake = 20): BlackjackState {
  return {
    status: 'active', currentHand: 0, totalStakeTokens: stake, payoutTokens: null,
    hands: [{ cards: player.map(card), stakeTokens: stake, status: 'playing', natural: player.length === 2 && player.includes('A') && player.some(r => ['10', 'J', 'Q', 'K'].includes(r)), split: false, doubled: false }],
    dealer: dealer.map(card), shoe: draws.map(card),
  };
}

test('zero loses a red bet', () => assert.equal(playRoulette(20, { kind: 'color', value: 'red' }, () => 0).payoutTokens, 0));
test('straight zero returns thirty-six times stake', () => assert.equal(playRoulette(20, { kind: 'number', value: 0 }, () => 0).payoutTokens, 720));
test('roulette outside bets exclude zero and return the whole winning stake', () => {
  const bets: RouletteSelection[] = [{kind:'parity',value:'even'}, {kind:'range',value:'low'}, {kind:'dozen',value:1}, {kind:'column',value:1}];
  for (const selection of bets) assert.equal(playRoulette(20, selection, () => 0).payoutTokens, 0);
  assert.equal(playRoulette(20, {kind:'color',value:'red'}, () => 1).payoutTokens, 40);
  assert.equal(playRoulette(20, {kind:'color',value:'black'}, () => 2).payoutTokens, 40);
  assert.equal(playRoulette(20, {kind:'dozen',value:3}, () => 36).payoutTokens, 60);
  assert.equal(playRoulette(20, {kind:'column',value:2}, () => 35).payoutTokens, 60);
  assert.equal(playRoulette(20, {kind:'parity',value:'odd'}, () => 35).payoutTokens, 40);
  assert.equal(playRoulette(20, {kind:'range',value:'high'}, () => 36).payoutTokens, 40);
});
test('roulette rejects invalid stake, selection and random output', () => {
  for (const stake of [0,1,-2,2.5,NaN,Infinity,Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => playRoulette(stake, {kind:'number',value:0}, () => 0));
  for (const selection of [{kind:'number',value:37},{kind:'color',value:'green'},{kind:'column',value:4},{kind:'parity',value:'other'},{kind:'bad',value:1},null]) assert.throws(() => playRoulette(20, selection as RouletteSelection, () => 0));
  assert.throws(() => playRoulette(20,{kind:'number',value:0}, () => 37));
  assert.throws(() => playRoulette(Number.MAX_SAFE_INTEGER,{kind:'number',value:0}, () => 0));
});

test('Plinko paths determine the bin and integer total payout', () => {
  let index = 0;
  const result = playPlinko(20,8,'medium',() => [0,1,0,1,1,0,0,1][index++]);
  assert.deepEqual(result.path,[0,1,0,1,1,0,0,1]);
  assert.equal(result.bin,4);
  assert.equal(result.multiplier,result.paytable[4]);
  assert.equal(result.payoutTokens,Math.floor(20 * result.multiplier / 10000));
  assert.equal(playPlinko(20,8,'high',() => 0).bin,0);
  assert.equal(playPlinko(20,16,'low',() => 1).bin,16);
});
test('Plinko published tables are symmetric and binomial expected returns do not exceed 97%', () => {
  for (const rows of [8,12,16] as const) {
    let previousEdge = 0;
    for (const risk of ['low','medium','high'] as const) {
      const values = plinkoPaytable(rows,risk);
      assert.equal(values.length, rows+1);
      assert.deepEqual(values,[...values].reverse());
      let combinations = 1;
      let weighted = 0;
      for (let bin=0;bin<=rows;bin++) {
        assert.ok(Number.isSafeInteger(values[bin]) && values[bin]>=0);
        weighted += combinations * values[bin];
        combinations = combinations * (rows-bin)/(bin+1);
      }
      assert.ok(weighted / 2 ** rows <= 9700);
      assert.ok(weighted / 2 ** rows > 9698);
      assert.ok(values[0] > previousEdge);
      assert.ok(values[0] > values[rows/2]);
      previousEdge = values[0];
    }
  }
});
test('Plinko validates settings, stakes and unbiased random draws', () => {
  assert.throws(() => playPlinko(1,8,'low',() => 0));
  assert.throws(() => playPlinko(20,9 as 8,'low',() => 0));
  assert.throws(() => plinkoPaytable(8,'bad' as 'low'));
  assert.throws(() => playPlinko(20,8,'low',() => 2));
});

test('blackjack uses six decks with an independent shuffled shoe', () => {
  const state = startBlackjack(20,max => max-1);
  assert.equal(state.shoe.length + state.dealer.length + state.hands.flatMap(h=>h.cards).length,312);
  const counts = new Map<string,number>();
  for (const c of [...state.shoe,...state.dealer,...state.hands.flatMap(h=>h.cards)]) counts.set(c.rank+ c.suit,(counts.get(c.rank+c.suit)??0)+1);
  assert.equal(counts.size,52);
  assert.ok([...counts.values()].every(n=>n===6));
  assert.throws(() => startBlackjack(3,max=>max-1));
  assert.throws(() => startBlackjack(1,max=>max-1));
  assert.throws(() => startBlackjack(20,()=>-1));
});
test('live blackjack projection hides dealer hole card and all future cards', () => {
  const state = table(['10','7'],['A','6'],['5','K']);
  const visible = publicBlackjack(state);
  assert.deepEqual(visible.dealer.cards,[card('A'),null]);
  assert.equal(visible.dealer.total,11);
  assert.equal('shoe' in visible,false);
  assert.equal(JSON.stringify(visible).includes('"K"'),false);
  assert.throws(() => blackjackPayout(state));
});
test('blackjack natural pays 3:2 profit while split 21 pays ordinary win', () => {
  const natural = actBlackjack(table(['A','K'],['10','7']),'stand').state;
  assert.equal(blackjackPayout(natural),50);
  const split = actBlackjack(table(['A','A'],['10','7'],['K','Q']),'split');
  assert.equal(split.additionalStake,20);
  assert.equal(split.state.status,'settled');
  assert.equal(blackjackPayout(split.state),80);
  assert.ok(split.state.hands.every(h=>h.split && !h.natural));
});
test('blackjack pushes return stakes and dealer natural beats ordinary 21', () => {
  assert.equal(blackjackPayout(actBlackjack(table(['10','8'],['K','8']),'stand').state),20);
  assert.equal(blackjackPayout(actBlackjack(table(['A','K'],['A','Q']),'stand').state),20);
  const state = table(['7','7','7'],['A','K']);
  assert.equal(blackjackPayout(actBlackjack(state,'stand').state),0);
});
test('dealer stands on soft 17 and draws hard 16', () => {
  const soft = actBlackjack(table(['10','8'],['A','6'],['K']),'stand').state;
  assert.equal(soft.dealer.length,2);
  assert.equal(blackjackPayout(soft),40);
  const hard = actBlackjack(table(['10','8'],['10','6'],['5']),'stand').state;
  assert.equal(hard.dealer.length,3);
  assert.equal(blackjackPayout(hard),0);
  assert.deepEqual(publicBlackjack(hard).dealer.cards,hard.dealer);
});
test('hit preserves its input, handles soft aces and settles a bust', () => {
  const initial = table(['A','5'],['10','7'],['A','K','9']);
  const snapshot = JSON.stringify(initial);
  const first = actBlackjack(initial,'hit').state;
  assert.equal(JSON.stringify(initial),snapshot);
  assert.equal(publicBlackjack(first).hands[0].total,17);
  const second = actBlackjack(first,'hit').state;
  assert.equal(publicBlackjack(second).hands[0].total,17);
  const busted = actBlackjack(second,'hit').state;
  assert.equal(busted.status,'settled');
  assert.equal(blackjackPayout(busted),0);
  assert.throws(() => actBlackjack(busted,'hit'));
});
test('double draws exactly one card and doubles stake with total-return settlement', () => {
  const initial = table(['5','6'],['10','7'],['K']);
  const {state,additionalStake} = actBlackjack(initial,'double');
  assert.equal(additionalStake,20);
  assert.equal(state.totalStakeTokens,40);
  assert.equal(state.hands[0].cards.length,3);
  assert.equal(blackjackPayout(state),80);
  assert.throws(() => actBlackjack(actBlackjack(table(['3','4'],['10','7'],['2']),'hit').state,'double'));
});
test('split allows double after split, enforces equal ranks and caps at four hands', () => {
  const split = actBlackjack(table(['8','8'],['10','7'],['3','2','K','K']),'split').state;
  assert.equal(split.totalStakeTokens,40);
  assert.equal(split.hands.length,2);
  assert.ok(publicBlackjack(split).availableActions.includes('double'));
  const doubled = actBlackjack(split,'double');
  assert.equal(doubled.additionalStake,20);
  assert.equal(doubled.state.currentHand,1);
  const complete = actBlackjack(doubled.state,'stand').state;
  // The doubled 21 returns 80; the other hand's 10 loses to dealer 17.
  assert.equal(blackjackPayout(complete),80);
  assert.throws(() => actBlackjack(table(['K','Q'],['10','7']),'split'));
  let state = table(['8','8'],['10','7'],['8','8','8','8','8','8']);
  for (let i=0;i<3;i++) state = actBlackjack(state,'split').state;
  assert.equal(state.hands.length,4);
  assert.throws(() => actBlackjack(state,'split'));
});
test('split aces cannot hit, double or resplit and are automatically stood', () => {
  const state = actBlackjack(table(['A','A'],['10','7'],['A','9']),'split').state;
  assert.equal(state.status,'settled');
  assert.ok(state.hands.every(h=>h.cards.length===2 && h.status==='stood'));
  assert.deepEqual(publicBlackjack(state).availableActions,[]);
  for (const action of ['hit','double','split'] as const) assert.throws(() => actBlackjack(state,action));
});
test('blackjack peek settles a dealer natural at the initial deal', () => {
  // Legal descending Fisher-Yates swaps arrange player 9, dealer A, player 8, dealer K.
  const targets = new Map([[12,3],[8,1],[7,2],[1,0]]);
  const state = startBlackjack(20,max => targets.get(max-1) ?? max-1);
  assert.equal(state.status,'settled');
  assert.equal(blackjackPayout(state),0);
  assert.deepEqual(publicBlackjack(state).availableActions,[]);
});
test('initial player natural settles immediately without drawing or offering actions', () => {
  const state = startBlackjack(20,max => max-1===12 ? 2 : max-1);
  assert.equal(state.status,'settled');
  assert.equal(state.shoe.length,308);
  assert.equal(state.hands[0].natural,true);
  assert.equal(blackjackPayout(state),50);
  assert.deepEqual(publicBlackjack(state).availableActions,[]);
  assert.throws(()=>actBlackjack(state,'double'));
});
test('a hit to 21 stands automatically and a dealer bust pays the full win', () => {
  const hit = actBlackjack(table(['5','6'],['10','6'],['K','K']),'hit');
  assert.equal(hit.additionalStake,0);
  assert.equal(hit.state.status,'settled');
  assert.equal(hit.state.hands[0].status,'stood');
  assert.equal(blackjackPayout(hit.state),40);
});
test('a doubled bust loses the entire doubled stake', () => {
  const {state,additionalStake}=actBlackjack(table(['10','6'],['10','7'],['K']),'double');
  assert.equal(additionalStake,20);
  assert.equal(state.totalStakeTokens,40);
  assert.equal(state.hands[0].status,'bust');
  assert.equal(blackjackPayout(state),0);
});
test('public card arrays are copies and cannot mutate private persisted state', () => {
  const state=table(['10','7'],['A','6'],['K']);
  const snapshot=JSON.stringify(state);
  const projected=publicBlackjack(state);
  projected.hands[0].cards[0].rank='2';
  projected.dealer.cards[0]!.rank='3';
  assert.equal(JSON.stringify(state),snapshot);
});
test('unsafe double totals are rejected without mutating the source round', () => {
  const state=table(['5','6'],['10','7'],['K'],Number.MAX_SAFE_INTEGER-1);
  const snapshot=JSON.stringify(state);
  assert.throws(()=>actBlackjack(state,'double'));
  assert.equal(JSON.stringify(state),snapshot);
});

test('crash points include instant crashes and cap at 100x', () => {
  assert.equal(crashPoint(()=>0),100);
  assert.equal(crashPoint(max=>max-1),10000);
  assert.throws(() => crashPoint(()=>-1));
  for (let i=0;i<1000;i++) {
    const point = crashPoint(max=>Math.floor(max*i/1000));
    assert.ok(Number.isSafeInteger(point) && point>=100 && point<=10000);
  }
});
test('crash distribution retains approximately 99% survival value at 2x and 10x', () => {
  let at2=0,at10=0;
  const samples=10000;
  for(let i=0;i<samples;i++) {
    const point=crashPoint(max=>Math.floor(max*(i+0.5)/samples));
    if(point>200) at2++;
    if(point>1000) at10++;
  }
  assert.ok(Math.abs(at2/samples*2-0.99)<0.001);
  assert.ok(Math.abs(at10/samples*10-0.99)<0.001);
});
test('crash point quantization preserves strict 2x cashout survival', () => {
  const point=crashPoint(()=>2168958485);
  assert.equal(point,201);
  assert.ok(crashDuration(200)<crashDuration(point));
  // The timing boundary remains unchanged; quantization corrects the private point.
  assert.equal(crashDuration(200),11553);
  assert.equal(crashMultiplier(11553),200);
});
test('exact finite-space crash survival pays 99% before Token rounding', () => {
  const sampleSpace=2**32;
  // Independent counts from d < 99*2^32/target, where d=2^32-sample is an integer.
  const cases=[
    {target:101,surviving:4209918438},
    {target:110,surviving:3865470566},
    {target:200,surviving:2126008811},
    {target:1000,surviving:425201762},
    {target:9999,surviving:42524428},
  ];
  for(const {target,surviving} of cases) {
    let low=0,high=sampleSpace;
    while(low<high) {
      const middle=Math.floor((low+high)/2);
      if(crashPoint(()=>middle)>target) high=middle;
      else low=middle+1;
    }
    assert.equal(sampleSpace-low,surviving);
    const expectedReturn=surviving/sampleSpace*target/100;
    assert.ok(expectedReturn<=0.99 && expectedReturn>0.99-target/(100*sampleSpace));
    assert.equal(crashPoint(()=>low-1)>target,false);
    assert.equal(crashPoint(()=>low)>target,true);
  }
  assert.equal(crashPoint(max=>max-1)>10000,false);
});
test('crash duration and multiplier agree at every integer boundary', () => {
  assert.equal(crashDuration(100),0);
  assert.equal(crashMultiplier(0),100);
  let previous=0;
  for(let point=101;point<=10000;point++) {
    const duration=crashDuration(point);
    assert.ok(Number.isSafeInteger(duration) && duration>=previous);
    assert.ok(crashMultiplier(duration-1)<point);
    assert.ok(crashMultiplier(duration)>=point);
    previous=duration;
  }
  assert.equal(crashMultiplier(1_000_000),10000);
  assert.throws(()=>crashMultiplier(-1));
  assert.throws(()=>crashMultiplier(NaN));
  for(const point of [99,10001,100.5,NaN]) assert.throws(()=>crashDuration(point));
});
