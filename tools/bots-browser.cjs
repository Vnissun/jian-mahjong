const path=require('node:path'),assert=require('node:assert/strict');
let pw;try{pw=require('playwright');}catch{pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const {createServer}=require('../server/server.cjs');
let browser,server;
(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 browser=await pw.chromium.launch({channel:'msedge',headless:true});const pages=[],errors=[];
 const read=page=>page.evaluate(async()=>{const cc=await System.import('cc');return cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friend?.state;});
 const wait=async(page,predicate)=>{const until=Date.now()+18000;while(Date.now()<until){const s=await read(page);if(s&&predicate(s))return s;await page.waitForTimeout(100);}throw Error('等待房间状态超时');};
 const open=async url=>{const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.fill('#password','CHANGE_ME_ACCESS_PASSWORD');await page.click('#login button');await page.waitForTimeout(5000);return page;};
 const click=async(page,nodePath)=>{const pos=await page.evaluate(async nodePath=>{const cc=await System.import('cc');let n=cc.director.getScene().getChildByName('Canvas');for(const key of nodePath.split('/'))n=n.getChildByName(key);if(!n.activeInHierarchy)throw Error('按钮不可见 '+nodePath);return {x:n.worldPosition.x,y:720-n.worldPosition.y};},nodePath);await page.mouse.click(pos.x,pos.y);};
 const nickname=async(page,name)=>page.evaluate(async name=>{const cc=await System.import('cc');cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friendPanel.nickname.string=name;},name);
 const waiting='FriendRoomPanel/FriendRoom/Waiting/';
 const a=await open(base);await click(a,'Lobby/Lobby/CreateFriend');await nickname(a,'房主甲');await click(a,'FriendRoomPanel/FriendRoom/Entry/Enter');const state=await wait(a,s=>s.members.length===1),code=state.code;
 await click(a,waiting+'AddBot');await wait(a,s=>s.members.filter(m=>m.isBot).length===1);await a.screenshot({path:'screenshots/bot-room-owner.png'});
 await click(a,waiting+'RemoveBot-south');await wait(a,s=>s.members.length===1);
 const b=await open(base+'/?room='+code);await nickname(b,'好友乙');await click(b,'FriendRoomPanel/FriendRoom/Entry/Enter');await wait(b,s=>s.members.length===2);await wait(a,s=>s.members.length===2);
 const guestControls=await b.evaluate(async()=>{const cc=await System.import('cc'),p=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friendPanel;return {add:p.addBot.active,remove:p.memberRows.some(r=>r.remove.active),start:p.startButton.active};});assert.deepEqual(guestControls,{add:false,remove:false,start:false});
 await click(a,waiting+'AddBot');await wait(a,s=>s.members.length===3);await a.screenshot({path:'screenshots/bot-room-two-friends.png'});
 for(const page of pages)await click(page,waiting+'Ready');await wait(a,s=>s.members.every(m=>m.ready));await click(a,waiting+'StartRoom');await wait(a,s=>s.phase==='playing'&&s.members.length===4&&s.members.filter(m=>m.isBot).length===2);await wait(b,s=>s.phase==='playing');
 const r=server.rooms.get(code);let moves=0,automaticTurns=0;
 while(r.phase==='playing'&&moves++<1400){
  if(r.pendingAI){r.tick(r.pendingAI.due+1);automaticTurns++;await wait(a,s=>s.revision>=r.revision);}
  else{const actor=r.prompt.playerId,page=(await read(a)).localId===actor?a:b;await wait(page,s=>s.revision>=r.revision);await page.evaluate(async()=>{const cc=await System.import('cc'),app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),s=app.friend.state,o=s.prompt,p=app.session.getPlayerById(s.localId);if(!o)throw Error('真人行动丢失');if(o.kind==='beforeGang')await app.friend.action('beforeGang');else if(o.kind==='claim')await app.friend.action(o.claimOptions[0]?'win':'pass');else if(o.options.canWin)await app.friend.action('win');else await app.friend.action('discard',{tileId:o.drawn?.id??p.hand[0].id});});await wait(a,s=>s.revision>=r.revision);}
 }
 assert.notEqual(r.phase,'playing');assert(automaticTurns>0);for(const p of pages)await wait(p,s=>['settled','finished'].includes(s.phase));await a.screenshot({path:'screenshots/bot-room-settlement.png'});
 const sa=await read(a),sb=await read(b);assert.deepEqual(sa.players.map(p=>p.score),sb.players.map(p=>p.score));assert.equal(sa.players.reduce((n,p)=>n+p.score,0),0);assert(sa.members.filter(m=>m.isBot).every(m=>m.ready));
 for(const page of pages)await page.evaluate(async()=>{const cc=await System.import('cc'),app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),s=app.friend.state;for(const p of s.players){if(p.hand.some(t=>t.id<0))throw Error('结算手牌未公开');const area=app.table.getArea(p.seat);if([...area.handRow.children,...area.meldsRow.children].some(n=>n.getComponent('TileView')?.isFaceDown))throw Error('牌桌未摊开');}});
 if(r.phase==='settled'){for(const page of pages)await page.evaluate(async()=>{const cc=await System.import('cc');cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').settlement.onNext();});await wait(a,s=>s.phase==='playing');await wait(b,s=>s.phase==='playing');}
 assert.deepEqual(errors,[]);console.log('Two friends + bots browser passed',JSON.stringify({code,moves,automaticTurns,scores:sa.players.map(p=>p.score),ownerControls:true,guestControls:false,nextRound:true,errors}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
