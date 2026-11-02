const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {FriendRoom}=require('./rooms.cjs'),{createTile}=require('./dist/core/Tile');
const {declareRiichi}=require('./dist/game/RiichiManager');
let id=990000,passed=0;
const tile=(s,r)=>createTile(id++,s,r);
function room(){const r=new FriendRoom('123456','甲');for(const n of ['乙','丙','丁'])r.add(n);r.members.forEach(m=>m.ready=true);r.start();r.bump();return r;}
function act(r,m,type,payload={}){r.action(m,{type,...payload,revision:r.revision,requestId:crypto.randomUUID()});}
function test(name,fn){const real=Date.now;let now=real();Date.now=()=>now;try{fn(ms=>now+=ms);passed++;console.log('✓',name);}finally{Date.now=real;}}
const alive=r=>r.members.filter(m=>!m.isBot&&!m.autoPlay).forEach(m=>m.lastSeen=Date.now());
const step=(r,advance)=>{const due=r.pendingSelfWinTimer?.due??r.pendingAI?.due??r.pendingAutoDiscard?.due??r.prompt?.deadline;assert(due);advance(Math.max(0,due-Date.now())+1);alive(r);r.tick();};
const readyHand=()=>[...Array.from({length:3},()=>tile('wan',1)),...[2,3,4].map(n=>tile('wan',n)),...[1,2,3].map(n=>tile('tong',n)),...[1,2,3].map(n=>tile('tiao',n)),tile('yuan',1)];
test('15秒前不代打，15秒到期自动打出本次摸牌',advance=>{
 const r=room(),p=r.game.players[0],prompt=r.prompt,drawn=prompt.drawn;assert.equal(prompt.deadline-Date.now(),15000);
 advance(14999);alive(r);r.tick();assert.equal(r.prompt,prompt);advance(1);alive(r);r.tick();assert(p.discards.some(t=>t.id===drawn.id));assert.notEqual(r.prompt,prompt);assert(!r.members[0].autoPlay);
});
test('报听摸中展示5秒后自动结算，不等15秒出牌超时',advance=>{
 const r=room(),g=r.game,p=g.players[0];p.hand=readyHand();assert(declareRiichi(p,true).ok);const drawn=tile('yuan',1);p.hand.push(drawn);g.lastDrawn=drawn;r.prompt={kind:'turn',playerId:p.id,drawn,deadline:Date.now()+15000};assert(g.computeHumanOptions(p,drawn).canWin);
 g.beginPlayerTurn(p,drawn);advance(4999);alive(r);r.tick();assert.equal(r.result,null);advance(1);r.tick();assert(!p.discards.some(t=>t.id===drawn.id));assert.equal(r.result?.kind,'win');assert.equal(r.result.mode,'selfDraw');
});
test('超时后才发来的出牌请求也会拒绝，不能钻定时器间隔的空隙',advance=>{
 const r=room(),p=r.game.players[0],drawn=r.prompt.drawn;advance(15001);alive(r);assert.throws(()=>act(r,r.members[0],'discard',{tileId:p.hand.find(t=>t.id!==drawn.id).id}),/超时/);assert(p.discards.some(t=>t.id===drawn.id));
});
test('断线15秒自动托管，身份、暗手隐私和座位保留；返回立即接管并取消旧机器人动作',advance=>{
 const r=room(),m=r.members[0],g=r.game,p=g.players[0],hand=p.hand.map(t=>t.id),scores=g.players.map(p=>p.score);
 advance(15000);for(const other of r.members.slice(1))other.lastSeen=Date.now();r.tick();assert(m.autoPlay);assert(g.isAI(p));assert.equal(r.prompt,null);assert(r.pendingAI);const stale=r.pendingAI.action;
 assert.deepEqual(p.hand.map(t=>t.id),hand);assert(r.snapshot(r.members[1]).players[0].hand.every(t=>t.id<0));assert(r.snapshot(r.members[1]).members[0].autoPlay);
 assert.equal(r.auth(m.token),m);assert(!m.autoPlay);assert(!g.isAI(p));assert.equal(r.prompt.playerId,p.id);assert.equal(r.prompt.deadline-Date.now(),15000);assert.equal(r.pendingAI,null);stale();assert.deepEqual(p.hand.map(t=>t.id),hand);assert.deepEqual(g.players.map(p=>p.score),scores);
 r.disconnect(m);assert(m.autoPlay);step(r,advance);assert(r.soundEvents.some(e=>e.type==='discard'&&e.playerId===m.id)||r.result);r.auth(m.token);assert(!m.autoPlay);assert.equal(r.members.length,4);
});
test('吃碰胡响应期间断线可托管，返回恢复同一个响应，不执行过期的机器人响应',()=>{
 const r=room(),g=r.game,[east,south,west,north]=g.players;g.players.forEach(p=>{p.hand=[];p.melds=[];p.discards=[];});
 const target=tile('wan',1);east.hand=[target];south.hand=[tile('wan',1),tile('wan',1),...[2,3,4].map(n=>tile('wan',n)),...[1,2,3].map(n=>tile('tong',n)),...[1,2,4].map(n=>tile('tiao',n)),tile('yuan',1),tile('yuan',1)];
 assert(g.playerDiscard(east,target));assert.equal(r.prompt.playerId,south.id);assert.equal(r.prompt.kind,'claim');r.disconnect(r.members[1]);assert.equal(r.pendingAI.playerId,south.id);const stale=r.pendingAI.action;
 r.auth(r.members[1].token);assert.equal(r.pendingAI,null);assert.equal(r.prompt.playerId,south.id);assert.equal(r.prompt.kind,'claim');stale();assert.equal(south.melds.length,0);act(r,r.members[1],'peng');assert.equal(south.melds[0].type,'peng');assert.equal(r.prompt.kind,'turn');
});
test('杠后补牌前断线能继续托管，杠分仍隐藏到局末',advance=>{
 const r=room(),g=r.game,p=g.players[0];p.hand=[...Array.from({length:4},()=>tile('tong',2)),...['wan','tiao','feng'].flatMap(s=>(s==='feng'?[1,1,1]:[1,2,3]).map(n=>tile(s,n))),tile('yuan',3)];g.lastDrawn=p.hand[0];
 assert(g.playerAnGang(p,p.hand[0]));assert.equal(r.prompt.kind,'beforeGang');r.disconnect(r.members[0]);assert(r.pendingAI||r.result);assert.deepEqual(g.players.map(p=>p.score),[0,0,0,0]);assert.deepEqual(r.gangs,[]);r.auth(r.members[0].token);if(r.phase==='playing')assert.equal(r.prompt.playerId,p.id);
});
test('离线玩家下局仍托管，在线真人准备即可继续；返回后恢复真人准备状态',()=>{
 const r=room(),m=r.members[1];r.disconnect(m);r.game.handleDrawn();assert(m.ready);for(const other of r.members.filter(x=>!x.autoPlay))act(r,other,'ready');assert.equal(r.phase,'playing');assert(r.game.isAI(r.game.players[1]));r.game.handleDrawn();r.auth(m.token);assert(!m.autoPlay);assert(!m.ready);
});
test('播报后自动行动留足时间，连续报听与打牌两句也不会挤在0.65秒内',()=>{
 const r=new FriendRoom('123456','甲');r.members[0].ready=true;r.start();const p=r.game.players[1];r.sound('discard',p,{tile:{suit:'wan',rank:1}});r.game.events.scheduleAI(()=>{},p);assert(r.pendingAI.due>=Date.now()+1800);
 r.sound('riichi',p);r.sound('discard',p,{tile:{suit:'tong',rank:2}});r.game.events.scheduleAutoDiscard(()=>true,850);assert(r.pendingAutoDiscard.due>=r.nextActionAt+200);assert(r.soundEvents.every(e=>Number.isFinite(e.at)));
});
test('全员离线可完成一局，反复接管不丢牌、不多出牌，积分守恒',advance=>{
 const r=room();r.members.forEach(m=>r.disconnect(m));assert(r.members.every(m=>!r.connected(m)));assert.equal(Date.now()-Math.max(...r.members.map(m=>m.lastSeen)),0,'全员主动离线不能因时间戳清零而立即清理房间');let moves=0;
 while(r.phase==='playing'&&moves++<1600){assert(r.pendingSelfWinTimer||r.pendingAI||r.pendingAutoDiscard,'托管不能停在无人响应的提示');step(r,advance);const g=r.game,tiles=[...g.wall.drawStack.slice(g.wall.drawIndex),...g.wall.kongStack.slice(0,g.wall.kongStack.length-g.wall.kongIndex),...g.players.flatMap(p=>[...p.hand,...p.discards,...p.melds.flatMap(m=>m.tiles)])];assert.equal(tiles.length,136);assert.equal(new Set(tiles.map(t=>t.id)).size,136);assert.equal(g.players.reduce((n,p)=>n+p.score,0),0);}
 assert.notEqual(r.phase,'playing');for(const m of r.members){r.auth(m.token);assert(!m.autoPlay);}assert.equal(r.members.length,4);
});
test('连续两次暗杠、补牌前选择及补摸后各重新获得15秒；快到期操作不沿用旧期限',advance=>{
 const r=room(),g=r.game,p=g.players[0];
 p.hand=[...Array.from({length:4},()=>tile('tong',2)),...Array.from({length:4},()=>tile('wan',8)),...[1,2,3].map(n=>tile('tiao',n)),tile('yuan',1),tile('yuan',1),tile('yuan',3)];
 g.lastDrawn=p.hand[13];g.waitingHumanTurn=p;g.wall.kongStack=[tile('yuan',3),tile('yuan',2)];g.wall.kongIndex=0;
 for(const [suit,rank]of [['tong',2],['wan',8]]){
  advance(14000);alive(r);const previous=r.prompt.deadline;
  act(r,r.members[0],'anGang',{tileIds:p.hand.filter(t=>t.suit===suit&&t.rank===rank).map(t=>t.id)});
  assert.equal(r.prompt.deadline-Date.now(),15000);assert(r.prompt.deadline>previous);
  if(r.prompt.kind==='beforeGang'){advance(14000);alive(r);act(r,r.members[0],'beforeGang');assert.equal(r.prompt.kind,'turn');assert.equal(r.prompt.deadline-Date.now(),15000);}
 }
 const current=r.prompt;advance(14999);alive(r);r.tick();assert.equal(r.prompt,current);advance(1);alive(r);r.tick();assert.notEqual(r.prompt,current);assert.equal(p.melds.length,2);
});
test('碰、吃、明杠响应和后续出牌均有新的15秒，重复请求或无效操作不续时',advance=>{
 for(const type of ['peng','chi','mingGang']){
  const r=room(),g=r.game,[east,south]=g.players;g.players.forEach(p=>{p.hand=[];p.melds=[];p.discards=[];});
  const target=tile('wan',1);east.hand=[target];
  south.hand=type==='chi'?[tile('wan',2),tile('wan',3)]:Array.from({length:type==='mingGang'?3:2},()=>tile('wan',1));
  south.hand.push(...[1,2,3,4,5,6,7].map(n=>tile('tong',n)),tile('yuan',1),tile('yuan',1),tile('tiao',9));south.hand=south.hand.slice(0,13);
  act(r,r.members[0],'discard',{tileId:target.id});assert.equal(r.prompt.playerId,south.id);assert.equal(r.prompt.deadline-Date.now(),15000);
  advance(14000);alive(r);const selected=type==='chi'?south.hand.slice(0,2).map(t=>t.id):undefined;
  const data={type,tileIds:selected,revision:r.revision,requestId:crypto.randomUUID()};r.action(r.members[1],data);
  assert.equal(r.prompt.playerId,south.id);assert.equal(r.prompt.deadline-Date.now(),15000);
  const deadline=r.prompt.deadline;advance(500);r.action(r.members[1],data);assert.equal(r.prompt.deadline,deadline);
  assert.throws(()=>act(r,r.members[1],'discard',{tileId:-12345}));assert.equal(r.prompt.deadline,deadline);
  r.snapshot(r.members[1]);assert.equal(r.prompt.deadline,deadline);
 }
});
console.log('Online controls tests passed:',passed);
