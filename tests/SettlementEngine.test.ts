import { describe,it,assertTrue,assertFalse,assertEqual } from './runner';
import {createPlayer} from '../assets/scripts/core/Player';
import {createTile,Tile} from '../assets/scripts/core/Tile';
import {SeatWind,Suit,RiichiType} from '../assets/scripts/core/Types';
import {DEFAULT_ROOM_CONFIG} from '../assets/scripts/config/GameConfig';
import {WinContext,WinMode,settleWin,computeWinMultiplier,applySettlement,applyCap} from '../assets/scripts/game/SettlementEngine';
import {computeFinalMultiplier} from '../assets/scripts/config/ScoringConfig';
function context():WinContext {
 const players=[SeatWind.East,SeatWind.South,SeatWind.West,SeatWind.North].map((seat,i)=>createPlayer('ABCD'[i],'ABCD'[i],seat));
 players.forEach(p=>p.state.isStanding=false);
 const tiles:Tile[]=[];let id=0;
 for(const [suit,ranks] of [[Suit.Wan,[1,1,1,2,3,4]],[Suit.Tong,[1,2,3]],[Suit.Tiao,[1,2,3]],[Suit.Yuan,[1,1]]] as [Suit,number[]][])
  for(const rank of ranks)tiles.push(createTile(id++,suit,rank));
 return {winner:players[2],firer:players[1],allPlayers:players,currentDealer:SeatWind.North,
  winTiles:tiles,winTile:tiles[13],winMode:WinMode.DianPao,
  isAfterGang:false,isAfterGangSpecial:false,isGangShangKaiHua:false,roomConfig:{...DEFAULT_ROOM_CONFIG}};
}
describe('逐家计分：用户示例与基本付款',()=>{
 it('A 报撅，BCD 普通报听，B 点炮 C：A ×4，B/D ×2 的报听项互不污染',()=>{
  const ctx=context();ctx.currentDealer=SeatWind.East;
  ctx.allPlayers.forEach(p=>p.state.riichi=RiichiType.Normal);ctx.allPlayers[0].state.riichi=RiichiType.Jue;
  ctx.combinedRiichiMul=4;
  const result=settleWin(ctx);
  assertEqual(result.payerDetails.A.breakdown.riichiMul,4);
  assertEqual(result.payerDetails.B.breakdown.riichiMul,2);
  assertEqual(result.payerDetails.D.breakdown.riichiMul,2);
  assertEqual(result.payerDeltas.A,-8);assertEqual(result.payerDeltas.B,-4);assertEqual(result.payerDeltas.D,-2);
  assertEqual(result.winnerDelta,14);
 });
 it('点炮时另外两家也付款，只有点炮者加点炮 ×2',()=>{
  const ctx=context(),r=settleWin(ctx);
  assertEqual(Object.keys(r.payerDeltas).length,3);
  assertEqual(r.payerDeltas.A,-1);assertEqual(r.payerDeltas.B,-2);assertEqual(r.payerDeltas.D,-2);
  assertEqual(r.payerDetails.A.breakdown.dianPaoMul,1);
  assertEqual(r.payerDetails.B.breakdown.dianPaoMul,2);
  assertEqual(r.payerDetails.D.breakdown.dianPaoMul,1);
 });
 it('自摸：每家自摸 ×2，庄家付款仅再 ×2 一次',()=>{
  const ctx=context();ctx.winMode=WinMode.SelfDraw;
  const r=settleWin(ctx);assertEqual(r.payerDeltas.A,-2);assertEqual(r.payerDeltas.B,-2);assertEqual(r.payerDeltas.D,-4);
 });
 it('胡家为庄家：每笔庄家 ×2，不重复算成 ×4',()=>{
  const ctx=context();ctx.currentDealer=ctx.winner.seat;
  const r=settleWin(ctx);assertEqual(r.payerDeltas.A,-2);assertEqual(r.payerDeltas.B,-4);assertEqual(r.payerDeltas.D,-2);
 });
 it('付款者为庄家：只影响这一笔',()=>{
  const ctx=context();ctx.currentDealer=SeatWind.East;
  assertEqual(computeWinMultiplier(ctx,ctx.allPlayers[0]).breakdown.dealerMul,2);
  assertEqual(computeWinMultiplier(ctx,ctx.allPlayers[1]).breakdown.dealerMul,1);
 });
 it('抢杠：三家付款，开杠者为责任方，积分守恒',()=>{
  const ctx=context();ctx.winMode=WinMode.RobbingGang;
  const r=settleWin(ctx);assertEqual(Object.keys(r.payerDeltas).length,3);
  assertEqual(r.firerId,'B');assertEqual(r.winnerDelta+Object.values(r.payerDeltas).reduce((a,b)=>a+b,0),0);
 });
});

