import {describe,it,assertTrue,assertFalse,assertEqual} from './runner';
import {createPlayer} from '../assets/scripts/core/Player';
import {createTile,Tile} from '../assets/scripts/core/Tile';
import {createRoom} from '../assets/scripts/core/Room';
import {SeatWind,Suit,RiichiType,MeldType} from '../assets/scripts/core/Types';
import {DEFAULT_ROOM_CONFIG} from '../assets/scripts/config/GameConfig';
import {getChiOptions,chi} from '../assets/scripts/game/ChiHandler';
import {GameSession,SessionPhase,SessionEvents} from '../assets/scripts/game/GameSession';
import {declareRiichi,analyzeListening,describeRiichi} from '../assets/scripts/game/RiichiManager';
import {evaluatePlayerWin} from '../assets/scripts/game/PlayerWin';
let id=5000;
const w=(r:number)=>createTile(id++,Suit.Wan,r);
const t=(r:number)=>createTile(id++,Suit.Tong,r);
const s=(r:number)=>createTile(id++,Suit.Tiao,r);
const y=()=>createTile(id++,Suit.Yuan,1);
function setup(allowChi=true,events:SessionEvents={}){
 const players=[SeatWind.East,SeatWind.South,SeatWind.West,SeatWind.North].map((seat,i)=>createPlayer(String(i),'玩家'+i,seat));
 const room=createRoom('test','3',{...DEFAULT_ROOM_CONFIG,allowChi},players);room.currentDealer=SeatWind.North;
 const game=new GameSession(room,players,[],events);game.startRound();
 players.forEach(p=>{p.hand=[];p.melds=[];p.discards=[];});
 return game;
}
describe('吃牌规则',()=>{
 it('5 万能吃 345、456、567 三组，采用真实手牌引用',()=>{
  const p=createPlayer('p','人',SeatWind.East);p.hand=[w(3),w(4),w(6),w(7)];
  const options=getChiOptions(p,w(5));assertEqual(options.length,3);assertTrue(options.every(pair=>pair.every(tile=>p.hand.includes(tile))));
 });
 it('1 和 9 的吃牌不能跨越边界',()=>{
  const p=createPlayer('p','人',SeatWind.East);p.hand=[w(2),w(3),w(7),w(8)];
  assertEqual(getChiOptions(p,w(1)).length,1);assertEqual(getChiOptions(p,w(9)).length,1);
 });
 it('字牌不能吃，不同花色不能凑顺子',()=>{
  const p=createPlayer('p','人',SeatWind.East);p.hand=[w(2),t(3),y(),y()];
  assertEqual(getChiOptions(p,w(1)).length,0);assertEqual(getChiOptions(p,y()).length,0);
 });
 it('报听后不能吃',()=>{
  const p=createPlayer('p','人',SeatWind.East);p.hand=[w(2),w(3)];p.state.riichi=RiichiType.Normal;
  assertEqual(getChiOptions(p,w(1)).length,0);
 });
 it('吃成功移除两张手牌、组成副露、开门',()=>{
  const p=createPlayer('p','人',SeatWind.East);p.hand=[w(2),w(3),w(9)];const selected=p.hand.slice(0,2),target=w(1);
  const result=chi(p,target,selected);assertTrue(result.ok);assertEqual(p.hand.length,1);
  assertEqual(p.melds[0].type,MeldType.Chi);assertEqual(p.melds[0].openedTileIndex,0);
  assertTrue(p.state.isOpen);assertFalse(p.state.isStanding);
 });
 it('伪造组合或重复同一物理牌被拒绝且手牌不变',()=>{
  const p=createPlayer('p','人',SeatWind.East);p.hand=[w(2),w(3)];
  assertFalse(chi(p,w(1),[p.hand[0],p.hand[0]]).ok);
  assertFalse(chi(p,w(1),[w(2),w(3)]).ok);assertEqual(p.hand.length,2);
 });
 it('仅下家吃上家，吃后弃牌转入副露并等待出牌',()=>{
  const game=setup(),[east,,,north]=game.players;const target=w(1);north.hand=[target];east.hand=[w(2),w(3),w(9)];
  assertTrue(game.playerDiscard(north,target));const options=game.getHumanChiOptions(east);
  assertEqual(options.length,1);assertFalse(game.playerClaimChi(game.players[1],options[0]));
  assertTrue(game.playerClaimChi(east,options[0]));assertEqual(north.discards.length,0);
  assertEqual(game.currentSeat,SeatWind.East);assertEqual(game.phase,SessionPhase.PlayerTurn);
  assertTrue(game.playerDiscard(east,east.hand[0]));
 });
 it('固定允许吃牌，旧配置关闭值也不能禁吃',()=>{
  const game=setup(false),[east,,,north]=game.players;const target=w(1);north.hand=[target];east.hand=[w(2),w(3)];
  assertTrue(game.config.allowChi);assertTrue(game.playerDiscard(north,target));assertEqual(game.getHumanChiOptions(east).length,1);
  assertTrue(game.playerClaimChi(east,east.hand));
 });
 it('其他玩家的碰优先于下家吃',()=>{
  let requested='';const game=setup(true,{onHumanClaim:(p,_t,_f,_w,peng)=>{if(peng)requested=p.id;}});
  const [east,south,,north]=game.players,target=w(1);north.hand=[target];east.hand=[w(2),w(3)];south.hand=[w(1),w(1),w(9)];
  assertTrue(game.playerDiscard(north,target));assertEqual(requested,south.id);
  assertFalse(game.playerClaimChi(east,east.hand));assertTrue(game.playerClaimPeng(south));assertEqual(east.melds.length,0);
 });
 it('碰机会放弃后下家仍可吃',()=>{
  const game=setup(),[east,south,,north]=game.players,target=w(1);north.hand=[target];east.hand=[w(2),w(3)];south.hand=[w(1),w(1)];
  assertTrue(game.playerDiscard(north,target));assertTrue(game.playerPass(south));assertEqual(game.getHumanChiOptions(east).length,1);
 });
});
describe('七小对资格与公开报听',()=>{
 const sevenPairs=()=>[w(1),w(1),w(2),w(2),t(3),t(3),t(4),t(4),s(5),s(5),s(6),s(6),y(),y()];
 it('七小对需先报听单吊，之后才能胡',()=>{
  const p=createPlayer('p','人',SeatWind.East),hand=sevenPairs();p.hand=hand.slice(0,13);
  assertFalse(evaluatePlayerWin(p,hand[13],true).ok);
  assertTrue(analyzeListening(p,true).isListening);assertTrue(declareRiichi(p,true).ok);
  assertEqual(p.state.riichi,RiichiType.Normal);assertTrue(p.state.riichiShapes.includes('danDiao'));
  assertEqual(describeRiichi(p),'单吊报听');assertTrue(evaluatePlayerWin(p,hand[13],true).ok);
 });
 it('七小对有幺九但缺一门，仍不能报听',()=>{
  const p=createPlayer('p','人',SeatWind.East);p.hand=[w(1),w(1),w(2),w(2),w(3),w(3),t(4),t(4),t(5),t(5),t(6),t(6),y()];
  assertFalse(declareRiichi(p,true).ok);
 });
 it('七小对三门齐全但无幺九，仍不能报听',()=>{
  const p=createPlayer('p','人',SeatWind.East);p.hand=[w(2),w(2),w(3),w(3),t(4),t(4),t(5),t(5),s(6),s(6),s(7),s(7),w(8)];
  assertFalse(declareRiichi(p,true).ok);
 });
 it('七小对纯清允许缺门，仍要求幺九',()=>{
  const p=createPlayer('p','人',SeatWind.East);p.hand=[w(1),w(1),w(2),w(2),w(3),w(3),w(4),w(4),w(5),w(5),w(6),w(6),w(7)];
  assertTrue(declareRiichi(p,true).ok);assertTrue(evaluatePlayerWin(p,w(7),true).ok);
 });
 it('普通夹胡报听公开夹胡名称，不把它当作额外胡型翻倍',()=>{
  const p=createPlayer('p','人',SeatWind.East);p.hand=[w(1),w(3),w(5),w(6),w(7),t(1),t(2),t(3),s(4),s(5),s(6),y(),y()];
  assertTrue(declareRiichi(p,true).ok);assertEqual(p.state.riichi,RiichiType.Normal);
  assertTrue(describeRiichi(p).includes('夹胡'));
 });
 it('新局清除公开报听类型',()=>{
  const game=setup(),p=game.players[0];p.state.riichi=RiichiType.Normal;p.state.riichiShapes=['danDiao'];
  game.startRound();assertEqual(p.state.riichiShapes.length,0);
 });
 it('默认底分 1、满贯 32、封圈 3、七小对及吃牌开启',()=>{
  assertEqual(DEFAULT_ROOM_CONFIG.baseScore,1);assertEqual(DEFAULT_ROOM_CONFIG.cap,32);
  assertEqual(DEFAULT_ROOM_CONFIG.totalRoundWinds,3);assertTrue(DEFAULT_ROOM_CONFIG.allowQiXiaoDui);assertTrue(DEFAULT_ROOM_CONFIG.allowChi);
 });
});
