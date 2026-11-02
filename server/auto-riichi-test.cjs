const assert=require('node:assert/strict');
const {FriendRoom}=require('./rooms.cjs');
const {createTile}=require('./dist/core/Tile');
const {getRiichiChoices,declareRiichi}=require('./dist/game/RiichiManager');
let id=700000;
const tile=(s,r)=>createTile(id++,s,r);
function fixture(win=false){
 const room=new FriendRoom('AUTO','甲',{});for(const name of ['乙','丙','丁'])room.add(name);room.members.forEach(m=>m.ready=true);room.start();
 const g=room.game,p=g.players[0];g.players.forEach(x=>{x.melds=[];x.discards=[];});
 p.hand=[['wan',1],['wan',9],['tong',2],['tong',5],['tiao',3],['tiao',8]].flatMap(([s,n])=>[tile(s,n),tile(s,n)]);p.hand.push(tile('yuan',3));
 const c=getRiichiChoices(p,true).find(c=>c.shape==='danDiao');assert(c);assert(declareRiichi(p,true,c.key).ok);
 const drawn=tile(win?'yuan':'feng',win?3:1);p.hand.push(drawn);g.currentSeat=p.seat;g.phase='playerTurn';g.lastDrawn=drawn;g.beginPlayerTurn(p,drawn);
 return {room,g,p,drawn};
}
{
 const {room,g,p,drawn}=fixture();assert(g.computeHumanOptions(p,drawn).autoDiscard);assert(room.pendingAutoDiscard);const before=p.hand.map(t=>t.id);room.tick(room.pendingAutoDiscard.due-1);assert.deepEqual(p.hand.map(t=>t.id),before);
 room.tick(room.pendingAutoDiscard.due);assert(!p.hand.some(t=>t.id===drawn.id));assert(p.discards.some(t=>t.id===drawn.id));assert.deepEqual(p.hand.map(t=>t.id),before.filter(x=>x!==drawn.id));
 console.log('✓ Server discards only the new tile after riichi, without a browser');
}
{
 const {room,g,p,drawn}=fixture(true);assert(g.computeHumanOptions(p,drawn).canWin);assert.equal(room.pendingAutoDiscard,null);room.tick(Date.now()+120000);assert(p.hand.some(t=>t.id===drawn.id));assert.equal(room.phase,'playing');assert(g.playerSelfWin(p,drawn));assert.equal(room.phase,'settled');
 console.log('✓ Winning draw stays pending until the player chooses Hu');
}
{
 const {room,g,p,drawn}=fixture(true);room.action(room.members[0],{requestId:'skip-hu',revision:room.revision,type:'discard',tileId:drawn.id});assert(p.discards.some(t=>t.id===drawn.id));assert.equal(p.state.isWon,false);
 console.log('✓ Explicitly passing Hu discards the drawn tile without changing the wait');
}
{
 const {room,g,p}=fixture();const stale=room.pendingAutoDiscard.action;g.stop();assert.equal(stale(),false);assert.equal(p.hand.length,14);
 console.log('✓ Stopped sessions ignore stale automatic actions');
}
{
 const {room,g,p}=fixture();const stale=room.pendingAutoDiscard.action;g.startRound();const before=p.hand.map(t=>t.id);assert.equal(stale(),false);assert.deepEqual(p.hand.map(t=>t.id),before);
 console.log('✓ New rounds ignore old automatic actions');
}

