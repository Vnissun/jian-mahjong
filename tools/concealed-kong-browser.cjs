const assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const {createServer}=require('../server/server.cjs');
const {FriendRoom}=require('../server/rooms.cjs'),{HandControl}=require('../server/hand-control.cjs');
const seats=['east','south','west','north'];let server,browser;
function fixture(seat){
 const r=new FriendRoom('123456','东家');for(const name of ['南家','西家','北家'])r.add(name);
 r.handControl=new HandControl(seat);
 r.handControl.setOpening('tong:2 tong:2 tong:2 tong:2 wan:1 wan:2 wan:3 tiao:7 tiao:8 tiao:9 yuan:1 yuan:1 yuan:1',seat==='east'?'feng:1':null);
 r.members.forEach(m=>m.ready=true);r.start();
 const act=(type,data={})=>r.action(r.members.find(m=>m.id===r.prompt.playerId),{type,...data,revision:r.revision,requestId:crypto.randomUUID()});
 for(let i=0;i<30&&!(r.prompt?.kind==='turn'&&r.game.currentSeat===seat);i++){
  assert(r.prompt);act(r.prompt.kind==='claim'?'pass':'discard',{tileId:r.prompt.drawn?.id??r.game.getPlayerById(r.prompt.playerId).hand[0].id});
 }
 assert.equal(r.game.currentSeat,seat);const p=r.game.getPlayer(seat),tiles=p.hand.filter(t=>t.suit==='tong'&&t.rank===2);assert.equal(tiles.length,4);
 act('anGang',{tileIds:tiles.map(t=>t.id)});if(r.prompt?.kind==='beforeGang')act('beforeGang');assert.equal(p.melds[0].type,'anGang');
 const playing=r.members.map(m=>r.snapshot(m));
 for(const state of playing){const meld=state.players.find(p=>p.seat===seat).melds[0];
  if(state.localId===p.id)assert.deepEqual(meld.tiles,tiles);else assert(meld.tiles.every(t=>t.id<0&&t.name==='暗牌'));
 }
 r.game.handleDrawn();const settled=r.members.map(m=>r.snapshot(m));
 assert(settled.every(s=>s.players.find(p=>p.seat===seat).melds[0].tiles.every(t=>t.id>=0&&t.suit==='tong'&&t.rank===2)));
 return {seat,playing,settled};
}
(async()=>{
 const cases=seats.map(fixture);
 server=createServer({accessPassword:false,testAdminPassword:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,...(mobile?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'}:{})}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForTimeout(5500);
  await page.waitForFunction(async()=>{try{window.cc=await System.import('cc');return !!window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('GameApp')?.lobby;}catch{return false;}},null,{timeout:90000});
  await page.waitForTimeout(1500);
  await page.evaluate(()=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');a.lobby.hide();a.friendPanel.hide();a.startGame({...a.lobby.config});a.session.stop();a.unscheduleAllCallbacks();a.actions.hide();a.table.node.active=true;});
  for(const test of cases)for(const phase of ['playing','settled'])for(const state of test[phase]){
   const result=await page.evaluate(async({state,seat})=>{
    const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),{FriendSession}=await System.import('chunks:///_virtual/FriendSession.ts');
    const session=new FriendSession({state}),local=state.players.find(p=>p.id===state.localId);
    a.table.localSeat=local.seat;a.table.refreshAll(session);
    const area=a.table.getArea(seat),tiles=area.meldsRow.children.map(n=>{const v=n.getComponent('TileView');return {id:v.tile.id,down:v.isFaceDown,suit:v.tile.suit,rank:v.tile.rank,y:n.position.y};});
    return {local:local.seat,tiles};
   },{state,seat:test.seat});
   assert.equal(result.tiles.length,4);
   const owner=result.local===test.seat,expected=phase==='settled'?4:owner?1:0;
   assert.equal(result.tiles.filter(t=>!t.down).length,expected,JSON.stringify({seat:test.seat,phase,...result}));
   if(owner&&phase==='playing'){
    const face=result.tiles.find(t=>!t.down);assert.equal(face.id,state.players.find(p=>p.seat===test.seat).melds[0].tiles[3].id);
    assert.equal(face.suit,'tong');assert.equal(face.rank,2);assert(face.y>Math.min(...result.tiles.map(t=>t.y)));
    if(test.seat==='east'){await page.waitForTimeout(400);await page.screenshot({path:'screenshots/concealed-kong-'+(mobile?'mobile':'desktop')+'.png'});}
   }
  }
  // Public special concealed kongs and exposed kongs still show every tile.
  await page.evaluate(()=>{
   const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');
   for(const seat of ['east','south','west','north']){
    const area=a.table.getArea(seat),p=a.session.players[0],quad=[0,1,2,3].map(id=>({id:90000+id,suit:'tong',rank:2,name:'二筒'}));
    for(const meld of [{type:'mingGang',tiles:quad,openedTileIndex:0},{type:'anGang',specialGang:'winds',tiles:[1,2,3,4].map((rank,id)=>({id:90100+id,suit:'feng',rank,name:'风'})),openedTileIndex:-1}]){
     area.refresh({...p,seat,hand:[],melds:[meld]},false,undefined,undefined,seat,false);
     if(area.meldsRow.children.some(n=>n.getComponent('TileView').isFaceDown))throw Error('Public kong became hidden');
    }
   }
  });
  for(const [count,name]of [[1,'豪华七对'],[2,'双豪七对'],[3,'三豪七对']]){
   const text=await page.evaluate(async count=>{
    const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),{settleWin}=await System.import('chunks:///_virtual/SettlementEngine.ts'),{createTile}=await System.import('chunks:///_virtual/Tile.ts');
    const players=a.session.players;players.forEach(p=>{p.state.isStanding=false;p.state.riichi='none';});
    const winner=players[1];winner.state.isStanding=true;winner.state.riichi='normal';winner.state.riichiShapes=['danDiao'];winner.melds=[];
    const pairs=[['wan',1],['wan',9],['tong',2],['tong',5],['tiao',3],['tiao',8]];for(let i=0;i<count;i++)pairs[i*2+1]=pairs[i*2];let id=98000;
    winner.hand=pairs.flatMap(([s,r])=>[createTile(id++,s,r),createTile(id++,s,r)]).concat(createTile(id++,'yuan',3),createTile(id++,'yuan',3));
    const result=settleWin({winner,winTiles:winner.hand,winTile:winner.hand[13],winMode:'dianPao',firer:players[2],allPlayers:players,currentDealer:'north',isAfterGang:false,isAfterGangSpecial:false,isGangShangKaiHua:false,qiInfo:{isHaoHua:true,gangGroups:count},roomConfig:{...a.session.config,cap:0}});
    a.settlement.show(result,[],players,'dianPao',winner,winner.hand[13]);return a.settlement.content.children.filter(n=>n.getComponent(window.cc.Label)).map(n=>n.getComponent(window.cc.Label).string).join('\n');
   },count);
   assert(text.includes(name));assert(text.includes(name+' ×'+2**count));assert(!text.includes('undefined'));
   if(count===3){await page.waitForTimeout(300);await page.screenshot({path:'screenshots/luxury-pairs-'+(mobile?'mobile':'desktop')+'.png'});}
  }
  assert.deepEqual(errors,[]);console.log('PASS',mobile?'mobile':'desktop','4 owners × 4 observer seats: owner 1 face / others 4 backs; settled 4 faces; public kongs unchanged');await page.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.closeAllConnections?.();if(server)await new Promise(r=>server.close(r));});
