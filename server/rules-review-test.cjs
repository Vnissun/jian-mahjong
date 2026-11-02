const assert=require('node:assert/strict'),crypto=require('node:crypto'),request=require('../tools/http-request.cjs');
const {createServer}=require('./server.cjs'),{createTile}=require('./dist/core/Tile');
const {declareRiichi,getRiichiChoices}=require('./dist/game/RiichiManager');
let id=250000;const tile=(s,r)=>createTile(id++,s,r);
(async()=>{const server=createServer({accessPassword:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const call=async(p,body,token)=>{const res=await request(base+p,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};};
try{
 for(const config of [{riichiDuel:'yes'},{cap:-1},{cap:null}])assert.equal((await call('/api/rooms',{name:'甲',config})).status,400);
 for(const spec of [{cap:0,duel:false,self:false},{cap:0,duel:false,self:true},{cap:0,duel:true,self:true},{cap:32,duel:false,self:false}].flatMap(s=>[0,1,2,3].map(luxury=>({...s,luxury})))){
  const a=(await call('/api/rooms',{name:'甲',config:{cap:spec.cap,riichiDuel:spec.duel,allowChi:false}})).body,code=a.state.code,clients=[a];
  assert.equal(a.state.config.allowChi,true);assert.equal(a.state.config.riichiDuel,spec.duel);assert.equal(a.state.config.cap,spec.cap);
  for(const name of ['乙','丙','丁'])clients.push((await call('/api/rooms/'+code+'/join',{name})).body);
  const r=server.rooms.get(code);r.members.forEach(m=>m.ready=true);r.start();r.bump();const g=r.game,ps=g.players,p=ps[1];
  for(const m of r.members){const s=r.snapshot(m);for(const other of s.players.filter(x=>x.id!==m.id))assert(other.hand.every(t=>t.id<0));}
  ps.forEach((x,i)=>{x.state.isStanding=false;x.state.isDealer=i===3;});g.room.currentDealer='north';p.state.isStanding=true;
  const pairs=[['wan',1],['wan',9],['tong',2],['tong',5],['tiao',3],['tiao',8]];
  // Merge two different pairs into four identical tiles, keeping all three suits.
  for(let i=0;i<spec.luxury;i++)pairs[i*2+1]=pairs[i*2];
  p.hand=pairs.flatMap(([s,n])=>[tile(s,n),tile(s,n)]);p.hand.push(tile('yuan',3));
  const choice=getRiichiChoices(p,true).find(c=>c.shape==='danDiao');assert(choice);assert(declareRiichi(p,true,choice.key).ok);
  if(spec.duel)ps[0].state.riichi='jue';
  const win=tile('yuan',3);
  if(spec.self){p.hand.push(win);g.lastDrawn=win;g.waitingHumanTurn=p;g.currentSeat=p.seat;g.phase='playerTurn';r.prompt={kind:'turn',playerId:p.id,drawn:win,deadline:Date.now()+60000};}
  else{ps[2].discards.push(win);g.lastDiscard=win;g.lastDiscarder=ps[2];g.waitingHumanClaim=p;g.phase='awaiting';r.prompt={kind:'claim',playerId:p.id,target:win,fromId:ps[2].id,claimOptions:[true,false,false,false],deadline:Date.now()+60000};}
  // Stabilize initial presence before capturing revision; the server's 250ms tick
  // must not race this synthetic hand setup with its first presence update.
  r.tick();r.bump();const result=await call('/api/rooms/'+code+'/action',{type:'win',revision:r.revision,requestId:crypto.randomUUID()},clients[1].token);assert.equal(result.status,200,JSON.stringify(result.body));
  const score=result.body.result.result;assert.equal(score.payerDetails[ps[0].id].breakdown.qiXiaoDuiBaseMul,8);
  const expected=(spec.duel?[256,64,128]:spec.self?[64,64,128]:[32,64,64]).map(n=>spec.cap?Math.min(n*2**spec.luxury,spec.cap):n*2**spec.luxury);
  assert.equal(score.breakdown.qiXiaoDuiLuxuryMul,2**spec.luxury);assert.deepEqual(result.body.gangs,[],'手中四同作为两个对子，不应额外收杠分');
  assert.deepEqual([ps[0],ps[2],ps[3]].map(x=>score.payerDetails[x.id].amount),expected);assert.equal(score.isCapped,spec.cap===32);
  for(const client of clients){const state=(await call('/api/rooms/'+code+'/state',undefined,client.token)).body;assert(state.players.every(x=>x.hand.every(t=>t.id>=0)));assert.equal(state.result.tile.id,win.id);assert.equal(state.players.find(x=>x.id===p.id).hand.filter(t=>t.id===win.id).length,1);assert(!JSON.stringify(state).includes('drawStack'));}
  r.nextRound();for(const m of r.members)for(const other of r.snapshot(m).players.filter(x=>x.id!==m.id))assert(other.hand.every(t=>t.id<0));
  console.log('✓ HTTP七小对计分、结算公开四家、下一局重新隐藏',JSON.stringify(spec));
 }
 // Revealing every player's concealed kong is restricted to settled/finished hands.
 const a=(await call('/api/rooms',{name:'甲'})).body,r=server.rooms.get(a.state.code);assert.equal(r.config.riichiDuel,false);r.members[0].ready=true;r.start();const p=r.game.players[0];p.melds=[{type:'anGang',tiles:[1,2,3,4].map(()=>tile('tong',2)),openedTileIndex:-1}];const viewer=r.members.find(m=>m.isBot);
 assert(r.snapshot(viewer).players[0].melds[0].tiles.every(t=>t.id<0));r.game.handleDrawn();assert(r.snapshot(viewer).players.every(x=>x.hand.every(t=>t.id>=0)));assert(r.snapshot(viewer).players[0].melds[0].tiles.every(t=>t.id>=0));console.log('✓ 荒庄也公开四家手牌和暗杠，局中继续隐藏');
}finally{await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