describe('豪华七对叠加',()=>{
 for(const count of [0,1,2,3])it(`${count}套四同：胡分额外乘${2**count}，庄家、自摸、清一色继续叠加且按满贯封顶`,()=>{
  const ctx=context();ctx.roomConfig.cap=0;ctx.qiInfo={isHaoHua:count>0,gangGroups:count};
  ctx.winner.state.isStanding=true;ctx.winner.state.riichi=RiichiType.Normal;ctx.winner.state.riichiShapes=['danDiao'];
  let r=settleWin(ctx);assertEqual(r.payerDetails.A.amount,32*2**count);assertEqual(r.payerDetails.B.amount,64*2**count);assertEqual(r.payerDetails.D.amount,64*2**count);
  assertEqual(r.breakdown.qiXiaoDuiLuxuryMul,2**count);assertEqual(r.breakdown.piaoHuMul,1);
  ctx.winMode=WinMode.SelfDraw;ctx.currentDealer=ctx.winner.seat;ctx.winTiles=ctx.winTiles.map(t=>({...t,suit:Suit.Wan}));
  r=settleWin(ctx);assertEqual(r.payerDetails.A.amount,32*2**count*2*2*4);
  ctx.roomConfig.cap=32;r=settleWin(ctx);assertEqual(r.payerDetails.A.amount,32);assertTrue(r.isCapped);
 });
});
describe('逐家计分：双方报听取高',()=>{
 for(const [winner,payer,expected] of [
  [RiichiType.None,RiichiType.None,1],[RiichiType.Normal,RiichiType.None,2],
  [RiichiType.None,RiichiType.Normal,2],[RiichiType.Normal,RiichiType.Normal,2],
  [RiichiType.Jue,RiichiType.Normal,4],[RiichiType.Normal,RiichiType.Jue,4],
  [RiichiType.Jue,RiichiType.Jue,4],
 ] as [RiichiType,RiichiType,number][])it(winner+' / '+payer+' → ×'+expected,()=>{
  const ctx=context();ctx.winner.state.riichi=winner;ctx.allPlayers[0].state.riichi=payer;
  assertEqual(computeWinMultiplier(ctx,ctx.allPlayers[0]).breakdown.riichiMul,expected);
 });
 it('第三人的报撅不会给其他双方额外加倍',()=>{
  const ctx=context();ctx.allPlayers[3].state.riichi=RiichiType.Jue;ctx.combinedRiichiMul=4;
  assertEqual(computeWinMultiplier(ctx,ctx.allPlayers[0]).breakdown.riichiMul,1);
 });
});
describe('逐家计分：站立和杠后',()=>{
 for(const [winner,payer,expected] of [[false,false,1],[true,false,2],[false,true,2],[true,true,4]] as [boolean,boolean,number][])
  it('站立 '+winner+' / '+payer+' → ×'+expected,()=>{
   const ctx=context();ctx.winner.state.isStanding=winner;ctx.allPlayers[0].state.isStanding=payer;
   assertEqual(computeWinMultiplier(ctx,ctx.allPlayers[0]).mul,expected);
  });
 it('杠后自摸：自摸 ×2，再追加 ×2，合计 ×4',()=>{
  const ctx=context();ctx.winMode=WinMode.SelfDraw;ctx.isAfterGang=true;ctx.isAfterGangSpecial=true;ctx.isGangShangKaiHua=true;
  const d=computeWinMultiplier(ctx,ctx.allPlayers[0]);assertEqual(d.mul,4);assertEqual(d.breakdown.selfDrawMul,2);assertEqual(d.breakdown.gangHouMul,2);
 });
 it('杠后点炮：点炮方 ×2 再追加 ×2，其他人没有责任倍数',()=>{
  const ctx=context();ctx.isAfterGang=true;ctx.isAfterGangSpecial=true;
  assertEqual(computeWinMultiplier(ctx,ctx.firer).mul,4);
  assertEqual(computeWinMultiplier(ctx,ctx.allPlayers[0]).mul,1);
 });
 it('本局早先有人杠过，不为之后的普通胡牌追加倍数',()=>{
  const ctx=context();ctx.isAfterGang=true;
  assertEqual(computeWinMultiplier(ctx,ctx.firer).mul,2);
 });
 it('四人都站立：四家清固定 ×16，不再叠加双方站立',()=>{
  const ctx=context();ctx.allPlayers.forEach(p=>p.state.isStanding=true);
  const d=computeWinMultiplier(ctx,ctx.allPlayers[0]);assertEqual(d.mul,16);assertEqual(d.breakdown.siJiaQingMul,16);
  assertEqual(d.breakdown.winnerStandingMul,1);assertEqual(d.breakdown.payerStandingMul,1);
 });
 it('三家清：仅胡家开门、其余三家未开门时 ×4',()=>{
  const ctx=context();ctx.allPlayers.forEach(p=>p.state.isStanding=true);ctx.winner.state.isStanding=false;
  const d=computeWinMultiplier(ctx,ctx.allPlayers[0]);assertEqual(d.mul,4);assertEqual(d.breakdown.sanJiaQingMul,4);assertEqual(d.breakdown.siJiaQingMul,1);
  assertEqual(d.breakdown.winnerStandingMul,1);assertEqual(d.breakdown.payerStandingMul,1);
 });
 it('胡家站立但某付款人开门，不算三家清',()=>{
  const ctx=context();ctx.allPlayers.forEach(p=>p.state.isStanding=true);ctx.allPlayers[0].state.isStanding=false;
  assertEqual(computeWinMultiplier(ctx,ctx.allPlayers[1]).breakdown.sanJiaQingMul,1);
 });
});
describe('三家清与四家清固定基础回归',()=>{
 it('四个胡家位置、全部16种站立组合逐家校验，不影响普通站立规则',()=>{
  for(let winner=0;winner<4;winner++)for(let mask=0;mask<16;mask++){
   const ctx=context();ctx.winner=ctx.allPlayers[winner];ctx.currentDealer=ctx.winner.seat;
   ctx.firer=ctx.allPlayers[(winner+1)%4];ctx.roomConfig.cap=0;
   ctx.allPlayers.forEach((p,i)=>p.state.isStanding=!!(mask&(1<<i)));
   const others=ctx.allPlayers.filter(p=>p!==ctx.winner),four=mask===15,
    three=!ctx.winner.state.isStanding&&others.every(p=>p.state.isStanding);
   for(const payer of others){
    const d=computeWinMultiplier(ctx,payer),base=four?16:three?4:(ctx.winner.state.isStanding?2:1)*(payer.state.isStanding?2:1);
    assertEqual(d.mul,base*2*(payer===ctx.firer?2:1));
    assertEqual(d.breakdown.winnerStandingMul,four||three?1:ctx.winner.state.isStanding?2:1);
    assertEqual(d.breakdown.payerStandingMul,four||three?1:payer.state.isStanding?2:1);
   }
   const r=settleWin(ctx);assertEqual(r.winnerDelta+Object.values(r.payerDeltas).reduce((a,b)=>a+b,0),0);
  }
 });
 for(const four of [false,true])it((four?'四家清':'三家清')+'仍叠加报听、庄家、自摸和清一色，保留满贯上限',()=>{
  const ctx=context();ctx.roomConfig.cap=0;ctx.winMode=WinMode.SelfDraw;ctx.currentDealer=ctx.winner.seat;
  ctx.allPlayers.forEach(p=>p.state.isStanding=true);ctx.winner.state.isStanding=four;
  ctx.winner.state.riichi=RiichiType.Jue;ctx.winTiles=ctx.winTiles.map(t=>({...t,suit:Suit.Wan}));
  const expected=(four?16:4)*4*2*2*4;
  let r=settleWin(ctx);for(const p of Object.values(r.payerDetails))assertEqual(p.amount,expected);
  ctx.roomConfig.cap=32;r=settleWin(ctx);for(const p of Object.values(r.payerDetails)){assertEqual(p.amount,32);assertTrue(p.isCapped);}
 });
});

