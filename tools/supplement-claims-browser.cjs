const path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const {createServer}=require('../server/server.cjs'),{fixture,countTiles}=require('../server/supplement-claims-test.cjs');
let server,browser,keepAlive;
(async()=>{
 server=createServer({accessPassword:false,testAdminPassword:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,errors=[];
 keepAlive=setInterval(()=>{for(const r of server.rooms.values())r.members.forEach(m=>m.lastSeen=Date.now());},500);
 browser=await chromium.launch({channel:'msedge',headless:true});const pages=[];
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,...(mobile?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'}:{})}),page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 }
 await Promise.all(pages.map(async p=>{await p.waitForTimeout(5500);await p.evaluate(async()=>window.cc=await System.import('cc'));await p.waitForFunction(()=>!!window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('GameApp')?.lobby);}));
 const app=()=>window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');
 async function click(page,name){const point=await page.evaluate(name=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),n=a.actions.node.getChildByName(name);if(!n?.activeInHierarchy)throw Error('Inactive action '+name);const el=document.getElementById('GameCanvas'),r=el.getBoundingClientRect(),camera=a.node.getComponent(window.cc.Canvas).cameraComponent,p=camera.worldToScreen(n.worldPosition);return {x:r.left+p.x/el.width*r.width,y:r.top+(el.height-p.y)/el.height*r.height};},name);await page.mouse.click(point.x,point.y);}
 async function wait(page,predicate){await page.waitForFunction(predicate,null,{timeout:12000});}
 for(const family of ['winds','dragons'])for(const outcome of ['peng','pass','win']){
  const {r,g,p,q,extra}=fixture({family,claim:outcome==='win'?'win':'peng',robberReady:outcome==='win'});server.rooms.set(r.code,r);r.tick();
  await Promise.all(pages.map((page,i)=>page.evaluate(async member=>{
   const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');a.friend?.stop();a.friend=null;a.session=null;a.settlement.hide();a.voiceChat?.setSession(null);a.lastSoundSequence=null;localStorage.setItem('mahjong-room-123456',member.token);await a.enterFriend(member.name,'123456');
  },{token:r.members[i].token,name:r.members[i].name})));
  await wait(pages[0],()=>window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').actions.node.getChildByName('gang')?.activeInHierarchy);
  await click(pages[0],'gang');await wait(pages[0],()=>!!window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').actions.node.getChildByName('GangChoice0'));await click(pages[0],'GangChoice0');
  await wait(pages[1],()=>window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friend.state.prompt?.kind==='claim');
  const shown=await pages[1].evaluate(()=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),n=a.table.node.getChildByName('PendingGangClaim'),v=n.getChildByName('Tile').getComponent('TileView');return {visible:n.activeInHierarchy,tile:v.tile,down:v.isFaceDown,buttons:a.actions.node.children.filter(n=>n.activeInHierarchy).map(n=>n.name),message:a.table.node.getChildByName('Message').getComponent(window.cc.Label).string,hidden:a.friend.state.players.filter(p=>p.id!==a.friend.state.localId).every(p=>p.hand.every(t=>t.id<0))};});
  assert(shown.visible&&!shown.down&&shown.hidden);assert.equal(shown.tile.id,extra.id);assert(!shown.buttons.includes('chi')&&!shown.buttons.includes('gang'));assert(shown.message.includes('补毛'));
  assert.equal(p.melds[0].tiles.length,4);assert.equal(g.wall.kongIndex,0);countTiles(g);
  const forced=await pages[1].evaluate(async ({revision,ids})=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');const res=await fetch('/api/rooms/123456/action',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+a.friend.token},body:JSON.stringify({type:'chi',tileIds:ids,revision,requestId:crypto.randomUUID()})});return res.status;},{revision:r.revision,ids:q.hand.slice(0,2).map(t=>t.id)});assert.equal(forced,400);
  await pages[1].waitForTimeout(200);await pages[1].screenshot({path:'screenshots/supplement-'+family+'-'+outcome+'-mobile.png'});
  await click(pages[1],outcome==='pass'?'pass':outcome);
  if(outcome==='win'){
   await Promise.all(pages.map(page=>wait(page,()=>['settled','finished'].includes(window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friend.state.phase))));assert.equal(r.result.mode,'robbingGang');assert.equal(g.wall.kongIndex,0);assert.equal(r.gangs.length,0);
  }else{
   await Promise.all(pages.map(page=>wait(page,()=>!window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friend.state.gangClaim)));
   assert.equal(g.wall.kongIndex,outcome==='pass'?1:0);assert.equal(p.melds[0].tiles.length,outcome==='pass'?5:4);if(outcome==='peng')assert(q.melds[0].tiles.some(t=>t.id===extra.id));
  }
  countTiles(g);assert.deepEqual(errors,[]);console.log('PASS real HTTP + desktop owner + mobile responder:',family,outcome,'no chi, hidden hands preserved, 136 unique tiles');
  await Promise.all(pages.map(page=>page.evaluate(()=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');a.friend.stop();a.friend=null;a.voiceChat?.setSession(null);})));server.rooms.delete(r.code);r.voice.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{clearInterval(keepAlive);await browser?.close();server?.closeAllConnections?.();if(server)await new Promise(r=>server.close(r));});
