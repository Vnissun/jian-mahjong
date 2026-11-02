const fs=require('node:fs'),path=require('node:path'),ts=require('../tools/typescript.cjs')();
const source=path.resolve(__dirname,'../assets/scripts'),target=path.join(__dirname,'dist');
for(const dir of ['core','config','data','game'])for(const file of fs.readdirSync(path.join(source,dir)).filter(f=>f.endsWith('.ts'))){const out=ts.transpileModule(fs.readFileSync(path.join(source,dir,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS},fileName:file});fs.mkdirSync(path.join(target,dir),{recursive:true});fs.writeFileSync(path.join(target,dir,file.replace(/\.ts$/,'.js')),out.outputText);}
console.log('Server rules compiled');
