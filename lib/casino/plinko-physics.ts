export const plinkoGeometry = (rows: number) => ({ binY: 64+rows*32, width:64+rows*28, height:146+rows*32, pitch:28, rowGap:32, pegRadius:3.5, ballRadius:5.5 });
export interface PlinkoImpact {timeMs:number;x:number;y:number;pegX:number;pegY:number;nx:number;ny:number;incoming:{vx:number;vy:number};outgoing:{vx:number;vy:number}}
export interface PlinkoTrajectory {durationMs:number;bin:number;impacts:PlinkoImpact[];segments:{timeMs:number;durationMs:number;x:number;y:number;vx:number;vy:number}[];end:{x:number;y:number}}
export interface PlinkoFrame {x:number;y:number;vx:number;vy:number;bin:number;landed:boolean;impact:PlinkoImpact|null}
const GRAVITY=520;
/** Deterministic, outcome-directed contact playback. Each free flight is ballistic;
 * a dissipative peg impulse reverses vertical velocity and directs the next flight
 * along the already approved path. This is animation, never a financial simulation. */
export function buildPlinkoTrajectory(path:readonly(0|1)[],variation=0):PlinkoTrajectory {
  if(![8,12,16].includes(path.length)||path.some(value=>value!==0&&value!==1))throw new Error('Invalid approved Plinko path.');
  const geometry=plinkoGeometry(path.length),segments:PlinkoTrajectory['segments']=[],impacts:PlinkoImpact[]=[];
  const bin=path.reduce<number>((sum,value)=>sum+value,0),end={x:300+(bin-path.length/2)*geometry.pitch,y:geometry.binY};
  const nxMagnitude=.4,ny=-Math.sqrt(1-nxMagnitude**2),contactRadius=geometry.pegRadius+geometry.ballRadius;
  let pegX=300,timeMs=0,incoming={vx:0,vy:0};
  const contacts=path.map((direction,row)=>{
    const pegY=64+row*geometry.rowGap,nx=direction===0?-nxMagnitude:nxMagnitude;
    const point={x:pegX+nx*contactRadius,y:pegY+ny*contactRadius,pegX,pegY,nx,ny};
    pegX+=(direction===0?-1:1)*geometry.pitch/2;
    return point;
  });
  let x=contacts[0].x,y=16;
  const initialDuration=Math.sqrt(2*(contacts[0].y-y)/GRAVITY);
  segments.push({timeMs,durationMs:initialDuration*1000,x,y,vx:0,vy:0});
  timeMs+=initialDuration*1000;incoming={vx:0,vy:GRAVITY*initialDuration};
  for(let row=0;row<path.length;row++){
    const contact=contacts[row],target=contacts[row+1]??end;
    x=contact.x;y=contact.y;
    // Different accepted balls have slightly different restitution, not different bins.
    const restitution=.32+(Math.abs(Math.sin(variation*17+row*3))*.06);
    // Solve ballistic flight with n·v_out = -e(n·v_in). Tangential
    // impulse follows the approved side; the normal impulse is a true bounce.
    const normalIncoming=incoming.vx*contact.nx+incoming.vy*contact.ny;
    const normalResponse=-restitution*normalIncoming/contact.ny;
    const dx=target.x-x,dy=target.y-y;
    const duration=(-normalResponse+Math.sqrt(normalResponse**2+2*GRAVITY*(dy+contact.nx/contact.ny*dx)))/GRAVITY;
    const vx=(target.x-x)/duration;
    const vy=normalResponse-contact.nx/contact.ny*vx;
    const outgoing={vx,vy};
    impacts.push({...contact,timeMs,incoming,outgoing});
    segments.push({timeMs,durationMs:duration*1000,x,y,vx,vy});
    timeMs+=duration*1000;incoming={vx,vy:vy+GRAVITY*duration};
  }
  return {durationMs:timeMs,bin,impacts,segments,end};
}
export function samplePlinkoTrajectory(trajectory:PlinkoTrajectory,elapsedMs:number):PlinkoFrame {
  const elapsed=Math.max(0,elapsedMs);
  if(elapsed>=trajectory.durationMs)return {...trajectory.end,vx:0,vy:0,bin:trajectory.bin,landed:true,impact:null};
  const segment=trajectory.segments.find(segment=>elapsed<segment.timeMs+segment.durationMs)??trajectory.segments[trajectory.segments.length-1];
  const t=Math.max(0,(elapsed-segment.timeMs)/1000);
  const impact=trajectory.impacts.findLast(impact=>elapsed>=impact.timeMs&&elapsed-impact.timeMs<160)??null;
  return {x:segment.x+segment.vx*t,y:segment.y+segment.vy*t+.5*GRAVITY*t*t,vx:segment.vx,vy:segment.vy+GRAVITY*t,bin:trajectory.bin,landed:false,impact};
}
