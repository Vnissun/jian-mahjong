const assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const {createServer}=require('../server/server.cjs'),{FriendRoom}=require('../server/rooms.cjs'),{HandControl}=require('../server/hand-control.cjs');
let browser,server;
(async()=>{
 server=createServer({accessPassword:false,testAdminPassword:'Sort-browser-test-123'});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const r=new FriendRoom('123456','东家');for(const n of ['南家','西家','北家'])r.add(n);r.handControl=new HandControl('east');
 r.handControl.setOpening('yuan:3 wan:9 tong:3 feng:4 tiao:7 wan:1 tong:1 feng:1 yuan:1 tiao:2 wan:1 tong:9 tiao:1','wan:5');r.members.forEach(m=>m.ready=true);r.start();r.tick=()=>{};server.rooms.set(r.code,r);
 browser=await chromium.launch({channel:'msedge',headless:true});const pages=[],errors=[];
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile}),page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/test-admin/');await page.fill('#admin-password','Sort-browser-test-123');await page.getByRole('button',{name:'进入后台',exact:true}).click();await page.locator('#workspace').waitFor({state:'visible'});await page.locator('.room-button').filter({hasText:r.code}).click();await page.locator('.live-player').first().waitFor();
 }
 const expected=()=>r.game.players.map(p=>p.hand.slice().sort((a,b)=>({wan:0,tong:100,tiao:200,feng:300,yuan:400}[a.suit]+a.rank)-({wan:0,tong:100,tiao:200,feng:300,yuan:400}[b.suit]+b.rank)).map(t=>t.suit+':'+t.rank));
 const displayed=p=>p.locator('.live-player').evaluateAll(nodes=>nodes.map(n=>Array.from(n.querySelectorAll('.tile-line .tile')).map(t=>t.title)));
 let before=JSON.stringify({players:r.game.players,wall:r.game.wall,prompt:r.prompt});
 for(const page of pages){assert.deepEqual(await displayed(page),expected());await page.getByRole('button',{name:'立即刷新',exact:true}).click();assert.deepEqual(await displayed(page),expected());}
 assert.equal(JSON.stringify({players:r.game.players,wall:r.game.wall,prompt:r.prompt}),before);
 const m=r.members[0];r.action(m,{type:'discard',tileId:r.prompt.drawn.id,revision:r.revision,requestId:crypto.randomUUID()});
 before=JSON.stringify({players:r.game.players,wall:r.game.wall,prompt:r.prompt});
 for(const page of pages){await page.waitForFunction(()=>document.querySelector('.live-player .tile-line').children.length===13);assert.deepEqual(await displayed(page),expected());}
 assert.equal(JSON.stringify({players:r.game.players,wall:r.game.wall,prompt:r.prompt}),before);
 for(let i=0;i<pages.length;i++){await pages[i].locator('#cards-section').scrollIntoViewIfNeeded();await pages[i].screenshot({path:'screenshots/admin-sorted-hands-'+(i?'mobile':'desktop')+'.png'});}
 assert.deepEqual(errors,[]);console.log('PASS desktop/mobile: all 4 hands sorted, immediate refresh + automatic refresh after actual discard, game hand/wall/prompt unchanged');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.closeAllConnections?.();if(server)await new Promise(r=>server.close(r));});
