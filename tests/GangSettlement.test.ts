import { describe, it, assertEqual, assertTrue } from './runner';
import { createPlayer, Player } from '../assets/scripts/core/Player';
import { createTile } from '../assets/scripts/core/Tile';
import { Suit, SeatWind, MeldType } from '../assets/scripts/core/Types';
import { DEFAULT_ROOM_CONFIG } from '../assets/scripts/config/GameConfig';
import { settleGang, applyGangSettlement, GangSettlementMode } from '../assets/scripts/game/GangSettlement';
let id=710000;
const seats=[SeatWind.East,SeatWind.South,SeatWind.West,SeatWind.North];
const players=()=>seats.map((s,i)=>createPlayer(String(i),'玩家'+i,s));
const tile=(s:Suit,r:number)=>createTile(id++,s,r);
function settle(ps:Player[],owner:number,s:Suit,r:number,mode:GangSettlementMode,firer?:number,special?:'winds'|'dragons',baseScore=1){
 const tiles=special==='winds'?[1,2,3,4].map(n=>tile(Suit.Feng,n)):special==='dragons'?[1,2,3,1].map(n=>tile(Suit.Yuan,n)):Array.from({length:4},()=>tile(s,r));
 const type=mode===GangSettlementMode.MingGang?MeldType.MingGang:mode===GangSettlementMode.JiaGang?MeldType.JiaGang:MeldType.AnGang;
 return settleGang({gangPlayer:ps[owner],meld:{type,tiles,openedTileIndex:0,specialGang:special},gangTile:tile(s,r),allPlayers:ps,currentDealer:SeatWind.East,roomConfig:{...DEFAULT_ROOM_CONFIG,baseScore},mode,firer:firer===undefined?undefined:ps[firer]});
}
describe('杠分逐家支付，供牌者不包付',()=>{
 it('庄家九饼明杠＋闲家北风明杠：+4、+2、-3、-3',()=>{
  const ps=players();applyGangSettlement(ps,settle(ps,0,Suit.Tong,9,GangSettlementMode.MingGang,2));applyGangSettlement(ps,settle(ps,1,Suit.Feng,4,GangSettlementMode.MingGang,2));
  assertEqual(ps.map(p=>p.score).join(','),'4,2,-3,-3');
 });
 it('同例北风改为暗杠：+2、+6、-4、-4',()=>{
  const ps=players();applyGangSettlement(ps,settle(ps,0,Suit.Tong,9,GangSettlementMode.MingGang,2));applyGangSettlement(ps,settle(ps,1,Suit.Feng,4,GangSettlementMode.AnGang));
  assertEqual(ps.map(p=>p.score).join(','),'2,6,-4,-4');
 });
 it('全34种牌的明杠、暗杠和加杠均向另外三家收费；谁供牌不影响金额',()=>{
  for(const [s,count] of [[Suit.Wan,9],[Suit.Tong,9],[Suit.Tiao,9],[Suit.Feng,4],[Suit.Yuan,3]] as [Suit,number][])
   for(let rank=1;rank<=count;rank++)for(const owner of [0,1])for(const mode of [GangSettlementMode.MingGang,GangSettlementMode.AnGang,GangSettlementMode.JiaGang]){
    const base=s===Suit.Tong&&rank===2||s===Suit.Wan&&rank===8?4:s===Suit.Yuan||s===Suit.Tong&&rank===1||s===Suit.Tiao&&rank===1?2:1;
    const amount=base*(mode===GangSettlementMode.AnGang?2:1),ps=players();
    const result=settle(ps,owner,s,rank,mode);
    assertEqual(Object.keys(result.payerDeltas).length,3);assertEqual(result.baseScore,base);
    let total=0;for(let payer=0;payer<4;payer++)if(payer!==owner){const expected=amount*(owner===0||payer===0?2:1);assertEqual(result.payerDeltas[String(payer)],-expected);total+=expected;}
    assertEqual(result.gangPlayerDelta,total);assertEqual(result.totalAmount,total);assertEqual(result.gangPlayerDelta+Object.values(result.payerDeltas).reduce((a,b)=>a+b,0),0);
    for(let firer=0;firer<4;firer++)if(firer!==owner)assertEqual(JSON.stringify(settle(ps,owner,s,rank,mode,firer).payerDeltas),JSON.stringify(result.payerDeltas));
   }
 });
 for(const special of ['winds','dragons'] as const)it(special+' 特殊字杠每家基础2再暗杠×2，庄家收付均翻倍',()=>{
  const ps=players(),s=special==='winds'?Suit.Feng:Suit.Yuan;
  for(const owner of [0,1]){const r=settle(ps,owner,s,1,GangSettlementMode.AnGang,undefined,special);assertEqual(r.baseScore,2);assertEqual(r.typeMultiplier,2);assertEqual(r.gangPlayerDelta,owner===0?24:16);assertTrue(Object.entries(r.payerDeltas).every(([payer,n])=>n===-(owner===0||payer==='0'?8:4)));}
 });
 it('补毛每张三家各付1，庄家那一笔×2，不再重复乘暗杠',()=>{
  const ps=players();for(const owner of [0,1]){const r=settle(ps,owner,Suit.Feng,2,GangSettlementMode.Supplement,undefined,'winds');assertEqual(r.typeMultiplier,1);assertEqual(r.gangPlayerDelta,owner===0?6:4);}
 });
 it('结算函数只计算不实时入账；房间底分照旧乘入，杠分不封顶',()=>{
  const ps=players(),r=settle(ps,0,Suit.Tong,2,GangSettlementMode.AnGang,undefined,undefined,5);assertEqual(ps.map(p=>p.score).join(','),'0,0,0,0');assertEqual(r.gangPlayerDelta,240);applyGangSettlement(ps,r);assertEqual(ps.map(p=>p.score).join(','),'240,-80,-80,-80');
 });
});