{
 const {room,g,p}=fixture();p.state=require('./dist/core/Player').createDefaultPlayerState();p.hand=[['wan',1],['wan',1],['wan',1],['tong',2],['tong',3],['tong',4],['tiao',7],['tiao',8],['tiao',9],['yuan',1],['yuan',1],['yuan',1],['yuan',3]].map(([s,r])=>tile(s,r));
 assert(declareRiichi(p,true).ok);const fourth=tile('wan',1);p.hand.push(fourth);g.lastDrawn=fourth;g.beginPlayerTurn(p,fourth);assert(g.computeHumanOptions(p,fourth).canAnGang);const old=room.pendingAutoDiscard.action;assert(room.pendingAutoDiscard.due>Date.now()+2000);
 const win=tile('yuan',3);g.wall.kongStack=[win];g.wall.kongIndex=0;assert(g.playerAnGang(p,fourth));assert.equal(old(),false);assert.equal(room.pendingAutoDiscard,null);assert(g.computeHumanOptions(p,win).canWin);assert(p.hand.includes(win));
 console.log('✓ Legal riichi kong retains its button window, cancels the old discard and pauses on a winning supplement');
}
for(const family of ['winds','dragons']){
 const {room,g,p}=fixture();p.state=require('./dist/core/Player').createDefaultPlayerState();p.melds=[{type:'anGang',tiles:family==='winds'?[1,2,3,4].map(r=>tile('feng',r)):[1,2,3,1].map(r=>tile('yuan',r)),openedTileIndex:-1,specialGang:family}];
 p.hand=[['wan',1],['wan',2],['wan',3],['tong',4],['tong',5],['tong',6],['tiao',7],['tiao',8],['tiao',9],[family==='winds'?'yuan':'feng',family==='winds'?3:1]].map(([s,r])=>tile(s,r));assert(declareRiichi(p,true).ok);
 const extra=tile(family==='winds'?'feng':'yuan',2);p.hand.push(extra);g.lastDrawn=extra;g.beginPlayerTurn(p,extra);assert(g.computeHumanOptions(p,extra).canSupplementGang);const old=room.pendingAutoDiscard.action,tail=tile('tong',8);g.wall.kongStack=[tail];g.wall.kongIndex=0;assert(g.playerSupplementGang(p,0,extra));assert.equal(old(),false);assert(room.pendingAutoDiscard);room.tick(room.pendingAutoDiscard.due);assert(p.discards.some(t=>t.id===tail.id));assert(p.melds[0].tiles.includes(extra));
 console.log('✓ '+family+' supplement remains available and its replacement tile automatically discards');
}

{
 const {room,g,p}=fixture();p.state=require('./dist/core/Player').createDefaultPlayerState();p.state.isOpen=true;p.state.isStanding=false;p.melds=[{type:'chi',tiles:[1,2,3].map(r=>tile('tong',r)),openedTileIndex:0}];p.hand=[['wan',1],['wan',1],['wan',1],['tiao',4],['tiao',5],['tiao',6],['yuan',1],['yuan',1],['yuan',1],['yuan',3]].map(([s,r])=>tile(s,r));assert(declareRiichi(p,true).ok);
 const fire=tile('wan',1),from=g.players[1];g.players.slice(1).forEach(x=>{x.hand=[];x.melds=[];});from.hand=[fire];g.currentSeat=from.seat;g.phase='playerTurn';g.lastDrawn=fire;g.waitingHumanTurn=from;assert(g.playerDiscard(from,fire));assert.equal(room.prompt.playerId,p.id);assert(room.prompt.claimOptions[2]);assert(!room.prompt.claimOptions[0]);assert(room.pendingAutoDiscard);room.tick(room.pendingAutoDiscard.due);assert.equal(p.melds.length,1);assert.notEqual(g.waitingHumanClaim,p);
 console.log('✓ Optional reported open kong automatically passes when not selected');
}

{
 const {room,g,p,drawn}=fixture(true);g.phase='awaiting';g.waitingHumanClaim=p;room.prompt={kind:'claim',playerId:p.id,target:drawn,claimOptions:[true,false,false,false],deadline:Date.now()-1};room.tick(Date.now()+120000);assert.equal(g.waitingHumanClaim,p);assert.equal(room.prompt.kind,'claim');
 console.log('✓ Reported discard-win prompt also waits for an explicit player choice');
}
console.log('Riichi automatic play tests passed');
