const assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http');
const {createServer}=require('./server.cjs');
const key=t=>t.suit+':'+t.rank;
function request(base,url,body,headers={}){return new Promise((resolve,reject)=>{const b=body===undefined?null:Buffer.from(JSON.stringify(body)),req=http.request(base+url,{method:b?'POST':'GET',headers:{...(b?{'Content-Type':'application/json','Content-Length':b.length}:{}),...headers}},res=>{const parts=[];res.on('data',x=>parts.push(x));res.on('end',()=>{let data;try{data=JSON.parse(Buffer.concat(parts).toString());}catch{data=Buffer.concat(parts).toString();}resolve({status:res.statusCode,data,headers:res.headers});});});req.on('error',reject);req.end(b);});}
function checkTiles(g){const all=[...g.players.flatMap(p=>p.hand.concat(p.discards,p.melds.flatMap(m=>m.tiles))),...g.wall.drawStack.slice(g.wall.drawIndex),...g.wall.kongStack.slice(0,g.wall.kongStack.length-g.wall.kongIndex)];assert.equal(all.length,136);assert.equal(new Set(all.map(t=>t.id)).size,136);assert.equal(g.players.reduce((n,p)=>n+p.score,0),0);}
const untouched=r=>JSON.stringify({config:r.config,ai:r.game?.aiSeats?[...r.game.aiSeats]:[],scores:r.game?.players.map(p=>p.score)});
(async()=>{
 const server=createServer({accessPassword:false,testAdminPassword:'Test-admin-password-123'});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await request(base,'/api/test-admin/bootstrap')).status,401);
  assert.equal((await request(base,'/api/test-admin/login',{password:'CHANGE_ME_ACCESS_PASSWORD'})).status,401);
  const login=await request(base,'/api/test-admin/login',{password:'Test-admin-password-123'});assert.equal(login.status,200);const headers={Cookie:login.headers['set-cookie'][0].split(';')[0],'X-Test-CSRF':login.data.csrf};
  const first=(await request(base,'/api/rooms',{name:'房主'})).data,r=server.rooms.get(first.state.code);for(const name of ['乙','丙','丁'])r.add(name);
  const prefix='/api/test-admin/rooms/'+r.code;
  const mutate=async(op,data={})=>{const res=await request(base,prefix+'/'+op,{seat:r.handControl?.seat,version:r.handControl?.version??0,...data},headers);assert.equal(res.status,200,JSON.stringify(res.data));return res.data;};
  const opening='tong:2 tong:2 tong:2 tong:2 wan:1 wan:2 wan:3 tiao:7 tiao:8 tiao:9 yuan:1 yuan:1 yuan:1'.split(' ');
  const unchanged=JSON.stringify(r.config);await mutate('select',{seat:'east'});await mutate('opening',{tiles:opening,extra:'feng:1'});
  assert.equal((await request(base,prefix+'/opening',{seat:'east',version:r.handControl.version,tiles:opening,extra:'feng:1'},{Cookie:headers.Cookie})).status,403);
  assert.equal((await request(base,prefix+'/opening',{seat:'east',version:r.handControl.version,tiles:opening,config:{cap:0}},headers)).status,400);
  assert.equal((await request(base,prefix+'/next',{seat:'south',version:r.handControl.version,kind:'normal',tile:'wan:1'},headers)).status,409);
  for(const op of ['enable','apply','wall','pause','control','step','action','drawn'])assert.equal((await request(base,prefix+'/'+op,{},headers)).status,404);
  r.members.forEach(m=>m.ready=true);r.start();r.bump();let g=r.game;assert.deepEqual(g.players[0].hand.slice(0,13).map(key),opening);assert.equal(key(g.lastDrawn),'feng:1');assert.equal(r.handControl.opening,null);assert.equal(JSON.stringify(r.config),unchanged);checkTiles(g);
  assert(!('test' in r.snapshot(r.members[0])));assert(r.snapshot(r.members[0]).players.slice(1).every(p=>p.hand.every(t=>t.id<0)));
  console.log('✓ 独立登录和CSRF；只允许一个座位；旧的全桌/规则控制接口已停用；起手牌只应用一次');
  const normalActions=(type,payload={})=>{const m=r.members.find(m=>m.id===r.prompt.playerId);r.action(m,{type,...payload,revision:r.revision,requestId:crypto.randomUUID()});};
  const originalHands=JSON.stringify(g.players.map(p=>p.hand)),before=untouched(r),normalFirst=g.wall.drawStack[g.wall.drawIndex];
  await mutate('next',{kind:'normal',tile:key(normalFirst)});const reservedId=r.handControl.next.normal.id;
  assert.equal(JSON.stringify(g.players.map(p=>p.hand)),originalHands);assert.equal(untouched(r),before);
  for(let i=0;i<80;i++){
   if(g.currentSeat==='east'&&g.lastDrawn?.id===reservedId)break;
   assert(r.prompt,'真人回合应保留正常操作');
   if(r.prompt.kind==='claim')normalActions('pass');else if(r.prompt.kind==='beforeGang')normalActions('beforeGang');else normalActions('discard',{tileId:r.prompt.drawn?.id??g.getPlayerById(r.prompt.playerId).hand[0].id});checkTiles(g);
  }
  assert.equal(g.currentSeat,'east');assert.equal(g.lastDrawn.id,reservedId);assert.equal(r.handControl.next.normal,null);
  console.log('✓ 给东家指定下一摸，南西北先摸牌也不会消耗指定牌；设置时不改其他三家手牌');
  const prior=JSON.stringify(r.handControl.state()),wall=JSON.stringify(g.wall);
  assert.equal((await request(base,prefix+'/next',{seat:'east',version:r.handControl.version,kind:'normal',tile:'tong:2'},headers)).status,400);assert.equal(JSON.stringify(r.handControl.state()),prior);assert.equal(JSON.stringify(g.wall),wall);
  const detail=(await request(base,prefix,undefined,headers)).data;assert.equal(detail.players.length,4);assert(detail.players.every(p=>p.hand.every(t=>t.id>=0)));assert(!JSON.stringify(detail).includes(first.token));
  console.log('✓ 不可用牌原子拒绝，不从别人手中或弃牌取牌；后台可看三家真实牌但不泄露身份令牌');
  await mutate('opening',{tiles:opening,extra:'feng:1'});assert.equal(key(g.lastDrawn),key(normalFirst));g.handleDrawn();r.nextRound();r.bump();g=r.game;checkTiles(g);
  assert.equal(r.handControl.opening,null);assert.deepEqual(g.players[0].hand.slice(0,13).map(key),opening);
  const supplement=g.wall.drawStack[g.wall.drawIndex],others=JSON.stringify(g.players.slice(1));await mutate('next',{kind:'supplement',tile:key(supplement)});const bonusId=r.handControl.next.supplement.id;
  const concealed=g.getConcealedGangChoices(g.players[0]).find(c=>c.tiles[0].suit==='tong');normalActions('anGang',{tileIds:concealed.tiles.map(t=>t.id)});if(r.prompt.kind==='beforeGang')normalActions('beforeGang');
  assert.equal(g.lastDrawn.id,bonusId);assert.equal(JSON.stringify(g.players.slice(1)),others);checkTiles(g);assert(g.players.every(p=>p.score===0));
  console.log('✓ 对局中保存的起手牌等下一局才生效；定向杠后补牌不改变其他三家牌和杠分结算规则');
  await mutate('select',{seat:'south'});assert.equal(r.handControl.opening,null);assert.equal(r.handControl.next.normal,null);assert.equal(r.handControl.next.supplement,null);
  await mutate('opening',{tiles:[],extra:''});assert.equal(r.handControl.opening,null);
  const config=JSON.stringify(r.config);assert.equal(config,unchanged);assert.equal(g.aiSeats.size,0); // Four humans, not forced by admin.
  console.log('✓ 切换角色会清除旧角色待执行设置；房间规则、计分、真人控制权始终保持');
  await request(base,'/api/test-admin/logout',{},headers);assert.equal((await request(base,'/api/test-admin/bootstrap',undefined,headers)).status,401);
  console.log('Single-seat admin HTTP suite passed');
 }finally{server.closeAllConnections?.();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
