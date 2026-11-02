const assert=require('node:assert/strict');
const {fixture,act,conserved}=require('./riichi-auto-win-test.cjs');
function settledFixture(four){
 const f=fixture({ready:false}),{r,g,p}=f;
 r.config.cap=g.config.cap=0;
 if(!four){p.melds=[{type:'peng',tiles:p.hand.splice(0,3),openedTileIndex:0}];p.state.isStanding=false;p.state.isOpen=true;}
 f.start();assert.equal(r.prompt.playerId,p.id);assert(g.computeHumanOptions(p,g.lastDrawn).canWin);
 act(r,'win');assert.equal(r.result.mode,'selfDraw');
 const result=r.result.result,base=four?16:4;
 for(const payer of g.players.filter(x=>x!==p)){
  const d=result.payerDetails[payer.id];
  assert.equal(d.amount,base*2*(payer.seat==='east'?2:1));
  assert.equal(d.breakdown.winnerStandingMul,1);assert.equal(d.breakdown.payerStandingMul,1);
  assert.equal(d.breakdown.sanJiaQingMul,four?1:4);assert.equal(d.breakdown.siJiaQingMul,four?16:1);
 }
 for(const m of r.members){const state=r.snapshot(m);assert.deepEqual(state.result.result,JSON.parse(JSON.stringify(result)));assert.deepEqual(state.players.map(x=>x.score),g.players.map(x=>x.score));}
 conserved(g);return f;
}
if(require.main===module){for(const four of [false,true]){settledFixture(four);console.log('PASS '+(four?'四家清固定16':'三家清固定4')+'：真实摸牌胡牌、三家付款、庄家自摸叠加、四端明细一致，不重复站立、136牌及积分守恒');}}
module.exports={settledFixture};
