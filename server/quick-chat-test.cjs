const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs');
const {createServer}=require('./server.cjs'),{QUICK_PHRASES,QUICK_EMOJIS,THROW_EMOJI_IDS}=require('./dist/data/QuickChat');
const {RoomVoice}=require('./voice.cjs');
const request=(base,path,body,token,extra={})=>new Promise((resolve,reject)=>{const data=body===undefined?null:Buffer.from(JSON.stringify(body)),req=http.request(base+path,{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json','Content-Length':data.length}:{}),...(token?{Authorization:'Bearer '+token}:{}),...extra}},res=>{const parts=[];res.on('data',p=>parts.push(p));res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(Buffer.concat(parts).toString())}));});req.on('error',reject);req.end(data);});
(async()=>{
 const sources=JSON.parse(fs.readFileSync('web-assets/sounds/quick/sources.json','utf8'));assert.equal(sources.clips.length,QUICK_PHRASES.length);
 for(const clip of sources.clips){assert(QUICK_PHRASES.some(p=>p.id===clip.id));assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync('web-assets/sounds/quick/'+clip.id+'.wav')).digest('hex'),clip.wavSha256);assert(clip.duration>.3&&clip.duration<10);}
 const v=new RoomVoice(),m={id:'a',name:'甲'};for(const [type,list]of [['phrase',QUICK_PHRASES],['emoji',QUICK_EMOJIS]])for(const item of list){v.quickSent.clear();const e=v.quick(m,type,item.id,type==='emoji'&&THROW_EMOJI_IDS.includes(item.id)?{id:'b',name:'乙'}:undefined);assert.equal(e.text,item.text);if(type==='phrase'){const b=fs.readFileSync('web-assets/sounds/quick/'+item.id+'.wav');assert.equal(b.toString('ascii',0,4),'RIFF');assert(b.length>10000);assert(b.subarray(100).some(x=>x!==0),'audio cannot be silent');}}
 assert.equal(v.messages.length,24);assert.throws(()=>v.quick(m,'phrase','great'),/3秒/);v.tick(Date.now()+61000);assert.equal(v.messages.length,0);
 const server=createServer({accessPassword:false,testAdminPassword:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  const a=(await request(base,'/api/rooms',{name:'甲'})).data,b=(await request(base,'/api/rooms/'+a.state.code+'/join',{name:'乙'})).data,c=(await request(base,'/api/rooms',{name:'外人'})).data,r=server.rooms.get(a.state.code),root='/api/rooms/'+r.code+'/voice/';
  assert.equal((await request(base,root+'quick',{type:'phrase',id:'great'},a.token)).status,403);r.members.forEach(m=>m.ready=true);r.start();r.tick();
  assert.equal((await request(base,root+'quick',{type:'phrase',id:'great'})).status,401);assert.equal((await request(base,root+'quick',{type:'emoji',id:'like'},c.token)).status,401);
  assert.equal((await request(base,root+'quick',{type:'phrase',id:'great'},a.token,{Origin:'https://bad.invalid'})).status,403);
  const before=JSON.stringify({rev:r.revision,prompt:r.prompt,players:r.game.players}),revision=r.voice.revision;
  const pending=request(base,root+'state?wait=1&since='+revision,undefined,b.token);
  const sent=await request(base,root+'quick',{type:'phrase',id:'great',playerId:'forged',text:'forged'},a.token);assert.equal(sent.status,200);assert.equal(sent.data.playerId,a.state.localId);assert.equal(sent.data.text,QUICK_PHRASES[0].text);
  const update=(await pending).data;assert.equal(update.messages[0].seq,sent.data.seq);assert.equal(update.messageSequence,1);assert.equal(update.messages[0].type,'phrase');assert.equal(JSON.stringify({rev:r.revision,prompt:r.prompt,players:r.game.players}),before);
  assert.equal((await request(base,root+'quick',{type:'emoji',id:'like'},a.token)).status,429);
  assert.equal((await request(base,root+'quick',{type:'emoji',id:'invalid'},b.token)).status,400);
  assert.equal((await request(base,root+'quick',{type:'emoji',id:'like',targetId:'not-in-room'},b.token)).status,400);
  assert.equal((await request(base,root+'quick',{type:'emoji',id:'like',targetId:b.state.localId},b.token)).status,400);
  assert.equal((await request(base,root+'quick',{type:'phrase',id:'thanks',targetId:a.state.localId},b.token)).status,400);
  assert.equal((await request(base,root+'quick',{type:'emoji',id:'poop'},b.token)).status,400);
  const targeted=await request(base,root+'quick',{type:'emoji',id:'like',targetId:a.state.localId,targetName:'forged'},b.token);assert.equal(targeted.status,200);assert.equal(targeted.data.targetId,a.state.localId);assert.equal(targeted.data.targetName,'甲');assert.equal(targeted.data.playerId,b.state.localId);
  for(const id of THROW_EMOJI_IDS){r.voice.quickSent.clear();const sent=await request(base,root+'quick',{type:'emoji',id,targetId:a.state.localId},b.token);assert.equal(sent.status,200);assert.equal(sent.data.id,id);assert.equal(sent.data.targetId,a.state.localId);assert.equal((await request(base,root+'state',undefined,a.token)).data.messages.at(-1).id,id);}
  r.disconnect(r.members[1]);assert.equal((await request(base,root+'quick',{type:'phrase',id:'hurry'},b.token)).status,403);assert(r.members[1].autoPlay);
  console.log('PASS 12 audible WAV assets + 17 emoji including 5 targeted throws; authenticated room broadcast, 3s cooldown, no spoof, no arbitrary text, no cross-room access, no change to selected hand/timer/game revision; offline stays trusted');
 }finally{server.closeAllConnections?.();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
