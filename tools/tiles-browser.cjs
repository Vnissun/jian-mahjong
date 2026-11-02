const path=require('node:path');let pw;try{pw=require(process.env.PLAYWRIGHT_PATH||'playwright');}catch{pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
let browser;(async()=>{
 browser=await pw.chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:7457');await page.waitForTimeout(6000);await page.mouse.click(640,612);await page.waitForTimeout(250);
 const setup=await page.evaluate(async()=>{
  const cc=await System.import('cc'),core=await System.import('chunks:///_virtual/Player.ts'),tiles=await System.import('chunks:///_virtual/Tile.ts'),riichi=await System.import('chunks:///_virtual/RiichiManager.ts');
  const app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),game=app.session;app.unscheduleAllCallbacks();game.events.scheduleAI=()=>{};
  game.players.forEach(p=>{p.state=core.createDefaultPlayerState();p.hand=[];p.melds=[];p.discards=[];p.score=0;});let id=40000;const tile=(s,r)=>tiles.createTile(id++,s,r),w=r=>tile('wan',r),t=r=>tile('tong',r),s=r=>tile('tiao',r),f=r=>tile('feng',r);
  const p=game.players[0],discard=w(9);p.hand=[w(1),w(2),w(3),w(4),t(1),t(2),t(3),s(1),s(2),s(3),f(1),f(1),f(1),discard];p.state.isDealer=true;game.phase='playerTurn';game.currentSeat='east';game.waitingHumanTurn=p;game.waitingHumanClaim=null;game.lastDrawn=discard;game.pendingRobbingGang=null;app.table.refreshAll(game);app.table.highlightTurn('east');app.humanTurn(p,discard);
  const choices=riichi.getRiichiChoices({...p,hand:p.hand.filter(t=>t.id!==discard.id)},true);if(choices.length!==2)throw Error('1234 未生成两项单吊');
  app.actions.onRiichi();app.clickTile(discard);app.clickTile(discard);if(p.state.riichi!=='none'||p.hand.length!==14||app.mode!=='riichiWait')throw Error('未选听口就报听/出牌');
  return {index:choices.findIndex(c=>c.winningTiles[0].rank===1),discardId:discard.id};
 });
 await page.waitForTimeout(200);await page.screenshot({path:'screenshots/riichi-options.png'});
 const point=await page.evaluate(async i=>{const cc=await System.import('cc');const app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');const p=app.actions.node.getChildByName('GangChoice'+i).worldPosition;return {x:p.x,y:720-p.y};},setup.index);
 await page.mouse.click(point.x,point.y);await page.waitForTimeout(150);
 const selected=await page.evaluate(async()=>{const tiles=await System.import('chunks:///_virtual/Tile.ts'),win=await System.import('chunks:///_virtual/PlayerWin.ts');const cc=await System.import('cc');const app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),p=app.session.players[0];
  if(p.state.riichi!=='normal'||p.hand.length!==13||p.state.riichiWaits.length!==1||p.state.riichiWaits[0].rank!==1)throw Error('点击未锁定单吊1万');
  if(win.evaluatePlayerWin(p,tiles.createTile(45000,'wan',4),true).ok||!win.evaluatePlayerWin(p,tiles.createTile(45001,'wan',1),true).ok)throw Error('选择1万后胡牌锁定失败');return p.state.riichiWaits;});
 await page.screenshot({path:'screenshots/riichi-selected.png'});
 const atlas=await page.evaluate(async()=>{
  const cc=await System.import('cc'),view=await System.import('chunks:///_virtual/TileView.ts'),ui=await System.import('chunks:///_virtual/UIHelper.ts'),tiles=await System.import('chunks:///_virtual/Tile.ts');const canvas=cc.director.getScene().getChildByName('Canvas');
  const panel=ui.UIHelper.node(canvas,'TileAtlas',1240,700);ui.UIHelper.paint(panel,new cc.Color(15,70,63));ui.UIHelper.label(panel,'Title','传统牌面 · 全部 34 种',1100,50,0,305,30);
  let id=46000,count=0;const defs=[['wan',9],['tong',9],['tiao',9],['feng',4],['yuan',3]];
  for(let row=0;row<4;row++){
   const def=defs[row];let entries=row===3?[...Array.from({length:4},(_,i)=>['feng',i+1]),...Array.from({length:3},(_,i)=>['yuan',i+1])]:Array.from({length:def[1]},(_,i)=>[def[0],i+1]);
   for(let i=0;i<entries.length;i++){const [s,r]=entries[i],node=ui.UIHelper.node(panel,'Tile'+count,64,88,(i-(entries.length-1)/2)*112,190-row*132);const v=node.addComponent(view.TileView);v.setTile(tiles.createTile(id++,s,r),false);if(node.getChildByName('Rank'))throw Error('仍有牌名注释');count++;}
  }
  return count;
 });
 await page.waitForTimeout(400);await page.screenshot({path:'screenshots/tile-atlas.png'});if(errors.length)throw Error(errors.join(';'));console.log('Tiles browser passed',JSON.stringify({selected,atlas,errors}));await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
