const path=require('node:path'),assert=require('node:assert/strict');
const pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{const browser=await pw.chromium.launch({channel:'msedge',headless:true});try{
for(const spec of [{name:'desktop-blackbars',width:1100,height:805},{name:'phone-landscape',width:851,height:393,mobile:true},{name:'phone-portrait',width:393,height:851,mobile:true}]){
 const page=await browser.newPage({viewport:{width:spec.width,height:spec.height},isMobile:!!spec.mobile,hasTouch:!!spec.mobile,...(spec.mobile?{userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'}:{})});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:7458');await page.fill('#password','CHANGE_ME_ACCESS_PASSWORD');await page.click('#login button');await page.waitForTimeout(5500);
 const geometry=await page.evaluate(()=>{const panel=document.getElementById('GameAudioControls'),r=panel.getBoundingClientRect(),button=panel.querySelector('button'),b=button.getBoundingClientRect();return {parent:panel.parentElement.id,rect:r.toJSON(),hit:document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===button};});
 assert.equal(geometry.parent,'GameDiv');assert(geometry.hit,JSON.stringify(geometry));assert(geometry.rect.x>=0&&geometry.rect.y>=0&&geometry.rect.right<=spec.width&&geometry.rect.bottom<=spec.height,JSON.stringify(geometry));if(!spec.mobile)assert(geometry.rect.top>93,'控件应位于绿色牌桌而非黑边');
 // A canvas listener stopping propagation must not prevent gesture unlocking.
 await page.evaluate(()=>{document.getElementById('GameCanvas').addEventListener('pointerdown',e=>e.stopPropagation());});
 if(spec.mobile)await page.touchscreen.tap(spec.width/2,spec.height/2);else await page.mouse.click(spec.width/2,spec.height/2);
 assert(await page.evaluate(async()=>{const cc=await System.import('cc');return cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').audio.unlocked;}));
 const test=page.getByRole('button',{name:'试听游戏声音',exact:true});if(spec.mobile)await test.tap();else await test.click();await page.waitForTimeout(900);
 assert.equal(await page.locator('#GameAudioControls [role=status]').textContent(),'');assert(await page.evaluate(async()=>{const cc=await System.import('cc');const audio=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').audio.player;return !audio.error&&audio.currentTime>0;}),'试听需要实际播放');
 if(!spec.mobile){await page.evaluate(()=>document.getElementById('GameDiv').requestFullscreen());await page.waitForTimeout(600);assert(await page.locator('#GameAudioControls').isVisible());await page.evaluate(()=>document.exitFullscreen());}
 await page.screenshot({path:'screenshots/audio-'+spec.name+'.png'});console.log(spec.name,JSON.stringify(geometry));assert.deepEqual(errors,[]);await page.close();
}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
