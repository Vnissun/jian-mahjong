const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {FriendRoom}=require('./rooms.cjs'),{ALL_TILES}=require('./dist/data/TileCatalog');
const {createDefaultPlayerState,hasLockedRiichiHand}=require('./dist/core/Player');
const {declareRiichi,getRiichiChoices}=require('./dist/game/RiichiManager');
const {finishPreview}=require('./riichi-auto-win-test.cjs');
const key=t=>t.suit+':'+t.rank;
function act(r,seat,type,payload={}){const data={type,...payload,revision:r.revision,requestId:crypto.randomUUID()};r.action(r.members.find(m=>m.seat===seat),data);return data;}
function countTiles(g){const all=[...g.players.flatMap(p=>p.hand.concat(p.discards,p.melds.flatMap(m=>m.tiles))),...g.wall.drawStack.slice(g.wall.drawIndex),...g.wall.kongStack.slice(0,g.wall.kongStack.length-g.wall.kongIndex)];assert.equal(all.length,136);assert.equal(new Set(all.map(t=>t.id)).size,136);assert.equal(g.players.reduce((n,p)=>n+p.score,0),0);}
function fixture({family='winds',claim='peng',ready=true,robberReady=false,jia=false}={}){
 const r=new FriendRoom('123456','补杠者');for(const n of ['响应者','西家','北家'])r.add(n);r.members.forEach(m=>m.ready=true);r.start();
 const g=r.game,[p,q]=g.players,pool=ALL_TILES.slice(),take=(s,n)=>{const i=pool.findIndex(t=>t.suit===s&&t.rank===n);assert(i>=0,s+':'+n);return pool.splice(i,1)[0];},tiles=(s,ns)=>ns.map(n=>take(s,n));
 g.players.forEach((x,i)=>{x.hand=[];x.melds=[];x.discards=[];x.score=0;x.state={...createDefaultPlayerState(),isDealer:i===0};});
 const target=jia?['wan',1]:family==='winds'?['feng',2]:['yuan',2];
 p.melds=[jia?{type:'peng',tiles:tiles('wan',[1,1,1]),openedTileIndex:0}:{type:'anGang',specialGang:family,tiles:family==='winds'?tiles('feng',[1,2,3,4]):tiles('yuan',[1,2,3,1]),openedTileIndex:-1}];
 p.state.isOpen=jia;p.state.isStanding=!jia;
 p.hand=jia?[...tiles('tong',[1,2,3]),...tiles('tiao',[4,5,6]),...tiles('yuan',[1,1,1,3])]:[...tiles('wan',[1,2,3]),...tiles('tong',[4,5,6]),...tiles('tiao',[7,8,9]),take(family==='winds'?'yuan':'feng',family==='winds'?3:1)];
 if(ready)assert(declareRiichi(p,true).ok,'报听后允许保持听口的补杠');
 const extra=take(...target),bonus=take(jia||family==='winds'?'yuan':'feng',jia||family==='winds'?3:1);
 if(claim==='win')q.hand=jia?[...tiles('wan',[2,3]),...tiles('tong',[1,2,3,9,9]),...tiles('tiao',[1,2,3]),...tiles('yuan',[2,2,2])]:[...tiles(target[0],[target[1],target[1]]),...tiles('wan',[1,1,1]),...tiles('tong',[1,2,3]),...tiles('tiao',[1,2,3]),...tiles('yuan',[1,1])];
 else if(claim==='peng')q.hand=[...tiles(target[0],[target[1],target[1]]),...tiles('wan',[2,4,6]),...tiles('tong',[2,4,6]),...tiles('tiao',[2,4,6]),...tiles('feng',[3,4])];
 if(robberReady){const choice=getRiichiChoices(q,true).find(c=>c.winningTiles.some(t=>key(t)===target.join(':')));assert(choice);assert(declareRiichi(q,true,choice.key).ok);}
 for(const x of g.players.slice(1))while(x.hand.length<13){const i=pool.findIndex(t=>key(t)!==target.join(':')&&(!jia||t.suit!=='wan'));assert(i>=0);x.hand.push(pool.splice(i,1)[0]);}
 p.hand.push(extra);g.wall={drawStack:pool,drawIndex:0,kongStack:[bonus],kongIndex:0};g.currentSeat='east';g.phase='playerTurn';g.waitingHumanTurn=p;g.waitingHumanClaim=null;g.pendingClaimQueue=[];g.pendingRobbingGang=null;g.lastDiscard=null;g.lastDiscarder=null;g.lastDrawn=extra;
 r.pendingAI=null;r.pendingAutoDiscard=null;r.prompt={kind:'turn',playerId:p.id,drawn:extra,deadline:Date.now()+15000};r.soundEvents=[];r.gangs=[];r.bump();countTiles(g);
 return {r,g,p,q,extra,bonus,offer:()=>act(r,'east',jia?'jiaGang':'supplement',jia?{tileId:extra.id}:{meldIndex:0,tileId:extra.id})};
}
function run(){
 for(const family of ['winds','dragons'])for(const ready of [false,true]){
  const {r,g,p,q,extra,offer}=fixture({family,ready});const locked=p.state.riichiLockedHandIds.slice();offer();
  assert.equal(r.prompt.playerId,q.id);assert.deepEqual(r.prompt.claimOptions,[false,true,false,false]);assert.equal(p.melds[0].tiles.length,4);assert(p.hand.some(t=>t.id===extra.id));assert.equal(g.wall.kongIndex,0);assert.deepEqual(r.gangs,[]);
  for(const m of r.members){const s=r.snapshot(m);assert.equal(s.gangClaim.tile.id,extra.id);assert(!('hand' in s.gangClaim));assert(s.players.filter(x=>x.id!==m.id).every(x=>x.hand.every(t=>t.id<0)));assert.equal(s.prompt?.claimOptions?.[3]??false,false);}
  const before=JSON.stringify(g.wall),deadline=r.prompt.deadline;assert.throws(()=>act(r,'south','chi',{tileIds:q.hand.slice(0,2).map(t=>t.id)}));assert.throws(()=>act(r,'south','mingGang'));assert.equal(r.prompt.deadline,deadline);assert.equal(JSON.stringify(g.wall),before);
  const request=act(r,'south','peng');r.action(r.members[1],request);
  assert.equal(p.melds[0].tiles.length,4);assert(!p.hand.some(t=>t.id===extra.id));assert(q.melds[0].tiles.some(t=>t.id===extra.id));assert.equal(g.wall.kongIndex,0);assert.equal(g.pendingRobbingGang,null);assert.equal(r.prompt.kind,'turn');assert.equal(r.prompt.playerId,q.id);assert(r.prompt.deadline-Date.now()>=14900);
  assert.deepEqual(p.state.riichiLockedHandIds,locked);if(ready)assert(hasLockedRiichiHand(p,p.hand));countTiles(g);g.handleDrawn();assert.deepEqual(r.gangs,[]);assert(g.players.every(x=>x.score===0));countTiles(g);
  console.log('✓',family,'报听='+ready,'补毛可碰、不可吃/杠；被碰不补摸、不计毛分、不改原听牌');
 }
 for(const family of ['winds','dragons'])for(const robberReady of [false,true]){
  const {r,g,p,q,extra,offer}=fixture({family,claim:'win',robberReady});offer();assert.deepEqual(r.prompt.claimOptions,[true,false,false,false]);
  assert.throws(()=>act(r,'south','peng'),'胡牌优先阶段不能绕过胡优先去碰');act(r,'south','win');
  assert.equal(r.result.mode,'robbingGang');assert.equal(r.result.winnerId,q.id);assert.equal(p.melds[0].tiles.length,4);assert(!p.hand.some(t=>t.id===extra.id));assert.equal(q.hand.filter(t=>t.id===extra.id).length,1);assert.equal(g.wall.kongIndex,0);assert.deepEqual(r.gangs,[]);assert.equal(g.pendingRobbingGang,null);countTiles(g);
  console.log('✓',family,'胡家报听='+robberReady,'能抢胡补毛；仅转移一张实牌，不补摸、不收毛分');
 }
 for(const family of ['winds','dragons'])for(const claim of ['none','peng','win']){
  const {r,g,p,bonus,offer}=fixture({family,claim});offer();let passes=0;
  while(r.prompt?.kind==='claim'){act(r,'south','pass');assert(++passes<4);}
  assert.equal(r.result,null);assert(r.game.pendingSelfWin);finishPreview(r);
  assert.equal(p.melds[0].tiles.length,5);assert.equal(g.wall.kongIndex,1);assert.equal(g.lastDrawn.id,bonus.id);assert(hasLockedRiichiHand(p,p.hand.filter(t=>t.id!==bonus.id)));assert.equal(g.pendingRobbingGang,null);countTiles(g);
  assert(!g.playerPass(g.players[1]));assert(p.state.isWon);assert.equal(r.prompt,null);assert.equal(r.result.mode,'selfDraw');assert.equal(r.gangs.length,1);assert.equal(r.gangs[0].mode,'supplement');countTiles(g);
  console.log('✓',family,claim,'无人响应/依次过胡再过碰，补毛只完成一次，补摸后仍可报听自摸');
 }
 for(const claim of ['none','win']){
  const {r,g,p,q,extra,offer}=fixture({jia:true,claim});offer();
  if(claim==='win'){assert.deepEqual(r.prompt.claimOptions,[true,false,false,false]);assert.deepEqual(g.getHumanChiOptions(q),[]);assert.throws(()=>act(r,'south','chi',{tileIds:q.hand.filter(t=>t.suit==='wan').map(t=>t.id)}));act(r,'south','win');assert.equal(p.melds[0].type,'peng');assert.equal(r.result.mode,'robbingGang');assert.deepEqual(r.gangs,[]);}
  else{assert.equal(p.melds[0].type,'jiaGang');assert.equal(p.melds[0].tiles.length,4);assert(!p.hand.some(t=>t.id===extra.id));assert(hasLockedRiichiHand(p,p.hand.filter(t=>t.id!==g.lastDrawn.id)));}
  countTiles(g);console.log('✓ 报听后普通补杠（碰后第四张）',claim,'可抢胡不可吃，听口不变');
 }
 {
  const {r,g,p,offer}=fixture();offer();const original=Date.now;try{const now=r.prompt.deadline;Date.now=()=>now;r.members.forEach(m=>m.lastSeen=now);r.tick();assert.equal(p.melds[0].tiles.length,5);assert.equal(g.wall.kongIndex,1);assert(r.game.pendingSelfWin);finishPreview(r);assert.equal(r.prompt,null);assert.equal(r.result.mode,'selfDraw');r.tick();assert.equal(g.wall.kongIndex,1);countTiles(g);}finally{Date.now=original;}console.log('✓ 超时自动过，补毛及补牌仅执行一次，报听补摸展示5秒后自摸');
 }
 {
  const {r,g,q,offer}=fixture({claim:'win'});offer();r.disconnect(r.members[1]);const stale=r.pendingAI.action;r.auth(r.members[1].token);stale();assert(!r.result);assert.equal(r.prompt.playerId,q.id);act(r,'south','win');assert.equal(r.result.mode,'robbingGang');countTiles(g);console.log('✓ 等待补毛响应时断线托管/重连，原玩家接回选择，旧机器人回调失效');
 }
 {
  const {r,g,offer}=fixture({claim:'win'});r.setAutoPlay(r.members[1],true);offer();assert(r.pendingAI);const fn=r.pendingAI.action;r.pendingAI=null;fn();assert.equal(r.result.mode,'robbingGang');countTiles(g);console.log('✓ 机器人也可抢胡补毛，不会让补毛先入杠');
 }
 console.log('Supplement claim regression suite passed');
}
module.exports={fixture,act,countTiles,run};if(require.main===module)run();
