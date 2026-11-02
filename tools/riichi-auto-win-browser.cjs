const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const {createServer}=require('../server/server.cjs'),{fixture,gangPreviewFixture,conserved}=require('../server/riichi-auto-win-test.cjs');
const {fixture:supplementFixture}=require('../server/supplement-claims-test.cjs');
let server,browser,keepAlive;
(async()=>{
 server=createServer({accessPassword:false,testAdminPassword:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,errors=[];
 keepAlive=setInterval(()=>{for(const r of server.rooms.values())r.members.forEach(m=>m.lastSeen=Date.now());},500);
 browser=await chromium.launch({channel:'msedge',headless:true});const pages=[];
 for(const mobile of [false,true]){const c=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,...(mobile?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'}:{})}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);pages.push(p);}
 await Promise.all(pages.map(async p=>{await p.waitForTimeout(5500);await p.evaluate(async()=>window.cc=await System.import('cc'));await p.waitForFunction(()=>!!window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('GameApp')?.lobby);}));
 const bind=async r=>{r.tick=()=>r.finishDueSelfWin();server.rooms.set(r.code,r);await Promise.all(pages.map((page,i)=>page.evaluate(async member=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');a.friend?.stop();a.friend=null;a.session=null;a.settlement.hide();a.voiceChat?.setSession(null);a.lastSoundSequence=null;localStorage.setItem('mahjong-room-123456',member.token);await a.enterFriend(member.name,'123456');},r.members.map(m=>({token:m.token,name:m.name}))[i])));};
 const unbind=async r=>{await Promise.all(pages.map(page=>page.evaluate(()=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');a.friend.stop();a.friend=null;a.voiceChat?.setSession(null);})));r.voice.close();r.bump();server.rooms.delete(r.code);};
 async function click(page,name){const pos=await page.evaluate(name=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),n=a.actions.node.getChildByName(name);if(!n?.activeInHierarchy)throw Error('Inactive '+name);const el=document.getElementById('GameCanvas'),r=el.getBoundingClientRect(),p=a.node.getComponent(window.cc.Canvas).cameraComponent.worldToScreen(n.worldPosition);return {x:r.left+p.x/el.width*r.width,y:r.top+(el.height-p.y)/el.height*r.height};},name);await page.mouse.click(pos.x,pos.y);}
 async function settled(r,winner){await Promise.all(pages.map(page=>page.waitForFunction(()=>['settled','finished'].includes(window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friend.state.phase))));for(const page of pages){const actual=await page.evaluate(()=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');return {prompt:a.friend.state.prompt,mode:a.friend.state.result.mode,visible:a.settlement.node.active&&a.settlement.shade.active,players:a.friend.state.players.map(p=>p.score)};});assert.equal(actual.prompt,null);assert.equal(actual.mode,'selfDraw');assert(actual.visible);assert.deepEqual(actual.players,r.game.players.map(p=>p.score));}assert(winner.state.isWon);conserved(r.game);}
 for(const spec of [{},{qi:3}]){
  const {r,g,p,next}=fixture(spec);await bind(r);const tile=g.players[0].hand.find(t=>t.suit+':'+t.rank!=='yuan:3');
  await pages[0].evaluate(async id=>{await window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friend.action('discard',{tileId:id});},tile.id);
  await pages[1].waitForFunction(()=>!!window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friend.state.autoSelfWin);
  const preview=await pages[1].evaluate(()=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');return {drawn:a.drawn?.id,last:a.table.getArea(a.table.localSeat).handRow.children.at(-1).getComponent('TileView').tile.id,win:a.actions.node.getChildByName('win').activeInHierarchy,discard:a.actions.node.getChildByName('discard').activeInHierarchy,caption:a.table.node.getChildByName('Message').getComponent(window.cc.Label).string};});
  assert.equal(preview.drawn,next.id);assert.equal(preview.last,next.id);assert(preview.win&&preview.discard);assert(preview.caption.includes('秒后自动胡牌'));assert.equal(r.result,null);
  await pages[1].screenshot({path:'screenshots/riichi-five-second-preview-mobile.png'});await pages[1].waitForTimeout(1000);assert.equal(r.result,null);
  await settled(r,p);assert(!p.discards.some(t=>t.id===next.id));await pages[1].screenshot({path:'screenshots/riichi-auto-win-'+(spec.qi?'luxury':'normal')+'-mobile.png'});console.log('PASS new draw visible for 5s with win/discard enabled -> automatic settlement on desktop and phone',spec);await unbind(r);
 }
 for(const action of ['win','discard']){
  const {r,g,p,next}=fixture();await bind(r);const tile=g.players[0].hand.find(t=>t.suit+':'+t.rank!=='yuan:3');await pages[0].evaluate(async id=>{await window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friend.action('discard',{tileId:id});},tile.id);
  await pages[1].waitForFunction(()=>!!window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friend.state.autoSelfWin);
  if(action==='discard')await pages[1].evaluate(()=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');a.selected=a.drawn;});
  await click(pages[1],action);await pages[1].waitForFunction(()=>!window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friend.state.autoSelfWin);
  const scores=JSON.stringify(g.players.map(p=>p.score));if(action==='win'){assert(p.state.isWon);assert.equal(r.result.mode,'selfDraw');}else{assert(!p.state.isWon);assert(p.discards.some(t=>t.id===next.id));}
  await pages[1].waitForTimeout(5200);assert.equal(JSON.stringify(g.players.map(p=>p.score)),scores);conserved(g);console.log('PASS clicking',action,'in phone preview executes and cancels old timer');await unbind(r);
 }
 for(const choice of ['pass','win']){
  const {r,g,p,winning}=fixture();const east=g.players[0],idx=g.wall.drawStack.findIndex(t=>t.id===winning.id);g.wall.drawStack.splice(idx,1);east.hand.push(winning);const replacement=east.hand.find(t=>t.id!==winning.id);east.hand=east.hand.filter(t=>t.id!==replacement.id);g.wall.drawStack.push(replacement);g.lastDrawn=winning;r.prompt.drawn=winning;
  await bind(r);await pages[0].evaluate(async id=>{await window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friend.action('discard',{tileId:id});},winning.id);
  await pages[1].waitForFunction(()=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');return a.friend.state.prompt?.kind==='claim'&&a.actions.node.getChildByName('win')?.activeInHierarchy&&a.actions.node.getChildByName('pass')?.activeInHierarchy;});assert.equal(r.result,null);await click(pages[1],choice);
  if(choice==='win'){await pages[1].waitForFunction(()=>window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friend.state.result?.mode==='dianPao');assert(p.state.isWon);}else{assert.equal(r.result,null);assert(!p.state.isWon);}conserved(g);console.log('PASS phone can choose',choice,'on somebody else discard');await unbind(r);
 }
 {
  const {r,g,p,bonus}=gangPreviewFixture();await bind(r);const old=r.pendingSelfWinTimer.action,oldDue=r.pendingSelfWinTimer.due;
  await click(pages[0],'gang');await pages[0].waitForFunction(()=>!!window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').actions.node.getChildByName('GangChoice0'));await click(pages[0],'GangChoice0');
  await pages[0].waitForFunction(id=>window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friend.state.prompt?.drawn?.id===id,bonus.id);
  assert.equal(g.lastDrawn.id,bonus.id);assert(r.pendingSelfWinTimer.due>=oldDue);assert.equal(old(),false);await settled(r,p);assert.equal(r.gangs.length,1);console.log('PASS legal gang/supplement button during preview -> new draw -> fresh 5s timer');await unbind(r);
 }
 {
  const {r,g,p}=supplementFixture({claim:'none'});await bind(r);await pages[0].evaluate(async id=>{await window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friend.action('supplement',{meldIndex:0,tileId:id});},g.lastDrawn.id);await settled(r,p);assert.equal(r.gangs.length,1);console.log('PASS riichi supplement -> automatic self-win, gang settled once');await unbind(r);
 }
 assert.deepEqual(errors,[]);console.log('Riichi automatic self-win live browser suite passed');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{clearInterval(keepAlive);await browser?.close();server?.closeAllConnections?.();if(server)await new Promise(r=>server.close(r));});
