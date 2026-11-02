const crypto=require('node:crypto');
const {QUICK_PHRASES,QUICK_EMOJIS,THROW_EMOJI_IDS}=require('./dist/data/QuickChat');
const MAX_BYTES=320044,LEASE_MS=22000,TTL_MS=60000;
function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
function wavDuration(b){
 if(b.length<44||b.length>MAX_BYTES||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE'||b.toString('ascii',12,16)!=='fmt '||b.readUInt32LE(16)!==16||b.readUInt16LE(20)!==1||b.readUInt16LE(22)!==1||b.readUInt32LE(24)!==16000||b.readUInt32LE(28)!==32000||b.readUInt16LE(32)!==2||b.readUInt16LE(34)!==16||b.toString('ascii',36,40)!=='data'||b.readUInt32LE(40)!==b.length-44||b.readUInt32LE(4)!==b.length-8||(b.length-44)%2)fail('录音格式无效，请重新录制');
 const ms=(b.length-44)/32;if(ms<400||ms>10000)fail('录音需要在0.4至10秒之间');return Math.round(ms);
}
class RoomVoice{
 constructor(){this.revision=0;this.sequence=0;this.lock=null;this.clips=[];this.waiters=new Set();this.sent=new Map();this.messages=[];this.messageSequence=0;this.quickSent=new Map();}
 bump(){this.revision++;for(const wake of Array.from(this.waiters))wake();}
 tick(now=Date.now()){
  if(this.lock&&this.lock.until<=now){this.lock=null;this.bump();}
  this.clips=this.clips.filter(c=>now-c.at<TTL_MS);
  this.messages=this.messages.filter(c=>now-c.at<TTL_MS);
 }
 claim(m){this.tick();if(m.isBot||m.autoPlay)fail('请先返回对局再发送语音',403);if(this.lock)fail('有人正在录音，请稍后再说',409);if(Date.now()-(this.sent.get(m.id)||0)<2000)fail('请稍等再发送下一条语音',429);
  this.lock={playerId:m.id,name:m.name,key:crypto.randomBytes(24).toString('hex'),until:Date.now()+LEASE_MS};this.bump();return {key:this.lock.key,until:this.lock.until};
 }
 release(m,key){if(this.lock?.playerId===m.id&&this.lock.key===key){this.lock=null;this.bump();}}
 releaseMember(id){if(this.lock?.playerId===id){this.lock=null;this.bump();}}
 upload(m,key,bytes){this.tick();if(!this.lock||this.lock.playerId!==m.id||this.lock.key!==key)fail('录音已取消或超时，请重新录制',409);
  const duration=wavDuration(bytes),clip={id:crypto.randomUUID(),seq:++this.sequence,playerId:m.id,name:m.name,at:Date.now(),duration,bytes:Buffer.from(bytes)};
  this.clips.push(clip);while(this.clips.length>6||this.clips.reduce((n,c)=>n+c.bytes.length,0)>1024*1024)this.clips.shift();this.sent.set(m.id,Date.now());this.lock=null;this.bump();return this.info(clip);
 }
 info(c){return {id:c.id,seq:c.seq,playerId:c.playerId,name:c.name,at:c.at,duration:c.duration};}
 quick(m,type,id,target){
  if(m.isBot||m.autoPlay)fail('请先返回对局再发送消息',403);
  const entry=(type==='phrase'?QUICK_PHRASES:type==='emoji'?QUICK_EMOJIS:[]).find(x=>x.id===id);
  if(!entry)fail('请选择有效的快捷语音或表情');
  if(type==='emoji'&&THROW_EMOJI_IDS.includes(id)&&!target)fail('请先选择要投掷的玩家');
  if(this.quickSent.has(m.id)&&Date.now()-this.quickSent.get(m.id)<3000)fail('请等3秒再发送',429);
  const message={seq:++this.messageSequence,playerId:m.id,name:m.name,type,id,text:entry.text,at:Date.now(),...(target?{targetId:target.id,targetName:target.name}:{})};
  this.quickSent.set(m.id,message.at);this.messages.push(message);if(this.messages.length>24)this.messages.shift();this.bump();return message;
 }
 state(){this.tick();return {revision:this.revision,sequence:this.sequence,messageSequence:this.messageSequence,messages:this.messages.slice(),serverNow:Date.now(),lock:this.lock?{playerId:this.lock.playerId,name:this.lock.name,until:this.lock.until}:null,clips:this.clips.map(c=>this.info(c))};}
 get(id){this.tick();const c=this.clips.find(c=>c.id===id);if(!c)fail('这条语音已过期',404);return c.bytes;}
 close(){for(const wake of Array.from(this.waiters))wake();this.clips=[];this.messages=[];this.lock=null;}
}
module.exports={RoomVoice,wavDuration,MAX_BYTES};
