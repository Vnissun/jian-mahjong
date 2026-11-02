const assert=require('node:assert/strict'),request=require('../tools/http-request.cjs'),http=require('node:http');
const {createServer}=require('./server.cjs');
function wav(){const b=Buffer.alloc(32044);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(32000,40);return b;}
(async()=>{const server=createServer({accessPassword:''});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const call=async(p,body,token,headers={})=>{const res=await request(base+p,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body)});return {status:res.status,data:await res.json()};};
 try{
  const a=(await call('/api/rooms',{name:'甲'})).data,code=a.state.code,b=(await call('/api/rooms/'+code+'/join',{name:'乙'})).data,c=(await call('/api/rooms',{name:'外人'})).data,root='/api/rooms/'+code+'/voice/';
  assert.equal((await call(root+'state')).status,401);assert.equal((await call(root+'state',undefined,c.token)).status,401);const first=(await call(root+'state',undefined,b.token)).data,key=(await call(root+'claim',{},a.token)).data.key;
  assert.equal((await call(root+'claim',{},b.token)).status,409);const pending=call(root+'state?wait=1&since='+server.rooms.get(code).voice.revision,undefined,b.token);
  assert.equal((await call(root+'upload',wav(),b.token,{'X-Voice-Key':key})).status,409);assert.equal(server.rooms.get(code).voice.lock.playerId,a.state.localId);
  const uploaded=await call(root+'upload',wav(),a.token,{'X-Voice-Key':key});assert.equal(uploaded.status,200);assert.equal(uploaded.data.duration,1000);const state=(await pending).data;assert.equal(state.clips.length,1);assert.equal(state.lock,null);assert(!JSON.stringify(state).includes(key));
  await new Promise((resolve,reject)=>http.get(base+root+'clips/'+uploaded.data.id,{headers:{Authorization:'Bearer '+b.token}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{assert.equal(res.statusCode,200);assert.equal(res.headers['content-type'],'audio/wav');assert(Buffer.concat(chunks).equals(wav()));resolve();});}).on('error',reject));
  assert.equal((await call(root+'state',undefined,a.token,{Origin:'https://invalid.test'})).status,403);const key2=(await call(root+'claim',{},b.token)).data.key;assert.equal((await call(root+'upload',Buffer.from('bad'),b.token,{'X-Voice-Key':key2})).status,400);assert.equal(server.rooms.get(code).voice.lock,null);
  console.log('✓ HTTP房间隔离、同时抢麦、禁止冒用、上传唤醒收听方、音频下载与异常释放通过');
 }finally{server.closeAllConnections?.();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
