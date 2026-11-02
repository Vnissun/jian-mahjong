const assert=require('node:assert/strict'),crypto=require('node:crypto'),request=require('../tools/http-request.cjs');
const {createServer}=require('./server.cjs');
(async()=>{
 const server=createServer({accessPassword:''});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const call=async(p,body,token,extra={})=>{const r=await request(base+p,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 try{
  const host=(await call('/api/rooms',{name:'甲'})).data,code=host.state.code,guest=(await call('/api/rooms/'+code+'/join',{name:'乙'})).data,r=server.rooms.get(code);
  const action=(c,type,payload={})=>call('/api/rooms/'+code+'/action',{type,...payload,revision:r.revision,requestId:crypto.randomUUID()},c.token);
  await action(host,'ready');await action(guest,'ready');assert.equal((await action(host,'start')).status,200);assert.equal(r.members.length,4);
  assert.equal((await call('/api/rooms/'+code+'/disconnect',{})).status,401);
  assert.equal((await call('/api/rooms/'+code+'/disconnect',{token:host.token},null,{Origin:'https://invalid.test'})).status,403);
  assert.equal((await call('/api/rooms/'+code+'/disconnect',{token:host.token})).status,200);assert(r.members[0].autoPlay);assert(!r.connected(r.members[0]));
  assert.equal((await call('/api/rooms/'+code+'/disconnect',{token:guest.token})).status,200);assert(r.members.slice(0,2).every(m=>m.autoPlay));
  await new Promise(r=>setTimeout(r,600));assert.equal(server.rooms.get(code),r,'全员离线时不能立即删除房间');
  const returned=(await call('/api/rooms/'+code+'/state',undefined,host.token)).data;assert.equal(returned.localId,host.state.localId);assert(!returned.members[0].autoPlay);assert(returned.members[0].connected);assert.equal(returned.members.length,4);
  assert.equal((await call('/api/rooms/'+code+'/join',{name:'甲'})).status,400,'不能只凭同名顶替别人');
  console.log('✓ HTTP断线通知认证、跨站拒绝、全员离线保留房间、原身份接管及同名防冒用通过');
 }finally{server.closeAllConnections?.();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
