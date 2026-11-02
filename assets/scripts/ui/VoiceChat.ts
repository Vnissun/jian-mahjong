import { sys } from 'cc';
import { FriendClient } from '../net/FriendClient';
import { VoiceRecorder } from '../net/VoiceRecorder';
import { QUICK_PHRASES, QUICK_EMOJIS, THROW_EMOJI_IDS } from '../data/QuickChat';

/** Room voice messages have their own poll/revision; they never reset game input. */
export class VoiceChat {
    private client: FriendClient | null = null;
    private root=document.createElement('div');
    private button=document.createElement('button');
    private status=document.createElement('div');
    private panel=document.createElement('div');
    private history=document.createElement('div');
    private listen=document.createElement('button');
    private player=new Audio('sounds/unlock.wav');
    private state:any=null;
    private generation=0;
    private revision=-1;
    private sequence:number|null=null;
    private messageSequence:number|null=null;
    private quickPanel=document.createElement('div');
    private quickButton=document.createElement('button');
    private quickSending=false;
    private quickTarget:string|null=null;
    private showQuick:(type:'phrase'|'emoji')=>void=()=>{};
    private quickNotice=document.createElement('div');
    private closeQuick=(e:Event)=>{if(!this.root.contains(e.target as HTMLElement))this.quickPanel.hidden=true;};
    private pollAbort:AbortController|null=null;
    private queue:any[]=[];
    private playing=false;
    private playbackId=0;
    private playbackTimer:any=null;
    private objectUrl='';
    private ready=false;
    private held=false;
    private cancelling=false;
    private busy=false;
    private recording=false;
    private key='';
    private recorder:VoiceRecorder|null=null;
    private timer:any=null;
    private startedAt=0;
    private active=false;
    private muted=localStorage.getItem('mahjong-chat-muted')==='1';
    private volume=Number(localStorage.getItem('mahjong-chat-volume')??'.85');
    constructor(private duck:(active:boolean)=>void,private onQuick:(message:any)=>void=()=>{}){
        this.volume=Number.isFinite(this.volume)?Math.max(0,Math.min(1,this.volume)):.85;
        this.root.id='GameVoiceControls';this.root.hidden=true;
        this.root.style.cssText='position:absolute;z-index:8500;width:112px;color:#fff8da;font:16px sans-serif;transform-origin:top left;touch-action:none;user-select:none;-webkit-user-select:none';
        this.button.id='GameVoiceRecord';this.button.type='button';this.button.setAttribute('aria-label','按住录音，松开发送');
        this.button.style.cssText='display:block;width:112px;height:56px;touch-action:none;border:1px solid #bbcf8e;border-radius:28px;background:linear-gradient(#388a58,#155333);color:#fff8da;box-shadow:0 3px 10px #00271977;font:17px sans-serif;cursor:pointer';
        this.button.oncontextmenu=e=>e.preventDefault();
        this.button.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();this.unlock();if(!this.ready){void this.prepare();return;}if(this.button.disabled)return;this.held=true;this.cancelling=false;this.button.setPointerCapture(e.pointerId);void this.start();};
        this.button.onpointermove=e=>{if(!this.held)return;const r=this.button.getBoundingClientRect();this.cancelling=e.clientX<r.left-45||e.clientX>r.right+45||e.clientY<r.top-45||e.clientY>r.bottom+45;if(this.recording)this.say(this.cancelling?'松开取消发送':'松开发送 · 移开取消');};
        this.button.onpointerup=()=>{this.held=false;void this.finish(this.cancelling);};
        this.button.onpointercancel=()=>{this.held=false;void this.finish(true);};
        this.button.onkeydown=e=>{if(e.code==='Space'&&!e.repeat){e.preventDefault();this.unlock();if(!this.ready)void this.prepare();else{this.held=true;void this.start();}}};
        this.button.onkeyup=e=>{if(e.code==='Space'){e.preventDefault();this.held=false;void this.finish(false);}};
        const more=document.createElement('button');more.type='button';more.textContent='···';more.setAttribute('aria-label','语音消息和音量');more.style.cssText=this.button.style.cssText+';width:44px;height:44px;margin-left:68px;margin-top:4px;font-weight:bold';more.onclick=()=>{this.unlock();this.panel.hidden=!this.panel.hidden;};
        this.quickButton.id='GameQuickChat';this.quickButton.type='button';this.quickButton.textContent='☺';this.quickButton.setAttribute('aria-label','快捷语音和表情');this.quickButton.style.cssText=this.button.style.cssText+';position:absolute;left:0;top:60px;width:48px;height:48px;font-size:30px';
        this.quickButton.onclick=()=>{this.unlock();this.quickTarget=null;this.quickNotice.textContent='点选即发送 · 每3秒可发送一次';this.quickPanel.hidden=!this.quickPanel.hidden;this.panel.hidden=true;this.quickButton.setAttribute('aria-expanded',String(!this.quickPanel.hidden));};
        this.quickPanel.id='GameQuickChatPanel';this.quickPanel.hidden=true;this.quickPanel.setAttribute('aria-label','快捷语音和表情选择');this.quickPanel.style.cssText='position:absolute;right:0;bottom:112px;width:340px;max-height:290px;box-sizing:border-box;padding:12px;background:linear-gradient(#205b40,#103c2b);border:1px solid #d4b871;border-radius:14px;box-shadow:0 8px 24px #001b16aa;touch-action:pan-y';
        this.quickPanel.style.right='120px';
        const tabs=document.createElement('div'),list=document.createElement('div');tabs.style.cssText='display:flex;gap:8px;margin-bottom:8px';list.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:7px;max-height:190px;overflow-y:auto;touch-action:pan-y';
        const style='min-height:48px;border:1px solid #b8aa70;border-radius:9px;background:#f7e6b8;color:#49331c;font:15px sans-serif;cursor:pointer;touch-action:manipulation';
        const show=(type:'phrase'|'emoji')=>{list.replaceChildren();for(const entry of type==='phrase'?QUICK_PHRASES:QUICK_EMOJIS){const b=document.createElement('button');b.type='button';b.dataset.quickId=entry.id;b.dataset.quickType=type;b.style.cssText=style+(type==='emoji'?';font-size:28px':'');b.textContent=type==='emoji'?entry.text+' '+(entry as any).label:entry.text;if(type==='emoji')b.style.fontSize='18px';b.setAttribute('aria-label',type==='emoji'?(entry as any).label:entry.text);b.onclick=()=>void this.sendQuick(type,entry.id);list.append(b);}};
        this.showQuick=show;
        for(const [type,label]of [['phrase','快捷语音'],['emoji','表情']] as const){const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText=style+';flex:1';b.onclick=()=>{if(type==='phrase'){this.quickTarget=null;this.quickNotice.textContent='点选即发送 · 每3秒可发送一次';}show(type);};tabs.append(b);}
        const close=document.createElement('button');close.type='button';close.textContent='关闭';close.style.cssText=style;close.onclick=()=>this.quickPanel.hidden=true;tabs.append(close);
        this.quickNotice.style.cssText='font:12px sans-serif;color:#ffdf83;min-height:16px;margin-top:6px';this.quickNotice.textContent='点选即发送 · 每3秒可发送一次';const credits=document.createElement('a');credits.textContent='表情图案：Twemoji · CC BY 4.0';credits.href='social/CREDITS.txt';credits.target='_blank';credits.rel='noopener';credits.style.cssText='display:block;margin-top:5px;font:11px sans-serif;color:#bfd6ba';this.quickPanel.append(tabs,list,this.quickNotice,credits);show('phrase');
        this.status.id='GameVoiceStatus';this.status.setAttribute('role','status');this.status.style.cssText='position:absolute;right:0;bottom:108px;width:130px;max-height:32px;font-size:11px;line-height:14px;overflow:hidden;text-shadow:0 1px 3px #002719;pointer-events:none';
        this.panel.hidden=true;this.panel.style.cssText='position:absolute;right:0;bottom:78px;width:240px;padding:12px;box-sizing:border-box;background:#124a32f5;border:1px solid #b1c78d;border-radius:12px;box-shadow:0 8px 24px #001c1c66;touch-action:manipulation';
        const title=document.createElement('div');title.textContent='好友语音';title.style.cssText='color:#ffe273;margin-bottom:9px';
        const mute=document.createElement('button');mute.type='button';mute.style.cssText='background:#286d43;color:#fff8da;border:1px solid #90ae71;border-radius:7px;padding:6px';
        const refreshMute=()=>mute.textContent=this.muted?'开启收听':'关闭收听';refreshMute();mute.onclick=()=>{this.unlock();this.muted=!this.muted;localStorage.setItem('mahjong-chat-muted',this.muted?'1':'0');if(this.muted)this.stopPlayback();else void this.next();refreshMute();};
        const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='1';slider.step='.05';slider.value=String(this.volume);slider.setAttribute('aria-label','好友语音音量');slider.style.cssText='width:115px;vertical-align:middle;margin-left:8px';slider.oninput=()=>{this.volume=Number(slider.value);this.player.volume=this.volume;localStorage.setItem('mahjong-chat-volume',String(this.volume));};
        this.listen.type='button';this.listen.textContent='点击收听语音';this.listen.hidden=true;this.listen.style.cssText='background:#cf973c;color:#fff;border:0;border-radius:8px;padding:8px;margin-bottom:6px;width:100%';this.listen.onclick=()=>{this.unlock();this.listen.hidden=true;void this.next();};
        this.panel.append(title,mute,slider,this.history);this.root.append(this.button,more,this.status,this.listen,this.panel,this.quickButton,this.quickPanel);this.player.id='GameVoiceAudio';this.player.preload='auto';this.player.hidden=true;this.root.append(this.player);this.layout();
        document.addEventListener('pointerdown',this.closeQuick);
        document.addEventListener('visibilitychange',this.visibility);window.addEventListener('pagehide',this.pageHide);window.addEventListener('resize',this.layout);document.addEventListener('fullscreenchange',this.layout);document.addEventListener('webkitfullscreenchange',this.layout);
    }
    private say(text:string):void{this.status.textContent=text;this.status.title=text;}
    private unlock():void{if(!this.playing){this.player.src='sounds/unlock.wav';void this.player.play().catch(()=>{});}}
    private layout=()=>{
        const frame=document.getElementById('GameDiv')||document.body,full=document.fullscreenElement||(document as any).webkitFullscreenElement,host=full&&!full.contains(frame)?full:frame;
        if(this.root.parentElement!==host)host.appendChild(this.root);
        const w=host.clientWidth,h=host.clientHeight,scale=sys.isMobile?w/1280:Math.min(w/1280,h/720),left=sys.isMobile?0:Math.max(0,(w-1280*scale)/2),top=sys.isMobile?0:Math.max(0,(h-720*scale)/2);
        const scaleY=sys.isMobile?h/720:scale;
        // Keep a finger-sized target even when the landscape table is scaled down.
        // Anchor above the hand; enlarged controls grow upwards and to the left.
        const controlScale=Math.max(1,scale),controlHeight=112;
        this.quickPanel.style.maxHeight=Math.max(140,Math.min(290,(top+565*scaleY-controlHeight*controlScale)/controlScale-20))+'px';
        this.quickPanel.style.overflowY='auto';
        this.root.style.left=(left+1270*scale-112*controlScale)+'px';
        this.root.style.top=(top+565*scaleY-controlHeight*controlScale)+'px';
        this.root.style.transform='scale('+controlScale+')';
    };
    setSession(client:FriendClient|null,state?:any):void{
        const active=!!client&&state?.phase!=='waiting';
        if(this.client!==client){this.reset();this.client=client;this.active=active;if(client&&!document.hidden)void this.poll(++this.generation);}
        this.active=active;this.root.hidden=!active;this.layout();
    }
    private async sendQuick(type:'phrase'|'emoji',id:string):Promise<void>{
        if(type==='emoji'&&THROW_EMOJI_IDS.includes(id)&&!this.quickTarget){this.quickNotice.textContent='请先点击对手头像，再选择投掷表情';return;}
        if(this.quickSending)return;this.quickSending=true;this.unlock();const generation=this.generation;
        try{await this.request('quick',{type,id,...(type==='emoji'&&this.quickTarget?{targetId:this.quickTarget}:{})});if(generation===this.generation){this.quickPanel.hidden=true;this.quickTarget=null;this.quickNotice.textContent='已发送 · 每3秒可发送一次';}}
        catch(e:any){if(generation===this.generation)this.quickNotice.textContent=e.message||'发送失败，请重试';}
        finally{this.quickSending=false;}
    }
    openEmojiFor(playerId:string):void{
        const target=this.client?.state?.members.find(m=>m.id===playerId);
        if(!this.active||!target||target.id===this.client?.state?.localId)return;
        this.unlock();this.quickTarget=target.id;this.showQuick('emoji');this.quickNotice.textContent='发送给 '+target.name+' · 点选表情即发送';this.quickPanel.hidden=false;this.panel.hidden=true;this.layout();
    }
    private async request(path:string,body?:any,signal?:AbortSignal):Promise<any>{
        const c=this.client;if(!c)throw Error('请先进入好友对局');
        const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),path.startsWith('state')?15000:12000),abort=()=>controller.abort();signal?.addEventListener('abort',abort);
        try{const raw=body instanceof ArrayBuffer,res=await fetch('/api/rooms/'+c.code+'/voice/'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+c.token,...(raw?{'Content-Type':'audio/wav','X-Voice-Key':this.key}:{'Content-Type':'application/json'})},body:body===undefined?undefined:raw?body:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
            if(!res.ok){const data=await res.json().catch(()=>({}));throw Error(data.error||'语音连接失败');}return path.startsWith('clips/')?await res.blob():await res.json();
        }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
    }
    private async poll(generation:number):Promise<void>{
        while(this.client&&generation===this.generation&&!document.hidden){
            this.pollAbort=new AbortController();
            try{const s=await this.request('state?wait=1&since='+this.revision,undefined,this.pollAbort.signal);if(generation!==this.generation)return;this.revision=s.revision;
                if(this.sequence!==null)for(const clip of s.clips)if(clip.seq>this.sequence&&clip.playerId!==this.client.state?.localId&&s.serverNow-clip.at<15000){this.queue.push(clip);if(this.queue.length>3)this.queue.shift();}
                this.sequence=s.sequence;this.state=s;this.render();void this.next();
                if(this.messageSequence!==null)for(const message of s.messages??[])if(message.seq>this.messageSequence&&s.serverNow-message.at<12000){
                    this.onQuick(message);
                    if(message.type==='phrase'&&QUICK_PHRASES.some(p=>p.id===message.id)){
                        this.queue.push({...message,quick:true,duration:6000});if(this.queue.length>3)this.queue.shift();
                    }
                }
                this.messageSequence=s.messageSequence??0;void this.next();
            }catch{if(generation!==this.generation)return;this.sequence=null;this.queue=[];if(this.active&&!this.recording)this.say('语音连接中…');await new Promise(r=>setTimeout(r,1800));}
        }
    }
    private render():void{
        const own=this.client?.state?.localId,other=this.state?.lock&&this.state.lock.playerId!==own;
        this.button.disabled=!!other||(this.busy&&!this.held);this.button.style.opacity=other?'.6':'1';this.button.textContent=this.recording?'● 录音 '+Math.min(10,Math.floor((Date.now()-this.startedAt)/1000))+'秒':this.busy?'正在发送…':other?'对方正在录音':this.ready?'🎙 按住说话':'🎙 开启语音';
        if(other&&!this.recording&&!this.busy)this.say(this.state.lock.name+' 正在录音');
        else if(!other&&this.status.textContent.includes('正在录音')&&!this.recording)this.say('按住说话，松开发送');
        this.history.replaceChildren();for(const clip of [...(this.state?.clips??[])].reverse().slice(0,3)){const b=document.createElement('button');b.type='button';b.textContent='▶ '+clip.name+' · '+Math.max(1,Math.round(clip.duration/1000))+'秒';b.style.cssText='display:block;background:#245d3c;color:#fff8da;border:0;border-radius:6px;margin-top:8px;padding:8px;width:100%;text-align:left';b.onclick=()=>{this.unlock();this.stopPlayback();this.queue=[clip];void this.next();};this.history.append(b);}
    }
    private async prepare():Promise<void>{
        if(this.busy)return;this.busy=true;this.render();this.say('请允许使用麦克风');
        try{if(!navigator.mediaDevices?.getUserMedia)throw Error('请在HTTPS页面或系统浏览器中开启语音');const s=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}});s.getTracks().forEach(t=>t.stop());this.ready=true;this.say('已开启 · 按住说话，松开发送');}
        catch(e:any){this.say(e.name==='NotAllowedError'?'未允许麦克风；仍可收听好友语音':e.message||'麦克风不可用');}
        finally{this.busy=false;this.render();}
    }
    private async start():Promise<void>{
        if(this.busy||this.recording||!this.client)return;this.busy=true;const generation=this.generation;let key='';
        try{
            this.stopPlayback();const recorder=new VoiceRecorder();this.recorder=recorder;
            const lock=await this.request('claim',{});key=lock.key;
            if(!this.held||generation!==this.generation){await this.release(key);return;}this.key=key;
            await recorder.start();
            if(!this.held||generation!==this.generation)return;
            this.recording=true;this.busy=false;this.startedAt=Date.now();this.duck(true);this.say('松开发送 · 移开取消');this.render();this.timer=setInterval(()=>{this.render();if(Date.now()-this.startedAt>=10000){this.held=false;void this.finish(false);}},150);
        }catch(e:any){this.say(e.message||'无法录音，请重试');}
        finally{if(generation===this.generation&&!this.recording){this.cleanupCapture();if(key)await this.release(key);if(generation===this.generation){this.key='';this.busy=false;this.render();void this.next();}}}
    }
    private cleanupCapture():void{clearInterval(this.timer);this.timer=null;this.recording=false;this.recorder?.stop();this.recorder=null;this.duck(this.playing);}
    private async release(key:string):Promise<void>{try{await this.request('release',{key});}catch{}}
    private async finish(cancel:boolean):Promise<void>{
        if(!this.recording)return;this.recording=false;this.busy=true;const key=this.key,data=this.recorder!.stop(),generation=this.generation;this.recorder=null;this.cleanupCapture();this.render();
        try{if(cancel){this.say('已取消录音');return;}if(data.byteLength<12844){this.say('录音太短，请按住至少半秒');return;}this.say('正在发送…');await this.request('upload',data);if(generation===this.generation)this.say('语音已发送');}
        catch(e:any){if(generation===this.generation)this.say(e.message||'发送失败，请重新录制');}
        finally{await this.release(key);if(generation===this.generation){this.key='';this.busy=false;this.render();void this.next();}}
    }
    private stopPlayback():void{clearTimeout(this.playbackTimer);this.playbackTimer=null;this.playbackId++;this.player.onended=null;this.player.onerror=null;this.player.pause();this.playing=false;if(this.objectUrl)URL.revokeObjectURL(this.objectUrl);this.objectUrl='';this.duck(this.recording);}
    private async next():Promise<void>{
        if(!this.active||this.playing||this.recording||this.busy||this.muted||document.hidden||!this.client||!this.queue.length)return;
        const clip=this.queue.shift(),generation=this.generation,id=++this.playbackId;this.playing=true;
        try{if(clip.quick){this.player.src='sounds/quick/'+clip.id+'.wav';}else{const blob=await this.request('clips/'+clip.id);if(generation!==this.generation||id!==this.playbackId)return;this.objectUrl=URL.createObjectURL(blob);this.player.src=this.objectUrl;}this.player.volume=this.volume;this.duck(true);this.say(clip.name+' · 正在播放');
            const done=()=>{if(id!==this.playbackId)return;this.stopPlayback();this.say('按住说话，松开发送');void this.next();};this.player.onended=done;this.player.onerror=done;await this.player.play();if(id!==this.playbackId)return;this.playbackTimer=setTimeout(done,clip.duration+5000);this.listen.hidden=true;
        }catch(e:any){if(generation!==this.generation||id!==this.playbackId)return;this.stopPlayback();if(e.name==='NotAllowedError'){this.queue.unshift(clip);this.listen.hidden=false;this.say('收到语音，点击收听');}else{this.say(e.message||'语音加载失败');void this.next();}}
    }
    private visibility=()=>{if(document.hidden){this.generation++;this.pollAbort?.abort();this.held=false;void this.finish(true);this.cleanupCapture();this.busy=false;this.key='';this.stopPlayback();this.queue=[];this.sequence=null;this.messageSequence=null;this.revision=-1;this.quickPanel.hidden=true;}else if(this.client)void this.poll(++this.generation);};
    private pageHide=()=>{this.held=false;void this.finish(true);this.cleanupCapture();};
    private reset():void{this.pollAbort?.abort();this.held=false;void this.finish(true);this.generation++;this.cleanupCapture();this.stopPlayback();this.queue=[];this.state=null;this.sequence=null;this.messageSequence=null;this.revision=-1;this.key='';this.busy=false;this.root.hidden=true;this.quickPanel.hidden=true;this.quickTarget=null;}
    destroy():void{this.reset();this.client=null;this.root.remove();document.removeEventListener('pointerdown',this.closeQuick);document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('pagehide',this.pageHide);window.removeEventListener('resize',this.layout);document.removeEventListener('fullscreenchange',this.layout);document.removeEventListener('webkitfullscreenchange',this.layout);}
}
