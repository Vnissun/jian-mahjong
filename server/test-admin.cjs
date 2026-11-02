const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {HandControl,SEATS,key}=require('./hand-control.cjs');
const {ALL_TILES}=require('./dist/data/TileCatalog');
const {fail}=require('./rooms.cjs');
const hash=v=>crypto.createHash('sha256').update(v).digest();
function adminPassword(options){
 if(options.testAdminPassword===false||process.env.TEST_ADMIN_ENABLED==='0')return '';
 const configured=options.testAdminPassword||process.env.TEST_ADMIN_PASSWORD;
 if(configured){if(typeof configured!=='string'||configured.length<12)throw Error('测试后台密码至少12个字符');return configured;}
 // Independent from the password shared with players. Never include this file in releases.
 const filename=options.testAdminSecretFile||path.join(__dirname,'test-admin-secret.json');
 try{const value=JSON.parse(fs.readFileSync(filename,'utf8')).password;if(typeof value!=='string'||value.length<12)throw Error('密码格式无效');return value;}
 catch(e){if(e.code!=='ENOENT'){console.error('测试后台密码文件无法读取，后台已关闭');return '';}}
 const password=crypto.randomBytes(18).toString('base64url');
 try{fs.writeFileSync(filename,JSON.stringify({password},null,2)+'\n',{flag:'wx',mode:0o600});console.log('测试后台已启用：/test-admin/，独立密码保存在 '+filename);return password;}
 catch(e){console.error('测试后台密码文件无法创建，后台已关闭；可配置 TEST_ADMIN_PASSWORD');return '';}
}
function createTestAdmin(options,rooms,json){
 const password=adminPassword(options),expected=password?hash(password):null,sessions=new Map(),attempts=new Map();
 const send=(res,status,data)=>{res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');json(res,status,data);};
 const list=()=>Array.from(rooms.values()).filter(r=>r.members.length).map(r=>({code:r.code,phase:r.phase,members:r.members.map(m=>({seat:m.seat,name:m.name,isBot:!!m.isBot,connected:r.connected(m)}))}));
 function detail(r){
  const g=r.game,available={};if(g)for(const t of [...g.wall.drawStack.slice(g.wall.drawIndex),...g.wall.kongStack.slice(0,g.wall.kongStack.length-g.wall.kongIndex)])available[key(t)]=(available[key(t)]||0)+1;
  return {code:r.code,phase:r.phase,control:r.handControl?.state()??null,members:list().find(x=>x.code===r.code)?.members??[],
   players:g?g.players.map(p=>({seat:p.seat,name:p.name,hand:p.hand,melds:p.melds,discards:p.discards,score:p.score,riichi:p.state.riichi,isDealer:p.state.isDealer})):[],
   currentSeat:g?.currentSeat??null,nextDealer:g?.room.currentDealer??'east',available,result:r.result,gangs:r.gangs};
 }
 return async(req,res,url)=>{
  const page=url.pathname==='/test-admin'||url.pathname.startsWith('/test-admin/'),api=url.pathname.startsWith('/api/test-admin/');
  if(!page&&!api)return false;
  if(!expected){send(res,404,{error:'测试后台未启用'});return true;}
  if(page){
   const files={'/test-admin':'index.html','/test-admin/':'index.html','/test-admin/index.html':'index.html','/test-admin/admin.js':'admin.js','/test-admin/admin.css':'admin.css'},name=files[url.pathname];
   if(!name)fail('页面不存在',404);if(!['GET','HEAD'].includes(req.method))fail('请求方式无效',405);
   const bytes=fs.readFileSync(path.join(__dirname,'test-admin',name));
   res.writeHead(200,{'Content-Type':name.endsWith('.js')?'application/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});res.end(req.method==='HEAD'?undefined:bytes);return true;
  }
  const now=Date.now();for(const [k,s]of sessions)if(s.until<now)sessions.delete(k);for(const [k,a]of attempts)if(now-a.at>600000)attempts.delete(k);
  if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin).host;}catch{fail('来源无效',403);}if(origin!==req.headers.host&&req.headers.origin!==options.publicUrl)fail('来源无效',403);}
  let data={};if(req.method==='POST'){
   // JSON and same-origin checks also prevent cross-site form submissions.
   if(!String(req.headers['content-type']).startsWith('application/json'))fail('需要JSON请求',415);
   let body='';for await(const part of req){body+=part;if(Buffer.byteLength(body)>32768)fail('测试请求过大',413);}
   try{data=JSON.parse(body||'{}');}catch{fail('JSON格式错误');}if(!data||typeof data!=='object'||Array.isArray(data))fail('请求格式错误');
  }
  const cookie=(req.headers.cookie||'').match(/(?:^|;\s*)mahjong_test_admin=([a-f0-9]{64})(?:;|$)/),session=cookie&&sessions.get(cookie[1]);
  const secure=options.publicUrl?.startsWith('https:')||req.socket.encrypted;
  const cookieValue=(token,max)=>'mahjong_test_admin='+token+'; Path=/api/test-admin; HttpOnly; SameSite=Strict; Max-Age='+max+(secure?'; Secure':'');
  if(url.pathname==='/api/test-admin/login'&&req.method==='POST'){
   const ip=req.socket.remoteAddress,a=attempts.get(ip)||{at:now,count:0};if(a.count>=10)fail('后台密码尝试过多，请10分钟后再试',429);
   if(!crypto.timingSafeEqual(expected,hash(typeof data.password==='string'?data.password:''))){a.count++;attempts.set(ip,a);fail('后台密码不正确',401);}
   attempts.delete(ip);if(sessions.size>=100)sessions.delete(sessions.keys().next().value);
   if(cookie)sessions.delete(cookie[1]);const token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(24).toString('hex');sessions.set(token,{until:now+8*3600000,csrf});
   res.setHeader('Set-Cookie',cookieValue(token,8*3600));send(res,200,{ok:true,csrf});return true;
  }
  if(!session||session.until<now)fail('请先登录独立测试后台',401);
  if(req.method==='POST'&&req.headers['x-test-csrf']!==session.csrf)fail('后台会话校验失败，请刷新页面',403);
  if(url.pathname==='/api/test-admin/logout'&&req.method==='POST'){sessions.delete(cookie[1]);res.setHeader('Set-Cookie',cookieValue('',0));send(res,200,{ok:true});return true;}
  if(url.pathname==='/api/test-admin/bootstrap'&&req.method==='GET'){
   send(res,200,{csrf:session.csrf,rooms:list(),catalog:Array.from(TYPES())});return true;
  }
  const match=url.pathname.match(/^\/api\/test-admin\/rooms\/(\d{6})(?:\/(select|opening|next|clear))?$/);
  if(!match)fail('接口不存在',404);const r=rooms.get(match[1]);if(!r)fail('房间不存在或已过期',404);
  if(req.method==='GET'&&!match[2]){send(res,200,detail(r));return true;}
  if(req.method!=='POST')fail('请求方式无效',405);const op=match[2];
  const allowed={select:['seat','version'],opening:['seat','version','tiles','extra'],next:['seat','version','kind','tile'],clear:['seat','version']}[op];
  if(!allowed||Object.keys(data).some(k=>!allowed.includes(k)))fail('此后台只支持所选座位的牌，不支持修改房间规则或代操作');
  if(!SEATS.includes(data.seat))fail('请选择东南西北中的一个座位');
  if((r.handControl?.version??0)!==data.version)fail('后台设置已变化，请刷新后重试',409);
  if(op==='select'){
   if(!r.handControl)r.handControl=new HandControl(data.seat);else r.handControl.select(data.seat);
  }else{
   if(!r.handControl||r.handControl.seat!==data.seat)fail('请先选择该座位，不能操作其他座位',409);
   if(op==='opening')r.handControl.setOpening(data.tiles,data.extra);
   else if(op==='next'){if(r.phase!=='playing')fail('请在本局开始后指定下一张牌');r.handControl.setNext(r.game,data.kind,data.tile);}
   else {r.handControl.opening=null;r.handControl.next={normal:null,supplement:null};r.handControl.version++;r.handControl.log('已清除尚未生效的起手牌和摸牌设置');}
  }
  send(res,200,detail(r));return true;
 };
}

function TYPES(){return new Map(ALL_TILES.map(t=>[key(t),{key:key(t),name:t.name,suit:t.suit,rank:t.rank}])).values();}
module.exports={createTestAdmin};
