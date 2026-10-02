"use client";
import { useEffect, useRef, useState } from "react";
import type { CasinoRoundPublic, PlinkoBatchResult, PlinkoResult, PlinkoRisk, PlinkoRows } from "@/lib/casino/types";
import { buildPlinkoTrajectory, samplePlinkoTrajectory, plinkoGeometry, type PlinkoTrajectory, type PlinkoFrame } from "@/lib/casino/plinko-physics";
import { multiple } from "./client";
type FallingBall={id:string;start:number;trajectory:PlinkoTrajectory};
type DrawBall={id:string;frame:PlinkoFrame;trail:PlinkoFrame[]};
export function PlinkoBoard({round,rows,risk,paytable,onActiveChange}:{round:CasinoRoundPublic|null;rows:PlinkoRows;risk:PlinkoRisk;paytable:number[];onActiveChange:(count:number)=>void}){
  const seen=useRef(new Set(round?[round.id]:[])),active=useRef<FallingBall[]>([]),startLoop=useRef(()=>{});
  const activeGeometry=useRef(`${rows}:${risk}`);
  const [balls,setBalls]=useState<DrawBall[]>([]),[pulses,setPulses]=useState<number[]>([]);
  const geometry=plinkoGeometry(rows);
  useEffect(()=>{
    let raf=0,disposed=false;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const tick=(now:number)=>{
      if(disposed)return;
      const draw:DrawBall[]=[],landed:number[]=[];
      active.current=active.current.filter(ball=>{
        const elapsed=now-ball.start,frame=samplePlinkoTrajectory(ball.trajectory,elapsed);
        if(frame.landed||document.hidden||reduced.matches){landed.push(ball.trajectory.bin);return false;}
        draw.push({id:ball.id,frame,trail:[60,40,20].map(offset=>samplePlinkoTrajectory(ball.trajectory,elapsed-offset))});return true;
      });
      setBalls(draw);if(landed.length)setPulses(landed);
      onActiveChange(active.current.length);
      raf=active.current.length?requestAnimationFrame(tick):0;
    };
    startLoop.current=()=>{if(!raf)raf=requestAnimationFrame(tick);};
    const fastForward=()=>{if(document.hidden||reduced.matches){cancelAnimationFrame(raf);raf=0;tick(performance.now());}};
    document.addEventListener('visibilitychange',fastForward);reduced.addEventListener('change',fastForward);
    return ()=>{disposed=true;cancelAnimationFrame(raf);active.current=[];startLoop.current=()=>{};document.removeEventListener('visibilitychange',fastForward);reduced.removeEventListener('change',fastForward);};
  },[onActiveChange]);
  useEffect(()=>{
    if(!round||seen.current.has(round.id))return;
    seen.current.add(round.id);
    // Identity is retained for the component lifetime; old receipts never replay.
    const details=round.details as PlinkoResult|PlinkoBatchResult;
    const acceptedGeometry=`${details.rows}:${details.risk}`;
    if (activeGeometry.current !== acceptedGeometry) {
      // Recovery is already financially confirmed. Finish older visual playback
      // before the parent adopts different pegs/pockets; never replay its POST.
      active.current=[];
      setBalls([]);
    }
    activeGeometry.current=acceptedGeometry;
    const accepted="balls" in details?details.balls:[details];
    const now=performance.now();
    const entries=accepted.map((ball,index)=>({id:`${round.id}:${index}`,start:now+index*65,trajectory:buildPlinkoTrajectory(ball.path,index)}));
    active.current=[...active.current,...entries].slice(-80);
    onActiveChange(active.current.length);setPulses([]);startLoop.current();
  },[round,onActiveChange]);
  const latest=round?.details as PlinkoResult|PlinkoBatchResult|undefined;
  const latestBalls=latest?("balls" in latest?latest.balls:[latest]):[];
  return <><svg viewBox={`${300-geometry.width/2} 0 ${geometry.width} ${geometry.height}`} className="plinko-board" role="img" aria-label={`${rows} row Plinko board; ${balls.length} balls falling`}>
    <defs><radialGradient id="plinko-ball-metal"><stop offset="0" stopColor="#fff5d3"/><stop offset=".55" stopColor="#efd092"/><stop offset="1" stopColor="#b98742"/></radialGradient></defs>
    <path d={`M300 22L${300-rows*geometry.pitch/2-24} ${geometry.binY+22}H${300+rows*geometry.pitch/2+24}Z`} className="plinko-boundary"/>
    {Array.from({length:rows},(_,row)=>Array.from({length:row+1},(_,peg)=>{
      const x=300+(peg-row/2)*geometry.pitch,y=64+row*geometry.rowGap;
      const flash=balls.some(ball=>ball.frame.impact?.pegX===x&&ball.frame.impact.pegY===y);
      return <g key={`${row}:${peg}`}>{flash&&<circle cx={x} cy={y} r="11" className="plinko-contact-flash"/>}<circle cx={x} cy={y} r={geometry.pegRadius} className={`plinko-peg ${flash?"is-contact":""}`}/></g>;
    }))}
    {paytable.map((value,bin)=>{const x=300+(bin-rows/2)*geometry.pitch,isWinner=pulses.includes(bin)||(!balls.length&&latestBalls.some(ball=>ball.rows===rows&&ball.bin===bin));return <g key={bin} className={isWinner?"plinko-pocket is-winner":"plinko-pocket"}><rect x={x-13} y={geometry.binY-5} width="26" height="66" rx="4" className="plinko-bin"/><text x={x} y={geometry.binY+29} transform={`rotate(-90 ${x} ${geometry.binY+29})`} textAnchor="middle" className="plinko-bin-label"><title>{`Bin ${bin}: ${multiple(value,10000)}x total return`}</title>{(value/10000).toFixed(value>=100000?1:2).replace(/\.?0+$/, "")}x</text></g>;})}
    {balls.map(ball=><g key={ball.id}>{ball.trail.map((frame,index)=><circle key={index} cx={frame.x} cy={frame.y} r={2.5+index*.7} className="plinko-trail" opacity={.12+index*.12}/>)}<circle data-ball-id={ball.id} className="plinko-ball plinko-moving-ball" cx={ball.frame.x} cy={ball.frame.y} r={geometry.ballRadius}/></g>)}
  </svg><p className="casino-stage-caption" role="status" data-testid={latest?"plinko-result":undefined}>{balls.length?`${balls.length} BALLS IN PLAY`:latestBalls.length===1?`BIN ${latestBalls[0].bin} / ${multiple(latestBalls[0].multiplier,10000)}x RETURN`:latestBalls.length?`${latestBalls.length} BALLS LANDED • ${latest?.payoutTokens} TOKENS RETURNED`:"CHOOSE YOUR DROP"}</p></>;
}
