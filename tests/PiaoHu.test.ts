import {describe,it,assertTrue,assertFalse,assertEqual} from './runner';
import {createPlayer} from '../assets/scripts/core/Player';
import {createTile,Tile} from '../assets/scripts/core/Tile';
import {Suit,SeatWind,MeldType,RiichiType} from '../assets/scripts/core/Types';
import {isPiaoHu} from '../assets/scripts/game/PiaoHu';
import {settleWin,WinMode,WinContext} from '../assets/scripts/game/SettlementEngine';
import {settleGang,GangSettlementMode} from '../assets/scripts/game/GangSettlement';
import {DEFAULT_ROOM_CONFIG} from '../assets/scripts/config/GameConfig';
let id=80000;const tile=(s:Suit,r:number)=>createTile(id++,s,r),w=(r:number)=>tile(Suit.Wan,r),t=(r:number)=>tile(Suit.Tong,r),s=(r:number)=>tile(Suit.Tiao,r),y=(r:number)=>tile(Suit.Yuan,r);
function fixture(){const ps=[SeatWind.East,SeatWind.South,SeatWind.West,SeatWind.North].map((seat,i)=>createPlayer(String(i),'玩家'+i,seat));ps.forEach(p=>{p.state.isStanding=false;p.state.isOpen=true;});const p=ps[1];p.hand=[w(1),w(1),w(1),t(2),t(2),t(2),s(3),s(3),s(3),y(1),y(1),y(1),y(3),y(3)];const ctx:WinContext={winner:p,winTiles:p.hand,winTile:p.hand[13],winMode:WinMode.DianPao,firer:ps[2],allPlayers:ps,currentDealer:SeatWind.East,isAfterGang:false,isAfterGangSpecial:false,isGangShangKaiHua:false,roomConfig:{...DEFAULT_ROOM_CONFIG,cap:256}};return {ps,p,ctx};}
describe('飘胡／对对胡，仅胡牌分额外 ×2',()=>{
 it('四暗刻加一对将可以飘胡',()=>{const {p}=fixture();assertTrue(isPiaoHu(p.hand,[]));});
 it('碰杠与暗手合并识别，四次碰后只剩一对将也算',()=>{const {p}=fixture();p.melds=[0,1,2,3].map(i=>({type:MeldType.Peng,tiles:p.hand.slice(i*3,i*3+3),openedTileIndex:0}));assertTrue(isPiaoHu(p.hand,p.melds));});
 it('含顺子或吃牌不能飘胡',()=>{const {p}=fixture();p.hand.splice(0,3,w(1),w(2),w(3));assertFalse(isPiaoHu(p.hand,[]));p.melds=[{type:MeldType.Chi,tiles:p.hand.slice(0,3),openedTileIndex:0}];assertFalse(isPiaoHu(p.hand,p.melds));});
 it('庄家和点炮责任加成照旧，每家胡牌款额外 ×2',()=>{const {ctx}=fixture();const r=settleWin(ctx);assertEqual(r.payerDetails['0'].breakdown.piaoHuMul,2);assertEqual(r.payerDeltas['0'],-4);assertEqual(r.payerDeltas['2'],-4);assertEqual(r.payerDeltas['3'],-2);assertEqual(r.winnerDelta,10);});
 it('自摸每家额外 ×2，仍按满贯封顶',()=>{const {ctx}=fixture();ctx.winMode=WinMode.SelfDraw;ctx.roomConfig.cap=2;const r=settleWin(ctx);assertTrue(r.payerDetails['0'].isCapped);assertEqual(r.payerDetails['0'].rawMultiplier,8);assertEqual(r.payerDeltas['0'],-2);assertEqual(r.payerDeltas['2'],-2);});
 it('七小对不重复获得飘胡加成',()=>{const {ctx,p}=fixture();p.state.riichi=RiichiType.Normal;p.state.riichiShapes=['danDiao'];ctx.qiInfo={isHaoHua:true,gangGroups:3};assertEqual(settleWin(ctx).breakdown.piaoHuMul,1);});
 it('飘胡不改动已经独立结算的杠分或补毛分',()=>{const {ctx,p,ps}=fixture();const meld={type:MeldType.AnGang,tiles:[w(8),w(8),w(8),w(8)],openedTileIndex:-1};const gang=()=>settleGang({gangPlayer:p,meld,gangTile:meld.tiles[0],allPlayers:ps,currentDealer:SeatWind.East,roomConfig:ctx.roomConfig,mode:GangSettlementMode.AnGang});const before=gang();settleWin(ctx);assertEqual(JSON.stringify(gang()),JSON.stringify(before));assertEqual(before.payerDeltas['2'],-8);});
});
