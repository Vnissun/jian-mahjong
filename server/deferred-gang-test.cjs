const assert=require('node:assert/strict');
const {FriendRoom}=require('./rooms.cjs');
const {createTile}=require('./dist/core/Tile');
const {getGangBaseScore}=require('./dist/config/GangConfig');
let nextId=190000;
const tile=(s,r)=>createTile(nextId++,s,r);
function setup(){
 const r=new FriendRoom('123456','甲');for(const name of ['乙','丙','丁'])r.add(name);r.members.forEach(m=>m.ready=true);r.start();
 const g=r.game,p=g.players[0];
 p.hand=[...Array.from({length:4},()=>tile('tong',2)),...['wan','tiao','feng'].flatMap(s=>(s==='feng'?[1,1,1]:[1,2,3]).map(n=>tile(s,n))),tile('yuan',3)];
 g.lastDrawn=p.hand[0];g.waitingHumanTurn=p;g.wall.kongStack=[tile('yuan',3)];g.wall.kongIndex=0;
 assert(g.playerAnGang(p,p.hand[0]));
 return {r,g,p};
}
function privateDuringPlay(r){
 assert.deepEqual(r.game.players.map(p=>p.score),[0,0,0,0]);assert.deepEqual(r.gangs,[]);
 for(const m of r.members){const s=r.snapshot(m);assert.deepEqual(s.gangs,[]);assert.deepEqual(s.players.map(p=>p.score),[0,0,0,0]);if(m.seat!=='east')assert(s.players[0].melds[0].tiles.every(t=>t.id<0));}
}
{
 const {r,g,p}=setup();privateDuringPlay(r);assert(g.playerBeforeGangDraw(p));privateDuringPlay(r);
 assert(g.playerSelfWin(p,g.lastDrawn));assert.equal(r.phase,'settled');assert.equal(r.gangs.length,1);assert.equal(r.gangs[0].baseScore,4);
 const result=r.result.result;assert.equal(r.gangs[0].gangPlayerDelta,48);
 assert.equal(p.score,result.winnerDelta+48);for(const payer of g.players.slice(1))assert.equal(payer.score,result.payerDeltas[payer.id]-16);
 assert.equal(result.cappedMultiplier,32);assert(p.score>32*3,'杠分不能与胡牌一起封顶');
 assert.deepEqual(r.snapshot(r.members[1]).gangs,r.gangs);
 const scores=g.players.map(p=>p.score);assert(!g.playerSelfWin(p,g.lastDrawn));assert.deepEqual(g.players.map(p=>p.score),scores);
 r.nextRound();assert.deepEqual(g.players.map(p=>p.score),scores);assert.deepEqual(r.gangs,[]);
 console.log('✓ 暗杠及补摸前后均不公开分值，胡牌时胡分+杠分入账，满贯不截杠分，不重复入账');
}
{
 const {r,g,p}=setup();privateDuringPlay(r);g.wall.kongStack=[];assert(g.playerBeforeGangDraw(p));
 assert.equal(r.result.kind,'drawn');assert.deepEqual(g.players.map(p=>p.score),[48,-16,-16,-16]);assert.equal(r.gangs.length,1);
 const scores=g.players.map(p=>p.score);g.settlePendingGangs();assert.deepEqual(g.players.map(p=>p.score),scores);
 console.log('✓ 补牌耗尽荒庄也统一结算杠分，重复刷新/清算不重复入账');
}
{
 const {r,g}=setup(),p=g.players[1];
 // Freeze opening-time dealer and base values for every kong category.
 const add=(mode,s,rank,specialGang)=>{const t=tile(s,rank),meld={type:mode,tiles:[t,t,t,t],openedTileIndex:-1,...(specialGang?{specialGang}:{})};g.recordPendingGang(p,meld,t,mode,g.players[2]);};
 add('anGang','tong',1);add('anGang','tiao',1);add('anGang','yuan',1);add('anGang','feng',1);add('anGang','feng',1,'winds');add('anGang','yuan',1,'dragons');add('supplement','feng',2,'winds');add('mingGang','wan',8);add('jiaGang','wan',3);
 privateDuringPlay(r);assert.equal(getGangBaseScore(tile('feng',1)),1);
 const pending=g.pendingGangSettlements;assert.deepEqual(pending.map(x=>x.baseScore),[4,2,2,2,1,2,2,1,4,1]);
 const expected=g.players.map(p=>pending.reduce((n,x)=>n+(x.gangPlayerId===p.id?x.gangPlayerDelta:x.payerDeltas[p.id]||0),0));
 g.room.currentDealer='west';g.handleDrawn();assert.deepEqual(g.players.map(p=>p.score),expected);assert.equal(r.gangs.length,10);assert.equal(expected.reduce((n,x)=>n+x,0),0);
 console.log('✓ 明杠、加杠、普通/特殊暗杠、补毛全部延迟；基础档、暗杠和开杠时庄家倍数保留');
}
{
 for(const [mode,expected]of [['mingGang',[4,2,-3,-3]],['anGang',[2,6,-4,-4]]]){
  const r=new FriendRoom('223456','庄家');for(const name of ['机器人1','机器人2','机器人3'])r.add(name);r.members.forEach(m=>m.ready=true);r.start();
  const g=r.game,ps=g.players,nine=Array.from({length:4},()=>tile('tong',9)),north=Array.from({length:4},()=>tile('feng',4));
  g.recordPendingGang(ps[0],{type:'mingGang',tiles:nine,openedTileIndex:0},nine[0],'mingGang',ps[2]);
  g.recordPendingGang(ps[1],{type:mode,tiles:north,openedTileIndex:0},north[0],mode,ps[2]);
  assert.deepEqual(ps.map(p=>p.score),[0,0,0,0]);assert.deepEqual(r.gangs,[]);
  for(const member of r.members){const snapshot=r.snapshot(member);assert.deepEqual(snapshot.players.map(p=>p.score),[0,0,0,0]);assert.deepEqual(snapshot.gangs,[]);}
  g.handleDrawn();assert.deepEqual(ps.map(p=>p.score),expected);
  assert.equal(r.gangs.length,2);assert(r.gangs.every(result=>Object.keys(result.payerDeltas).length===3));
  for(const member of r.members){const snapshot=r.snapshot(member);assert.deepEqual(snapshot.players.map(p=>p.score),expected);assert.deepEqual(snapshot.gangs,r.gangs);}
  const scores=ps.map(p=>p.score);g.settlePendingGangs();assert.deepEqual(ps.map(p=>p.score),scores);
 }
 console.log('✓ 截图案例：庄家九饼明杠＋北风明/暗杠，局内不扣分，局末四端一致且不由供牌者包付');
}
