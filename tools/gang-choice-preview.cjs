const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const {createServer}=require('../server/server.cjs');let browser,server;
(async()=>{
 server=createServer({accessPassword:''});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:780,height:360}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,...(mobile?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'}:{})});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForTimeout(5500);
  await page.evaluate(async()=>window.cc=await System.import('cc'));
  await page.waitForFunction(()=>!!window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('GameApp')?.lobby);
  await page.evaluate(()=>{
   const app=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');app.lobby.node.active=false;app.startGame({...app.lobby.config});
   window.choiceHit=-1;
   window.choices=['三元补毛 发','九饼 加杠','东南西北 四风杠（公开）','中发白＋一万（公开）','二饼 暗杠','八万 暗杠','四风补毛 北','三元补毛 中','三元补毛 白'].map((label,i)=>({label,run:()=>window.choiceHit=i}));
   app.actions.showGangChoices(window.choices);
  });
  const measure=()=>page.evaluate(()=>{
   const canvas=window.cc.director.getScene().getChildByName('Canvas'),app=canvas.getComponent('GameApp'),camera=canvas.getComponent(window.cc.Canvas).cameraComponent,el=document.getElementById('GameCanvas'),r=el.getBoundingClientRect();
   return app.actions.node.children.filter(n=>n.name.startsWith('GangChoice')&&n.name!=='GangChoicePage').map(n=>{
    const tf=n.getComponent(window.cc.UITransform),p=camera.worldToScreen(n.worldPosition);
    return {name:n.name,x:r.left+p.x/el.width*r.width,y:r.top+(el.height-p.y)/el.height*r.height,h:tf.height*(window.cc.sys.isMobile?r.height/720:Math.min(r.width/1280,r.height/720))};
   });
  });
  await page.waitForTimeout(150);const bounds=await measure(),viewport=page.viewportSize();
  for(const b of bounds){assert(b.h>=44,JSON.stringify(b));assert(b.x>=0&&b.x<=viewport.width&&b.y-b.h/2>=0&&b.y+b.h/2<=viewport.height,JSON.stringify(b));}
  await page.screenshot({path:'screenshots/gang-choices-'+(mobile?'mobile':'desktop')+'.png'});
  const click=async name=>{const b=(await measure()).find(b=>b.name===name);assert(b,name);await page.mouse.click(b.x,b.y);await page.waitForTimeout(100);};
  await click('GangChoice0');assert.equal(await page.evaluate(()=>window.choiceHit),0);
  await click('GangChoicePage1');await click('GangChoice0');assert.equal(await page.evaluate(()=>window.choiceHit),8);
  await click('GangChoicePage-1');assert.deepEqual(errors,[]);
  console.log('PASS',mobile?'mobile 780x360':'desktop',bounds);await context.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.closeAllConnections?.();if(server)await new Promise(r=>server.close(r));});
