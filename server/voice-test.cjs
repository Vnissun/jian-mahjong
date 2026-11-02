const assert=require('node:assert/strict'),{RoomVoice,wavDuration}=require('./voice.cjs'),{FriendRoom}=require('./rooms.cjs');
const fs=require('node:fs'),ts=require('../tools/typescript.cjs')();
const Module=require('node:module'),m=new Module('voice-wav');m._compile(ts.transpileModule(fs.readFileSync('assets/scripts/net/VoiceWav.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,'voice-wav');
const wav=ms=>Buffer.from(m.exports.encodeVoiceWav([Float32Array.from({length:Math.round(ms*48)},(_,i)=>.3*Math.sin(i/10))],48000));
const a={id:'a',name:'甲'},b={id:'b',name:'乙'};
{
 const v=new RoomVoice(),key=v.claim(a).key;assert.throws(()=>v.claim(b),/正在录音/);assert(!JSON.stringify(v.state()).includes(key));v.release(b,key);assert(v.lock);assert.throws(()=>v.upload(b,key,wav(1000)),/取消或超时/);assert(v.lock);const clip=v.upload(a,key,wav(1000));assert.equal(clip.duration,1000);assert.equal(v.lock,null);assert.equal(wavDuration(v.get(clip.id)),1000);assert.throws(()=>v.upload(a,key,wav(1000)),/取消或超时/);assert.throws(()=>v.claim(a),/稍等/);
 console.log('✓ 单人录音锁、所有者校验、密钥不公开、重复发送拒绝和WAV编码互通');
}
{
 const v=new RoomVoice();assert.throws(()=>wavDuration(Buffer.alloc(32044)),/格式无效/);assert.throws(()=>wavDuration(wav(200)),/0.4至10秒/);assert.equal(wavDuration(wav(10000)),10000);let bytes=wav(1000);bytes.writeUInt32LE(44100,24);assert.throws(()=>wavDuration(bytes),/格式无效/);v.claim(a);v.tick(Date.now()+23000);assert.equal(v.lock,null);v.claim(b);v.releaseMember(b.id);assert.equal(v.lock,null);
 console.log('✓ 非音频、错误格式及过短录音拒绝；最长10秒，超时或断线释放录音锁');
}
{
 const v=new RoomVoice();let last;for(let i=0;i<9;i++){const p={id:'p'+i,name:'玩家'+i},key=v.claim(p).key;last=v.upload(p,key,wav(10000));}assert(v.clips.length<=6);assert(v.clips.reduce((n,c)=>n+c.bytes.length,0)<=1024*1024);v.tick(Date.now()+61000);assert.throws(()=>v.get(last.id),/过期/);assert.equal(v.clips.length,0);
 console.log('✓ 录音按房间限量临时保存，60秒自动过期，内存有上限');
}
{
 const r=new FriendRoom('123456','甲');for(const n of ['乙','丙','丁'])r.add(n);r.members.forEach(m=>m.ready=true);r.start();const revision=r.revision,hand=r.game.players.map(p=>p.hand.map(t=>t.id)),scores=r.game.players.map(p=>p.score),key=r.voice.claim(r.members[0]).key;r.voice.upload(r.members[0],key,wav(1000));assert.equal(r.revision,revision);assert.deepEqual(r.game.players.map(p=>p.hand.map(t=>t.id)),hand);assert.deepEqual(r.game.players.map(p=>p.score),scores);r.voice.claim(r.members[1]);r.disconnect(r.members[1]);assert.equal(r.voice.lock,null);r.auth(r.members[1].token,false);assert(r.members[1].autoPlay);assert(!r.connected(r.members[1]));
 console.log('✓ 语音事件不改变牌局版本、手牌或积分；语音轮询不会抢回离线托管身份');
}
