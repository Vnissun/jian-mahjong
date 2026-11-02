const fs=require('node:fs'),path=require('node:path');
let playwright;
try { playwright=require(process.env.PLAYWRIGHT_PATH || 'playwright'); }
catch { playwright=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const {chromium}=playwright;
let activeBrowser;
(async()=>{
 const browser=activeBrowser=await chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:7457');
 await page.waitForFunction(async()=>{try{const cc=await System.import('cc');return !!cc.director.getScene()?.getChildByName('Canvas')?.getComponent('GameApp')?.lobby;}catch{return false;}},{},{timeout:30000});
 await page.waitForTimeout(3500);
 const dir=path.resolve(__dirname,'../screenshots');fs.mkdirSync(dir,{recursive:true});
 await page.screenshot({path:path.join(dir,'lobby.png')});
 console.log('Errors at startup',JSON.stringify(errors));
 console.log('Lobby',await page.evaluate(async()=>{const cc=await System.import('cc');const canvas=cc.director.getScene()?.getChildByName('Canvas');return {size:cc.view.getVisibleSize(),position:canvas?.position,scene:cc.director.getScene()?.name};}));
 // Exercise actual pointer hit testing on the canvas.
 await page.mouse.click(640,612);
 await page.waitForTimeout(500);await page.screenshot({path:path.join(dir,'table.png')});
 const state=await page.evaluate(async()=>{const cc=await System.import('cc');const app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');return {phase:app.session.phase,hand:app.session.players[0].hand.length,actions:app.actions.node.active};});
 if(state.phase!=='playerTurn'||state.hand!==14||!state.actions)throw Error('开局失败 '+JSON.stringify(state));
 await page.mouse.click(237,637);await page.waitForTimeout(80);
 const selected=await page.evaluate(async()=>{const cc=await System.import('cc');return !!cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').selected;});
 if(!selected)throw Error('真实鼠标点击没有选中手牌');
 await page.mouse.click(237,637);await page.waitForTimeout(80);
 const discarded=await page.evaluate(async()=>{const cc=await System.import('cc');const app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');return app.session.players[0].hand.length<14||app.settlement.node.active;});
 if(!discarded)throw Error('第二次点击没有确认出牌');
 await page.waitForTimeout(1800);
 // Keep production pacing unchanged; accelerate only this browser test.
 await page.evaluate(async()=>{const cc=await System.import('cc');const app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');app.session.events.scheduleAI=fn=>app.scheduleOnce(fn,.015);});
 let settled=false;
 for(let i=0;i<240;i++){
  const state=await page.evaluate(async()=>{
   const cc=await System.import('cc'),app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');
   if(app.settlement.node.active)return 'settled';
   if(app.session.phase==='playerTurn'&&app.session.currentSeat==='east'){
    const p=app.session.players[0];const tile=p.state.riichi!=='none'?app.session.lastDrawn:p.hand[p.hand.length-1];
    if(tile){app.clickTile(tile);app.clickTile(tile);}return 'discard';
   }
   if(app.claim&&app.actions.node.active){app.actions.onPass();return 'pass';}
   return 'wait';
  });
  if(state==='settled'){settled=true;break;}
  await page.waitForTimeout(50);
 }
 if(!settled)throw Error('浏览器完整对局没有到达结算');
 console.log('Errors',JSON.stringify(errors));
 console.log('Final',await page.evaluate(async()=>{const cc=await System.import('cc'),app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');return {phase:app.session.phase,scores:app.session.players.map(p=>p.score),discards:app.session.players.map(p=>p.discards.length)};}));
 await page.screenshot({path:path.join(dir,'playing.png')});
 await page.setViewportSize({width:960,height:540});await page.waitForTimeout(300);
 await page.screenshot({path:path.join(dir,'compact.png')});
 await page.evaluate(async()=>{const cc=await System.import('cc');const app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');app.settlement.onNext();});
 await page.waitForTimeout(300);
 await page.evaluate(async()=>{const cc=await System.import('cc');const app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');if(app.settlement.node.active)throw Error('下一局没有关闭结算');app.openLobby();if(!app.lobby.node.active||app.table.node.active)throw Error('返回大厅失败');});
 console.log('Browser smoke passed: pointer start/discard, full round, settlement, next round, lobby');
 await browser.close();if(errors.length)process.exitCode=1;
})().catch(async e=>{console.error(e);process.exitCode=1;await activeBrowser?.close();});
