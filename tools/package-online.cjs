require('./sync-web-audio.cjs');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),name='ji-an-mahjong-online-'+new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14),stage=path.join(root,'release',name);
fs.mkdirSync(stage,{recursive:true});
const release={version:name,webSha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'build/web-repaired/assets/main/index.js'))).digest('hex')};
fs.writeFileSync(path.join(root,'server/release.json'),JSON.stringify(release,null,2)+'\n');
const entries=['build/web-repaired','server/dist','server/server.cjs','server/release.json','server/access.cjs','server/rooms.cjs','server/build.cjs','server/nginx.conf.example','server/start-production.cjs','server/production.json','server/healthcheck.cjs','ecosystem.config.cjs','BAOTA-NODEJS.md','UPDATE-CHECK.md','MOBILE-UPDATE.md','ACCESS-UPDATE.md','SETTLEMENT-UPDATE.md','AUDIO-UPDATE.md','IOS-AUDIO-FIX.md','BOTS-UPDATE.md','RULES-REVIEW-UPDATE.md','GAME-UI-UPDATE.md','TILE-ARTWORK.md','STANDING-AUTO-UPDATE.md','PERSPECTIVE-TILES-UPDATE.md','ARTWORK-SPEC.md','ARTWORK-UI-UPDATE.md','REFERENCE-UI-UPDATE.md','UI-POLISH-UPDATE.md','tools/typescript.cjs','package.json','Dockerfile','compose.yaml','.dockerignore','DEPLOY.md'];
entries.push('GANG-SCORE-FIX.md','CLEAR-BASE-UPDATE.md','server/clear-base-test.cjs');
entries.push('ONLINE-CONTROLS-UPDATE.md');
entries.push('server/controls-test.cjs');
entries.push('server/controls-http-test.cjs');
entries.push('server/riichi-auto-win-test.cjs','RIICHI-AUTO-WIN-UPDATE.md');
entries.push('server/supplement-claims-test.cjs','SUPPLEMENT-CLAIMS-UPDATE.md');
entries.push('server/quick-chat-test.cjs','QUICK-CHAT-UPDATE.md','THROW-EMOJI-UPDATE.md');
entries.push('server/voice.cjs','VOICE-MESSAGES-UPDATE.md');
entries.push('server/ai-strategy-test.cjs','BOT-STRATEGY-UPDATE.md');
entries.push('server/test-admin.cjs','server/hand-control.cjs','server/test-admin','server/test-admin-test.cjs','TEST-ADMIN-GUIDE.md');
for(const item of entries){const target=path.join(stage,item);fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(path.join(root,item),target,{recursive:true});}
for(const folder of ['core','config','data','game']){const source=path.join(root,'assets/scripts',folder),target=path.join(stage,'assets/scripts',folder);fs.mkdirSync(target,{recursive:true});for(const file of fs.readdirSync(source).filter(f=>f.endsWith('.ts')))fs.copyFileSync(path.join(source,file),path.join(target,file));}
const archive=path.join(root,'release',name+'.tar.gz');cp.execFileSync('tar',['-czf',archive,'-C',stage,'.']);console.log(archive);console.log('Bytes:',fs.statSync(archive).size);

fs.copyFileSync(archive,path.join(root,'release','ji-an-mahjong-online.tar.gz'));



