const path=require('node:path'),assert=require('node:assert/strict');
const pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const {createServer}=require('../server/server.cjs');let browser,server;
(async()=>{
 server=createServer({accessPassword:''});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await pw.chromium.launch({channel:'msedge',headless:true});
 for(const spec of [{name:'desktop',width:1280,height:720},{name:'phone',width:851,height:393,mobile:true},{name:'portrait',width:393,height:851,mobile:true}]){
  const page=await browser.newPage({viewport:{width:spec.width,height:spec.height},isMobile:!!spec.mobile,hasTouch:!!spec.mobile,...(spec.mobile?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'}:{})});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.text().includes('[Artwork]'))errors.push(m.text());});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(async()=>{try{const cc=await System.import('cc');return !!cc.director.getScene()?.getChildByName('Canvas')?.getComponent('GameApp')?.lobby;}catch{return false;}},null,{timeout:90000});
  await page.waitForTimeout(5000);await page.screenshot({path:'screenshots/refined-lobby-'+spec.name+'.png'});
  const loaded=await page.evaluate(async()=>{const a=await System.import('chunks:///_virtual/TileResources.ts'),b=await System.import('chunks:///_virtual/ArtworkBounds.ts');return Object.keys(b.ART_BOUNDS).filter(p=>!a.TileResources.get(p));});if(loaded.length)console.log("Load errors",errors);assert.deepEqual(loaded,[]);
  assert(await page.locator('#GameSoundToggle').isVisible());assert(!await page.locator('#GameSoundPanel').isVisible());
  await page.locator('#GameSoundToggle').click();assert(await page.locator('#GameSoundPanel').isVisible());
  await page.locator('[aria-label="游戏音量"]').fill('0.4');
  assert.equal(await page.evaluate(()=>localStorage.getItem('mahjong-volume')),'0.4');
  await page.locator('[aria-label="试听游戏声音"]').click();await page.waitForTimeout(200);
  await page.screenshot({path:'screenshots/refined-audio-'+spec.name+'.png'});
  await page.locator('#GameSoundToggle').click();assert(!await page.locator('#GameSoundPanel').isVisible());
  assert(await page.evaluate(async()=>{const cc=await System.import('cc'),a=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),settings=a.lobby.node.getChildByName('Lobby').getChildByName('Settings');return ['45','46','47'].every(code=>settings.getChildByName('Art-reference_ui/GameLayer/Mahjong/2/handmah_'+code));}));
  // Click actual UI, deriving screen coordinates from the Cocos camera.
  async function clickNode(expression){const pos=await page.evaluate(async expr=>{const cc=await System.import('cc'),app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');const n=Function('app','return '+expr)(app),r=document.getElementById('GameCanvas').getBoundingClientRect(),c=app.node.getChildByName('Camera').getComponent(cc.Camera),h=c.orthoHeight*2,rotated=document.getElementById('GameDiv').style.transform.includes('90deg'),w=h*(rotated?r.height/r.width:r.width/r.height),p=n.worldPosition,x=.5+(p.x-app.node.worldPosition.x)/w,y=.5-(p.y-app.node.worldPosition.y)/h;return rotated?{x:r.right-y*r.width,y:r.top+x*r.height}:{x:r.left+x*r.width,y:r.top+y*r.height};},expression);if(spec.mobile)await page.touchscreen.tap(pos.x,pos.y);else await page.mouse.click(pos.x,pos.y);}
  await clickNode("app.lobby.node.getChildByName('Lobby').getChildByName('Start')");
  await page.waitForTimeout(300);await page.evaluate(async()=>{const cc=await System.import('cc'),a=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');a.table.showOnlineStatus('好友房 123456 · 你坐东 · 好友 Vnissun 57 秒');});await page.screenshot({path:'screenshots/refined-start-'+spec.name+'.png'});
  await clickNode("app.table.node.getChildByName('Lobby')");
  assert(await page.evaluate(async()=>{const cc=await System.import('cc'),a=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');return !!(a.mobileStage??a.node).getChildByName('ExitConfirmation')&&a.table.node.active&&!a.lobby.node.active;}));
  await page.screenshot({path:'screenshots/refined-exit-'+spec.name+'.png'});
  await clickNode("(app.mobileStage??app.node).getChildByName('ExitConfirmation').getChildByName('Card').getChildByName('Cancel')");
  assert(await page.evaluate(async()=>{const cc=await System.import('cc'),a=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');return !(a.mobileStage??a.node).getChildByName('ExitConfirmation')&&a.table.node.active;}));
  const before=await page.evaluate(async()=>{const cc=await System.import('cc'),app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');app.session.events.scheduleAI=()=>{};const label=app.table.node.getChildByName('OnlineStatus'),bottom=label.position.y-label.getComponent(cc.UITransform).height/2,area=app.table.getArea('west');for(const n of [...area.handRow.children,...area.meldsRow.children])if(area.node.position.y+n.position.y+n.getComponent(cc.UITransform).height/2>bottom)throw Error('Opponent hand overlaps online status');return app.human.hand.length;});assert.equal(before,14);
  await clickNode("app.table.getArea('east').handRow.children[0]");
  assert(await page.evaluate(async()=>{const cc=await System.import('cc');return !!cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').selected;}));
  await clickNode("app.table.getArea('east').handRow.children[0]");
  assert.equal(await page.evaluate(async()=>{const cc=await System.import('cc');return cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').human.hand.length;}),13);
  await page.evaluate(async()=>{const cc=await System.import('cc'),t=await System.import('chunks:///_virtual/Tile.ts'),app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');app.unscheduleAllCallbacks();app.session.phase='playerTurn';let id=90000;const tile=(s,r)=>t.createTile(id++,s,r);
   app.session.players.forEach((p,i)=>{p.discards=Array.from({length:15},(_,n)=>tile(['wan','tong','tiao'][n%3],n%9+1));p.melds=[{type:'peng',tiles:[tile('yuan',2),tile('yuan',2),tile('yuan',2)],openedTileIndex:0}];p.hand=p.hand.slice(0,10);});
   app.table.refreshAll(app.session);app.actions.showForClaim(true,true,true,true);
  });
  assert(await page.evaluate(async()=>{const cc=await System.import('cc'),a=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');for(const seat of ['south','north']){const nodes=a.table.getArea(seat).meldsRow.children.slice().sort((a,b)=>a.position.y-b.position.y);for(let i=1;i<nodes.length;i++){const prev=nodes[i-1],next=nodes[i],distance=next.position.y-prev.position.y,needed=(next.getComponent(cc.UITransform).height+prev.getComponent(cc.UITransform).height)/2;if(distance+0.1<needed)throw Error('Side exposed tiles overlap');}}return true;}));
  await page.screenshot({path:'screenshots/refined-table-'+spec.name+'.png'});
  await page.evaluate(async()=>{const cc=await System.import('cc'),app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');app.actions.hide();app.session.phase='settled';app.table.refreshAll(app.session);app.settlement.showDrawn(app.session.players,[]);});
  await page.screenshot({path:'screenshots/refined-settlement-'+spec.name+'.png'});
  await clickNode("app.settlement.shade.getChildByName('Card').getChildByName('ReviewTable')");
  const revealed=await page.evaluate(async()=>{const cc=await System.import('cc'),app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');return !app.settlement.shade.active&&app.session.players.every(p=>app.table.getArea(p.seat).handRow.children.every(n=>!n.getComponent('TileView').isFaceDown));});assert(revealed);
  await page.screenshot({path:'screenshots/refined-review-'+spec.name+'.png'});
  await page.evaluate(async()=>{const cc=await System.import('cc'),tiles=await System.import('chunks:///_virtual/Tile.ts'),score=await System.import('chunks:///_virtual/SettlementEngine.ts'),app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');let id=100000;const tile=(s,r)=>tiles.createTile(id++,s,r),ps=app.session.players,winner=ps[0];
   winner.hand=[tile('wan',1),tile('wan',2),tile('wan',3),tile('tong',1),tile('tong',2),tile('tong',3),tile('tiao',4),tile('tiao',5),tile('tiao',6),tile('yuan',1),tile('yuan',1)];winner.melds=[{type:'peng',tiles:[tile('feng',1),tile('feng',1),tile('feng',1)],openedTileIndex:0}];ps.forEach(p=>{p.state.isStanding=false;p.state.isOpen=true;});const winTile=winner.hand[10];const result=score.settleWin({winner,winTiles:winner.hand,winTile,winMode:'dianPao',firer:ps[1],allPlayers:ps,currentDealer:'east',isAfterGang:false,isAfterGangSpecial:false,isGangShangKaiHua:false,roomConfig:app.session.config});ps.forEach(p=>p.score=p.id===winner.id?result.winnerDelta:result.payerDeltas[p.id]);app.settlement.setTableReview(false);app.settlement.show(result,[],ps,'dianPao',winner,winTile);
   const row=app.settlement.content.getChildByName('WinningTiles');if(row.children.filter(n=>n.getComponent('TileView')).length!==14)throw Error('Winning hand or melds missing');
  });await page.screenshot({path:'screenshots/refined-win-'+spec.name+'.png'});
  await page.evaluate(async()=>{
   const cc=await System.import('cc'),t=await System.import('chunks:///_virtual/Tile.ts'),views=await System.import('chunks:///_virtual/TileView.ts'),art=await System.import('chunks:///_virtual/TileResources.ts'),a=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');
   let id=120000;const tile=(s,r)=>t.createTile(id++,s,r),kinds=[['wan',9],['tong',9],['tiao',9],['feng',4],['yuan',3]];
   for(const [s,count] of kinds)for(let r=1;r<=count;r++)for(const seat of ['east','south','west','north']){
     const sample=tile(s,r);if(!art.TileResources.get(views.TileView.path(sample,false,true,seat)))throw Error('Missing directional tile '+s+r+' '+seat);
     if(!art.TileResources.get(views.TileView.path(sample,false,false,'east')))throw Error('Missing hand tile '+s+r);
   }
   a.settlement.hide();a.session.phase='playerTurn';a.session.players.forEach(p=>{
     p.state.isWon=false;p.state.isDrawn=false;p.hand=[tile('yuan',1),tile('yuan',1)];
     p.melds=[{type:'chi',tiles:[tile('wan',1),tile('wan',2),tile('wan',3)],openedTileIndex:0},
      {type:'peng',tiles:[tile('tiao',9),tile('tiao',9),tile('tiao',9)],openedTileIndex:0},
      {type:'anGang',tiles:Array.from({length:4},()=>tile('tong',2)),openedTileIndex:-1},
      {type:'anGang',specialGang:'winds',tiles:[tile('feng',1),tile('feng',2),tile('feng',3),tile('feng',4),tile('feng',1),tile('feng',2),tile('feng',3)],openedTileIndex:-1}];
   });a.table.refreshAll(a.session);
   for(const p of a.session.players){const area=a.table.getArea(p.seat);for(const n of area.meldsRow.children){const tv=n.getComponent('TileView');if(tv.tile.suit==='tong'?!tv.isFaceDown:tv.isFaceDown)throw Error('Concealed/public meld exposure changed');if(n.angle!==0)throw Error('Pre-rendered perspective was rotated');}
     if(area.meldsRow.children.length!==17)throw Error('Supplement tile missing');
   }
  });await page.screenshot({path:'screenshots/refined-melds-'+spec.name+'.png'});
  await clickNode("app.table.node.getChildByName('Lobby')");
  await clickNode("(app.mobileStage??app.node).getChildByName('ExitConfirmation').getChildByName('Card').getChildByName('Confirm')");
  assert(await page.evaluate(async()=>{const cc=await System.import('cc'),a=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');return a.lobby.node.active&&!a.table.node.active;}));
  await page.evaluate(async()=>{const cc=await System.import('cc'),a=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');a.friendPanel.showEntry(false);});
  await page.screenshot({path:'screenshots/refined-friend-'+spec.name+'.png'});
  assert.deepEqual(errors,[]);console.log('Refined UI passed:',spec.name,'reference artwork resources; pointer start/select/discard; review reveals all hands');await page.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});


