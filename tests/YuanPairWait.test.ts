import {describe,it,assertTrue,assertFalse,assertEqual} from './runner';
import {createPlayer} from '../assets/scripts/core/Player';
import {createTile} from '../assets/scripts/core/Tile';
import {Suit,SeatWind,MeldType} from '../assets/scripts/core/Types';
import {getRiichiChoices,declareRiichi} from '../assets/scripts/game/RiichiManager';
import {evaluatePlayerWin} from '../assets/scripts/game/PlayerWin';
let id=60000;const tile=(s:Suit,r:number)=>createTile(id++,s,r),w=(r:number)=>tile(Suit.Wan,r),t=(r:number)=>tile(Suit.Tong,r),s=(r:number)=>tile(Suit.Tiao,r),y=(r:number)=>tile(Suit.Yuan,r);
describe('没有刻子时单吊中发白',()=>{
 for(const rank of [1,2,3])it('四组顺子、无刻子，单吊元牌 '+rank+' 可报听、点炮及自摸',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.melds=[{type:MeldType.Chi,tiles:[w(1),w(2),w(3)],openedTileIndex:0},{type:MeldType.Chi,tiles:[s(7),s(8),s(9)],openedTileIndex:0}];p.state.isOpen=true;p.state.isStanding=false;
  p.hand=[w(4),w(5),w(6),t(3),t(4),t(5),y(rank)];
  const choice=getRiichiChoices(p,true).find(c=>c.shape==='danDiao'&&c.winningTiles[0].suit===Suit.Yuan&&c.winningTiles[0].rank===rank)!;assertTrue(!!choice);assertTrue(declareRiichi(p,true,choice.key).ok);
  const win=y(rank);assertTrue(evaluatePlayerWin(p,win,true).ok);p.hand.push(win);assertTrue(evaluatePlayerWin(p,win,true).ok);
 });
 it('四次吃牌后只剩单张白板，配对白板满足刻子要求',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.melds=[[w(1),w(2),w(3)],[w(4),w(5),w(6)],[t(3),t(4),t(5)],[s(7),s(8),s(9)]].map(tiles=>({type:MeldType.Chi,tiles,openedTileIndex:0}));p.hand=[y(3)];assertTrue(declareRiichi(p,true).ok);assertTrue(evaluatePlayerWin(p,y(3),true).ok);
 });
 it('两张不同元牌不构成对子，顺子未完成也不能胡',()=>{
  const p=createPlayer('p','你',SeatWind.East);p.hand=[w(1),w(2),w(3),w(4),w(5),w(6),t(3),t(4),t(5),s(7),s(8),s(9),y(1)];assertFalse(evaluatePlayerWin(p,y(3),true).ok);
 });
});