describe('逐家计分：清一色与七小对',()=>{
 it('混清一色 ×2',()=>{
  const ctx=context();ctx.winTiles=ctx.winTiles.map(t=>t.suit===Suit.Yuan?t:{...t,suit:Suit.Wan});
  assertEqual(computeWinMultiplier(ctx,ctx.allPlayers[0]).breakdown.qingMul,2);
 });
 it('无字纯清一色 ×4，不能再乘混清变成 ×8',()=>{
  const ctx=context();ctx.winTiles=ctx.winTiles.map(t=>({...t,suit:Suit.Wan}));
  assertEqual(computeWinMultiplier(ctx,ctx.allPlayers[0]).breakdown.qingMul,4);
 });
 it('七小对固定 ×8，站立 ×2，单吊报听 ×2，基础 ×32',()=>{
  const ctx=context();ctx.qiInfo={isHaoHua:false,gangGroups:0};
  ctx.winner.state.isStanding=true;ctx.winner.state.riichi=RiichiType.Normal;ctx.winner.state.riichiShapes=['danDiao'];
  const d=computeWinMultiplier(ctx,ctx.allPlayers[0]);assertEqual(d.mul,32);assertEqual(d.breakdown.qiXiaoDuiBaseMul,8);
 });
 it('七小对不再次乘四家清 ×16，避免固定基础重复',()=>{
  const ctx=context();ctx.qiInfo={isHaoHua:false,gangGroups:0};ctx.winner.state.riichi=RiichiType.Normal;ctx.winner.state.riichiShapes=['danDiao'];
  ctx.allPlayers.forEach(p=>p.state.isStanding=true);
  const d=computeWinMultiplier(ctx,ctx.allPlayers[0]);assertEqual(d.breakdown.siJiaQingMul,1);assertEqual(d.mul,64);
 });
 it('七小对未先报听单吊，结算拒绝',()=>{
  const ctx=context();ctx.qiInfo={isHaoHua:false,gangGroups:0};let error=false;
  try{settleWin(ctx);}catch{error=true;}assertTrue(error);
 });
 it('不把旧胡型倍数继续乘入新清单',()=>{
  const ctx=context();ctx.patternResult={patterns:[],description:'旧型态',totalMultiplier:8};
  assertEqual(computeWinMultiplier(ctx,ctx.allPlayers[0]).mul,1);
 });
});
describe('逐家计分：封顶与应用',()=>{
 it('无限满贯不截分且不标记封顶，底分仍在倍数之后乘入',()=>{
  const ctx=context();ctx.roomConfig.cap=0;ctx.roomConfig.baseScore=5;ctx.allPlayers.forEach(p=>{p.state.isStanding=true;p.state.riichi=RiichiType.Jue;});
  const r=settleWin(ctx);assertFalse(r.isCapped);for(const d of Object.values(r.payerDetails)){assertEqual(d.rawMultiplier,d.cappedMultiplier);assertEqual(d.amount,d.rawMultiplier*5);assertFalse(d.isCapped);}assertEqual(applyCap(4096,0),4096);assertEqual(computeFinalMultiplier([8,2,2,2],0),64);
 });
 it('每家分别封顶，庄家不能在封顶后再翻倍',()=>{
  const ctx=context();ctx.currentDealer=ctx.winner.seat;ctx.roomConfig.cap=32;ctx.roomConfig.baseScore=5;
  ctx.allPlayers.forEach(p=>{p.state.isStanding=true;p.state.riichi=RiichiType.Jue;});
  const r=settleWin(ctx);assertEqual(r.payerDetails.A.rawMultiplier,128);assertEqual(r.payerDetails.B.rawMultiplier,256);
  assertEqual(r.payerDetails.A.amount,160);assertEqual(r.payerDetails.B.amount,160);
  assertTrue(r.payerDetails.A.isCapped);assertTrue(r.payerDetails.B.isCapped);
 });
 it('应用结果后积分守恒，只有责任方标记点炮',()=>{
  const ctx=context(),r=settleWin(ctx);applySettlement(ctx.allPlayers,r);
  assertEqual(ctx.allPlayers.reduce((n,p)=>n+p.score,0),0);
  assertTrue(ctx.allPlayers[1].state.isFired);assertFalse(ctx.allPlayers[0].state.isFired);assertFalse(ctx.allPlayers[3].state.isFired);
 });
 it('自摸付款不误标记为点炮',()=>{
  const ctx=context();ctx.winMode=WinMode.SelfDraw;applySettlement(ctx.allPlayers,settleWin(ctx));
  assertTrue(ctx.allPlayers.filter(p=>p!==ctx.winner).every(p=>!p.state.isFired));
 });
 it('非法点炮上下文拒绝结算',()=>{
  const ctx=context();ctx.firer=undefined;let failed=false;
  try{settleWin(ctx);}catch{failed=true;}assertTrue(failed);
 });
 it('封顶函数不改变低于满贯的倍数',()=>{assertEqual(applyCap(16,32),16);assertEqual(applyCap(64,32),32);});
});

