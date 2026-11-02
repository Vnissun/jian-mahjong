const fs=require('node:fs'),path=require('node:path');
let playwright;
try{playwright=require(process.env.PLAYWRIGHT_PATH||'playwright');}
catch{playwright=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
let browser;
(async()=>{
 browser=await playwright.chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:7457');await page.waitForTimeout(6000);
 const defaults=await page.evaluate(async()=>{const cc=await System.import('cc');return cc.director.getScene().getChildByName('Canvas').getComponent('GameApp').lobby.config;});
 if(defaults.baseScore!==1||defaults.cap!==32||defaults.totalRoundWinds!==3||!defaults.allowQiXiaoDui||!defaults.allowChi)throw Error('默认选项不正确');
 await page.mouse.click(640,612);await page.waitForTimeout(300);
 await page.evaluate(async()=>{
  const cc=await System.import('cc'),app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),game=app.session;
  app.unscheduleAllCallbacks();game.players.forEach(p=>{p.hand=[];p.melds=[];p.discards=[];p.score=0;
   p.state.riichi='none';p.state.riichiShapes=[];p.state.isWon=false;p.state.isDrawn=false;p.state.isStanding=true;p.state.isOpen=false;});
  let id=1000;const tile=(suit,rank)=>({id:id++,suit,rank,name:String(rank)+(suit==='wan'?'万':suit==='tong'?'筒':suit==='tiao'?'条':'中')});
  const w=r=>tile('wan',r),t=r=>tile('tong',r),s=r=>tile('tiao',r),y=()=>tile('yuan',1);
  const east=game.players[0],north=game.players[3],target=w(5);
  east.hand=[w(3),w(4),w(6),w(7),t(1),t(2),t(3),s(1),s(2),s(3),y(),y(),w(9)];north.hand=[target];
  game.phase='playerTurn';game.currentSeat='north';game.waitingHumanTurn=north;game.waitingHumanClaim=null;
  game.pendingRobbingGang=null;game.lastDiscard=null;game.lastDiscarder=null;game.lastDrawn=null;
  if(!game.playerDiscard(north,target)||!app.actions.buttons.chi.active)throw Error('真人吃牌按钮没有显示');
  app.actions.onChi();if(app.actions.choices.length!==3)throw Error('吃牌没有提供三种组合');
 });
 const dir=path.resolve(__dirname,'../screenshots');fs.mkdirSync(dir,{recursive:true});
 await page.waitForTimeout(100);await page.screenshot({path:path.join(dir,'chi-options.png')});
 const location=await page.evaluate(async()=>{const cc=await System.import('cc'),app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),n=app.actions.choices[1];return {x:n.worldPosition.x,y:720-n.worldPosition.y};});
 await page.mouse.click(location.x,location.y);await page.waitForTimeout(200);
 await page.evaluate(async()=>{const cc=await System.import('cc'),app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp');
  if(app.session.players[0].melds[0]?.type!=='chi'||app.session.phase!=='playerTurn'||!app.actions.buttons.discard.active)throw Error('吃后出牌流程失败');});
 await page.screenshot({path:path.join(dir,'chi.png')});
 const example=await page.evaluate(async()=>{
  const cc=await System.import('cc'),engine=await System.import('chunks:///_virtual/SettlementEngine.ts');
  const app=cc.director.getScene().getChildByName('Canvas').getComponent('GameApp'),game=app.session,players=game.players;
  app.unscheduleAllCallbacks();game.phase='settled';
  players.forEach((p,i)=>{p.name='ABCD'[i];p.score=0;p.state.isStanding=false;p.state.riichi=i===0?'jue':'normal';
   p.state.riichiShapes=[['jue','jiaHu','danDiao','duiDao'][i]];});
  const winner=players[2],firer=players[1];
  const tiles=[{id:600,suit:'wan',rank:1,name:'一万'},{id:601,suit:'tong',rank:1,name:'一筒'},{id:602,suit:'tiao',rank:1,name:'一条'}];
  const result=engine.settleWin({winner,firer,allPlayers:players,currentDealer:'east',winMode:'dianPao',winTiles:tiles,winTile:tiles[0],
   roomConfig:{...game.config},isAfterGang:false,isAfterGangSpecial:false,isGangShangKaiHua:false});
  engine.applySettlement(players,result);app.table.refreshAll(game);app.settlement.show(result,[],players,'dianPao',winner);
  const riichi=players.filter(p=>p!==winner).map(p=>result.payerDetails[p.id].breakdown.riichiMul);
  if(riichi.join(',')!=='4,2,2'||result.winnerDelta!==14)throw Error('用户示例结算错误');
  const text=app.settlement.content.children.map(n=>n.getComponent(cc.Label)?.string||'').join('\n');
  if(!text.includes('双方报听取高 ×4')||!text.includes('双方报听取高 ×2'))throw Error('逐家倍数没有显示');
  if(players.some(p=>!app.table.node.getChildByName('PublicWait-'+p.id).getComponent(cc.Label).string))throw Error('报听类型未向所有人显示');
  return {riichi,scores:players.map(p=>p.score)};
 });
 await page.waitForTimeout(200);await page.screenshot({path:path.join(dir,'scoring-example.png')});
 console.log('Rules browser passed',JSON.stringify({defaults,example,errors}));
 await browser.close();if(errors.length)process.exitCode=1;
})().catch(async e=>{console.error(e);process.exitCode=1;await browser?.close();});
