// Preview and friend rooms share the same HTTP service.
const {createServer}=require('../server/server.cjs');
const port=Number(process.env.PORT||7457),host=process.env.HOST||'127.0.0.1';
createServer().listen(port,host,()=>console.log('集安麻将：http://'+host+':'+port));
