const {ALL_TILES}=require('./dist/data/TileCatalog');
const SEATS=['east','south','west','north'],catalog=new Map(ALL_TILES.map(t=>[t.suit+':'+t.rank,t]));
const key=t=>t.suit+':'+t.rank;
function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
function parseTiles(value,max=13){if(typeof value==='string')value=value.trim()?value.trim().split(/[\s,，]+/):[];
 if(!Array.isArray(value)||value.length>max||value.some(t=>!catalog.has(t)))fail('牌种或张数无效，起手牌最多指定13张');
 return value.slice();}
function slots(wall){const a=[];for(let i=wall.drawIndex;i<wall.drawStack.length;i++)a.push({list:wall.drawStack,index:i});
 for(let i=0;i<wall.kongStack.length-wall.kongIndex;i++)a.push({list:wall.kongStack,index:i});return a;}
function swap(a,b){[a.list[a.index],b.list[b.index]]=[b.list[b.index],a.list[a.index]];}
class HandControl{
 constructor(seat){this.seat=seat;this.version=1;this.opening=null;this.next={normal:null,supplement:null};this.history=[];}
 log(text){this.history.push({at:new Date().toISOString(),text});if(this.history.length>40)this.history.shift();}
 select(seat){if(!SEATS.includes(seat))fail('请选择东南西北中的一个座位');if(this.seat!==seat){this.seat=seat;this.opening=null;this.next={normal:null,supplement:null};this.version++;this.log('切换控制座位，清除原座位尚未执行的设置');}}
 setOpening(value,extra){
  const tiles=parseTiles(value);if(extra&&!catalog.has(extra))fail('庄家第14张牌无效');
  const counts=new Map();for(const k of tiles.concat(extra?[extra]:[])){counts.set(k,(counts.get(k)||0)+1);if(counts.get(k)>4)fail(catalog.get(k).name+'不能超过四张');}
  this.opening=tiles.length||extra?{tiles,extra:extra||null}:null;this.version++;this.log(this.opening?'已保存所选座位下一局起手牌':'已取消下一局起手牌设置');
 }
 prepareWall(wall,players,dealer){
  this.next={normal:null,supplement:null};const plan=this.opening;this.opening=null;this.version++;
  if(!plan)return;
  const seatIndex=players.findIndex(p=>p.seat===this.seat);if(seatIndex<0){this.log('本局未找到所选座位，起手牌设置未执行');return;}
  // Reserve before any player is dealt. Remaining slots keep the shuffled order.
  const pool=wall.drawStack.concat(wall.kongStack),reserved=new Map();
  const take=k=>{const i=pool.findIndex(t=>key(t)===k);return pool.splice(i,1)[0];};
  plan.tiles.forEach((k,i)=>reserved.set(i*players.length+seatIndex,take(k)));
  if(this.seat===dealer&&plan.extra)reserved.set(52,take(plan.extra));
  const draw=[];for(let i=0;i<wall.drawStack.length;i++)draw.push(reserved.has(i)?reserved.get(i):pool.shift());
  wall.drawStack=draw;wall.kongStack=pool;
  this.log('本局起手牌已生效；未指定牌及其他三家正常随机发牌');
 }
 setNext(game,kind,tile){
  if(!['normal','supplement'].includes(kind))fail('摸牌类型无效');
  if(!game||!['playerTurn','awaiting','gangSupplement'].includes(game.phase))fail('请在本局开始后指定下一张牌');
  if(!tile){this.next[kind]=null;this.version++;this.log('已取消下一张'+(kind==='normal'?'正常摸牌':'补牌'));return;}
  if(!catalog.has(tile))fail('牌种无效');
  if(kind==='normal'&&game.wall.drawIndex>=game.wall.drawStack.length)fail('正常牌墙已空，此牌不可用');
  if(kind==='supplement'&&game.wall.kongIndex>=game.wall.kongStack.length)fail('补牌区已空，此牌不可用');
  const held=new Set(Object.entries(this.next).filter(([k])=>k!==kind).flatMap(([,v])=>v?[v.id]:[]));
  const found=slots(game.wall).find(s=>key(s.list[s.index])===tile&&!held.has(s.list[s.index].id));
  if(!found)fail(catalog.get(tile).name+'不可用：剩余牌墙中没有可分配的牌，可能已在玩家手中、已打出或已被另一项指定占用');
  this.next[kind]={key:tile,id:found.list[found.index].id};this.version++;this.log('已指定所选座位下次'+(kind==='normal'?'正常摸牌':'杠后补牌')+'：'+catalog.get(tile).name);
 }
 beforeDraw(wall,seat,isKong){
  const kind=isKong?'supplement':'normal',pending=this.next[kind];
  const index=isKong?wall.kongStack.length-1-wall.kongIndex:wall.drawIndex,list=isKong?wall.kongStack:wall.drawStack;
  if(index<0||index>=list.length)return;
  const target={list,index};
  if(seat===this.seat&&pending){
   const source=slots(wall).find(s=>s.list[s.index].id===pending.id);
   if(source){swap(source,target);this.log('指定摸牌已执行：'+catalog.get(pending.key).name);}
   else this.log('指定牌已不可用，本次继续按原牌墙摸牌');
   this.next[kind]=null;this.version++;return;
  }
  // Keep a queued physical tile in the unused wall until the selected player's draw.
  // Only wall slots are exchanged; never touch another player's current hand/melds/river.
  const reserved=Object.entries(this.next).filter(([,v])=>v),ids=new Set(reserved.map(([,v])=>v.id));
  if(ids.has(list[index].id)){
   const source=slots(wall).reverse().find(s=>!ids.has(s.list[s.index].id));
   if(source)swap(source,target);
   else {for(const [k,v]of reserved)if(v.id===list[index].id){this.next[k]=null;this.log('可用牌已耗尽，取消尚未轮到的指定摸牌');this.version++;}}
  }
 }
 state(){return {seat:this.seat,version:this.version,opening:this.opening,next:{normal:this.next.normal?.key??null,supplement:this.next.supplement?.key??null},history:this.history};}
}
module.exports={HandControl,SEATS,key};
