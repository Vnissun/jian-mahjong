const crypto=require('node:crypto');
const page=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>集安麻将 · 好友登录</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 30%,#20574a,#091f1e 80%);color:#f5efdb;font:18px sans-serif}form{width:min(80vw,360px);padding:36px;background:#0f2b28;border:1px solid #817343;border-radius:24px;box-shadow:0 24px 80px #0006}input,button{box-sizing:border-box;width:100%;padding:14px;margin:12px 0;font-size:18px;border-radius:8px;border:0}button{background:linear-gradient(135deg,#c6a667,#89672f);color:#fff9e8;cursor:pointer}h2{color:#e0c07e;font-weight:500;letter-spacing:2px}input{background:#082723;color:#f5efdb;border:1px solid #536c54;outline-color:#e0c07e}p{font-size:14px;color:#d9c695}</style><form id="login"><h2>集安麻将 · 好友登录</h2><p>输入好友访问密码后进入游戏</p><input id="password" type="password" autocomplete="current-password" placeholder="访问密码" required maxlength="128"><button>登录进入</button><p id="message" role="status"></p></form><script>document.getElementById('login').onsubmit=async function(e){e.preventDefault();var button=this.querySelector('button');button.disabled=true;try{var res=await fetch('/api/access/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('password').value})});var data=await res.json();if(!res.ok)throw Error(data.error||'登录失败');location.reload();}catch(error){document.getElementById('message').textContent=error.message;}finally{button.disabled=false;}};</script></html>`;
module.exports=function accessGate(password,publicUrl){
 const expected=crypto.createHash('sha256').update(password).digest(),sessions=new Map(),attempts=new Map();
 return async(req,res,url)=>{
  const now=Date.now();for(const [key,until]of sessions)if(until<now)sessions.delete(key);for(const [key,b]of attempts)if(now-b.since>600000)attempts.delete(key);
  if(url.pathname==='/api/health')return false;
  const cookie=(req.headers.cookie||'').match(/(?:^|;\s*)mahjong_access=([a-f0-9]{64})(?:;|$)/),authenticated=cookie&&sessions.get(cookie[1])>now;
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(url.pathname==='/api/access/login'&&req.method==='POST'){
   const origin=req.headers.origin; if(origin&&new URL(origin).host!==req.headers.host&&origin!==publicUrl){json(403,{error:'来源无效'});return true;}
   const key=req.socket.remoteAddress,b=attempts.get(key)||{since:now,count:0};if(b.count>=15){json(429,{error:'尝试过多，请10分钟后再试'});return true;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>1024){json(413,{error:'请求过大'});return true;}}
   let value;try{value=JSON.parse(body).password;}catch{}const actual=crypto.createHash('sha256').update(typeof value==='string'?value:'').digest();
   if(!crypto.timingSafeEqual(expected,actual)){b.count++;attempts.set(key,b);json(401,{error:'密码不正确'});return true;}
   attempts.delete(key);const token=crypto.randomBytes(32).toString('hex');sessions.set(token,now+86400000);const secure=publicUrl?.startsWith('https:')||req.socket.encrypted;
   res.setHeader('Set-Cookie','mahjong_access='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400'+(secure?'; Secure':''));json(200,{ok:true});return true;
  }
  if(authenticated)return false;
  if(url.pathname.startsWith('/api/'))json(401,{error:'请先输入访问密码登录',loginRequired:true});
  else{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:page);}
  return true;
 };
};