describe('报听对踢与新版七小对',()=>{
 for(const winner of [RiichiType.None,RiichiType.Normal,RiichiType.Jue])for(const payer of [RiichiType.None,RiichiType.Normal,RiichiType.Jue])
 it('对踢 '+winner+' / '+payer+' 按双方乘积',()=>{const ctx=context();ctx.roomConfig.riichiDuel=true;ctx.winner.state.riichi=winner;ctx.allPlayers[0].state.riichi=payer;const mult=(r:RiichiType)=>r===RiichiType.Jue?4:r===RiichiType.Normal?2:1;assertEqual(computeWinMultiplier(ctx,ctx.allPlayers[0]).breakdown.riichiMul,mult(winner)*mult(payer));});
 it('普通报听对撅：开启×8，关闭×4，逐家比较',()=>{
  const ctx=context();ctx.winner.state.riichi=RiichiType.Normal;ctx.allPlayers[0].state.riichi=RiichiType.Jue;ctx.allPlayers[1].state.riichi=RiichiType.Normal;
  ctx.roomConfig.riichiDuel=true;let r=settleWin(ctx);assertEqual(r.payerDetails.A.breakdown.riichiMul,8);assertEqual(r.payerDetails.B.breakdown.riichiMul,4);assertEqual(r.payerDetails.D.breakdown.riichiMul,2);
  ctx.roomConfig.riichiDuel=false;r=settleWin(ctx);assertEqual(r.payerDetails.A.breakdown.riichiMul,4);assertEqual(r.payerDetails.B.breakdown.riichiMul,2);
 });
 it('七小对基础32，点炮64，自摸64，庄家与纯清继续乘；无限保留全部倍数',()=>{
  const ctx=context();ctx.roomConfig.cap=0;ctx.qiInfo={isHaoHua:false,gangGroups:0};ctx.winner.state.isStanding=true;ctx.winner.state.riichi=RiichiType.Normal;ctx.winner.state.riichiShapes=['danDiao'];
  let r=settleWin(ctx);assertEqual(r.payerDetails.A.amount,32);assertEqual(r.payerDetails.B.amount,64);assertEqual(r.payerDetails.D.amount,64);
  ctx.winMode=WinMode.SelfDraw;r=settleWin(ctx);assertEqual(r.payerDetails.A.amount,64);assertEqual(r.payerDetails.D.amount,128);
  ctx.winTiles=ctx.winTiles.map(t=>({...t,suit:Suit.Wan}));r=settleWin(ctx);assertEqual(r.payerDetails.A.amount,256);assertEqual(r.payerDetails.D.amount,512);
 });
});

