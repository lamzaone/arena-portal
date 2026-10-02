import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Use the same real engines without requiring native .ts imports in this .mjs runner.
const engineBundle=await build({stdin:{contents:"export {playRouletteMulti} from './lib/casino/roulette';export {playPlinkoBatch} from './lib/casino/plinko';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {playRouletteMulti,playPlinkoBatch}=await import(`data:text/javascript;base64,${Buffer.from(engineBundle.outputFiles[0].text).toString('base64')}`);

const artifacts = 'D:/ARENA/.artifacts/casino-premium';
const initial = () => ({ balance: 1000, settings: { enabled: true, minBet: 2, maxBet: 10000, blackjackTimeoutMs: 300000 }, activeBlackjack: null, crash: null, history: [] });
const round = (game, details, stake = 10) => ({ id: `${game}-1`, game, status: 'settled', stakeTokens: stake, payoutTokens: 0, createdAt: new Date().toISOString(), settledAt: new Date().toISOString(), details });
const blackjack = (status = 'active') => ({ status, hands: [{ cards: [{ rank: '8', suit: 'hearts' }, { rank: '8', suit: 'spades' }], stakeTokens: 10, status: status === 'active' ? 'playing' : 'stood', natural: false, split: false, doubled: false, total: 16, soft: false }], currentHand: 0, dealer: { cards: [{ rank: '6', suit: 'clubs' }, status === 'active' ? null : { rank: 'K', suit: 'hearts' }], total: status === 'active' ? 6 : 16, soft: false }, totalStakeTokens: 10, payoutTokens: status === 'active' ? null : 20, availableActions: status === 'active' ? ['hit', 'stand', 'double', 'split'] : [] });
const fitsViewport = async page => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'each game fits the viewport');

test('premium tables place chips, align a normal-motion wheel, keep concurrent balls moving, and expose real participants', async () => {
  const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {CasinoLobby} from './components/casino/casino-lobby';import './app/casino/casino.css';createRoot(document.getElementById('root')).render(<CasinoLobby initial={${JSON.stringify(initial())}} steamId="premium-player" csrf="premium-csrf" themeKey="default"/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,outfile:'premium.js',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
  const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
  const css=(await readFile('app/globals.css','utf8')).replace(/^@import[^\r\n]+[\r\n]*/gm,'')+bundle.outputFiles.find(f=>f.path.endsWith('.css')).text;
  const server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/premium.js'?'text/javascript':req.url==='/premium.css'?'text/css':'text/html');res.end(req.url==='/premium.js'?js:req.url==='/premium.css'?css:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/premium.css"></head><body><main id="root" style="max-width:1440px;margin:auto;padding:16px"></main><script src="/premium.js"></script></body></html>');});
  await new Promise(done=>server.listen(0,'127.0.0.1',done)); await mkdir(artifacts,{recursive:true});
  const browser=await chromium.launch();
  try {
    for(const width of [1440,375]) {
      const context=await browser.newContext({viewport:{width,height:1000},recordVideo:{dir:artifacts,size:{width,height:1000}}});
      const page=await context.newPage();page.setDefaultTimeout(8000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      let state={...initial(),settings:{...initial().settings,maxBet:100000}},posts=[];
      await page.route('**/api/casino/**',async route=>{
        if(route.request().method()==='GET'){await route.fulfill({json:{ok:true,...state}});return;}
        const body=route.request().postDataJSON();posts.push(body);let result;
        if(body.game==='roulette') {
          const details=playRouletteMulti(body.stake,body.selection.bets,()=>32);
          result={...round('roulette',details,body.stake),id:`wheel-${posts.length}`,payoutTokens:details.payoutTokens};
        } else {
          let draw=0;const details=playPlinkoBatch(body.stake,body.selection.rows,body.selection.risk,body.selection.ballCount,()=>draw++%2);
          result={...round('plinko',details,details.stakeTokens),id:`batch-${posts.length}`,payoutTokens:details.payoutTokens};
        }
        state.balance-=result.stakeTokens;state.balance+=result.payoutTokens;state.history.unshift(result);
        await route.fulfill({json:{ok:true,balance:state.balance,round:result}});
      });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.getByRole('button',{name:'10 Token chip',exact:true}).click();
      await page.getByRole('button',{name:'Red',exact:true}).click();await page.getByRole('button',{name:'Red',exact:true}).click();
      await page.getByRole('button',{name:'Number 7',exact:true}).click();
      assert.match(await page.getByTestId('roulette-total').textContent(),/30/);
      await page.getByRole('button',{name:'Undo chip',exact:true}).click();assert.match(await page.getByTestId('roulette-total').textContent(),/20/);
      await page.getByRole('button',{name:'Clear table',exact:true}).click();assert.match(await page.getByTestId('roulette-total').textContent(),/0/);
      await page.getByRole('button',{name:'Red',exact:true}).click();await page.getByRole('button',{name:'Red',exact:true}).click();await page.getByRole('button',{name:'Number 32',exact:true}).click();
      await page.evaluate(()=>{
        window.wheelMotion=[];let started=null;
        const sample=()=>{const svg=document.querySelector('.roulette-wheel');if(svg?.dataset.revealing==='true'){const now=performance.now();started??=now;const angle=Number(svg.querySelector('.roulette-rotor').getAttribute('transform').match(/rotate\(([-\d.]+)/)[1]);window.wheelMotion.push({time:now-started,angle});}window.wheelMotionRaf=requestAnimationFrame(sample);};
        window.wheelMotionRaf=requestAnimationFrame(sample);
      });
      await page.getByRole('button',{name:'Spin wheel',exact:true}).click();
      await page.getByText('Revealing spin…',{exact:true}).waitFor();await page.locator('.roulette-wheel').scrollIntoViewIfNeeded();assert.equal(await page.getByRole('button',{name:'Spin wheel',exact:true}).isDisabled(),true);
      assert.equal(posts.length,1);assert.equal(posts[0].stake,30);assert.deepEqual(posts[0].selection.bets,[{selection:{kind:'color',value:'red'},stakeTokens:20},{selection:{kind:'number',value:32},stakeTokens:10}]);
      const first=await page.locator('.roulette-rotor').getAttribute('transform');await page.waitForTimeout(300);assert.notEqual(await page.locator('.roulette-rotor').getAttribute('transform'),first);
      const rotation=await page.locator('.roulette-wheel').evaluate(async svg=>{
        const sample=()=>{const rotor=svg.querySelector('.roulette-rotor');const ball=svg.querySelector('.roulette-ball');return {wheel:Number(rotor.getAttribute('transform').match(/rotate\(([-\d.]+)/)[1]),ball:Math.atan2(Number(ball.getAttribute('cx'))-200,200-Number(ball.getAttribute('cy')))*180/Math.PI};};
        const a=sample();await new Promise(resolve=>setTimeout(resolve,32));const b=sample();return {wheel:b.wheel-a.wheel,ball:((b.ball-a.ball+540)%360)-180};
      });
      assert.ok(rotation.wheel>0&&rotation.ball<0,`wheel and ball must counterrotate, signed deltas: ${JSON.stringify(rotation)}`);
      await page.screenshot({path:`${artifacts}/wheel-moving-${width}.png`,fullPage:true});
      await page.locator('.roulette-wheel[data-revealing="false"]').waitFor();
      const speeds=await page.evaluate(()=>{
        cancelAnimationFrame(window.wheelMotionRaf);
        const speed=(start,end)=>{const frames=window.wheelMotion.filter(frame=>frame.time>=start&&frame.time<=end);if(frames.length<2)throw Error('Missing real wheel frames');return (frames.at(-1).angle-frames[0].angle)/(frames.at(-1).time-frames[0].time);};
        return {launch:speed(0,180),middle:speed(600,1100),braking:speed(2900,3400)};
      });
      assert.ok(speeds.launch>0&&speeds.middle>speeds.launch*1.4,`wheel accelerates after launch: ${JSON.stringify(speeds)}`);
      assert.ok(speeds.braking>0&&speeds.braking<speeds.middle*.5,`wheel brakes before landing: ${JSON.stringify(speeds)}`);
      const alignment=await page.locator('.roulette-wheel').evaluate(svg=>{const p=svg.querySelector('[data-pocket="32"]'),b=svg.querySelector('.roulette-ball');const a=svg.createSVGPoint();a.x=+p.getAttribute('data-x');a.y=+p.getAttribute('data-y');const q=a.matrixTransform(p.getCTM());const c=svg.createSVGPoint();c.x=+b.getAttribute('cx');c.y=+b.getAttribute('cy');const d=c.matrixTransform(b.getCTM());const center=svg.createSVGPoint();center.x=200;center.y=200;const o=center.matrixTransform(svg.getCTM());return Math.abs(Math.atan2(q.y-o.y,q.x-o.x)-Math.atan2(d.y-o.y,d.x-o.x));});
      assert.ok(alignment<.001,'winning pocket center aligns exactly with landed ball');
      assert.equal(await page.getByRole('button',{name:'Red',exact:true}).getAttribute('data-winning'),'true');assert.equal(await page.getByRole('button',{name:'Number 32',exact:true}).getAttribute('data-winning'),'true');
      await fitsViewport(page);await page.screenshot({path:`${artifacts}/roulette-premium-${width}.png`,fullPage:true});
      await page.getByRole('button',{name:'Clear table',exact:true}).click();await page.getByRole('button',{name:'100000 Token chip',exact:true}).click();await page.getByRole('button',{name:'Red',exact:true}).click();assert.match(await page.getByTestId('roulette-total').textContent(),/100,000/);await page.getByRole('button',{name:'Spin wheel',exact:true}).click();await page.getByRole('alert').filter({hasText:'balance'}).waitFor();assert.equal(posts.length,1);
      await page.getByRole('button',{name:'Clear table',exact:true}).click();await page.getByRole('button',{name:'Repeat table',exact:true}).click();assert.match(await page.getByTestId('roulette-total').textContent(),/30/);
      await page.getByRole('tab',{name:'Plinko',exact:true}).click();await page.getByLabel('Ball count').fill('5');
      assert.match(await page.getByTestId('plinko-cost').textContent(),/10 Tokens/);
      await page.getByRole('button',{name:'Drop balls',exact:true}).click();
      await page.waitForFunction(()=>document.querySelectorAll('.plinko-moving-ball').length===5);
      const position=await page.locator('.plinko-moving-ball').first().getAttribute('cy');await page.waitForTimeout(160);assert.notEqual(await page.locator('.plinko-moving-ball').first().getAttribute('cy'),position);
      assert.equal(await page.getByLabel('Rows',{exact:true}).isDisabled(),true);
      await page.getByRole('button',{name:'Drop balls',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.plinko-moving-ball').length===10);await page.locator('.plinko-board').scrollIntoViewIfNeeded();
      await page.screenshot({path:`${artifacts}/plinko-multiball-${width}.png`,fullPage:true});
      await fitsViewport(page);await page.waitForFunction(()=>document.querySelectorAll('.plinko-moving-ball').length===0);
      assert.equal(await page.getByLabel('Rows',{exact:true}).isEnabled(),true);
      await page.getByLabel('Stake (Tokens)').fill('300');await page.getByRole('button',{name:'Drop balls',exact:true}).click();await page.getByRole('alert').filter({hasText:'batch'}).waitFor();assert.equal(posts.length,3);
      state.crash={roundId:'public-round',phase:'betting',serverTime:Date.now(),opensAt:Date.now(),startAt:Date.now()+8000,crashesAt:null,multiplier:100,recent:[],bet:null,participants:[{betId:'a',steamId:'1',displayName:'Mara',avatarUrl:null,stakeTokens:40,status:'pending',cashoutMultiplier:null,payoutTokens:null},{betId:'b',steamId:'2',displayName:'Denis',avatarUrl:null,stakeTokens:50,status:'pending',cashoutMultiplier:null,payoutTokens:null}]};
      await page.getByRole('tab',{name:'Crash',exact:true}).click();await page.getByText('Mara',{exact:true}).waitFor();assert.equal(await page.locator('.crash-participant').count(),2);
      state.crash={...state.crash,phase:'flying',serverTime:Date.now(),startAt:Date.now()-8000,multiplier:161,participants:state.crash.participants.map((p,i)=>({...p,status:i?'active':'cashed_out',cashoutMultiplier:i?null:150,payoutTokens:i?null:60}))};
      await page.getByRole('button',{name:'Refresh balance and rounds'}).click();await page.getByText('60 Tokens returned',{exact:true}).waitFor();
      await page.screenshot({path:`${artifacts}/crash-participants-${width}.png`,fullPage:true});await fitsViewport(page);
      state.crash={...state.crash,phase:'crashed',multiplier:170,crashesAt:Date.now(),participants:state.crash.participants.map(p=>p.status==='active'?{...p,status:'lost',payoutTokens:0}:p)};
      await page.getByRole('button',{name:'Refresh balance and rounds'}).click();await page.getByText('0 Tokens returned',{exact:true}).waitFor();
      state.crash={...state.crash,roundId:'next',phase:'betting',participants:[]};await page.getByRole('button',{name:'Refresh balance and rounds'}).click();await page.getByText('The table is open. Be the first to join.',{exact:true}).waitFor();
      for(const game of ['Blackjack','Slots']){await page.getByRole('tab',{name:game,exact:true}).click();await fitsViewport(page);await page.screenshot({path:`${artifacts}/${game.toLowerCase()}-premium-${width}.png`,fullPage:true});}
      assert.deepEqual(errors,[]);const video=page.video();await context.close();await video.saveAs(`${artifacts}/premium-motion-${width}.webm`);
    }
  } finally {await browser.close();await new Promise(done=>server.close(done));}
});

test('shared recovery finishes incompatible Plinko playback before adopting different rows and risk', async()=>{
  const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {CasinoLobby} from './components/casino/casino-lobby';import './app/casino/casino.css';createRoot(document.getElementById('root')).render(<CasinoLobby initial={${JSON.stringify(initial())}} steamId="recovery-geometry" csrf="current-csrf" themeKey="default"/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,outfile:'recovery.js',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
  const js=bundle.outputFiles.find(file=>file.path.endsWith('.js')).text;
  const css=(await readFile('app/globals.css','utf8')).replace(/^@import[^\r\n]+[\r\n]*/gm,'')+bundle.outputFiles.find(file=>file.path.endsWith('.css')).text;
  const server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':req.url==='/fixture.css'?'text/css':'text/html');res.end(req.url==='/fixture.js'?js:req.url==='/fixture.css'?css:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><main id="root" style="max-width:1200px;margin:auto;padding:16px"></main><script src="/fixture.js"></script></body></html>');});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));const browser=await chromium.launch();
  try{
    const context=await browser.newContext({viewport:{width:1280,height:1000},recordVideo:{dir:artifacts,size:{width:1280,height:1000}}});
    const pages=await Promise.all([context.newPage(),context.newPage()]);const [page,other]=pages;pages.forEach(p=>p.setDefaultTimeout(8000));
    let state=initial(),accepted=0;const receipts=new Map(),requests=[];
    await context.route('**/api/casino/**',async route=>{
      if(route.request().method()==='GET'){await route.fulfill({json:{ok:true,...state}});return;}
      const body=route.request().postDataJSON();requests.push(body);
      if(receipts.has(body.idempotencyKey)){await route.fulfill({json:receipts.get(body.idempotencyKey)});return;}
      accepted++;let draw=0;const details=playPlinkoBatch(body.stake,body.selection.rows,body.selection.risk,body.selection.ballCount,()=>draw++%2);
      const result={...round('plinko',details,details.stakeTokens),id:body.selection.rows===12?'own-twelve':'recovered-eight',payoutTokens:details.payoutTokens};
      state.balance-=result.stakeTokens;state.balance+=result.payoutTokens;state.history.unshift(result);
      const receipt={ok:true,balance:state.balance,round:result};receipts.set(body.idempotencyKey,receipt);
      if(body.selection.rows===8){await route.abort('failed');return;}await route.fulfill({json:receipt});
    });
    await Promise.all(pages.map(p=>p.goto(`http://127.0.0.1:${server.address().port}`)));
    await page.getByRole('tab',{name:'Plinko',exact:true}).click();
    await page.getByRole('button',{name:'Drop ball',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-ball-id="own-twelve:0"]'));
    await page.getByText('Request confirmed. Your balance and rounds have been refreshed.',{exact:true}).waitFor();
    // Seed the complete accepted-but-unconfirmed receipt from the other tab.
    // Existing recovery tests exercise response loss; this case isolates adoption during motion.
    const original={path:'/api/casino/play',payload:{game:'plinko',stake:2,selection:{rows:8,risk:'high',ballCount:2}},key:'recovered-geometry-original'};
    let draw=0;const details=playPlinkoBatch(2,8,'high',2,()=>draw++%2);
    const recovered={...round('plinko',details,details.stakeTokens),id:'recovered-eight',payoutTokens:details.payoutTokens};
    accepted++;state.balance-=recovered.stakeTokens;state.balance+=recovered.payoutTokens;state.history.unshift(recovered);
    receipts.set(original.key,{ok:true,balance:state.balance,round:recovered});
    await other.evaluate(original=>localStorage.setItem(`tapped.casino.pending.v2.recovery-geometry.${original.key}`,JSON.stringify(original)),original);
    await page.getByRole('button',{name:'Retry pending request',exact:true}).waitFor();
    assert.equal(await page.locator('.plinko-board').getAttribute('aria-label'),'12 row Plinko board; 1 balls falling');
    assert.equal(await page.getByLabel('Rows',{exact:true}).inputValue(),'12');
    await page.evaluate(()=>{window.geometryFrames=[];const collect=()=>{const board=document.querySelector('.plinko-board');window.geometryFrames.push({board:board?.getAttribute('aria-label'),ids:[...document.querySelectorAll('.plinko-moving-ball')].map(ball=>ball.dataset.ballId)});window.geometryRaf=requestAnimationFrame(collect);};window.geometryRaf=requestAnimationFrame(collect);});
    const beforeReplay=state.balance;await page.getByRole('button',{name:'Retry pending request',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.plinko-board')?.getAttribute('aria-label')?.startsWith('8 row'));
    assert.equal(await page.locator('[data-ball-id="own-twelve:0"]').count(),0,'old playback finished before board changed');
    assert.equal(await page.getByLabel('Rows',{exact:true}).inputValue(),'8');assert.equal(await page.getByLabel('Risk',{exact:true}).inputValue(),'high');
    assert.equal(await page.getByLabel('Rows',{exact:true}).isDisabled(),true);assert.equal(await page.getByLabel('Risk',{exact:true}).isDisabled(),true);
    const frames=await page.evaluate(()=>{cancelAnimationFrame(window.geometryRaf);return window.geometryFrames;});
    assert.ok(frames.every(frame=>!frame.board?.startsWith('8 row')||frame.ids.every(id=>id.startsWith('recovered-eight:'))),'every drawn 8-row frame must contain only its matching trajectories');
    assert.equal(accepted,2,'financial recovery never creates another wager');assert.equal(state.balance,beforeReplay);assert.equal(requests.length,2);assert.equal(requests[1].idempotencyKey,original.key);assert.deepEqual(requests[1].selection,original.payload.selection);
    await page.locator('.plinko-board').scrollIntoViewIfNeeded();await page.screenshot({path:`${artifacts}/plinko-recovered-geometry.png`,fullPage:true});
    // Risk alone also changes the payout pockets, even when peg rows match.
    const riskOriginal={path:'/api/casino/play',payload:{game:'plinko',stake:2,selection:{rows:8,risk:'low',ballCount:1}},key:'recovered-risk-original'};
    draw=0;const lowDetails=playPlinkoBatch(2,8,'low',1,()=>draw++%2);
    const lowRound={...round('plinko',lowDetails,lowDetails.stakeTokens),id:'recovered-eight-low',payoutTokens:lowDetails.payoutTokens};
    accepted++;state.balance-=lowRound.stakeTokens;state.balance+=lowRound.payoutTokens;state.history.unshift(lowRound);receipts.set(riskOriginal.key,{ok:true,balance:state.balance,round:lowRound});
    await other.evaluate(original=>localStorage.setItem(`tapped.casino.pending.v2.recovery-geometry.${original.key}`,JSON.stringify(original)),riskOriginal);
    await page.getByRole('button',{name:'Retry pending request',exact:true}).waitFor();
    assert.equal(await page.locator('[data-ball-id^="recovered-eight:"]').count(),2);
    const beforeRiskReplay=state.balance;await page.getByRole('button',{name:'Retry pending request',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('select[aria-label=Risk]')?.value==='low');
    assert.equal(await page.locator('[data-ball-id^="recovered-eight:"]').count(),0,'risk-only recovery finishes prior payout-pocket playback');
    await page.waitForFunction(()=>document.querySelector('[data-ball-id="recovered-eight-low:0"]'));
    assert.equal(await page.getByLabel('Rows',{exact:true}).isDisabled(),true);assert.equal(await page.getByLabel('Risk',{exact:true}).isDisabled(),true);
    assert.equal(accepted,3);assert.equal(state.balance,beforeRiskReplay);assert.equal(requests.length,3);assert.equal(requests[2].idempotencyKey,riskOriginal.key);
    await page.waitForFunction(()=>document.querySelectorAll('.plinko-moving-ball').length===0);assert.equal(await page.getByLabel('Rows',{exact:true}).isEnabled(),true);assert.equal(await page.getByLabel('Risk',{exact:true}).isEnabled(),true);
    const video=page.video();await context.close();await video.saveAs(`${artifacts}/plinko-recovered-geometry.webm`);
  }finally{await browser.close();await new Promise(done=>server.close(done));}
});

test('two existing tabs preserve every simultaneous request identity and recover only their own records', async () => {
  const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {CasinoLobby} from './components/casino/casino-lobby'; createRoot(document.getElementById('root')).render(<CasinoLobby initial={${JSON.stringify(initial())}} steamId="player-tabs" csrf={new URLSearchParams(location.search).get('csrf')||'old-csrf'} themeKey="default"/>);`, loader:'tsx',resolveDir:process.cwd() },bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'} });
  const server=createServer((request,response)=>{response.setHeader('content-type',request.url==='/fixture.js'?'text/javascript':'text/html');response.end(request.url==='/fixture.js'?bundle.outputFiles[0].text:'<div id="root"></div><script src="/fixture.js"></script>');});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const url=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser=await chromium.launch();
    for (const loseBoth of [false,true]) {
      const context=await browser.newContext();
      // Storage delivery can lag another tab's click. Hold notifications only
      // until both POSTs arrive to exercise this race deterministically.
      await context.addInitScript(()=>{
        const original=window.addEventListener.bind(window);
        window.__storageEvents=[];
        window.addEventListener=(type,listener,options)=>original(type,type==='storage'?event=>window.__storageEvents.push(()=>listener(event)):listener,options);
      });
      const pages=await Promise.all([context.newPage(),context.newPage()]);
      pages.forEach(page=>page.setDefaultTimeout(5000));
      const receipts=new Map(), requests=[], firstRoutes=[]; let state=initial();
      await context.route('**/api/casino/**',async route=>{
        if(route.request().method()==='GET'){await route.fulfill({json:{ok:true,...state}});return;}
        const body=route.request().postDataJSON();requests.push(body);
        if(receipts.has(body.idempotencyKey)){await route.fulfill({json:receipts.get(body.idempotencyKey)});return;}
        state.balance-=body.stake;
        const result={ok:true,balance:state.balance,round:{...round('roulette',{stakeTokens:body.stake,payoutTokens:0,number:0,color:'green',selection:body.selection}),id:body.idempotencyKey}};
        receipts.set(body.idempotencyKey,result);firstRoutes.push({route,result});
        if(firstRoutes.length===2){await firstRoutes[0].route.abort('failed');if(loseBoth)await firstRoutes[1].route.abort('failed');else await firstRoutes[1].route.fulfill({json:firstRoutes[1].result});}
      });
      await Promise.all(pages.map(page=>page.goto(url)));
      await Promise.all(pages.map(page=>page.getByRole('button',{name:'10 Token chip',exact:true}).click()));
      await Promise.all(pages.map(page=>page.getByRole('button',{name:'Red',exact:true}).click()));
      await Promise.all(pages.map(page=>page.getByRole('button',{name:'Spin wheel'}).click()));
      await pages[0].waitForFunction(()=>document.querySelector('[role="alert"]')||document.body.textContent.includes('Request confirmed.'));
      await pages[1].waitForFunction(()=>document.querySelector('[role="alert"]')||document.body.textContent.includes('Request confirmed.'));
      assert.equal(receipts.size,2,'both initially enabled tabs admitted independently');
      const lostKey=requests[0].idempotencyKey;
      await Promise.all(pages.map(page=>page.evaluate(()=>{for(const deliver of window.__storageEvents.splice(0))deliver();})));
      const expected=loseBoth?2:1;
      await Promise.all(pages.map(page=>page.waitForFunction(n=>document.querySelectorAll('.casino-recovery').length===n,expected)));
      await pages[0].goto(`${url}/?csrf=new-csrf`);
      assert.equal(await pages[0].getByRole('button',{name:'Retry pending request',exact:true}).count(),expected,'reload enumerates every unresolved identity');
      for(let index=0;index<expected;index++) {
        await pages[0].getByRole('button',{name:'Retry pending request',exact:true}).first().click();
        await pages[0].waitForFunction(n=>document.querySelectorAll('.casino-recovery').length===n,expected-index-1);
      }
      assert.equal(receipts.size,2,'recovery never accepts a new wager');
      assert.ok(requests.slice(2).some(body=>body.idempotencyKey===lostKey&&body.csrf==='new-csrf'));
      await pages[1].reload();
      assert.equal(await pages[1].getByRole('button',{name:'Retry pending request',exact:true}).count(),0);
      await context.close();
    }
    for(const method of ['getItem','setItem']) {
      const context=await browser.newContext();
      await context.addInitScript(method=>{Storage.prototype[method]=()=>{throw new DOMException('Storage blocked','SecurityError');};},method);
      const page=await context.newPage();let posts=0;
      await page.route('**/api/casino/**',async route=>{if(route.request().method()==='POST')posts++;await route.fulfill({json:{ok:true,...initial()}});});
      await page.goto(url);
      if(method==='setItem'){await page.getByRole('button',{name:'Red',exact:true}).click();await page.getByRole('button',{name:'Spin wheel'}).click();}
      await page.getByRole('alert').filter({hasText:'storage is unavailable'}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Spin wheel'}).isDisabled(),true);
      assert.equal(posts,0,'inaccessible storage cannot send an unrecoverable wager');
      await context.close();
    }
  } finally {await browser?.close();await new Promise(done=>server.close(done));}
});

test('real casino clients recover accepted wagers across reload, render all games, and fit mobile', async () => {
  const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {CasinoLobby} from './components/casino/casino-lobby'; import './app/casino/casino.css'; const query=new URLSearchParams(location.search); createRoot(document.getElementById('root')).render(<CasinoLobby initial={${JSON.stringify(initial())}} steamId={query.get('account')||'player-1'} csrf={query.get('csrf')||'csrf-one'} themeKey="default"/>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, outfile: 'fixture.js', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' } });
  const javascript = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
  const css = (await readFile('app/globals.css', 'utf8')).replace(/^@import[^\r\n]+[\r\n]*/gm,'') + bundle.outputFiles.find(file => file.path.endsWith('.css')).text;
  const server = createServer((request, response) => {
    response.setHeader('content-type', request.url === '/fixture.js' ? 'text/javascript' : request.url === '/fixture.css' ? 'text/css' : 'text/html');
    response.end(request.url === '/fixture.js' ? javascript : request.url === '/fixture.css' ? css : '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><main id="root" style="max-width:1200px;margin:auto;padding:16px"></main><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${server.address().port}`;
  await mkdir(artifacts, { recursive: true });
  let browser;
  try {
    browser = await chromium.launch();
    for (const width of [1280, 375]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      page.setDefaultTimeout(10000);
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      let state = initial(), accepted = 0, lost = false, refreshes = 0, outage = false, authStatus = 0;
      const requests = [], receipts = new Map();
      await page.route('**/api/casino/**', async route => {
        if (route.request().method() === 'GET') { refreshes++; await route.fulfill({ json: { ok: true, ...state } }); return; }
        const payload = route.request().postDataJSON(); requests.push({ path: new URL(route.request().url()).pathname, ...payload });
        if (authStatus) { await route.fulfill({ status: authStatus, json: { ok: false, message: authStatus === 401 ? 'Sign in with Steam.' : 'Session verification expired.' } }); return; }
        if (outage) { await route.fulfill({ status: 503, json: { ok: false, message: 'SQL storage failure: apply portal migration 037_casino.sql and configure credentials' } }); return; }
        if (receipts.has(payload.idempotencyKey)) { await route.fulfill({ json: receipts.get(payload.idempotencyKey) }); return; }
        let result;
        if (payload.game === 'roulette') {
          accepted++; state.balance -= payload.stake;
          result = round('roulette', { stakeTokens: payload.stake, payoutTokens: 0, number: 0, color: 'green', selection: payload.selection }, payload.stake);
          state.history.unshift(result);
        } else if (payload.game === 'plinko') {
          state.balance -= payload.stake;
          result = round('plinko', { stakeTokens: payload.stake, payoutTokens: 0, rows: payload.selection.rows, risk: payload.selection.risk, path: Array(payload.selection.rows).fill(0), bin: 0, multiplier: 9700, paytable: Array(payload.selection.rows + 1).fill(9700) }, payload.stake);
          state.history.unshift(result);
        } else if (new URL(route.request().url()).pathname.endsWith('/blackjack')) {
          const settled = payload.action !== 'start';
          result = { ...round('blackjack', blackjack(settled ? 'settled' : 'active')), status: settled ? 'settled' : 'active', payoutTokens: settled ? 20 : null };
          state.balance += settled ? 20 : -payload.stake;
          state.activeBlackjack = settled ? null : result;
          if (settled) state.history.unshift(result);
        } else {
          const cashout = new URL(route.request().url()).pathname.endsWith('/cashout');
          state.crash.bet = cashout ? { ...state.crash.bet, status: 'cashed_out', cashoutMultiplier: 125, payoutTokens: 12 } : { id: 'bet-1', roundId: state.crash.roundId, stakeTokens: payload.stake, autoCashout: payload.autoCashout, status: 'pending', cashoutMultiplier: null, payoutTokens: null };
          state.balance += cashout ? 12 : -payload.stake;
          result = round('crash', state.crash.bet);
        }
        const receipt = { ok: true, balance: state.balance, round: result }; receipts.set(payload.idempotencyKey, receipt);
        if (payload.game === 'roulette' && !lost) { lost = true; state.balance += 7; await route.abort('failed'); return; }
        await route.fulfill({ json: receipt });
      });
      await page.goto(url);
      await page.getByRole('tab', { name: 'Roulette', exact: true }).waitFor();
      await page.getByRole('button',{name:'1000 Token chip',exact:true}).click();
      await page.getByRole('button',{name:'Red',exact:true}).click();
      await page.getByRole('button',{name:'Red',exact:true}).click();
      await page.getByRole('button', { name: 'Spin wheel' }).click();
      await page.getByRole('alert').filter({ hasText: 'balance' }).waitFor();
      assert.equal(requests.length, 0);
      await page.getByRole('button',{name:'Clear table',exact:true}).click();
      await page.getByRole('button',{name:'10 Token chip',exact:true}).click();
      await page.getByRole('button',{name:'Red',exact:true}).click();
      await page.getByRole('button', { name: 'Spin wheel' }).click();
      await page.getByRole('button', { name: 'Retry pending request' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Spin wheel' }).isDisabled(), true);
      const durableOriginal = await page.evaluate(() => Object.entries(localStorage).find(([key])=>key.startsWith('tapped.casino.pending.v2.player-1.')));
      assert.ok(durableOriginal,'accepted request has its own durable identity');
      authStatus = width === 1280 ? 403 : 401;
      await page.getByRole('button', { name: 'Retry pending request' }).click();
      await page.getByRole('alert').waitFor();
      assert.equal(await page.evaluate(key => localStorage.getItem(key),durableOriginal[0]), durableOriginal[1], `HTTP${authStatus} must preserve the accepted uncertain request`);
      assert.match(await page.getByRole('alert').textContent(), /reload|sign in/i);
      assert.equal(await page.getByRole('button', { name: 'Spin wheel' }).isDisabled(), true);
      authStatus = 0;
      // An older installed client may have saved this exact request in v1.
      await page.evaluate(([key,value])=>{localStorage.setItem('tapped.casino.pending.v1.player-1',value);localStorage.removeItem(key);},durableOriginal);
      await page.goto(`${url}/?csrf=csrf-two&account=other-player`);
      assert.equal(await page.getByRole('button', { name: 'Retry pending request' }).count(), 0);
      await page.goto(`${url}/?csrf=csrf-two`);
      const beforeReplay = refreshes;
      await page.getByRole('button', { name: 'Retry pending request' }).click();
      await page.locator('.casino-recovery').waitFor({ state: 'hidden' });
      await page.getByText('Request confirmed. Your balance and rounds have been refreshed.', { exact: true }).waitFor();
      await page.getByTestId('token-balance').filter({ hasText: '997' }).waitFor();
      assert.ok(refreshes > beforeReplay, 'same-key replay must fetch actual state after its historical receipt');
      assert.equal(accepted, 1);
      assert.equal(requests[0].idempotencyKey, requests[1].idempotencyKey);
      assert.equal(requests[0].idempotencyKey, requests[2].idempotencyKey);
      assert.deepEqual({ ...requests[0], csrf: null }, { ...requests[2], csrf: null });
      assert.equal(requests[2].csrf, 'csrf-two');
      await fitsViewport(page);
      await page.screenshot({ path: `${artifacts}/roulette-${width}.png`, fullPage: true });
      await page.getByRole('tab', { name: 'Blackjack', exact: true }).click();
      await page.getByLabel('Stake (Tokens)').fill('3');
      await page.getByRole('button', { name: 'Deal cards' }).click();
      await page.getByRole('alert').filter({ hasText: 'even' }).waitFor();
      await page.getByLabel('Stake (Tokens)').fill('10');
      await page.getByRole('button', { name: 'Deal cards' }).click();
      await page.getByLabel('Dealer hole card').waitFor();
      await page.reload();
      await page.getByRole('tab', { name: 'Blackjack', exact: true }).click();
      for (const action of ['Hit', 'Stand', 'Double', 'Split']) assert.equal(await page.getByRole('button', { name: action, exact: true }).isEnabled(), true);
      assert.equal(await page.locator('.casino-card:not(.is-back)').evaluateAll(cards => cards.every(card => [...card.children].every(child => { const a = card.getBoundingClientRect(), b = child.getBoundingClientRect(); return b.top >= a.top && b.left >= a.left && b.bottom <= a.bottom && b.right <= a.right; }))), true, 'all card marks stay inside card bounds');
      await fitsViewport(page);
      await page.screenshot({ path: `${artifacts}/blackjack-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Stand', exact: true }).click();
      await page.getByRole('button', { name: 'Deal cards' }).waitFor();
      await page.getByRole('tab', { name: 'Plinko', exact: true }).click();
      await page.getByRole('button', { name: 'Drop ball' }).click();
      await page.getByTestId('plinko-result').waitFor();
      assert.match(await page.getByTestId('plinko-result').textContent(), /0\.97/);
      await page.waitForFunction(()=>!document.querySelector('select[aria-label=Rows]')?.disabled);
      assert.equal(await page.getByLabel('Rows',{exact:true}).isEnabled(),true,'reduced-motion batches must unlock geometry after immediate landing');
      await fitsViewport(page);
      await page.screenshot({ path: `${artifacts}/plinko-${width}.png`, fullPage: true });
      state.crash = { roundId: 'crash-1', phase: 'betting', serverTime: Date.now(), opensAt: Date.now(), startAt: Date.now() + 8000, crashesAt: null, multiplier: 100, recent: [{ roundId: 'old', multiplier: 175, crashedAt: Date.now() - 10000 }], bet: null };
      await page.getByRole('tab', { name: 'Crash', exact: true }).click();
      await page.getByRole('button', { name: 'Join round' }).waitFor();
      await page.getByLabel('Auto cashout (x)').fill('100');
      await page.getByLabel('Confirm auto cashout target').check();
      await page.getByRole('button', { name: 'Join round' }).click();
      await page.getByRole('alert').filter({ hasText: '99.99' }).waitFor();
      await page.getByLabel('Auto cashout (x)').fill('2.50');
      await page.getByLabel('Confirm auto cashout target').check();
      await page.getByRole('button', { name: 'Join round' }).click();
      await page.getByText('Auto cashout: 2.50x', { exact: true }).waitFor();
      assert.equal(requests.at(-1).autoCashout, 250);
      state.crash = { ...state.crash, phase: 'flying', serverTime: Date.now(), startAt: Date.now() - 3719, multiplier: 125, bet: { ...state.crash.bet, status: 'active' } };
      await page.getByRole('button', { name: 'Cash out', exact: true }).waitFor();
      const beforePoll = refreshes;
      await new Promise((done, reject) => { const started = Date.now(); const timer = setInterval(() => { if (refreshes > beforePoll) { clearInterval(timer); done(); } else if (Date.now() - started > 5000) { clearInterval(timer); reject(new Error('Crash did not poll while visible')); } }, 25); });
      assert.match(await page.getByTestId('crash-multiplier').textContent(), /^1\.\d{2}x$/);
      await fitsViewport(page);
      await page.screenshot({ path: `${artifacts}/crash-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Cash out', exact: true }).click();
      assert.equal(requests.at(-1).path, '/api/casino/crash/cashout');
      assert.equal('multiplier' in requests.at(-1), false);
      assert.equal('time' in requests.at(-1), false);
      state.settings.enabled = false;
      await page.getByRole('tab', { name: 'Roulette', exact: true }).click();
      await page.getByRole('button', { name: 'Refresh balance and rounds' }).click();
      await page.getByText('New wagers are paused.', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Spin wheel' }).isDisabled(), true);
      state.activeBlackjack = { ...round('blackjack', blackjack()), status: 'active', payoutTokens: null };
      state.settings.minBet = 3; state.settings.maxBet = 101;
      await page.getByRole('button', { name: 'Refresh balance and rounds' }).click();
      await page.getByRole('tab', { name: 'Blackjack', exact: true }).click();
      await page.getByRole('button', { name: 'Hit', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Hit', exact: true }).isEnabled(), true);
      assert.equal(await page.getByRole('button', { name: 'Stand', exact: true }).isEnabled(), true);
      assert.equal(await page.getByRole('button', { name: 'Double', exact: true }).isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: 'Split', exact: true }).isDisabled(), true);
      await page.getByRole('button', { name: 'Stand', exact: true }).click();
      await page.getByRole('button', { name: 'Deal cards' }).waitFor();
      assert.equal(await page.getByLabel('Stake (Tokens)').getAttribute('min'), '4');
      assert.equal(await page.getByLabel('Stake (Tokens)').getAttribute('max'), '100');
      state.settings.minBet = 2; state.settings.maxBet = 10000;
      state.crash.bet = { ...state.crash.bet, status: 'active', payoutTokens: null, cashoutMultiplier: null };
      await page.getByRole('tab', { name: 'Crash', exact: true }).click();
      await page.getByRole('button', { name: 'Cash out', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Cash out', exact: true }).isEnabled(), true);
      await page.getByRole('button', { name: 'Cash out', exact: true }).click();
      await page.getByText(/Cashed out at 1.25x/).waitFor();
      await page.getByRole('tab', { name: 'Slots', exact: true }).click();
      const slots = page.getByRole('tabpanel');
      for (const name of ['Dazzling Hot', 'Burning Hot', 'Shining Crown', 'Sweet Bonanza']) await slots.getByText(name, { exact: true }).waitFor();
      assert.equal(await slots.locator('button,input,iframe').count(), 0);
      assert.match(await slots.textContent(), /unavailable/i);
      await fitsViewport(page);
      await page.screenshot({ path: `${artifacts}/slots-${width}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('.casino-stage').count(), 0);
      await page.getByRole('tab', { name: 'Roulette', exact: true }).click();
      assert.equal(await page.locator('.roulette-wheel').evaluate(el => getComputedStyle(el).animationName), 'none');
      await page.getByRole('tab', { name: 'Roulette', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.getByRole('tab', { name: 'Blackjack', exact: true }).getAttribute('aria-selected'), 'true');
      await page.keyboard.press('End');
      assert.equal(await page.getByRole('tab', { name: 'Slots', exact: true }).getAttribute('aria-selected'), 'true');
      state.settings.enabled = true;
      await page.getByRole('button', { name: 'Refresh balance and rounds' }).click();
      await page.getByText('Tables open', { exact: true }).waitFor();
      await page.getByRole('tab', { name: 'Roulette', exact: true }).click();
      outage = true;
      await page.getByRole('button',{name:'10 Token chip',exact:true}).click();
      await page.getByRole('button',{name:'Red',exact:true}).click();
      await page.getByRole('button', { name: 'Spin wheel' }).click();
      await page.getByRole('button', { name: 'Retry pending request' }).waitFor();
      assert.match(await page.getByRole('alert').textContent(), /temporarily unavailable/);
      assert.doesNotMatch(await page.locator('body').textContent(), /SQL|037_casino|credentials/);
      assert.equal(await page.getByRole('button', { name: 'Spin wheel' }).isDisabled(), true);
      const outageKey = requests.at(-1).idempotencyKey;
      outage = false;
      await page.getByRole('button', { name: 'Retry pending request' }).click();
      await page.locator('.casino-recovery').waitFor({ state: 'hidden' });
      assert.equal(requests.at(-1).idempotencyKey, outageKey);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});

test('Blackjack fresh state supersedes active receipts after immediate, polled, and replayed settlement', async () => {
  const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {CasinoLobby} from './components/casino/casino-lobby';import './app/casino/casino.css';createRoot(document.getElementById('root')).render(<CasinoLobby initial={${JSON.stringify(initial())}} steamId="blackjack-player" csrf="current-csrf" themeKey="default"/>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, outfile: 'blackjack.js', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' } });
  const javascript = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
  const css = (await readFile('app/globals.css', 'utf8')).replace(/^@import[^\r\n]+[\r\n]*/gm,'') + bundle.outputFiles.find(file => file.path.endsWith('.css')).text;
  const server = createServer((request, response) => { response.setHeader('content-type', request.url === '/blackjack.js' ? 'text/javascript' : request.url === '/blackjack.css' ? 'text/css' : 'text/html'); response.end(request.url === '/blackjack.js' ? javascript : request.url === '/blackjack.css' ? css : '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/blackjack.css"></head><body><main id="root" style="max-width:1200px;margin:auto;padding:16px"></main><script src="/blackjack.js"></script></body></html>'); });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch();
    for (const mode of ['receipt', 'poll', 'replay']) {
      const page = await browser.newPage({ viewport: { width: 375, height: 1000 }, reducedMotion: 'reduce' });
      page.setDefaultTimeout(10000);
      let state = initial(), accepted = 0, receipt = null, requests = [];
      const settle = () => {
        const table = state.activeBlackjack.details, stake = table.totalStakeTokens;
        const details = { ...blackjack('settled'), hands: table.hands.map(hand => ({ ...hand, status: 'stood' })), currentHand: table.hands.length, totalStakeTokens: stake, payoutTokens: stake * 2, dealer: { cards: [{ rank: '6', suit: 'clubs' }, { rank: 'K', suit: 'hearts' }, { rank: '10', suit: 'diamonds' }], total: 26, soft: false } };
        state.history = [{ ...round('blackjack', details, stake), payoutTokens: stake * 2 }];
        state.activeBlackjack = null; state.balance = 1000 + stake;
      };
      await page.route('**/api/casino/**', async route => {
        if (route.request().method() === 'GET') { await route.fulfill({ json: { ok: true, ...state } }); return; }
        const payload = route.request().postDataJSON(); requests.push(payload);
        if (!receipt) {
          accepted++;
          state.activeBlackjack = { ...round('blackjack', blackjack()), status: 'active', payoutTokens: null };
          state.balance = 990; receipt = { ok: true, balance: 990, round: state.activeBlackjack };
          if (mode === 'receipt') settle();
          if (mode === 'replay') { await route.abort('failed'); return; }
        }
        await route.fulfill({ json: receipt });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.getByRole('tab', { name: 'Blackjack', exact: true }).click();
      await page.getByLabel('Stake (Tokens)').fill('10');
      await page.getByRole('button', { name: 'Deal cards' }).click();
      if (mode === 'poll') {
        await page.getByRole('button', { name: 'Stand', exact: true }).waitFor();
        await page.getByText('Request confirmed. Your balance and rounds have been refreshed.', { exact: true }).waitFor();
        // Simulate the persisted result of a four-hand split, including a long card row.
        const publicTable = state.activeBlackjack.details;
        publicTable.hands = Array.from({ length: 4 }, (_, index) => ({ ...blackjack().hands[0], split: true, cards: index === 0 ? Array.from({ length: 10 }, () => ({ rank: '2', suit: 'clubs' })) : blackjack().hands[0].cards, total: index === 0 ? 20 : 16 }));
        publicTable.totalStakeTokens = 40; publicTable.availableActions = ['hit', 'stand'];
        state.activeBlackjack.stakeTokens = 40; state.balance = 960;
        await page.getByRole('button', { name: 'Refresh balance and rounds' }).click();
        await page.locator('.blackjack-hand').nth(3).waitFor();
        await fitsViewport(page);
        await page.screenshot({ path: `${artifacts}/blackjack-split-375.png`, fullPage: true });
        settle(); // The next ordinary five-second table poll must remove obsolete active controls.
      } else if (mode === 'replay') {
        await page.getByRole('button', { name: 'Retry pending request' }).waitFor();
        settle();
        await page.getByRole('button', { name: 'Retry pending request' }).click();
      }
      await page.getByRole('img', { name: 'K of hearts', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Deal cards' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Deal cards' }).isEnabled(), true);
      assert.equal(await page.getByRole('img', { name: 'Dealer hole card', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Stand', exact: true }).count(), 0);
      assert.match(await page.locator('.casino-result-note').textContent(), mode === 'poll' ? /Returned 80 Tokens/ : /Returned 20 Tokens/);
      assert.equal(await page.getByTestId('token-balance').textContent(), mode === 'poll' ? '1,040' : '1,010');
      assert.equal(accepted, 1);
      if (mode === 'replay') assert.equal(requests[0].idempotencyKey, requests[1].idempotencyKey);
      await fitsViewport(page);
      await page.screenshot({ path: `${artifacts}/blackjack-settled-${mode}-375.png`, fullPage: true });
      await page.close();
    }
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});

test('real casino server page fails closed with wallet, inherits one account nav, and requires Steam', async () => {
  const modules = {
    '@/lib/auth/session': `export async function getSession(){return new URLSearchParams(location.search).has('signedout')?null:{steamId:'player-1',profileThemeKey:'default'}}; export function createEconomyActionToken(){throw Error('No CSRF should be created for the unavailable page')}`,
    '@/lib/data/casino-repository': `export async function getCasinoBootstrap(){throw Error('SQL storage failure: run db/037_casino.sql and configure credentials')}`,
    '@/lib/data/portal-repository': `export async function getTokenWallet(){if(new URLSearchParams(location.search).has('walletmissing'))throw Error('Wallet missing');return {balance:1250}}`,
    '@/components/site-header': `import React from 'react';import {AccountNav} from './components/account-nav';export function SiteHeader({authenticated}){return <header>{authenticated?<AccountNav profileHref="/players/player-1" themeKey="default"/>:<a href="/">TAPPED.RO</a>}</header>}`,
    'next/link': `import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`,
    'next/navigation': `export const usePathname=()=>'/casino';`,
  };
  const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import CasinoPage,{metadata} from './app/casino/page';window.fixtureMetadata=metadata;CasinoPage().then(page=>createRoot(document.getElementById('root')).render(page));`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, outfile: 'page.js', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'page-server-boundaries', setup(builder) { builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(modules, args.path) ? { path: args.path, namespace: 'page-fixture' } : undefined); builder.onLoad({ filter: /.*/, namespace: 'page-fixture' }, args => ({ contents: modules[args.path], loader: 'tsx', resolveDir: process.cwd() })); } }] });
  const javascript = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
  const css = (await readFile('app/globals.css', 'utf8')).replace(/^@import[^\r\n]+[\r\n]*/gm,'') + bundle.outputFiles.find(file => file.path.endsWith('.css')).text;
  const server = createServer((request, response) => { response.setHeader('content-type', request.url === '/page.js' ? 'text/javascript' : request.url === '/page.css' ? 'text/css' : 'text/html'); response.end(request.url === '/page.js' ? javascript : request.url === '/page.css' ? css : '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"></head><body><div id="root"></div><script src="/page.js"></script></body></html>'); });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch();
    for (const width of [1280, 375]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.getByRole('heading', { name: 'Tables are temporarily unavailable.' }).waitFor();
      await page.getByText('1,250', { exact: true }).waitFor();
      assert.equal(await page.getByRole('navigation', { name: 'Account navigation' }).count(), 1);
      const casinoLink = page.getByRole('link', { name: 'Casino', exact: true });
      assert.equal(await casinoLink.getAttribute('href'), '/casino');
      assert.equal(await casinoLink.getAttribute('aria-current'), 'page');
      assert.deepEqual(await page.evaluate(() => window.fixtureMetadata.robots), { index: false, follow: false });
      assert.equal(await page.evaluate(() => window.fixtureMetadata.alternates.canonical), '/casino');
      assert.equal(await page.getByRole('tablist').count(), 0);
      assert.equal(await page.getByLabel('Stake (Tokens)').count(), 0);
      assert.doesNotMatch(await page.locator('body').textContent(), /SQL|db\/037|credentials|CSRF/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `${artifacts}/unavailable-${width}.png`, fullPage: true });
      await page.goto(`http://127.0.0.1:${server.address().port}/?walletmissing=1`);
      await page.getByRole('heading', { name: 'Tables are temporarily unavailable.' }).waitFor();
      assert.equal(await page.getByText('1,250', { exact: true }).count(), 0);
      await page.goto(`http://127.0.0.1:${server.address().port}/?signedout=1`);
      await page.getByRole('link', { name: 'Sign in with Steam' }).waitFor();
      assert.equal(await page.getByRole('navigation', { name: 'Account navigation' }).count(), 0);
      assert.equal(await page.getByRole('tablist').count(), 0);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});
