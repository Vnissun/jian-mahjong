const {createServer}=require('../server/server.cjs'),{spawn}=require('node:child_process');
const server=createServer();server.listen(0,'127.0.0.1',()=>{
 const child=spawn(process.execPath,['tools/online-browser.cjs'],{stdio:'inherit',env:{...process.env,ONLINE_URL:'http://127.0.0.1:'+server.address().port}});
 child.on('exit',code=>{server.closeAllConnections?.();server.close(()=>{process.exitCode=code||0;});});
});
