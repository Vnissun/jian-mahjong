import {describe,it,assertTrue,assertFalse,assertEqual} from './runner';
import {createPlayer,Player,readRiichiShapes} from '../assets/scripts/core/Player';
import {createRoom} from '../assets/scripts/core/Room';
import {createTile,Tile} from '../assets/scripts/core/Tile';
import {Suit,SeatWind,RiichiType,MeldType} from '../assets/scripts/core/Types';
import {DEFAULT_ROOM_CONFIG} from '../assets/scripts/config/GameConfig';
import {declareRiichi,describeRiichi} from '../assets/scripts/game/RiichiManager';
import {evaluatePlayerWin} from '../assets/scripts/game/PlayerWin';
import {GameSession,SessionPhase} from '../assets/scripts/game/GameSession';
import {getConcealedGangChoices,concealedGang,getSupplementGangChoices,supplementGang} from '../assets/scripts/game/ConcealedGang';
import {GangSettlementMode,settleGang} from '../assets/scripts/game/GangSettlement';
import {countVisibleCopies,isMeldPublic} from '../assets/scripts/game/TileVisibility';
let id=9000;
const make=(suit:Suit,r:number)=>createTile(id++,suit,r),w=(r:number)=>make(Suit.Wan,r),t=(r:number)=>make(Suit.Tong,r),s=(r:number)=>make(Suit.Tiao,r),f=(r:number)=>make(Suit.Feng,r),y=(r:number)=>make(Suit.Yuan,r);
const screenshot13=()=>[t(3),t(3),t(4),t(4),t(5),t(5),t(8),t(8),f(1),f(1),f(3),f(3),y(1)];
function players(){return [SeatWind.East,SeatWind.South,SeatWind.West,SeatWind.North].map((seat,i)=>createPlayer(String(i),'玩家'+i,seat));}
describe('真实报听声明与七小对回归',()=>{
 it('截图混清七小对：声明单吊后摸中，确实可以胡',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.hand=screenshot13();assertTrue(declareRiichi(p,true).ok);
  assertEqual(describeRiichi(p),'单吊报听');assertTrue(p.state.riichiShapes.every(s=>typeof s==='string'));
  const drawn=y(1);p.hand.push(drawn);const result=evaluatePlayerWin(p,drawn,true);
  assertTrue(result.ok);assertTrue(!!result.qiInfo);
 });
 it('完整会话：真人报听、摸中、显示可胡、完成自摸结算',()=>{
  const ps=players(),game=new GameSession(createRoom('test','0',{...DEFAULT_ROOM_CONFIG},ps),ps,[]);game.startRound();
  ps.forEach(p=>{p.hand=[];p.melds=[];p.discards=[];});const p=ps[0],discard=w(9);p.hand=screenshot13().concat(discard);
  game.lastDrawn=discard;assertTrue(game.playerDeclareRiichi(p,discard));
  const drawn=y(1);p.hand.push(drawn);game.lastDrawn=drawn;game.phase=SessionPhase.PlayerTurn;game.currentSeat=SeatWind.East;(game as any).waitingHumanTurn=p;
  assertTrue(game.computeHumanOptions(p,drawn).canWin);assertTrue(game.playerSelfWin(p,drawn));
  assertEqual(ps.reduce((n,p)=>n+p.score,0),0);
 });
 it('纯清一色七小对有幺九，报听后可自摸',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.hand=[t(1),t(1),t(2),t(2),t(3),t(3),t(4),t(4),t(5),t(5),t(6),t(6),t(7)];
  assertTrue(declareRiichi(p,true).ok);const drawn=t(7);p.hand.push(drawn);assertTrue(evaluatePlayerWin(p,drawn,true).ok);
 });
 it('兼容旧构建 [Set] 数据，不显示 object Set，也不阻止七小对',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.hand=screenshot13();declareRiichi(p,true);
  p.state.riichiShapes=[new Set(['danDiao'])] as any;
  assertEqual(readRiichiShapes(p).join(','),'danDiao');assertEqual(describeRiichi(p),'单吊报听');
  assertTrue(evaluatePlayerWin(p,y(1),true).ok);
 });
 it('报听锁定原始暗手，偷偷替换同种物理牌也不能胡',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.hand=screenshot13();declareRiichi(p,true);
  p.hand[0]=t(3);assertFalse(evaluatePlayerWin(p,y(1),true).ok);
 });
 it('报听后改变对子和听口，不允许用新听口胡牌',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.hand=screenshot13();declareRiichi(p,true);
  p.hand[p.hand.length-1]=y(2);assertFalse(evaluatePlayerWin(p,y(2),true).ok);
  assertEqual(p.state.riichiWaits[0].rank,1);
 });
});
describe('可见牌余量：不泄漏暗手或暗杠',()=>{
 it('四张减已出、吃碰亮牌、自己持有，重复 ID 只算一次',()=>{
  const ps=players(),sample=s(3),a=s(3),b=s(3);ps[0].hand=[sample];ps[1].discards=[a];
  ps[2].melds=[{type:MeldType.Peng,tiles:[a,b,w(1)],openedTileIndex:0}];
  const c=countVisibleCopies(ps,ps[0],sample);assertEqual(c.publicCount,2);assertEqual(c.ownCount,1);assertEqual(c.remaining,1);assertEqual(c.unexposed,2);
 });
 it('他家暗手无论藏了几张，都不改变余量估计',()=>{
  const ps=players(),sample=s(3);ps[0].hand=[sample];const before=countVisibleCopies(ps,ps[0],sample).remaining;
  ps[1].hand=[s(3),s(3),s(3)];assertEqual(countVisibleCopies(ps,ps[0],sample).remaining,before);
 });
 it('他家四同暗杠不泄漏牌种，自己暗杠则属于自己已知牌',()=>{
  const ps=players(),tiles=[t(2),t(2),t(2),t(2)],meld={type:MeldType.AnGang,tiles,openedTileIndex:-1};ps[1].melds=[meld];
  assertFalse(isMeldPublic(meld));assertEqual(countVisibleCopies(ps,ps[0],tiles[0]).remaining,4);
  assertEqual(countVisibleCopies(ps,ps[1],tiles[0]).remaining,0);
 });
 it('公开三元杠的重复元牌也计入可见牌',()=>{
  const ps=players(),extra=y(1),meld={type:MeldType.AnGang,tiles:[y(1),y(2),y(3),extra],openedTileIndex:-1,specialGang:'dragons' as const};ps[1].melds=[meld];
  assertTrue(isMeldPublic(meld));assertEqual(countVisibleCopies(ps,ps[0],extra).remaining,2);
 });
 it('未见张数不会变负数',()=>{
  const ps=players(),sample=t(1);ps[0].discards=Array.from({length:5},()=>t(1));assertEqual(countVisibleCopies(ps,ps[0],sample).remaining,0);
 });
});
describe('特殊杠、补毛和庄家付款',()=>{
 it('四风各一张可以攒齐开杠，公开、不开门、按暗杠 ×2',()=>{
  const ps=players(),p=ps[1];p.hand=[f(1),f(2),f(3),f(4),w(9)];
  const choice=getConcealedGangChoices(p).find(c=>c.specialGang==='winds')!;assertTrue(!!choice);
  const action=concealedGang(p,choice.tiles);assertTrue(action.ok);assertFalse(p.state.isOpen);assertTrue(p.state.isStanding);assertTrue(isMeldPublic(action.meld!));
  const r=settleGang({gangPlayer:p,meld:action.meld!,gangTile:choice.tiles[0],allPlayers:ps,currentDealer:SeatWind.East,roomConfig:{...DEFAULT_ROOM_CONFIG},mode:GangSettlementMode.AnGang});
  assertEqual(r.baseScore,2);assertEqual(r.typeMultiplier,2);assertEqual(r.payerDeltas['0'],-8);assertEqual(r.payerDeltas['2'],-4);assertEqual(r.totalAmount,16);
 });
 it('三元第四张只允许元牌，拒绝数牌及风牌且物理 ID 不能重复',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.hand=[y(1),y(2),y(3),w(8),f(1),y(1)];
  const choices=getConcealedGangChoices(p).filter(c=>c.specialGang==='dragons');assertEqual(choices.length,1);
  assertTrue(choices.every(c=>c.tiles.every(t=>t.suit===Suit.Yuan)));
  assertFalse(concealedGang(p,p.hand.slice(0,4)).ok);
  assertFalse(concealedGang(p,[p.hand[0],p.hand[1],p.hand[2],p.hand[4]]).ok);
  assertTrue(choices.every(c=>new Set(c.tiles.map(t=>t.id)).size===4));assertFalse(concealedGang(p,[p.hand[0],p.hand[1],p.hand[2],p.hand[2]]).ok);
 });
 it('非庄补一张毛：庄付 2，其他各付 1，总计 4',()=>{
  const ps=players(),p=ps[1],tiles=[f(1),f(2),f(3),f(4)];p.melds=[{type:MeldType.AnGang,tiles,openedTileIndex:-1,specialGang:'winds'}];
  const extra=f(1);p.hand=[extra];const action=supplementGang(p,0,extra);assertTrue(action.ok);assertEqual(action.meld!.tiles.length,5);
  const r=settleGang({gangPlayer:p,meld:action.meld!,gangTile:extra,allPlayers:ps,currentDealer:SeatWind.East,roomConfig:{...DEFAULT_ROOM_CONFIG},mode:GangSettlementMode.Supplement});
  assertEqual(r.baseScore,1);assertEqual(r.typeMultiplier,1);assertEqual(r.payerDeltas['0'],-2);assertEqual(r.payerDeltas['2'],-1);assertEqual(r.payerDeltas['3'],-1);assertEqual(r.gangPlayerDelta,4);
 });
 it('庄家自己补毛：另外三家各付 2',()=>{
  const ps=players(),p=ps[0],extra=f(1);p.melds=[{type:MeldType.AnGang,tiles:[f(1),f(2),f(3),f(4),extra],openedTileIndex:-1,specialGang:'winds'}];
  const r=settleGang({gangPlayer:p,meld:p.melds[0],gangTile:extra,allPlayers:ps,currentDealer:SeatWind.East,roomConfig:{...DEFAULT_ROOM_CONFIG},mode:GangSettlementMode.Supplement});
  assertEqual(r.gangPlayerDelta,6);assertTrue(Object.values(r.payerDeltas).every(n=>n===-2));
 });
 it('补毛限原字牌家族，不能补任意数牌或普通四同暗杠',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.melds=[{type:MeldType.AnGang,tiles:[y(1),y(2),y(3),y(1)],openedTileIndex:-1,specialGang:'dragons'}];
  p.hand=[y(1),f(1),w(8)];assertEqual(getSupplementGangChoices(p).length,1);
  assertFalse(supplementGang(p,0,p.hand[1]).ok);assertFalse(supplementGang(p,0,p.hand[2]).ok);
 });
 it('二筒不能作为三元第四张，也不能补毛；凑四张才可普通暗杠',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.hand=[y(1),y(2),y(3),t(2)];
  assertEqual(getConcealedGangChoices(p).length,0);
  p.hand=[t(2),t(2),t(2),t(2)];assertTrue(concealedGang(p,p.hand.slice()).ok);
  p.hand=[t(2),y(1)];assertEqual(getSupplementGangChoices(p).length,0);
 });
 it('拒绝继续补含数牌的旧三元副露',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.melds=[{type:MeldType.AnGang,tiles:[y(1),y(2),y(3),t(2)],openedTileIndex:-1,specialGang:'dragons'}];p.hand=[y(1),t(2)];
  assertEqual(getSupplementGangChoices(p).length,0);assertFalse(supplementGang(p,0,p.hand[0]).ok);
 });
 it('报听后不可开特殊杠或补毛，避免换听',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.hand=[f(1),f(2),f(3),f(4)];p.state.riichi=RiichiType.Normal;
  assertEqual(getConcealedGangChoices(p).length,0);assertEqual(getSupplementGangChoices(p).length,0);
 });
 it('会话补毛后尾部补牌，自摸享受杠后追加 ×2',()=>{
  let result:any;const ps=players(),game=new GameSession(createRoom('test','0',{...DEFAULT_ROOM_CONFIG},ps),ps,[],{onWin:(_p,_t,r)=>result=r});game.startRound();
  const p=ps[0];p.hand=[w(1),w(2),w(3),t(1),t(2),t(3),s(1),s(2),s(3),t(9),f(1)];
  // This test isolates a completed supplement; random opponents must not claim it.
  for(const other of ps.slice(1)){other.hand=[];other.melds=[];other.discards=[];}
  p.melds=[{type:MeldType.AnGang,tiles:[f(1),f(2),f(3),f(4)],openedTileIndex:-1,specialGang:'winds'}];
  const drawn=t(9);game.wall.kongStack=[drawn];game.wall.kongIndex=0;
  assertTrue(game.playerSupplementGang(p,0,p.hand[10]));assertEqual(game.wall.kongIndex,1);assertEqual(p.hand.length,11);assertTrue(game.isAfterGangSpecial);
  assertTrue(game.playerSelfWin(p,drawn));assertEqual(result.payerDetails['1'].breakdown.gangHouMul,2);
 });
 for(const [suit,rank,base] of [[Suit.Tong,2,4],[Suit.Wan,8,4],[Suit.Tong,1,2],[Suit.Tiao,1,2],[Suit.Yuan,1,2],[Suit.Yuan,2,2],[Suit.Yuan,3,2]] as [Suit,number,number][])
 it(suit+rank+' 四同暗杠：基础 '+base+'，暗杠再 ×2，其他人不可见',()=>{
  const ps=players(),p=ps[1];p.hand=Array.from({length:4},()=>make(suit,rank));const action=concealedGang(p,p.hand.slice());assertTrue(action.ok);assertFalse(isMeldPublic(action.meld!));
  const r=settleGang({gangPlayer:p,meld:action.meld!,gangTile:action.meld!.tiles[0],allPlayers:ps,currentDealer:SeatWind.East,roomConfig:{...DEFAULT_ROOM_CONFIG},mode:GangSettlementMode.AnGang});
  assertEqual(r.baseScore,base);assertEqual(r.payerDeltas['2'],-base*2);assertEqual(r.payerDeltas['0'],-base*4);
 });
});
