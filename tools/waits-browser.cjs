const fs=require('node:fs'),path=require('node:path');
let pw;try{pw=require(process.env.PLAYWRIGHT_PATH||'playwright');}catch{pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
let browser;
(async()=>{
 browser=await pw.chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:7457');await page.waitForTimeout(6000);await page.mouse.click(640,612);await page.waitForTimeout(250);
 const gangFamily=await page.evaluate(async()=>{
  const core=await System.import('chunks:///_virtual/Player.ts'),tiles=await System.import('chunks:///_virtual/Tile.ts'),gang=await System.import('chunks:///_virtual/ConcealedGang.ts');
  const p=core.createPlayer('family','规则检查','east');let id=30000;const tile=(s,r)=>tiles.createTile(id++,s,r);
  p.hand=[tile('yuan',1),tile('yuan',2),tile('yuan',3),tile('tong',2),tile('feng',1)];
  if(gang.getConcealedGangChoices(p).length)throw Error('三元仍可混入二筒或风牌');
  p.hand.push(tile('yuan',2));const choices=gang.getConcealedGangChoices(p);
  if(choices.length!==1||!choices[0].tiles.every(t=>t.suit==='yuan'))throw Error('三元第四张未限制元牌');
  if(!gang.concealedGang(p,choices[0].tiles).ok)throw Error('合法三元无法成杠');
  p.hand.push(tile('yuan',1));const supplements=gang.getSupplementGangChoices(p);
  if(supplements.length!==1||supplements[0].tile.suit!=='yuan')throw Error('三元补毛混入其他牌类');
  return '三元第四张及补毛仅元牌，二筒/风牌拒绝';
 });
 console.log('Gang family passed',gangFamily);
 const declaration=await page.evaluate(async()=>{
  const cc=await System.import('cc'),core=await System.import('chunks:///_virtual/Player.ts'),tiles=await System.import('chunks:///_virtual/Tile.ts'),riichi=await System.import('chunks:///_virtual/RiichiManager.ts');
  const app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),game=app.session;
  app.unscheduleAllCallbacks();game.events.scheduleAI=()=>{};game.players.forEach(p=>{p.state=core.createDefaultPlayerState();p.hand=[];p.melds=[];p.discards=[];p.score=0;});
  let id=1000;const make=(suit,r)=>tiles.createTile(id++,suit,r),t=r=>make('tong',r),w=r=>make('wan',r),s=r=>make('tiao',r),f=r=>make('feng',r),y=r=>make('yuan',r);
  const p=game.players[0],discard=w(9);p.hand=[t(3),t(3),t(4),t(4),t(5),t(5),t(8),t(8),f(1),f(1),f(3),f(3),y(1),discard];p.state.isDealer=true;
  game.phase='playerTurn';game.currentSeat='east';game.waitingHumanTurn=p;game.waitingHumanClaim=null;game.lastDrawn=discard;game.pendingRobbingGang=null;
  app.humanTurn(p,discard);app.actions.onRiichi();app.clickTile(discard);app.clickTile(discard);
  if(p.state.riichiShapes.join(',')!=='danDiao'||!p.state.riichiShapes.every(s=>typeof s==='string'))throw Error('真实 Cocos 报听仍损坏 Set');
  const b=game.players[1],c=game.players[2],d=game.players[3];
  b.hand=[w(1),w(1),w(2),w(3),w(4),t(1),t(2),t(3),s(1),s(2),s(3),y(1),y(1)];
  c.hand=[w(1),w(3),w(5),w(6),w(7),t(1),t(2),t(3),s(4),s(5),s(6),y(1),y(1)];
  d.hand=[w(1),w(2),w(5),w(6),w(7),t(1),t(2),t(3),s(4),s(5),s(6),y(1),y(1)];
  for(const other of [b,c,d])if(!riichi.declareRiichi(other,true).ok)throw Error('其他听型声明失败');
  d.discards=[y(1)];app.table.refreshAll(game);
  const shapes=game.players.map(p=>app.table.node.getChildByName('PublicWait-'+p.id).getComponent(cc.Label).string);
  if(shapes.some(s=>s.includes('object')||!s)||!shapes[0].includes('单吊')||!shapes[1].includes('对倒')||!shapes[2].includes('夹胡')||!shapes[3].includes('撅'))throw Error('具体听法未公开 '+shapes);
  if(!app.table.waitInfo.string.includes('中 2 张'))throw Error('锁定中单吊余量应为2 '+app.table.waitInfo.string);
  app.clickTile(p.hand[0]);if(!app.table.tileInfo.string.includes('外部未见 2 张')||p.hand.length!==13)throw Error('非自己回合查看手牌失败');
  const drawn=y(1);p.hand.push(drawn);game.phase='playerTurn';game.currentSeat='east';game.waitingHumanTurn=p;game.lastDrawn=drawn;
  app.table.highlightTurn('east');app.humanTurn(p,drawn);
  if(!app.actions.buttons.win.active||!app.table.messageLabel.string.includes('已经自摸'))throw Error('七小对自摸仍无胡牌提示');
  return {shapes,wait:app.table.waitInfo.string,lock:JSON.stringify(p.state.riichiLockedHandIds)};
 });
 // Real pointer on a locked old tile must inspect it, not discard or change waits.
 await page.mouse.click(231,637);await page.mouse.click(231,637);await page.waitForTimeout(120);
 await page.evaluate(async()=>{const cc=await System.import('cc'),app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');if(app.session.players[0].hand.length!==14||!app.actions.buttons.win.active)throw Error('查看旧牌改变手牌或隐藏胡按钮');});
 const dir=path.resolve(__dirname,'../screenshots');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'riichi-selfdraw.png')});
 const pos=await page.evaluate(async()=>{const cc=await System.import('cc'),app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),n=app.actions.buttons.win;return {x:n.worldPosition.x,y:720-n.worldPosition.y};});
 await page.mouse.click(pos.x,pos.y);await page.waitForTimeout(150);
 await page.evaluate(async()=>{const cc=await System.import('cc'),app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');if(!app.settlement.node.active||app.session.phase!=='settled')throw Error('七小对胡按钮无法完成结算');});
 await page.screenshot({path:path.join(dir,'qi-settlement.png')});
 const gang=await page.evaluate(async()=>{
  const cc=await System.import('cc'),core=await System.import('chunks:///_virtual/Player.ts'),tiles=await System.import('chunks:///_virtual/Tile.ts');
  const app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),game=app.session;
  app.settlement.hide();app.unscheduleAllCallbacks();game.players.forEach(p=>{p.state=core.createDefaultPlayerState();p.hand=[];p.melds=[];p.discards=[];p.score=0;});
  let id=4000;const make=(suit,r)=>tiles.createTile(id++,suit,r),w=r=>make('wan',r),t=r=>make('tong',r),s=r=>make('tiao',r),f=r=>make('feng',r);
  const p=game.players[0];p.hand=[f(1),f(2),f(3),f(4),w(1),w(2),w(3),t(1),t(2),t(3),s(1),s(2),s(3),t(9)];
  game.phase='playerTurn';game.currentSeat='east';game.waitingHumanTurn=p;game.waitingHumanClaim=null;game.lastDrawn=p.hand[13];
  game.wall.kongStack=[t(9),f(1)];game.wall.kongIndex=0;app.table.highlightTurn('east');app.humanTurn(p,game.lastDrawn);app.actions.onGang();
  const node=app.actions.choices.find(n=>n.getChildByName('Label').getComponent(cc.Label).string.includes('四风杠'));
  if(!node)throw Error('四风杠未提供');node.emit(cc.Button.EventType.CLICK);
  if(!p.melds[0]?.specialGang||p.state.isOpen||p.score!==24)throw Error('特殊杠基础/庄家/暗杠错误');
  app.actions.onGang();const mao=app.actions.choices.find(n=>n.getChildByName('Label').getComponent(cc.Label).string.includes('补毛'));
  if(!mao)throw Error('补毛未提供');mao.emit(cc.Button.EventType.CLICK);
  if(p.melds[0].tiles.length!==5||p.score!==30||game.wall.kongIndex!==2||!game.isAfterGangSpecial||!app.actions.buttons.win.active)throw Error('补毛、尾部补牌或杠后自摸错误');
  // Rendering uses the viewer's perspective, not the concealed gang's scoring mode.
  const special=p.melds[0];p.melds=[];const other=game.players[1];
  other.melds=[special,{type:'anGang',tiles:[t(2),t(2),t(2),t(2)],openedTileIndex:-1}];
  app.table.refreshAll(game);const views=app.table.getArea('south').meldsRow.children.map(n=>n.getComponent('TileView'));
  if(views.length!==9||views.slice(0,5).some(v=>v.isFaceDown)||views.slice(5).some(v=>!v.isFaceDown))throw Error('公开特殊杠和普通暗杠显示错误');
  return {score:p.score,tailDraws:game.wall.kongIndex,publicFaces:5,hiddenFaces:4};
 });
 await page.waitForTimeout(120);await page.screenshot({path:path.join(dir,'special-gang.png')});
 console.log('Waits browser passed',JSON.stringify({declaration,gang,errors}));await browser.close();if(errors.length)process.exitCode=1;
})().catch(async e=>{console.error(e);process.exitCode=1;await browser?.close();});
