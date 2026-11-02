const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createServer}=require('./server.cjs');
function request(base,{method='GET',headers={},body}={}){return new Promise((resolve,reject)=>{const req=http.request(base,{method,headers},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(chunks)}));});req.on('error',reject);req.end(body);});}
(async()=>{const server=createServer({accessPassword:'CHANGE_ME_ACCESS_PASSWORD'});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;try{
 const login=await request(base+'/api/access/login',{method:'POST',body:JSON.stringify({password:'CHANGE_ME_ACCESS_PASSWORD'})}),Cookie=login.headers['set-cookie'][0].split(';')[0];
 const url=base+'/sounds/peng.wav',file=fs.readFileSync(path.join(__dirname,'../build/web-repaired/sounds/peng.wav'));
 const get=(range,extra={})=>request(url,{headers:{Cookie,...(range?{Range:range}:{}),...extra}});
 const full=await get();assert.equal(full.status,200);assert.equal(full.headers['accept-ranges'],'bytes');assert.equal(full.headers['content-type'],'audio/wav');assert.equal(+full.headers['content-length'],file.length);assert.deepEqual(full.bytes,file);
 for(const [range,start,end]of [['bytes=0-1',0,1],['bytes=2-99',2,99],['bytes=100-',100,file.length-1],['bytes=-100',file.length-100,file.length-1],['bytes=0-999999',0,file.length-1]]){
  const r=await get(range);assert.equal(r.status,206);assert.equal(r.headers['content-range'],`bytes ${start}-${end}/${file.length}`);assert.equal(+r.headers['content-length'],end-start+1);assert.deepEqual(r.bytes,file.subarray(start,end+1));
 }
 for(const range of ['bytes=999999-','bytes=10-2','bytes=-0']){const r=await get(range);assert.equal(r.status,416);assert.equal(r.headers['content-range'],'bytes */'+file.length);assert.equal(r.bytes.length,0);}
 const head=await request(url,{method:'HEAD',headers:{Cookie,Range:'bytes=0-1'}});assert.equal(head.status,200);assert.equal(+head.headers['content-length'],file.length);assert.equal(head.bytes.length,0);
 const ifRange=await get('bytes=0-1',{'If-Range':'"unknown"'});assert.equal(ifRange.status,200);assert.deepEqual(ifRange.bytes,file);
 const locked=await request(url,{headers:{Range:'bytes=0-1'}});assert.equal(locked.status,200);assert(locked.headers['content-type'].startsWith('text/html'));assert(locked.bytes.toString().includes('好友登录'));
 console.log('Media tests passed: authenticated iOS 2-byte probe, exact/suffix/open ranges, full/HEAD lengths, 416, If-Range, access gate');
}finally{await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
