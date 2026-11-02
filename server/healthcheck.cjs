const http=require('node:http');
const req=http.get('http://127.0.0.1:'+(process.env.PORT||7458)+'/api/health',res=>{
 let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>{try{process.exit(res.statusCode===200&&JSON.parse(body).ok===true?0:1);}catch{process.exit(1);}});
});req.setTimeout(4000,()=>{req.destroy();process.exit(1);});req.on('error',()=>process.exit(1));
