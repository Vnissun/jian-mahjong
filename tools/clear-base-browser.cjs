const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const {createServer}=require('../server/server.cjs'),{settledFixture}=require('../server/clear-base-test.cjs');
let server,browser,alive;
(async()=>{
 server=createServer({accessPassword:false,testAdminPassword:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,errors=[];
 alive=setInterval(()=>{for(const r of server.rooms.values())r.members.forEach(m=>m.lastSeen=Date.now());},500);
 browser=await chromium.launch({channel:'msedge',headless:true});const pages=[];
 for(const mobile of [false,true]){const c=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,...(mobile?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'}:{})}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);pages.push(p);}
 await Promise.all(pages.map(async p=>{await p.waitForTimeout(5500);await p.evaluate(async()=>window.cc=await System.import('cc'));await p.waitForFunction(()=>!!window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('GameApp')?.lobby);}));
 for(const four of [false,true]){
  const {r,p}=settledFixture(four);r.tick=()=>{};server.rooms.set(r.code,r);
  await Promise.all(pages.map((page,i)=>page.evaluate(async m=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');a.friend?.stop();a.friend=null;a.session=null;a.settlement.hide();a.voiceChat?.setSession(null);localStorage.setItem('mahjong-room-123456',m.token);await a.enterFriend(m.name,'123456');},r.members[i])));
  for(const page of pages){
   await page.waitForFunction(()=>window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').settlement.node.active);
   const detail=await page.evaluate(async id=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),factors=a.settlement.content.children.filter(n=>n.name.startsWith('Factors-')).map(n=>n.getComponent(window.cc.Label).string),engine=await System.import('chunks:///_virtual/SettlementEngine.ts'),ctx={winner:a.session.getPlayerById(id),allPlayers:a.session.players,winTiles:a.session.getPlayerById(id).hand,winMode:'selfDraw',currentDealer:'east',roomConfig:a.session.config};return {factors,local:engine.computeWinMultiplier(ctx,a.session.getPlayer('west')).breakdown,scores:a.friend.state.players.map(p=>p.score)};},p.id);
   assert(detail.factors.length===3);assert(detail.factors.every(s=>s.includes(four?'四家清 ×16':'三家清 ×4')&&!s.includes('站立')));
   assert.equal(detail.local.winnerStandingMul,1);assert.equal(detail.local.payerStandingMul,1);assert.equal(detail.local[four?'siJiaQingMul':'sanJiaQingMul'],four?16:4);assert.deepEqual(detail.scores,r.game.players.map(p=>p.score));
  }
  r.voice.close();r.bump();server.rooms.delete(r.code);console.log('PASS desktop + phone settlement factors and browser local engine: '+(four?'四家清16':'三家清4')+' with no extra standing');
 }
 assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{clearInterval(alive);await browser?.close();server?.closeAllConnections?.();if(server)await new Promise(r=>server.close(r));});
