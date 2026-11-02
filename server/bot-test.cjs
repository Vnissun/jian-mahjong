const assert=require('node:assert/strict'),crypto=require('node:crypto');
const request=require('../tools/http-request.cjs');
const {FriendRoom}=require('./rooms.cjs'),{createServer}=require('./server.cjs');
const act=(r,m,type,payload={})=>r.action(m,{type,...payload,revision:r.revision,requestId:crypto.randomUUID()});
const room=(humans=2)=>{const r=new FriendRoom('123456','房主');for(let i=1;i<humans;i++)r.add('好友'+i);return r;};
{
 const r=room(),[host,friend]=r.members;
 assert.throws(()=>act(r,friend,'addBot'),/房主/);assert.throws(()=>act(r,host,'start'),/准备/);assert.equal(r.members.length,2);
 act(r,host,'addBot');const bot=r.members.find(m=>m.isBot);assert(bot.ready&&r.connected(bot));assert.equal(bot.token,null);assert.throws(()=>r.auth(null),/身份/);
 assert.throws(()=>act(r,friend,'removeBot',{memberId:bot.id}),/房主/);assert.throws(()=>act(r,host,'removeBot',{memberId:friend.id}),/只能/);
 act(r,host,'removeBot',{memberId:bot.id});assert.equal(r.members.length,2);const replacement=r.add('新好友');assert.equal(replacement.seat,bot.seat);
 act(r,host,'addBot');assert.equal(r.members.length,4);assert.throws(()=>act(r,host,'addBot'),/已满/);
 assert(r.snapshot(host).members.some(m=>m.isBot));assert(!JSON.stringify(r.snapshot(host)).includes(host.token));
 console.log('✓ 仅房主可增删机器人，不能移除真人，空位可留给好友，机器人无登录令牌且人数不超过四人');
}
{
 const r=room(),[host,friend]=r.members;r.addBot();r.members=[host,r.members[2],friend];r.leave(host);assert.equal(r.ownerId,friend.id);assert(!r.members.find(m=>m.id===r.ownerId).isBot);r.leave(friend);assert.equal(r.members.length,0);
 console.log('✓ 房主退出只转交给真人，最后一位真人退出等待房后清空机器人');
}
function checkTiles(r){const g=r.game,tiles=[...g.wall.drawStack.slice(g.wall.drawIndex),...g.wall.kongStack.slice(0,g.wall.kongStack.length-g.wall.kongIndex),...g.players.flatMap(p=>[...p.hand,...p.discards,...p.melds.flatMap(m=>m.tiles)])];assert.equal(tiles.length,136);assert.equal(new Set(tiles.map(t=>t.id)).size,136);assert.equal(g.players.reduce((n,p)=>n+p.score,0),0);}
for(const humans of [1,2,3]){
 const r=room(humans),host=r.members[0];r.members.forEach(m=>act(r,m,'ready'));act(r,host,'start');assert.equal(r.members.filter(m=>m.isBot).length,4-humans);assert.equal(r.game.aiSeats.size,4-humans);
 assert.throws(()=>act(r,host,'addBot'),/开局前/);assert.throws(()=>act(r,host,'removeBot',{memberId:r.members.find(m=>m.isBot).id}),/开局前/);
 for(let round=0;round<2;round++){
  let moves=0;
  while(r.phase==='playing'&&moves++<1600){
   for(const m of r.members.filter(m=>!m.isBot)){m.lastSeen=Date.now();const s=r.snapshot(m);for(const p of s.players.filter(p=>p.id!==m.id&&!p.state.isWon))assert(p.hand.every(t=>t.id<0));assert.deepEqual(s.gangs,[]);}
   if(r.pendingAI){assert.equal(r.prompt,null);assert(r.members.find(m=>m.id===r.pendingAI.playerId).isBot);r.tick(r.pendingAI.due+1);}
   else{
    assert(r.prompt,'牌局必须等待真人或有待执行AI');const m=r.members.find(m=>m.id===r.prompt.playerId);assert(!m.isBot);const o=r.snapshot(m).prompt;
    if(o.kind==='beforeGang')act(r,m,'beforeGang');else if(o.kind==='claim')act(r,m,o.claimOptions[0]?'win':'pass');else if(o.options.canWin)act(r,m,'win');else act(r,m,'discard',{tileId:o.drawn?.id??r.game.getPlayerById(m.id).hand[0].id});
   }
   checkTiles(r);
  }
  assert.notEqual(r.phase,'playing','混合牌局必须完整结束');assert(r.result);for(const b of r.members.filter(m=>m.isBot))assert(b.ready);
  const scores=r.game.players.map(p=>p.score);if(round===0&&r.phase==='settled'){const people=r.members.filter(m=>!m.isBot);for(let i=0;i<people.length;i++){act(r,people[i],'ready');if(i<people.length-1)assert.equal(r.phase,'settled');}assert.equal(r.phase,'playing');assert.deepEqual(r.game.players.map(p=>p.score),scores);}else break;
 }
 console.log(`✓ ${humans}真人+${4-humans}机器人完整对战及下一局，AI不阻塞、暗手隐藏、牌和积分守恒`);
}
{
 const r=room();r.members.forEach(m=>m.ready=true);r.members[1].lastSeen=0;assert.throws(()=>act(r,r.members[0],'start'),/在线/);assert.equal(r.members.length,2);
 // A bot in the dealer seat must schedule its move even at round start.
 const b=r.addBot();r.members[1].lastSeen=Date.now();[r.members[0].seat,b.seat]=[b.seat,r.members[0].seat];r.start();assert(r.pendingAI);assert.equal(r.pendingAI.playerId,b.id);r.tick(r.pendingAI.due+1);assert(r.prompt||r.pendingAI||r.result);
 console.log('✓ 不替离线真人强行开局，机器人坐庄可自动开始行动');
}
(async()=>{const server=createServer({accessPassword:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const call=async(p,body,token)=>{const res=await request(base+p,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:res.status,body:await res.json()};};
 try{const a=(await call('/api/rooms',{name:'房主'})).body,code=a.state.code,b=(await call('/api/rooms/'+code+'/join',{name:'好友'})).body;
 const action=(client,type,payload={})=>call('/api/rooms/'+code+'/action',{type,...payload,revision:server.rooms.get(code).revision,requestId:crypto.randomUUID()},client.token);
 assert.equal((await action(b,'addBot')).status,403);assert.equal((await action(a,'addBot')).status,200);const bot=server.rooms.get(code).members.find(m=>m.isBot);
 assert.equal((await action(a,'removeBot',{memberId:bot.id})).status,200);await action(a,'ready');await action(b,'ready');const started=await action(a,'start');assert.equal(started.status,200);assert.equal(started.body.members.filter(m=>m.isBot).length,2);assert.equal(started.body.phase,'playing');assert(!JSON.stringify(started.body).includes('pendingAI'));
 console.log('✓ HTTP权限及两真人自动补齐开局通过');
 }finally{await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
