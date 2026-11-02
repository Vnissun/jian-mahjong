const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const {FriendRoom,fail}=require('./rooms.cjs');
function createServer(options={}){
 const password=options.accessPassword??process.env.ACCESS_PASSWORD??'CHANGE_ME_ACCESS_PASSWORD';
 const gate=password?require('./access.cjs')(password,options.publicUrl||process.env.PUBLIC_URL):null;
 const rooms=new Map(),limits=new Map(),root=path.resolve(options.root||path.join(__dirname,'../build/web-repaired'));
 // Read once at process startup: an old process must not claim a newly uploaded release.
 let release={version:'development',webSha256:null};try{release=JSON.parse(fs.readFileSync(path.join(__dirname,'release.json'),'utf8'));}catch{}
 const startedAt=new Date().toISOString();
 const publicOrigin=options.publicUrl||process.env.PUBLIC_URL;const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 const testAdmin=require('./test-admin.cjs').createTestAdmin({...options,publicUrl:publicOrigin},rooms,json);
 const timer=setInterval(()=>{for(const [code,room]of rooms){try{room.tick();}catch(e){console.error('Room timer:',e.message);}const humans=room.members.filter(m=>!m.isBot);if(Date.now()-(humans.length?Math.max(...humans.map(m=>m.lastSeen)):room.lastActivity)>30*60000&&humans.every(m=>!room.connected(m))){room.game?.stop();room.voice.close();for(const wake of Array.from(room.waiters))wake();rooms.delete(code);}}for(const [key,bucket]of limits)if(Date.now()-bucket.since>120000)limits.delete(key);},250);timer.unref();
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   if(gate&&await gate(req,res,url))return;
   if(await testAdmin(req,res,url))return;
   if(url.pathname.startsWith('/api/')){
    if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin).host;}catch{fail('来源无效',403);}const allowed=req.headers.host;if(origin!==allowed&&(!publicOrigin||req.headers.origin!==new URL(publicOrigin).origin))fail('来源无效',403);}
    const key=req.socket.remoteAddress,bucket=limits.get(key)||{since:Date.now(),count:0};if(Date.now()-bucket.since>60000){bucket.since=Date.now();bucket.count=0;}bucket.count++;limits.set(key,bucket);if(bucket.count>600)fail('操作过于频繁，请稍后重试',429);
    if(req.method==='GET'&&url.pathname==='/api/access/status')return json(res,200,{ok:true});
    if(req.method==='GET'&&url.pathname==='/api/health'){
     let servedWebSha256=null;try{servedWebSha256=crypto.createHash('sha256').update(await fs.promises.readFile(path.join(root,'assets/main/index.js'))).digest('hex');}catch{}
     return json(res,200,{ok:true,version:release.version,startedAt,webSha256:release.webSha256,servedWebSha256,webMatchesRelease:!!release.webSha256&&release.webSha256===servedWebSha256});
    }
    const voiceMatch=url.pathname.match(/^\/api\/rooms\/(\d{6})\/voice\/(state|quick|claim|release|upload|clips\/([a-f0-9-]+))$/);
    if(voiceMatch){
     const room=rooms.get(voiceMatch[1]);if(!room)fail('房间不存在或已过期',404);
     const m=room.auth((req.headers.authorization||'').replace(/^Bearer /,''),false),voice=room.voice,op=voiceMatch[2];
     if(op==='state'&&req.method==='GET'){
      if(Number(url.searchParams.get('since'))===voice.revision&&url.searchParams.get('wait')==='1')await new Promise(resolve=>{let timeout;const wake=()=>{clearTimeout(timeout);voice.waiters.delete(wake);res.off('close',wake);resolve();};voice.waiters.add(wake);timeout=setTimeout(wake,10000);res.once('close',wake);});
      if(!res.destroyed)return json(res,200,voice.state());return;
     }
     if(op.startsWith('clips/')&&req.method==='GET'){
      const bytes=voice.get(voiceMatch[3]);res.writeHead(200,{'Content-Type':'audio/wav','Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);return;
     }
     if(req.method!=='POST')fail('请求方式无效',405);
     const parts=[];let length=0;for await(const part of req){length+=part.length;if(length>(op==='upload'?320044:2048))fail('录音文件过大',413);parts.push(part);}const body=Buffer.concat(parts);
     if(op==='upload'){
      try{return json(res,200,voice.upload(m,req.headers['x-voice-key'],body));}catch(e){voice.release(m,req.headers['x-voice-key']);throw e;}
     }
     if(op==='claim'){if(!room.connected(m))fail('请先返回对局',403);return json(res,200,voice.claim(m));}
     let data;try{data=JSON.parse(body.toString()||'{}');}catch{fail('请求格式无效');}
     if(op==='quick'){
      if(!['playing','settled','finished'].includes(room.phase)||!room.connected(m))fail('请先进入好友对局',403);
      let target;if(data?.targetId!==undefined){target=room.members.find(x=>x.id===data.targetId);if(data.type!=='emoji'||!target||target.id===m.id)fail('请选择本桌其他玩家发送表情');}
      return json(res,200,voice.quick(m,data?.type,data?.id,target));
     }
     voice.release(m,data?.key);return json(res,200,{ok:true});
    }
    let data={};if(req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>8192)fail('请求过大',413);}try{data=JSON.parse(body||'{}');if(!data||Array.isArray(data)||typeof data!=='object')fail('请求无效');}catch{fail('请求格式无效');}}
    if(req.method==='POST'&&url.pathname==='/api/rooms'){if(rooms.size>=200)fail('房间已满，请稍后再试',503);let code;do{code=String(crypto.randomInt(100000,1000000));}while(rooms.has(code));const room=new FriendRoom(code,data.name,data.config);rooms.set(code,room);const member=room.members[0];return json(res,200,{token:member.token,state:room.snapshot(member)});}
    const match=url.pathname.match(/^\/api\/rooms\/(\d{6})\/(join|state|action|leave|disconnect)$/);if(!match)fail('接口不存在',404);const room=rooms.get(match[1]);if(!room)fail('房间不存在或已过期',404);
    if(match[2]==='join'&&req.method==='POST'){const m=room.add(data.name);return json(res,200,{token:m.token,state:room.snapshot(m)});}
    const m=room.auth(match[2]==='disconnect'?data.token:(req.headers.authorization||'').replace(/^Bearer /,''));
    if(match[2]==='disconnect'&&req.method==='POST'){room.disconnect(m);return json(res,200,{ok:true});}
    if(match[2]==='state'&&req.method==='GET'){
     if(Number(url.searchParams.get('since'))===room.revision&&url.searchParams.get('wait')==='1'){
      await new Promise(resolve=>{let timeout;const wake=()=>{clearTimeout(timeout);room.waiters.delete(wake);res.off('close',wake);resolve();};room.waiters.add(wake);timeout=setTimeout(wake,10000);res.once('close',wake);});
     }if(!res.destroyed)return json(res,200,room.snapshot(m));return;
    }
    if(match[2]==='action'&&req.method==='POST'){room.action(m,data);return json(res,200,room.snapshot(m));}
    if(match[2]==='leave'&&req.method==='POST'){room.leave(m);return json(res,200,{ok:true});}fail('请求方式无效',405);
   }
   if(req.method!=='GET'&&req.method!=='HEAD')fail('请求方式无效',405);
   let filename=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(filename!==root&&!filename.startsWith(root+path.sep))fail('禁止访问',403);if(fs.existsSync(filename)&&fs.statSync(filename).isDirectory())filename=path.join(filename,'index.html');
   const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.wasm':'application/wasm','.ico':'image/x-icon','.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
   const bytes=await fs.promises.readFile(filename);
   const headers={'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Accept-Ranges':'bytes','Content-Length':bytes.length};
   // iOS media playback probes byte ranges before loading WAV/audio data.
   // Without a validator for If-Range, send the full representation in that case.
   const range=req.method==='GET'&&!req.headers['if-range']&&typeof req.headers.range==='string'?req.headers.range.match(/^bytes=(\d*)-(\d*)$/):null;
   if(range&&(range[1]||range[2])){
    const start=range[1]?Number(range[1]):Math.max(0,bytes.length-Number(range[2]));
    const end=range[1]&&range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=bytes.length||end<start){res.writeHead(416,{...headers,'Content-Range':'bytes */'+bytes.length,'Content-Length':0});res.end();return;}
    const chunk=bytes.subarray(start,end+1);res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':chunk.length});res.end(chunk);return;
   }
   res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:bytes);
  }catch(e){if(!res.headersSent&&!res.destroyed)json(res,e.status||(e.code==='ENOENT'?404:500),{error:e.status?e.message:e.code==='ENOENT'?'文件不存在':'服务暂时不可用'});if(!e.status&&e.code!=='ENOENT')console.error(e);}
 });server.on('close',()=>{clearInterval(timer);for(const room of rooms.values())room.voice.close();});server.rooms=rooms;return server;
}
if(require.main===module){const port=Number(process.env.PORT||7458),host=process.env.HOST||'0.0.0.0';createServer().listen(port,host,()=>console.log('集安麻将联机服务 http://'+host+':'+port));}
module.exports={createServer};
