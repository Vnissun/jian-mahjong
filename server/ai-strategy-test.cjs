const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const ai=require('./dist/game/AIBot'),{handDistance}=require('./dist/game/AIHand');
const {createPlayer}=require('./dist/core/Player'),{createTile}=require('./dist/core/Tile');
const {ALL_TILES}=require('./dist/data/TileCatalog');
const {getRiichiChoices,declareRiichi}=require('./dist/game/RiichiManager');
const {getChiOptions}=require('./dist/game/ChiHandler');
const {DEFAULT_ROOM_CONFIG}=require('./dist/config/GameConfig');
let id=600000;
const tiles=(s,ns)=>ns.map(n=>createTile(id++,s,n));
const player=(name='ai',seat='east')=>createPlayer(name,name,seat);
const pairWait=()=>{const p=player();p.hand=[...tiles('wan',[1,1,9,9]),...tiles('tong',[2,2,5,5]),...tiles('tiao',[3,3,8,8]),...tiles('yuan',[3])];return p;};
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('✓ '+name);};

test('公开撅提高三七风险；弱手改打其他牌，自己的牌河不构成绝对安全',()=>{
 const p=player(),b=player('enemy','south');b.state.riichi='jue';b.state.riichiShapes=['jue'];
 p.hand=[['wan',3],['tiao',9],['wan',7],['tong',6],['tong',1],['tiao',4],['tiao',9],['wan',9],['tong',3],['tiao',1],['yuan',2],['yuan',3],['yuan',1],['tong',3]].map(([s,n])=>createTile(id++,s,n));
 const context={players:[p,b]},view=ai.buildAIView(p,context),three=p.hand[0];
 assert(ai.discardDanger(three,view)>ai.discardDanger(p.hand[3],view));
 const plan=ai.planDiscard(p,true,undefined,context);assert(!['wan','tong','tiao'].includes(plan.tile.suit)||![3,7].includes(plan.tile.rank));
 b.discards=tiles('wan',[3]);assert(ai.discardDanger(three,ai.buildAIView(p,context))>0);
});
test('同色吃碰杠信号提高该色危险度；不把别的花色武断认定绝对安全',()=>{
 const p=player(),b=player('enemy','south');
 b.melds=[{type:'chi',tiles:tiles('wan',[1,2,3]),openedTileIndex:2},{type:'peng',tiles:tiles('wan',[5,5,5]),openedTileIndex:2}];
 const view=ai.buildAIView(p,{players:[p,b]}),wan=createTile(id++,'wan',7),tong=createTile(id++,'tong',7);
 assert(ai.discardDanger(wan,view)>ai.discardDanger(tong,view));assert(ai.discardDanger(tong,view)>0);
});
test('撅的组成牌四张均已可见时，不再误判该撅听口',()=>{
 const p=player(),b=player('enemy','south');p.hand=tiles('wan',[1,1,1,1]);b.state.riichi='jue';b.state.riichiShapes=['jue'];
 const view=ai.buildAIView(p,{players:[p,b]});assert.equal(ai.discardDanger(createTile(id++,'wan',3),view),0);
 assert(ai.discardDanger(createTile(id++,'tong',3),view)>0);
});
test('能选择旧手牌报撅，不局限于打出刚摸的牌；策略不改动原手牌和状态',()=>{
 const p=player();p.hand=[...tiles('wan',[1,1,1,1,2]),...tiles('tong',[2,3,4]),...tiles('tiao',[7,8,9]),...tiles('yuan',[3,3]),...tiles('feng',[1])];
 const before=JSON.stringify(p),drawn=p.hand[4],plan=ai.planDiscard(p,true,drawn);
 assert.equal(plan.tile.suit,'feng');assert(plan.riichiKey.startsWith('jue:'));assert.notEqual(plan.tile.id,drawn.id);
 const after={...p,hand:p.hand.filter(t=>t.id!==plan.tile.id),state:{...p.state}};
 assert(declareRiichi(after,true,plan.riichiKey).ok);assert.equal(JSON.stringify(p),before);
});
test('死听七小对不报听；活听七小对保留合法单吊声明',()=>{
 const p=pairWait(),b=player('enemy','south');assert(ai.chooseRiichi(p,true,{players:[p,b]}));
 b.discards=tiles('yuan',[3,3,3]);assert.equal(ai.chooseRiichi(p,true,{players:[p,b]}),undefined);
});
test('双方报听对踢、庄家、满贯配置实际影响危险积分估计',()=>{
 const p=player(),b=player('enemy','south');p.state.riichi='normal';b.state.riichi='jue';b.state.riichiShapes=['jue'];
 const t=createTile(id++,'wan',3),context={players:[p,b],config:{...DEFAULT_ROOM_CONFIG,cap:0}};
 const ordinary=ai.discardDanger(t,ai.buildAIView(p,context));context.config.riichiDuel=true;
 assert(ai.discardDanger(t,ai.buildAIView(p,context))>ordinary);p.state.isDealer=true;
 const dealer=ai.discardDanger(t,ai.buildAIView(p,context));context.config.cap=32;
 assert(ai.discardDanger(t,ai.buildAIView(p,context))<dealer);
});
test('已报听必须打新摸牌，不因防守改动已锁定手牌',()=>{
 const p=pairWait(),c=getRiichiChoices(p,true)[0];assert(declareRiichi(p,true,c.key).ok);
 const t=createTile(id++,'wan',3);p.hand.push(t);const b=player('enemy','south');b.state.riichi='jue';
 assert.equal(ai.planDiscard(p,true,t,{players:[p,b]}).tile.id,t.id);
});
test('自己已有大胡活听口时允许合理进攻，不对三七一律弃和',()=>{
 const p=player(),b=player('enemy','south');b.state.riichi='jue';b.state.riichiShapes=['jue'];
 p.hand=[...tiles('wan',[1,2,5,5,7]),...tiles('tong',[1,1,1]),...tiles('tiao',[7,8,9]),...tiles('yuan',[3,3,3])];
 const drawn=p.hand[4],plan=ai.planDiscard(p,true,drawn,{players:[p,b]});
 assert.equal(plan.tile.id,drawn.id);assert(plan.riichiKey.startsWith('jue:'));assert(plan.live>=3);assert(plan.value>=24);
});
test('优先高分二饼暗杠；不因普通杠拆毁已经形成的活听牌',()=>{
 const p=player();p.hand=[...tiles('wan',[4,4,4,4]),...tiles('tong',[2,2,2,2]),...tiles('tiao',[4,5,6]),...tiles('yuan',[1,1,1])];
 const c=ai.chooseConcealedGang(p,true);assert(c);assert.equal(c.tiles[0].suit,'tong');assert.equal(c.tiles[0].rank,2);
 const q=player();q.hand=[...tiles('wan',[1,1,1,1]),...tiles('tong',[2,2,3,3]),...tiles('tiao',[5,5,6,6]),...tiles('yuan',[3]),...tiles('feng',[1])];
 assert(getRiichiChoices({...q,hand:q.hand.slice(0,-1)},true).length);
 assert.equal(ai.chooseConcealedGang(q,true),undefined);
});
test('有活的第四种风牌可等时，为四风杠保留已攒的三风',()=>{
 const p=player();p.hand=[...tiles('feng',[1,2,3]),...tiles('wan',[1,2,3]),...tiles('tong',[2,3,4,9]),...tiles('tiao',[5,6,7]),...tiles('yuan',[3])];
 assert.notEqual(ai.planDiscard(p,true).tile.suit,'feng');
});
test('为七小对活听保留门清，不盲吃顺子破坏牌型',()=>{
 const p=pairWait(),t=createTile(id++,'wan',2),options=getChiOptions(p,t);
 // Use an actual legal eat option against pairs 1122: incoming three forms 123.
 const incoming=createTile(id++,'wan',3);p.hand=tiles('wan',[1,1,2,2]).concat(tiles('tong',[2,2,5,5]),tiles('tiao',[3,3,8,8]),tiles('yuan',[3]));
 const chi=getChiOptions(p,incoming);assert(chi.length);assert.equal(ai.chooseChi(p,incoming,chi,true),undefined);
});
test('对手暗手、暗杠牌种、锁定听口不可读取；改动秘密信息不影响加杠或弃牌',()=>{
 const p=player(),b=player('enemy','south');p.melds=[{type:'peng',tiles:tiles('wan',[3,3,3]),openedTileIndex:2}];
 p.state.isStanding=false;p.state.isOpen=true;
 p.hand=[...tiles('wan',[3,4,5]),...tiles('tong',[1,2,3]),...tiles('tiao',[7,8,9]),...tiles('yuan',[1,1])];
 b.state.riichi='normal';b.state.riichiShapes=['jiaHu'];
 b.melds=[{type:'anGang',openedTileIndex:-1}];
 for(const [object,key] of [[b,'hand'],[b.state,'riichiWaits'],[b.state,'riichiLockedHandIds'],[b.state,'riichiMeldSignature'],[b.melds[0],'tiles']])
  Object.defineProperty(object,key,{get(){throw Error('Illegal private read: '+key);}});
 const context={players:[p,b]};const view=ai.buildAIView(p,context);assert.deepEqual(view.opponents[0].hand,[]);assert.deepEqual(view.opponents[0].melds[0].tiles,[]);
 assert(ai.planDiscard(p,true,undefined,context));assert(ai.decideJiaGang(p,[p,b],true,context));
 assert(ai.chooseConcealedGang(p,true,context)===undefined);ai.decideClaimPengGang(p,createTile(id++,'yuan',1),true,context);
});
test('向听计算与固定副露、七小对完整手牌相符',()=>{
 const p=pairWait();assert.equal(handDistance(p.hand,0,true),0);
 p.hand.push(...tiles('yuan',[3]));assert.equal(handDistance(p.hand,0,true),-1);
 const standard=[...tiles('wan',[1,1,1]),...tiles('tong',[2,3,4]),...tiles('tiao',[7,8,9]),...tiles('yuan',[3])];assert.equal(handDistance(standard,1,false),0);
});
test('固定种子随机手牌性能及返回值：80手均返回真实手牌，不修改玩家',()=>{
 let seed=20261020;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const elapsed=[];
 for(let i=0;i<80;i++){
  const p=player(),b=player('enemy','south'),deck=ALL_TILES.slice();
  for(let j=deck.length-1;j>0;j--){const k=Math.floor(random()*(j+1));[deck[j],deck[k]]=[deck[k],deck[j]];}
  p.hand=deck.slice(0,14);if(i%2){b.state.riichi='jue';b.state.riichiShapes=['jue'];}
  const before=JSON.stringify(p),start=performance.now(),plan=ai.planDiscard(p,true,p.hand[13],{players:[p,b]});
  elapsed.push(performance.now()-start);assert(p.hand.includes(plan.tile));assert.equal(JSON.stringify(p),before);
 }
 elapsed.sort((a,b)=>a-b);const average=elapsed.reduce((a,b)=>a+b,0)/elapsed.length;
 console.log('  策略耗时(ms)',{average:average.toFixed(1),p95:elapsed[76].toFixed(1),max:elapsed[79].toFixed(1)});
 assert(average<250,'Node16策略不应长时间阻塞事件循环');
});
console.log('AI strategy tests passed:',passed);
