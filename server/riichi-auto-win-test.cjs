const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {FriendRoom}=require('./rooms.cjs'),{ALL_TILES}=require('./dist/data/TileCatalog'),{createDefaultPlayerState}=require('./dist/core/Player');
const {declareRiichi,getRiichiChoices}=require('./dist/game/RiichiManager');
const key=t=>t.suit+':'+t.rank;
function act(r,type,data={}){return r.action(r.members.find(m=>m.id===r.prompt?.playerId),{type,...data,revision:r.revision,requestId:crypto.randomUUID()});}
function fixture({qi=-1,jue=false,ready=true,hit=true}={}){
 const r=new FriendRoom('123456','东家');for(const n of ['报听者','西家','北家'])r.add(n);r.members.forEach(m=>m.ready=true);r.start();
 const g=r.game,p=g.players[1],pool=ALL_TILES.slice(),take=k=>{const i=pool.findIndex(t=>key(t)===k);assert(i>=0,k);return pool.splice(i,1)[0];};
 g.players.forEach((p,i)=>{p.hand=[];p.melds=[];p.discards=[];p.score=0;p.state={...createDefaultPlayerState(),isDealer:i===0};});
 let keys='wan:1 wan:1 wan:1 wan:4 wan:5 wan:6 tong:1 tong:2 tong:3 tiao:1 tiao:2 tiao:3 yuan:3'.split(' '),win='yuan:3';
 if(jue){keys='wan:1 wan:2 tong:1 tong:1 tong:1 tiao:1 tiao:2 tiao:3 yuan:1 yuan:1 yuan:1 yuan:3 yuan:3'.split(' ');win='wan:3';}
 if(qi>=0){const pairs=['wan:1','wan:9','tong:2','tong:5','tiao:3','tiao:8'];for(let i=0;i<qi;i++)pairs[i*2+1]=pairs[i*2];keys=pairs.flatMap(k=>[k,k]).concat('yuan:3');}
 p.hand=keys.map(take);const winning=take(win),miss=hit?null:take('feng:4'),next=miss??winning;
 if(ready){const choice=getRiichiChoices(p,true).find(c=>c.shape===(jue?'jue':'danDiao')&&c.winningTiles.some(t=>key(t)===win));assert(choice);assert(declareRiichi(p,true,choice.key).ok);}
 // Deal all other physical tiles after reserving the chosen player's legal draw.
 for(const other of g.players.filter(x=>x!==p))while(other.hand.length<(other.seat==='east'?14:13))other.hand.push(pool.shift());
 if(miss)pool.push(winning);g.wall={drawStack:[next,...pool],drawIndex:0,kongStack:[],kongIndex:0};g.phase='playerTurn';g.currentSeat='east';g.lastDrawn=g.players[0].hand[13];g.lastDiscard=null;g.lastDiscarder=null;g.waitingHumanTurn=g.players[0];g.waitingHumanClaim=null;g.pendingClaimQueue=[];
 r.prompt={kind:'turn',playerId:g.players[0].id,drawn:g.lastDrawn,deadline:Date.now()+15000};r.pendingAutoDiscard=null;r.pendingAI=null;r.gangs=[];r.result=null;r.bump();
 const start=()=>{const tile=g.players[0].hand.find(t=>key(t)!==win);act(r,'discard',{tileId:tile.id});for(let i=0;r.prompt?.kind==='claim'&&i<12;i++)act(r,'pass');};
 return {r,g,p,next,winning,start};
}
function conserved(g){const tiles=g.players.flatMap(p=>p.hand.concat(p.discards,p.melds.flatMap(m=>m.tiles))).concat(g.wall.drawStack.slice(g.wall.drawIndex),g.wall.kongStack.slice(0,g.wall.kongStack.length-g.wall.kongIndex));assert.equal(tiles.length,136);assert.equal(new Set(tiles.map(t=>t.id)).size,136);assert.equal(g.players.reduce((s,p)=>s+p.score,0),0);}
function finishPreview(r){const real=Date.now;try{const now=r.pendingSelfWinTimer.due;Date.now=()=>now;r.members.forEach(m=>m.lastSeen=now);r.tick(now);}finally{Date.now=real;}}
function gangPreviewFixture(){
 const {r,g,p}=require('./supplement-claims-test.cjs').fixture({family:'winds',claim:'none'}),pool=g.wall.drawStack;
 const take=()=>{const i=pool.findIndex(t=>key(t)==='feng:1');assert(i>=0);return pool.splice(i,1)[0];};
 const oldBase=p.hand[9],oldDraw=p.hand[10],oldBonus=g.wall.kongStack[0];p.hand=p.hand.slice(0,9).concat(take());const drawn=take(),bonus=take();pool.push(oldBase,oldDraw,oldBonus);g.wall.kongStack=[bonus];
 p.state.riichi='none';p.state.riichiLockedHandIds=[];assert(declareRiichi(p,true).ok);p.hand.push(drawn);g.lastDrawn=drawn;g.beginPlayerTurn(p,drawn);return {r,g,p,drawn,bonus};
}
function run(){
 for(const spec of [{},{jue:true},...[0,1,2,3].map(qi=>({qi}))]){
  const {r,g,p,next,start}=fixture(spec);let turns=0,wins=0;const oldTurn=g.events.onHumanTurn,oldWin=g.events.onWin;g.events.onHumanTurn=(who,t)=>{if(who===p)turns++;oldTurn(who,t);};g.events.onWin=(...args)=>{wins++;oldWin(...args);};
  const before=Date.now();start();assert.equal(r.result,null);assert(g.pendingSelfWin);assert(r.pendingSelfWinTimer.due-before>=5000);assert.equal(r.prompt.playerId,p.id);
  const options=g.computeHumanOptions(p,next);assert(options.canWin&&options.canDiscard&&!options.autoDiscard);
  const real=Date.now;try{Date.now=()=>r.pendingSelfWinTimer.due-1;r.tick();assert.equal(r.result,null);}finally{Date.now=real;}
  for(const m of r.members){const state=r.snapshot(m);assert(state.autoSelfWin);assert(!('tileId' in state.autoSelfWin));assert(state.players.filter(x=>x.id!==m.id).every(x=>x.hand.every(t=>t.id<0)));}
  finishPreview(r);assert.equal(r.result.kind,'win');assert.equal(r.result.mode,'selfDraw');assert.equal(r.result.tile.id,next.id);assert.equal(r.prompt,null);assert.equal(r.pendingAutoDiscard,null);assert.equal(turns,1);assert.equal(wins,1);assert(p.state.isWon);assert(!p.discards.some(t=>t.id===next.id));assert.equal(p.hand.filter(t=>t.id===next.id).length,1);conserved(g);
  const scores=g.players.map(p=>p.score);assert(!g.playerDiscard(p,next));assert(!g.playerSelfWin(p,next));assert.deepEqual(g.players.map(p=>p.score),scores);for(const m of r.members){const s=r.snapshot(m);assert.equal(s.result.mode,'selfDraw');assert.equal(s.prompt,null);assert(s.players.every(p=>p.hand.every(t=>t.id>=0)));}
  console.log('✓ 摸中展示5秒，按钮可用，4999ms不结算，满5秒四端一致且不重复结算',JSON.stringify(spec));
 }
 for(const action of ['win','discard']){
  const {r,g,p,next,start}=fixture();start();const stale=r.pendingSelfWinTimer.action;act(r,action,action==='discard'?{tileId:next.id}:{});
  assert.equal(g.pendingSelfWin,null);const before=JSON.stringify(g.players);stale();assert.equal(JSON.stringify(g.players),before);
  if(action==='win'){assert.equal(r.result.mode,'selfDraw');assert(p.state.isWon);}else{assert(!p.state.isWon);assert(p.discards.some(t=>t.id===next.id));}conserved(g);console.log('✓ 5秒内主动',action,'正常执行且旧自动胡回调失效');
 }
 {
  const {r,g,p,start}=fixture();start();const due=r.pendingSelfWinTimer.due;const m=r.members[1];r.disconnect(m);assert.equal(r.pendingSelfWinTimer.due,due);r.auth(m.token);assert.equal(r.pendingSelfWinTimer.due,due);finishPreview(r);assert(p.state.isWon);conserved(g);console.log('✓ 展示时离线及重连不重置5秒，也不丢失自动胡');
 }
 {
  const {r,g,p,drawn,bonus}=gangPreviewFixture(),stale=r.pendingSelfWinTimer.action,oldDue=r.pendingSelfWinTimer.due;
  const real=Date.now,now=oldDue-4000;try{Date.now=()=>now;act(r,'supplement',{meldIndex:0,tileId:drawn.id});}finally{Date.now=real;}
  assert.equal(g.lastDrawn.id,bonus.id);assert.equal(g.wall.kongIndex,1);assert.equal(r.pendingSelfWinTimer.due,oldDue+1000);assert.equal(stale(),false);finishPreview(r);assert(p.state.isWon);assert.equal(r.gangs.length,1);conserved(g);console.log('✓ 展示期间合法补毛按钮可用，新补牌自摸重新展示5秒，旧回调不能重复结算');
 }
 for(const accept of [false,true]){
  const {r,g,p,winning}=fixture();const east=g.players[0];
  const idx=g.wall.drawStack.findIndex(t=>t.id===winning.id);g.wall.drawStack.splice(idx,1);east.hand.push(winning);const replacement=east.hand.find(t=>t.id!==winning.id);east.hand=east.hand.filter(t=>t.id!==replacement.id);g.wall.drawStack.push(replacement);g.lastDrawn=winning;r.prompt.drawn=winning;
  act(r,'discard',{tileId:winning.id});assert.equal(r.result,null);assert.equal(r.prompt.playerId,p.id);assert(r.prompt.claimOptions[0]);
  act(r,accept?'win':'pass');if(accept){assert.equal(r.result.mode,'dianPao');assert(p.state.isWon);}else{assert.equal(r.result,null);assert(!p.state.isWon);}conserved(g);
  console.log('✓ 别人点炮仍可选择',accept?'胡':'过');
 }
 {
  const {r,g,p,next,start}=fixture({ready:false});start();assert.equal(r.result,null);assert.equal(r.prompt.playerId,p.id);assert(r.prompt.options===undefined);assert(g.computeHumanOptions(p,next).canWin);assert(g.playerDiscard(p,next));assert(p.discards.some(t=>t.id===next.id));conserved(g);console.log('✓ 未报听的自摸仍允许手动选择，不扩大自动胡范围');
 }
 {
  const {r,g,p,next,start}=fixture({hit:false});start();assert.equal(r.result,null);assert(r.pendingAutoDiscard);const fn=r.pendingAutoDiscard.action;r.pendingAutoDiscard=null;fn();assert(p.discards.some(t=>t.id===next.id));conserved(g);console.log('✓ 报听后未摸中继续自动出牌');
 }
 console.log('Riichi automatic self-win tests passed');
}
module.exports={fixture,gangPreviewFixture,act,conserved,finishPreview,run};if(require.main===module)run();
