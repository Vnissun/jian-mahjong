import { describe,it,assertTrue,assertFalse,assertEqual } from './runner';
import { createPlayer } from '../assets/scripts/core/Player';
import { createTile,Tile } from '../assets/scripts/core/Tile';
import { Suit,SeatWind,RiichiType } from '../assets/scripts/core/Types';
import { getRiichiChoices,declareRiichi,analyzeListening } from '../assets/scripts/game/RiichiManager';
import { evaluatePlayerWin } from '../assets/scripts/game/PlayerWin';
import { decideRiichi } from '../assets/scripts/game/AIBot';
import { GameSession,SessionPhase } from '../assets/scripts/game/GameSession';
import { createRoom } from '../assets/scripts/core/Room';
import { DEFAULT_ROOM_CONFIG } from '../assets/scripts/config/GameConfig';
let id=50000;const make=(s:Suit,r:number)=>createTile(id++,s,r),w=(r:number)=>make(Suit.Wan,r),t=(r:number)=>make(Suit.Tong,r),s=(r:number)=>make(Suit.Tiao,r),f=(r:number)=>make(Suit.Feng,r),y=(r:number)=>make(Suit.Yuan,r);
const doubleSingle=()=>[w(1),w(2),w(3),w(4),t(1),t(2),t(3),s(1),s(2),s(3),f(1),f(1),f(1)];
const twoSided=()=>[w(4),w(5),t(1),t(2),t(3),s(1),s(2),s(3),f(1),f(1),f(1),y(1),y(1)];
describe('报听资格与单吊听口选择',()=>{
 it('普通两面听仍可胡，但不能报听或触发 AI 报听',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.hand=twoSided();assertTrue(analyzeListening(p,true).isListening);
  assertTrue(evaluatePlayerWin(p,w(3),true).ok);assertTrue(evaluatePlayerWin(p,w(6),true).ok);
  assertEqual(getRiichiChoices(p,true).length,0);assertFalse(declareRiichi(p,true).ok);assertFalse(decideRiichi(p,true));assertEqual(p.state.riichi,RiichiType.None);
 });
 it('1234 听 1 或 4：给出两项单吊，未选不能声明',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.hand=doubleSingle();const choices=getRiichiChoices(p,true);
  assertEqual(choices.length,2);assertTrue(choices.every(c=>c.shape==='danDiao'&&c.winningTiles.length===1));
  assertEqual(choices.map(c=>c.winningTiles[0].rank).sort().join(','),'1,4');assertFalse(declareRiichi(p,true).ok);assertEqual(p.state.riichi,RiichiType.None);
 });
 for(const chosen of [1,4])it('单吊选择 '+chosen+' 后，只能胡该张，自摸/点炮都不能胡另一张',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.hand=doubleSingle();const choice=getRiichiChoices(p,true).find(c=>c.winningTiles[0].rank===chosen)!;
  assertTrue(declareRiichi(p,true,choice.key).ok);assertEqual(p.state.riichiWaits.length,1);assertEqual(p.state.riichiShapes.join(','),'danDiao');
  const wrong=w(chosen===1?4:1),right=w(chosen);assertFalse(evaluatePlayerWin(p,wrong,true).ok);assertTrue(evaluatePlayerWin(p,right,true).ok);
  p.hand.push(wrong);assertFalse(evaluatePlayerWin(p,wrong,true).ok);p.hand.pop();p.hand.push(right);assertTrue(evaluatePlayerWin(p,right,true).ok);
 });
 it('无效听口不能声明或更改手牌',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.hand=doubleSingle();const ids=p.hand.map(t=>t.id).join(',');assertFalse(declareRiichi(p,true,'danDiao:wan:9').ok);assertEqual(p.state.riichi,RiichiType.None);assertEqual(p.hand.map(t=>t.id).join(','),ids);
 });
 it('对倒两张保留为一个对倒选择，两张都能胡',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.hand=[w(1),w(2),w(3),t(1),t(2),t(3),s(1),s(2),s(3),f(1),f(1),y(1),y(1)];
  const choice=getRiichiChoices(p,true).find(c=>c.shape==='duiDao')!;assertEqual(choice.winningTiles.length,2);assertTrue(declareRiichi(p,true,choice.key).ok);assertTrue(evaluatePlayerWin(p,f(1),true).ok);assertTrue(evaluatePlayerWin(p,y(1),true).ok);
 });
 it('会话中先选单吊听口再弃牌，未选不扣牌不报听',()=>{
  const ps=[SeatWind.East,SeatWind.South,SeatWind.West,SeatWind.North].map((seat,i)=>createPlayer(String(i),'玩家'+i,seat));
  const game=new GameSession(createRoom('test','0',{...DEFAULT_ROOM_CONFIG},ps),ps,[],{scheduleAI:()=>{}});game.startRound();const p=ps[0],discard=w(9);p.hand=doubleSingle().concat(discard);game.lastDrawn=discard;game.phase=SessionPhase.PlayerTurn;game.currentSeat=SeatWind.East;(game as any).waitingHumanTurn=p;
  assertFalse(game.playerDeclareRiichi(p,discard));assertEqual(p.hand.length,14);assertEqual(p.state.riichi,RiichiType.None);
  const choice=getRiichiChoices({...p,hand:p.hand.filter(t=>t.id!==discard.id)},true).find(c=>c.winningTiles[0].rank===1)!;
  assertTrue(game.playerDeclareRiichi(p,discard,choice.key));assertEqual(p.hand.length,13);assertEqual(p.state.riichiWaits[0].rank,1);assertTrue(p.discards.some(t=>t.id===discard.id));
 });
 it('普通两面听可继续换牌出牌，不会锁手',()=>{
  const ps=[SeatWind.East,SeatWind.South,SeatWind.West,SeatWind.North].map((seat,i)=>createPlayer(String(i),'玩家'+i,seat));const game=new GameSession(createRoom('test','0',{...DEFAULT_ROOM_CONFIG},ps),ps,[],{scheduleAI:()=>{}});game.startRound();const p=ps[0],drawn=w(9);p.hand=twoSided().concat(drawn);game.lastDrawn=drawn;game.phase=SessionPhase.PlayerTurn;game.currentSeat=SeatWind.East;(game as any).waitingHumanTurn=p;
  assertFalse(game.getRiichiDiscards(p).some(t=>t.id===drawn.id));assertTrue(game.playerDiscard(p,p.hand[0]));assertTrue(p.hand.some(t=>t.id===drawn.id));assertEqual(p.state.riichi,RiichiType.None);
 });
});
