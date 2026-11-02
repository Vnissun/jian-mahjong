const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')),{createServer}=require('../server/server.cjs');
let browser,server;
(async()=>{
 server=createServer({accessPassword:false,testAdminPassword:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,errors=[];
 browser=await chromium.launch({channel:'msedge',headless:true});const pages=[];
 for(const mobile of [false,true]){const c=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,...(mobile?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'}:{})}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);pages.push(p);}
 await Promise.all(pages.map(async p=>{await p.waitForTimeout(5500);await p.evaluate(async()=>window.cc=await System.import('cc'));await p.waitForFunction(()=>!!window.cc.director.getScene()?.getChildByName('Canvas')?.getComponent('GameApp')?.lobby);await p.evaluate(()=>{window.quickPlayed=[];document.addEventListener('playing',e=>{if(e.target.id==='GameVoiceAudio')window.quickPlayed.push(e.target.currentSrc);},true);});}));
 const [a,b]=pages;
 await a.evaluate(async()=>{await window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').enterFriend('房主');});
 const code=await a.evaluate(()=>window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friend.code);
 await b.evaluate(async code=>{await window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').enterFriend('好友',code);},code);
 await b.evaluate(async()=>{await window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').friend.action('ready');});
 await a.evaluate(async()=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');await a.friend.action('ready');await a.friend.action('start');});
 const r=server.rooms.get(code);r.tick=()=>{};
 await Promise.all(pages.map(p=>p.waitForFunction(()=>!document.getElementById('GameVoiceControls').hidden&&window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').voiceChat.messageSequence!==null)));
 await b.mouse.click(420,210);await a.evaluate(()=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');a.selected=a.human.hand[0];});
 const selected=await a.evaluate(()=>window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').selected.id),before=JSON.stringify({revision:r.revision,prompt:r.prompt,players:r.game.players});
 await a.locator('#GameQuickChat').click();await a.locator('[data-quick-id="great"]').click();
 await Promise.all(pages.map(p=>p.waitForFunction(()=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');return a.table.node.getChildByName('Chat-east')?.getChildByName('Text').getComponent(window.cc.Label).string.includes('忒好了');})));
 await Promise.all(pages.map(p=>p.waitForFunction(()=>window.quickPlayed.some(s=>s.endsWith('/sounds/quick/great.wav')))));
 assert.equal(JSON.stringify({revision:r.revision,prompt:r.prompt,players:r.game.players}),before);assert.equal(await a.evaluate(()=>window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').selected.id),selected);
 await a.locator('#GameQuickChat').click();await a.locator('[data-quick-id="thanks"]').click();await a.waitForFunction(()=>document.querySelector('#GameQuickChatPanel').textContent.includes('3秒再发送'));
 // Click the actual Cocos avatar: south's desktop view is the mobile player's own seat.
 const avatar=await a.evaluate(()=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),n=a.table.node.getChildByName('PlayerProfile-south').getChildByName('AvatarHit'),el=document.getElementById('GameCanvas'),r=el.getBoundingClientRect(),p=a.node.getComponent(window.cc.Canvas).cameraComponent.worldToScreen(n.worldPosition);return {x:r.left+p.x/el.width*r.width,y:r.top+(el.height-p.y)/el.height*r.height};});
 await a.mouse.click(avatar.x,avatar.y);await a.waitForFunction(()=>document.getElementById('GameQuickChatPanel').textContent.includes('发送给 好友'));
 r.voice.quickSent.clear();await a.getByRole('button',{name:'送花',exact:true}).click();
 await b.waitForFunction(()=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),n=a.table.node.getChildByName('Chat-south');return n?.getChildByName('Text').getComponent(window.cc.Label).string==='🌹'&&n.getChildByName('From').getComponent(window.cc.Label).string==='房主送来';});
 // Mobile south sees east on its left: verify the seat rotation resolves the right target.
 const otherAvatar=await b.evaluate(()=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),n=a.table.node.getChildByName('PlayerProfile-north').getChildByName('AvatarHit'),el=document.getElementById('GameCanvas'),r=el.getBoundingClientRect(),p=a.node.getComponent(window.cc.Canvas).cameraComponent.worldToScreen(n.worldPosition);return {x:r.left+p.x/el.width*r.width,y:r.top+(el.height-p.y)/el.height*r.height};});
 await b.mouse.click(otherAvatar.x,otherAvatar.y);await b.waitForFunction(()=>document.getElementById('GameQuickChatPanel').textContent.includes('发送给 房主'));
 const box=await b.locator('#GameQuickChat').boundingBox();assert(box.width>=44&&box.height>=44);const panel=await b.locator('#GameQuickChatPanel').boundingBox();assert(panel.x>=0&&panel.y>=0&&panel.x+panel.width<=844&&panel.y+panel.height<=390);
 await b.screenshot({path:'screenshots/quick-chat-emoji-panel-mobile.png'});await b.getByRole('button',{name:'厉害',exact:true}).click();
 await a.waitForFunction(()=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),n=a.table.node.getChildByName('Chat-east');return n?.getChildByName('Text').getComponent(window.cc.Label).string==='👍'&&n.getChildByName('From').getComponent(window.cc.Label).string==='好友送来';});
 await b.waitForTimeout(150);await b.screenshot({path:'screenshots/quick-chat-bubble-mobile.png'});assert.equal(JSON.stringify({revision:r.revision,prompt:r.prompt,players:r.game.players}),before);
 // Real targeted throws: both clients animate source-to-target in their own seat coordinates.
 for(const id of ['poop','tomato','egg','slipper','bomb']){
  r.voice.quickSent.clear();await a.mouse.click(avatar.x,avatar.y);
  await a.locator('[data-quick-id="'+id+'"]').click();
  await Promise.all(pages.map(p=>p.waitForFunction(id=>!!window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').table.node.getChildByName('ThrowEffects')?.getChildByName('Throw-'+id),id)));
  const positions=await Promise.all(pages.map(p=>p.evaluate(id=>{const app=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),f=app.table.throwEffects.flights.find(f=>f.id===id);return {start:f.start,end:f.end,elapsed:f.elapsed,art:!!f.sprite.getChildByName('Art-social/'+id)};},id)));
  assert.deepEqual(positions[0].start,{x:-564,y:-129});assert.deepEqual(positions[0].end,{x:558,y:68});
  assert.deepEqual(positions[1].start,{x:-558,y:68});assert.deepEqual(positions[1].end,{x:-564,y:-129});assert(positions.every(p=>p.art));
  await Promise.all(pages.map(p=>p.waitForFunction(id=>{const a=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),f=a.table.throwEffects.flights.find(f=>f.id===id);return f?.impact.active&&!f.sprite.active;},id)));
  await b.waitForTimeout(240);if(id==='tomato')await b.screenshot({path:'screenshots/throw-tomato-hit-mobile.png'});
  assert.equal(JSON.stringify({revision:r.revision,prompt:r.prompt,players:r.game.players}),before);
  await b.waitForFunction(id=>!window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').table.throwEffects.flights.some(f=>f.id===id),id);
 }
 await b.waitForFunction(()=>window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').table.throwEffects.flights.length===0);
 // Remaining two targets (bots) use actual clickable avatars, not a fixed screen point.
 for(const seat of ['west','north']){
  r.voice.quickSent.clear();const target=await a.evaluate(seat=>{const app=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),n=app.table.node.getChildByName('PlayerProfile-'+seat).getChildByName('AvatarHit'),el=document.getElementById('GameCanvas'),r=el.getBoundingClientRect(),p=app.node.getComponent(window.cc.Canvas).cameraComponent.worldToScreen(n.worldPosition);return {x:r.left+p.x/el.width*r.width,y:r.top+(el.height-p.y)/el.height*r.height};},seat);
  await a.mouse.click(target.x,target.y);await a.locator('[data-quick-id="tomato"]').click();
  await Promise.all(pages.map(p=>p.waitForFunction(()=>window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').table.throwEffects.flights.some(f=>f.id==='tomato'))));
  const end=await a.evaluate(()=>window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').table.throwEffects.flights.find(f=>f.id==='tomato').end);
  assert.deepEqual(end,seat==='west'?{x:423,y:300}:{x:-558,y:68});
  await b.waitForFunction(()=>window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').table.throwEffects.flights.length===0);
 }
 r.voice.quickSent.clear();const messages=r.voice.messageSequence;
 await a.locator('#GameQuickChat').click();await a.locator('[data-quick-id="poop"]').click();
 await a.waitForFunction(()=>document.querySelector('#GameQuickChatPanel').textContent.includes('请先点击对手头像'));
 assert.equal(r.voice.messageSequence,messages);
 // Leaving a room clears in-flight nodes as well as ordinary bubbles.
 await b.evaluate(()=>{const app=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');app.table.showThrow(app.session.players[0].seat,app.session.players[1].seat,'poop','测试');app.table.clearChat();if(app.table.throwEffects.flights.length)throw Error('Throw survives cleanup');});
 console.log('PASS 5 throw types, sender/receiver rotated avatar positions, artwork preloaded, visible impact, timed cleanup, no game/timer/score mutation');
 // Muting voice must not suppress visible messages; switching room must not replay old messages.
 await b.evaluate(()=>window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').voiceChat.muted=true);r.voice.quickSent.clear();
 if(await a.locator('#GameQuickChatPanel').isHidden())await a.locator('#GameQuickChat').click();await a.getByRole('button',{name:'快捷语音',exact:true}).click();await a.locator('[data-quick-id="friends"]').click();await b.waitForFunction(()=>window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').table.node.getChildByName('Chat-east')?.getChildByName('Text').getComponent(window.cc.Label).string.includes('加个好友'));
 await b.locator('#GameQuickChat').click();await b.getByRole('button',{name:'快捷语音',exact:true}).click();await b.screenshot({path:'screenshots/quick-chat-phrases-mobile.png'});
 await b.setViewportSize({width:390,height:844});await b.waitForTimeout(500);await b.screenshot({path:'screenshots/quick-chat-portrait.png'});
 // A phone that blocks autoplay must offer a working explicit playback button.
 await b.evaluate(()=>{const v=window.cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').voiceChat;v.muted=false;v.stopPlayback();v.queue=[];v.quickPanel.hidden=true;const original=v.player.play.bind(v.player);let blocked=false;v.player.play=()=>{if(!blocked&&v.player.src.includes('/quick/')){blocked=true;return Promise.reject(new DOMException('gesture required','NotAllowedError'));}return original();};});
 r.voice.quickSent.clear();if(await a.locator('#GameQuickChatPanel').isHidden())await a.locator('#GameQuickChat').click();await a.locator('[data-quick-id="thanks"]').click();
 await b.getByRole('button',{name:'点击收听语音',exact:true}).waitFor({state:'visible'});await b.getByRole('button',{name:'点击收听语音',exact:true}).click();await b.waitForFunction(()=>window.quickPlayed.some(s=>s.endsWith('/sounds/quick/thanks.wav')));
 const decoded=await b.evaluate(async()=>{const data=await(await fetch('sounds/quick/great.wav')).arrayBuffer(),ctx=new AudioContext(),buffer=await ctx.decodeAudioData(data);const out={duration:buffer.duration,nonSilent:buffer.getChannelData(0).some(v=>Math.abs(v)>.001)};await ctx.close();return out;});assert(decoded.nonSilent&&decoded.duration>1);
 const imported=await b.evaluate(async()=>{const catalog=(await System.import('chunks:///_virtual/QuickChat.ts')).QUICK_PHRASES,source=await(await fetch('sounds/quick/sources.json')).json(),ctx=new AudioContext(),result=[];try{for(const phrase of catalog){const clip=source.clips.find(c=>c.id===phrase.id),buffer=await ctx.decodeAudioData(await(await fetch('sounds/quick/'+phrase.id+'.wav')).arrayBuffer());if(!clip||!buffer.getChannelData(0).some(v=>Math.abs(v)>.001))throw Error('Missing or silent voice '+phrase.id);result.push({id:phrase.id,duration:buffer.duration,source:clip.sourceId});}return result;}finally{await ctx.close();}});assert.equal(imported.length,12);assert(imported.every(v=>v.duration>.3&&v.duration<10));console.log('PASS all 12 imported original voices decode in phone browser',imported);
 assert.deepEqual(errors,[]);console.log('PASS two live clients: sender+receiver phrase audio, seat bubbles, emoji, phone 48px targets/panel bounds, cooldown, mute keeps text, selected tile/deadline/score unchanged;',decoded);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.closeAllConnections?.();if(server)await new Promise(r=>server.close(r));});
