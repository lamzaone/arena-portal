"use client";
import { useMemo, useState } from "react";
import type { RouletteBet, RouletteMultiResult, RouletteResult, RouletteSelection } from "@/lib/casino/types";
import { GameLayout, Result, tokens, type GameClient } from "./client";
import { RouletteTable, roulettePosition } from "./roulette-table";
import { RouletteWheel } from "./roulette-wheel";

export function RouletteGame({client}:{client:GameClient}){
  const [chip,setChip]=useState(10),[placements,setPlacements]=useState<RouletteBet[]>([]),[repeat,setRepeat]=useState<RouletteBet[]>([]),[revealing,setRevealing]=useState(false);
  const bets=useMemo(()=>{
    const grouped=new Map<string,RouletteBet>();
    for(const bet of placements){const key=roulettePosition(bet.selection);grouped.set(key,{selection:bet.selection,stakeTokens:(grouped.get(key)?.stakeTokens??0)+bet.stakeTokens});}
    return [...grouped.values()].sort((a,b)=>roulettePosition(a.selection).localeCompare(roulettePosition(b.selection)));
  },[placements]);
  const total=bets.reduce((sum,bet)=>sum+bet.stakeTokens,0);
  const round=client.lastRound?.game==="roulette"?client.lastRound:client.state.history.find(item=>item.game==="roulette")??null;
  const result=round?.details as RouletteMultiResult|RouletteResult|undefined;
  const previous=result?("bets" in result?result.bets:[{selection:result.selection,payoutTokens:result.payoutTokens}]):[];
  const winning=new Set(revealing?[]:previous.filter(bet=>bet.payoutTokens>0&&bet.selection).map(bet=>roulettePosition(bet.selection)));
  const disabled=client.busy||client.blocked||revealing||!client.state.settings.enabled;
  const place=(selection:RouletteSelection)=>{if(placements.length>=196){client.error("This table is full. Undo a chip or clear the table.");return;}setPlacements(current=>[...current,{selection,stakeTokens:chip}]);};
  const spin=()=>{
    const {minBet,maxBet}=client.state.settings;
    if(!Number.isSafeInteger(total)||total<minBet||total>maxBet){client.error(`Place a total between ${tokens(minBet)} and ${tokens(maxBet)} Tokens per spin.`);return;}
    if(total>client.state.balance){client.error("Your Token balance is too low for this table total.");return;}
    setRepeat(bets.map(bet=>({...bet})));void client.mutate("/api/casino/play",{game:"roulette",stake:total,selection:{bets}});
  };
  return <GameLayout title="Roulette" subtitle="A classic table. Every chip has its place." stage={<div className="roulette-surface"><RouletteWheel roundId={round?.id??null} number={result?.number??null} color={result?.color} onRevealing={setRevealing}/><RouletteTable bets={bets} winning={winning} disabled={disabled} place={place}/></div>} rules={<><p>Single zero. Straight number: 36x. Dozen or column: 3x. Red/black, odd/even, low/high: 2x. Zero loses every outside selection.</p><p>Choose a chip, then tap a number or an outside position. Tap again to add chips. All placements share one spin, with a maximum total of {tokens(client.state.settings.maxBet)} Tokens.</p><p>Each pocket has a 1 in 37 chance. The theoretical total return is 36/37 (97.30%).</p></>}>
    <div className="roulette-rack" role="group" aria-label="Chip denominations"><span>CHOOSE YOUR CHIP</span><div>{[2,10,50,100,1000,10000,100000].filter(value=>value<=client.state.settings.maxBet).map(value=><button type="button" key={value} className={`casino-chip chip-${value}`} aria-label={`${value} Token chip`} aria-pressed={chip===value} disabled={disabled} onClick={()=>setChip(value)}><span>{value>=1000?`${value/1000}K`:value}</span></button>)}</div></div>
    <div className="roulette-tools"><button type="button" disabled={disabled||placements.length===0} onClick={()=>setPlacements(current=>current.slice(0,-1))}>Undo chip</button><button type="button" disabled={disabled||placements.length===0} onClick={()=>setPlacements([])}>Clear table</button><button type="button" disabled={disabled||repeat.length===0} onClick={()=>setPlacements(repeat.map(bet=>({...bet})))}>Repeat table</button></div>
    <div className="casino-cost" data-testid="roulette-total"><span>TABLE TOTAL</span><strong>{tokens(total)} <small>Tokens</small></strong><span>{bets.length} positions · {tokens(client.state.settings.maxBet)} maximum per spin</span></div>
    <button type="button" className="casino-primary" disabled={disabled} onClick={spin}>Spin wheel</button><p className="casino-control-note">The chips stay on the table for your next spin. Undo, clear or repeat before playing.</p><Result round={round}/>
  </GameLayout>;
}
