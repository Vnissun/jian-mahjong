// Small test client that also works on Node 16 (no global fetch dependency).
const http=require('node:http'),https=require('node:https');
module.exports=function request(url,options={}){return new Promise((resolve,reject)=>{
 const target=new URL(url),body=options.body;
 const req=(target.protocol==='https:'?https:http).request(target,{method:options.method||'GET',headers:options.headers||{},agent:false},res=>{
  const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');resolve({status:res.statusCode,ok:res.statusCode>=200&&res.statusCode<300,json:async()=>JSON.parse(text),text:async()=>text});});res.on('error',reject);
 });req.on('error',reject);req.setTimeout(27000,()=>req.destroy(new Error('HTTP timeout')));req.end(body);
});};
