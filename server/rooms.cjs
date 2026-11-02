const {RoomVoice}=require('./voice.cjs');
const crypto=require('node:crypto');
const {GameSession,SessionPhase}=require('./dist/game/GameSession');
const {createPlayer,createDefaultPlayerState}=require('./dist/core/Player');
const {createRoom}=require('./dist/core/Room');
const {getRiichiChoices}=require('./dist/game/RiichiManager');
const {isMeldPublic}=require('./dist/game/TileVisibility');
const {getRemainingCount,getKongRemainingCount,setWallRandomIndex}=require('./dist/game/WallGenerator');
setWallRandomIndex(limit=>crypto.randomInt(limit));
const {BASE_SCORE_OPTIONS,CAP_OPTIONS,ROUND_WIND_OPTIONS,DEFAULT_ROOM_CONFIG}=require('./dist/config/GameConfig');
const seats=['east','south','west','north'];
const TURN_MS=15000,OFFLINE_MS=15000,VOICE_MS=1800;
function fail(message,status=400){const error=new Error(message);error.status=status;throw error;}
function configOf(value={}){const c={...DEFAULT_ROOM_CONFIG,...value};for(const [key,list]of [['baseScore',BASE_SCORE_OPTIONS],['cap',CAP_OPTIONS],['totalRoundWinds',ROUND_WIND_OPTIONS]])if(!list.includes(c[key]))fail('房间规则参数无效');if(typeof c.allowChi!=='boolean'||typeof c.allowQiXiaoDui!=='boolean'||typeof c.riichiDuel!=='boolean')fail('房间规则参数无效');return {baseScore:c.baseScore,cap:c.cap,totalRoundWinds:c.totalRoundWinds,allowChi:true,allowQiXiaoDui:c.allowQiXiaoDui,riichiDuel:c.riichiDuel};}
function nameOf(name){if(typeof name!=='string'||!name.trim()||name.trim().length>12)fail('昵称请输入 1–12 个字符');return name.trim().replace(/[\x00-\x1f\x7f]/g,'');}
function hidden(n,offset=0){return Array.from({length:n},(_,i)=>({id:-10000-offset-i,suit:'wan',rank:1,name:'暗牌'}));}
class FriendRoom{
 constructor(code,name,config){this.voice=new RoomVoice();this.soundSequence=0;this.soundEvents=[];this.code=code;this.config=configOf(config);this.members=[];this.revision=0;this.phase='waiting';this.prompt=null;this.game=null;this.gangs=[];this.result=null;this.waiters=new Set();this.lastActivity=Date.now();this.add(name);this.ownerId=this.members[0].id;}
 sound(type,player,extra={}){const at=Date.now();this.soundEvents.push({seq:++this.soundSequence,at,type,playerId:player?.id,...extra});if(type!=='draw'){if(this.soundRevision!==this.revision){this.soundRevision=this.revision;this.nextActionAt=at;}this.nextActionAt=Math.max(at,this.nextActionAt||0)+VOICE_MS;}if(this.soundEvents.length>32)this.soundEvents.shift();}
 add(name,isBot=false){if(this.phase!=='waiting')fail('本桌已开局，仅原玩家可重连');if(this.members.length>=4)fail('房间已满');const seat=seats.find(s=>!this.members.some(p=>p.seat===s));const m={id:crypto.randomUUID(),token:isBot?null:crypto.randomBytes(32).toString('hex'),name:nameOf(name),seat,isBot,ready:isBot,lastSeen:Date.now(),requests:new Map()};this.members.push(m);this.bump();return m;}
 addBot(){let n=1;while(this.members.some(m=>m.name==='机器人 '+n))n++;return this.add('机器人 '+n,true);}
 removeBot(id){if(this.phase!=='waiting')fail('仅开局前可以移除机器人');const target=this.members.find(m=>m.id===id&&m.isBot);if(!target)fail('只能移除房间内的机器人');this.members=this.members.filter(m=>m!==target);}
 auth(token,active=true){const m=this.members.find(p=>!p.isBot&&p.token===token);if(!m)fail('身份已失效，请重新加入房间',401);if(active){m.lastSeen=Date.now();if(m.autoPlay){this.setAutoPlay(m,false);this.bump();}}return m;}
 setAutoPlay(m,enabled){if(m.isBot||!!m.autoPlay===enabled)return;m.autoPlay=enabled;if(enabled)this.voice.releaseMember(m.id);
  if(this.phase==='playing'&&this.game){if(this.pendingAI?.playerId===m.id)this.pendingAI=null;if(this.prompt?.playerId===m.id){this.prompt=null;this.pendingAutoDiscard=null;}this.game.setAutoControl(this.game.getPlayerById(m.id),enabled);}
  if(this.phase==='settled')m.ready=enabled;
 }
 disconnect(m){if(m.isBot)return;m.lastSeen=Date.now();this.setAutoPlay(m,true);this.bump();}
 bump(){this.revision++;this.lastActivity=Date.now();for(const fn of Array.from(this.waiters))fn();}
 connected(m,now=Date.now()){return !!m.isBot||(!m.autoPlay&&now-m.lastSeen<OFFLINE_MS);}
 start(){if(!this.members.some(m=>!m.isBot)||this.members.some(m=>!m.isBot&&(!m.ready||!this.connected(m))))fail('需要所有真人玩家在线并准备');while(this.members.length<4)this.addBot();const players=seats.map(seat=>{const m=this.members.find(m=>m.seat===seat);return createPlayer(m.id,m.name,seat);});this.game=new GameSession(createRoom(this.code,this.ownerId,this.config,players),players,this.members.filter(m=>m.isBot).map(m=>m.seat),{
  scheduleSelfWin:(action,delay)=>{this.pendingAutoDiscard=null;this.pendingAI=null;this.prompt=null;this.pendingSelfWinTimer={action,due:Date.now()+delay};},
  scheduleAutoDiscard:(action,delay)=>{this.pendingAutoDiscard={action,due:Math.max(Date.now()+delay,(this.nextActionAt||0)+200)};},
  scheduleAI:(action,player)=>{this.pendingAutoDiscard=null;this.prompt=null;this.pendingAI={action,playerId:(player||this.game.getPlayer(this.game.currentSeat)).id,due:Math.max(Date.now()+650,(this.nextActionAt||0)+200)};},
  scheduleClaim:(action,player)=>{this.pendingAutoDiscard=null;this.prompt=null;this.pendingAI={action,playerId:player.id,due:Math.max(Date.now()+650,(this.nextActionAt||0)+200)};},
  onBeforeDeal:(wall,players,dealer)=>this.handControl?.prepareWall(wall,players,dealer),
  onBeforeDraw:(wall,player,kong)=>this.handControl?.beforeDraw(wall,player.seat,kong),
  onDraw:p=>this.sound('draw',p),
  onDiscard:(p,t)=>this.sound('discard',p,{tile:{suit:t.suit,rank:t.rank}}),
  onChi:p=>this.sound('chi',p),onPeng:p=>this.sound('peng',p),
  onAnGang:p=>this.sound('anGang',p),onMingGang:p=>this.sound('mingGang',p),onJiaGang:p=>this.sound('jiaGang',p),onSupplementGang:p=>this.sound('supplement',p),
  onRiichi:p=>this.sound('riichi',p,{shape:p.state.riichiShapes[0]}),
  onBeforeGangDraw:p=>{this.pendingAutoDiscard=null;this.prompt={kind:'beforeGang',playerId:p.id,deadline:Date.now()+TURN_MS};},
  onHumanTurn:(p,drawn)=>{this.pendingAutoDiscard=null;this.prompt={kind:'turn',playerId:p.id,drawn,deadline:Date.now()+TURN_MS};},
  onHumanClaim:(p,target,from,win,peng,gang,chi=false)=>{this.pendingAutoDiscard=null;this.prompt={kind:'claim',playerId:p.id,target,fromId:from.id,claimOptions:[win,peng,gang,chi],deadline:Date.now()+TURN_MS};},
  onGangSettlement:(_p,result)=>this.gangs.push(result),
  onWin:(winner,tile,result,mode)=>{this.sound('win',winner,{mode});this.result={kind:'win',winnerId:winner.id,tile,result,mode};},
  onDrawn:()=>{this.sound('drawn');this.result={kind:'drawn'};},
  onRoundEnd:finished=>{this.pendingSelfWinTimer=null;this.pendingAutoDiscard=null;this.phase=finished?'finished':'settled';this.prompt=null;this.pendingAI=null;this.members.forEach(m=>m.ready=!!m.isBot||!!m.autoPlay);}
 });this.nextRound();}
 nextRound(){this.pendingSelfWinTimer=null;this.pendingAutoDiscard=null;this.phase='playing';this.prompt=null;this.pendingAI=null;this.result=null;this.gangs=[];this.members.forEach(m=>m.ready=!!m.isBot||!!m.autoPlay);this.game.aiSeats.clear();for(const m of this.members)if(m.isBot||m.autoPlay)this.game.aiSeats.add(m.seat);this.sound('start');this.game.startRound();}
 action(m,data,automatic=false){
  if(typeof data.requestId!=='string'||data.requestId.length>80)fail('操作编号无效');
  if(m.requests.has(data.requestId))return;
  this.finishDueSelfWin();
  if(!automatic&&this.phase==='playing'&&this.prompt?.playerId===m.id&&this.prompt.deadline<=Date.now()){this.expirePrompt();fail('操作已超时，系统已自动处理',409);}
  if(data.revision!==this.revision&&!['ready','start'].includes(data.type))fail('牌局已更新，请按最新牌局重新选择',409);
  const previousPrompt=this.prompt;
  let ok=false;const g=this.game,p=g?.getPlayerById(m.id);
  if(data.type==='addBot'||data.type==='removeBot'){
   if(m.id!==this.ownerId)fail('仅房主可以管理机器人',403);if(this.phase!=='waiting')fail('仅开局前可以调整机器人');
   if(data.type==='addBot')this.addBot();else this.removeBot(data.memberId);ok=true;
  }else if(data.type==='ready'){
   if(this.phase!=='waiting'&&this.phase!=='settled')fail('当前不能准备');m.ready=data.ready!==false;ok=true;
   if(this.phase==='settled'&&this.members.every(x=>x.ready&&(this.connected(x)||x.autoPlay)))this.nextRound();
  }else if(data.type==='start'){if(m.id!==this.ownerId)fail('仅房主可以开局',403);if(this.phase!=='waiting')fail('已经开局');this.start();ok=true;
  }else{
   if(this.phase!=='playing'||!p||this.prompt?.playerId!==m.id)fail('尚未轮到你操作',403);
   const prompt=this.prompt;const own=id=>p.hand.find(t=>t.id===id);const selected=Array.isArray(data.tileIds)?data.tileIds.map(own):[];
   const turn=prompt.kind==='turn';this.prompt=null;
   try{switch(data.type){
    case 'beforeGang':ok=prompt.kind==='beforeGang'&&g.playerBeforeGangDraw(p,data.choiceKey);break;
    case 'discard':ok=turn&&!!own(data.tileId)&&g.playerDiscard(p,own(data.tileId));break;
    case 'riichi':ok=turn&&!!own(data.tileId)&&typeof data.choiceKey==='string'&&g.playerDeclareRiichi(p,own(data.tileId),data.choiceKey);break;
    case 'anGang':ok=turn&&selected.every(Boolean)&&g.playerSelectedConcealedGang(p,selected);break;
    case 'jiaGang':ok=turn&&!!own(data.tileId)&&g.playerJiaGang(p,own(data.tileId));break;
    case 'supplement':ok=turn&&!!own(data.tileId)&&g.playerSupplementGang(p,data.meldIndex,own(data.tileId));break;
    case 'chi':ok=!turn&&selected.every(Boolean)&&g.playerClaimChi(p,selected);break;
    case 'peng':ok=!turn&&g.playerClaimPeng(p);break;
    case 'mingGang':ok=!turn&&g.playerClaimMingGang(p);break;
    case 'win':ok=turn?!!prompt.drawn&&g.playerSelfWin(p,prompt.drawn):g.playerClaimWin(p);break;
    case 'pass':ok=!turn&&g.playerPass(p);break;
   }}finally{if(!ok)this.prompt=prompt;}
  }
  if(!ok)fail('该操作不符合当前牌局或规则');
  // A completed action opens a fresh 15-second decision, including consecutive
  // kongs and the choice before/after their supplement draw. Reads/retries and
  // rejected actions never extend an existing prompt.
  if(this.phase==='playing'&&this.prompt&&this.prompt!==previousPrompt)this.prompt.deadline=Date.now()+TURN_MS;
  m.requests.set(data.requestId,true);if(m.requests.size>100)m.requests.delete(m.requests.keys().next().value);this.bump();
 }
 leave(m){this.voice.releaseMember(m.id);if(this.phase==='waiting'){this.members=this.members.filter(x=>x!==m);if(this.ownerId===m.id)this.ownerId=this.members.find(x=>!x.isBot)?.id;if(!this.members.some(x=>!x.isBot))this.members=[];this.bump();}else this.disconnect(m);}
 expirePrompt(){if(!this.prompt)return;const prompt=this.prompt,m=this.members.find(m=>m.id===prompt.playerId),p=this.game.getPlayerById(m.id);
  this.action(m,{requestId:crypto.randomUUID(),revision:this.revision,type:prompt.kind==='beforeGang'?'beforeGang':prompt.kind==='claim'?'pass':'discard',tileId:prompt.drawn?.id??p.hand[0]?.id},true);
 }
 finishDueSelfWin(now=Date.now()){
  if(this.phase==='playing'&&this.pendingSelfWinTimer&&this.pendingSelfWinTimer.due<=now){const pending=this.pendingSelfWinTimer;this.pendingSelfWinTimer=null;if(pending.action())this.bump();}
 }
 tick(now=Date.now()){
  this.voice.tick(now);
  this.finishDueSelfWin(now);
   for(const m of this.members)if(!m.isBot&&!m.autoPlay&&!this.connected(m,now)&&this.phase!=='waiting'){this.setAutoPlay(m,true);this.bump();}
  if(this.phase==='playing'&&this.pendingAutoDiscard&&this.pendingAutoDiscard.due<=now){const pending=this.pendingAutoDiscard;this.pendingAutoDiscard=null;if(pending.action())this.bump();return;}
  if(this.phase==='playing'&&this.pendingAI&&this.pendingAI.due<=now){const pending=this.pendingAI;this.pendingAI=null;pending.action();this.bump();return;}
  if(this.phase==='playing'&&this.prompt&&this.prompt.deadline<=now)this.expirePrompt();
  const presence=this.members.map(m=>this.connected(m)).join(',');if(this.presence!==presence){this.presence=presence;this.bump();}
 }
 snapshot(m){
  const g=this.game,players=g?g.players.map((p,i)=>{const own=p.id===m.id,roundOver=['settled','finished'].includes(this.phase),reveal=roundOver||own||p.state.isWon;return {id:p.id,name:p.name,seat:p.seat,score:p.score,hand:reveal?p.hand:hidden(p.hand.length,i*100),discards:p.discards,melds:p.melds.map((meld,j)=>({...meld,tiles:roundOver||own||isMeldPublic(meld)?meld.tiles:hidden(meld.tiles.length,500+i*100+j*10)})),state:own?{...p.state}:{...createDefaultPlayerState(),isDealer:p.state.isDealer,isStanding:p.state.isStanding,isOpen:p.state.isOpen,isWon:p.state.isWon,isDrawn:p.state.isDrawn,isFired:p.state.isFired,isRobbed:p.state.isRobbed,riichi:p.state.riichi,riichiShapes:p.state.riichiShapes}};}):[];
  let prompt=null;
  if(this.prompt?.playerId===m.id){prompt={...this.prompt};if(prompt.kind==='turn'){const p=g.getPlayerById(m.id);prompt.options=g.computeHumanOptions(p,prompt.drawn);prompt.riichiDiscards=g.getRiichiDiscards(p).map(t=>({tileId:t.id,choices:getRiichiChoices({...p,hand:p.hand.filter(x=>x.id!==t.id)},g.allowQi)}));prompt.concealed=g.getConcealedGangChoices(p);prompt.supplements=g.getSupplementGangChoices(p);prompt.jia=p.melds.filter(x=>x.type==='peng').flatMap(meld=>p.hand.filter(t=>t.suit===meld.tiles[0].suit&&t.rank===meld.tiles[0].rank));}else prompt.chi=g.getHumanChiOptions(g.getPlayerById(m.id));}
  const pending=g?.pendingRobbingGang,gangClaim=pending?{playerId:pending.gangPlayer.id,tile:pending.gangTile,supplementMeldIndex:pending.supplementMeldIndex}:null;
  return JSON.parse(JSON.stringify({serverNow:Date.now(),turnSeconds:15,soundSequence:this.soundSequence,soundEvents:this.soundEvents,code:this.code,revision:this.revision,phase:this.phase,localId:m.id,ownerId:this.ownerId,config:this.config,members:this.members.map(x=>({id:x.id,name:x.name,seat:x.seat,isBot:!!x.isBot,autoPlay:!!x.autoPlay,ready:x.ready,connected:this.connected(x)})),players,room:g?{...g.room,players:undefined}:null,currentSeat:g?.currentSeat,gamePhase:g?.phase,autoSelfWin:g?.pendingSelfWin?{playerId:g.pendingSelfWin.playerId,deadline:g.pendingSelfWin.deadline}:null,lastDiscard:g?.lastDiscard,lastDiscarderId:g?.lastDiscarder?.id,gangClaim,remaining:g?getRemainingCount(g.wall):0,kongRemaining:g?getKongRemainingCount(g.wall):0,prompt,actingId:this.prompt?.playerId??this.pendingAI?.playerId,deadline:this.prompt?.deadline??this.pendingAI?.due,result:this.result,gangs:['settled','finished'].includes(this.phase)?this.gangs:[]}));
 }
}
module.exports={FriendRoom,fail};
