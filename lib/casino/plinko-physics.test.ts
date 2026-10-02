import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPlinkoTrajectory, samplePlinkoTrajectory, plinkoGeometry } from './plinko-physics.ts';

for (const rows of [8,12,16] as const) {
  for (const [name,path,bin] of [
    ['left',Array(rows).fill(0),0],['right',Array(rows).fill(1),rows],
    ['alternating',Array.from({length:rows},(_,i)=>i%2),rows/2],
  ] as const) test(`${rows} row ${name} path lands continuously in its approved bin`,()=>{
    const trajectory=buildPlinkoTrajectory(path as (0|1)[]);
    const final=samplePlinkoTrajectory(trajectory,trajectory.durationMs);
    assert.equal(final.bin,bin); assert.equal(final.landed,true);
    assert.equal(final.x,300+(bin-rows/2)*28);
    assert.equal(final.y,plinkoGeometry(rows).binY);
    for(let t=0;t<trajectory.durationMs;t+=8){
      const a=samplePlinkoTrajectory(trajectory,t),b=samplePlinkoTrajectory(trajectory,t+8);
      assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.y));
      assert.ok(Math.hypot(b.x-a.x,b.y-a.y)<20,'no teleport between pegs or final pocket');
    }
  });
}
test('gravity accelerates free flight and contacts produce real outward ricochets',()=>{
  const trajectory=buildPlinkoTrajectory([0,1,0,1,1,0,1,0]);
  const a=samplePlinkoTrajectory(trajectory,20),b=samplePlinkoTrajectory(trajectory,40);
  assert.ok(b.vy>a.vy); assert.ok(b.y-a.y>0);
  assert.equal(trajectory.impacts.length,8);
  for(const impact of trajectory.impacts){
    assert.ok(Math.abs(Math.hypot(impact.x-impact.pegX,impact.y-impact.pegY)-9)<.001,'ball touches peg at combined radius');
    assert.ok(impact.incoming.vx*impact.nx+impact.incoming.vy*impact.ny<0);
    assert.ok(impact.outgoing.vx*impact.nx+impact.outgoing.vy*impact.ny>0);
    const restitution=-(impact.outgoing.vx*impact.nx+impact.outgoing.vy*impact.ny)/(impact.incoming.vx*impact.nx+impact.incoming.vy*impact.ny);
    assert.ok(restitution>=.32-1e-9&&restitution<=.38+1e-9,'dissipative normal contact impulse');
    assert.ok(impact.incoming.vy>0&&impact.outgoing.vy<0,'vertical velocity reverses at contact');
    const before=samplePlinkoTrajectory(trajectory,impact.timeMs-.01),after=samplePlinkoTrajectory(trajectory,impact.timeMs+.01);
    assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<.1);
  }
});
test('staggered concurrent balls sample independently and clamp at their endpoints',()=>{
  const left=buildPlinkoTrajectory(Array(16).fill(0),1),right=buildPlinkoTrajectory(Array(16).fill(1),2);
  assert.equal(samplePlinkoTrajectory(left,-120).y,samplePlinkoTrajectory(left,0).y);
  assert.notEqual(samplePlinkoTrajectory(left,800).x,samplePlinkoTrajectory(right,680).x);
  assert.deepEqual(samplePlinkoTrajectory(left,left.durationMs+1000),samplePlinkoTrajectory(left,left.durationMs));
  assert.equal(samplePlinkoTrajectory(right,right.durationMs).bin,16);
});
