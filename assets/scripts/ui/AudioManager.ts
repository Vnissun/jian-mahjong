import { _decorator, Component, sys } from 'cc';
import { Tile } from '../core/Tile';
const { ccclass } = _decorator;
@ccclass('AudioManager')
export class AudioManager extends Component {
    private context: AudioContext | null = null;
    private unlocked = false;
    private muted = localStorage.getItem('mahjong-muted') === '1';
    private volume = Number(localStorage.getItem('mahjong-volume') ?? '.7');
    private player: HTMLAudioElement | null = null;
    private voice: HTMLAudioElement | null = null;
    private queue: {key:string;expires:number}[] = [];
    private voiceGeneration = 0;
    private eventBatch = false;
    private lastSpeakAt = 0;
    private chatActive=false;
    setChatActive(active:boolean):void{this.chatActive=active;if(active)this.resetVoice();}
    private hideAudio = () => { if(document.hidden)this.resetVoice(); };
    resetVoice(): void {
        this.voiceGeneration++;
        if(this.voice){this.voice.onended=null;this.voice.onerror=null;this.voice.pause();}
        this.voice=null;this.queue=[];
    }
    private controls: HTMLDivElement | null = null;
    private audioStatus: HTMLSpanElement | null = null;
    private soundButton: HTMLButtonElement | null = null;
    private soundPanel: HTMLDivElement | null = null;
    private closeSoundPanel = (event: Event) => {
        if(event.type==='keydown'&&(event as KeyboardEvent).key!=='Escape')return;
        if(event.type==='keydown'||!this.controls?.contains(event.target as HTMLElement)){
            if(this.soundPanel)this.soundPanel.hidden=true;
            this.soundButton?.setAttribute('aria-expanded','false');
        }
    };
    private layoutControls = () => {
        if (!this.controls) return;
        const frame = document.getElementById('GameDiv') || document.body;
        const fullscreen = document.fullscreenElement || (document as any).webkitFullscreenElement;
        const host = fullscreen && !fullscreen.contains(frame) ? fullscreen : frame;
        if (this.controls.parentElement !== host) host.appendChild(this.controls);
        const width = host.clientWidth, height = host.clientHeight;
        const scale = sys.isMobile ? width / 1280 : Math.min(width / 1280, height / 720);
        const left = sys.isMobile ? 0 : Math.max(0, (width - 1280 * scale) / 2);
        const top = sys.isMobile ? 0 : Math.max(0, (height - 720 * scale) / 2);
        this.controls.style.left = `${left + 12 * scale}px`;
        this.controls.style.top = `${top + 14 * scale}px`;
        const size=Math.max(44,52*scale);
        if(this.soundButton){this.soundButton.style.width=size+'px';this.soundButton.style.height=size+'px';}
        if(this.soundPanel)this.soundPanel.style.top=(size+8)+'px';
    };
    private buttonSound = () => this.playButton();
    private unlock = () => {
        if(!this.player){this.player=new Audio('sounds/unlock.wav');this.player.volume=this.volume;void this.player.play().catch(()=>{});}
        this.unlocked = true;
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!this.context && AudioContextClass) this.context = new AudioContextClass();
        if (this.context?.state === 'suspended') void this.context.resume().catch(() => {});
        this.nextVoice();
    };
    onLoad(): void {
        this.volume = Number.isFinite(this.volume) ? Math.max(0, Math.min(1, this.volume)) : .7;
        // Cocos consumes some canvas touch events; capture the gesture before it does.
        document.addEventListener('pointerdown', this.unlock, {passive:true,capture:true});
        document.addEventListener('touchend', this.unlock, {passive:true,capture:true});
        document.addEventListener('keydown', this.unlock, true);
        document.addEventListener('mahjong-button', this.buttonSound);
        document.addEventListener('visibilitychange',this.hideAudio);
        const root=document.createElement('div');root.id='GameAudioControls';
        root.style.cssText='position:absolute;z-index:9000;color:#fff8d9;font:14px sans-serif;touch-action:manipulation';
        const speaker=document.createElement('button');speaker.id='GameSoundToggle';speaker.type='button';speaker.setAttribute('aria-label','声音设置');speaker.setAttribute('aria-expanded','false');speaker.setAttribute('aria-controls','GameSoundPanel');
        speaker.style.cssText='display:grid;place-items:center;cursor:pointer;padding:0;border:1px solid #b1c78d;border-radius:50%;background:linear-gradient(#327c4e,#10492f);color:#fff8d9;box-shadow:0 2px 5px #001c1c77';
        speaker.innerHTML='<svg aria-hidden="true" style="width:64%;height:64%;display:block;pointer-events:none" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4 6 8H3v8h3l5 4V4Z" fill="currentColor" stroke="none"/><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></svg>';
        const panel=document.createElement('div');panel.id='GameSoundPanel';panel.hidden=true;panel.setAttribute('role','group');panel.setAttribute('aria-label','声音与音量');
        panel.style.cssText='position:absolute;left:0;width:238px;max-width:80vw;box-sizing:border-box;padding:14px;background:#124a32f5;border:1px solid #b1c78d;border-radius:12px;box-shadow:0 8px 24px #001c1c66';
        const title=document.createElement('div');title.textContent='声音设置';title.style.cssText='font-size:16px;margin-bottom:12px;color:#ffe273';
        const row=document.createElement('div');row.style.cssText='display:flex;gap:10px;align-items:center';
        const mute=document.createElement('button');mute.type='button';mute.style.cssText='border:1px solid #7d9d66;border-radius:7px;padding:7px 9px;background:#256f42;color:#fff8d9;cursor:pointer;white-space:nowrap';
        const refresh=()=>{mute.textContent=this.muted?'开启声音':'关闭声音';mute.setAttribute('aria-label',this.muted?'开启声音':'关闭声音');speaker.style.color=this.muted?'#a9b6a3':'#fff8d9';speaker.setAttribute('aria-label',this.muted?'声音设置（已静音）':'声音设置');};
        mute.onclick=()=>{this.unlock();this.muted=!this.muted;localStorage.setItem('mahjong-muted',this.muted?'1':'0');if(this.muted)this.resetVoice();refresh();};
        const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='1';slider.step='.1';slider.value=String(this.volume);slider.setAttribute('aria-label','游戏音量');slider.style.cssText='width:100%;min-width:0;accent-color:#ffe273';
        slider.oninput=()=>{this.volume=Number(slider.value);localStorage.setItem('mahjong-volume',String(this.volume));if(this.voice)this.voice.volume=this.volume;};
        const test=document.createElement('button');test.type='button';test.textContent='试听';test.setAttribute('aria-label','试听游戏声音');test.style.cssText=mute.style.cssText+';margin-top:12px;width:100%';
        test.onclick=()=>{this.unlock();this.muted=false;if(this.volume===0){this.volume=.7;slider.value='.7';localStorage.setItem('mahjong-volume','.7');}localStorage.setItem('mahjong-muted','0');refresh();this.voice?.pause();this.voice=null;this.queue=[];this.speak('peng');};
        const status=document.createElement('span');status.setAttribute('role','status');status.style.cssText='display:block;font-size:12px;margin-top:6px';this.audioStatus=status;
        speaker.onclick=()=>{this.unlock();panel.hidden=!panel.hidden;speaker.setAttribute('aria-expanded',String(!panel.hidden));};
        row.append(mute,slider);panel.append(title,row,test,status);root.append(speaker,panel);
        this.controls=root;this.soundButton=speaker;this.soundPanel=panel;refresh();this.layoutControls();
        document.addEventListener('pointerdown',this.closeSoundPanel,true);
        document.addEventListener('keydown',this.closeSoundPanel,true);
        window.addEventListener('resize',this.layoutControls);
        document.addEventListener('fullscreenchange',this.layoutControls);
        document.addEventListener('webkitfullscreenchange',this.layoutControls);
        this.schedule(this.layoutControls,.5);
    }
    onDestroy(): void { this.resetVoice();document.removeEventListener('visibilitychange',this.hideAudio);document.removeEventListener('pointerdown',this.closeSoundPanel,true);document.removeEventListener('keydown',this.closeSoundPanel,true);document.removeEventListener('pointerdown',this.unlock,true);document.removeEventListener('touchend',this.unlock,true);document.removeEventListener('keydown',this.unlock,true);document.removeEventListener('mahjong-button',this.buttonSound);window.removeEventListener('resize',this.layoutControls);document.removeEventListener('fullscreenchange',this.layoutControls);document.removeEventListener('webkitfullscreenchange',this.layoutControls);this.voice?.pause();this.controls?.remove();void this.context?.close(); }
    private speak(key: string): void {
        if (this.muted || !this.unlocked || document.hidden || this.chatActive) return;
        if (!this.eventBatch && Date.now()-this.lastSpeakAt>100) this.resetVoice();
        this.lastSpeakAt=Date.now();
        if (this.queue.length >= 2) this.queue.shift();
        this.queue.push({key,expires:Date.now()+2200});this.nextVoice();
    }
    private nextVoice(): void {
        if(this.voice || this.muted || !this.unlocked || !this.queue.length || this.chatActive)return;
        const item=this.queue.shift()!;
        if(item.expires<Date.now()||document.hidden){this.nextVoice();return;}
        const key=item.key,voice=this.player ?? new Audio(),generation=this.voiceGeneration;voice.src='sounds/'+encodeURIComponent(key)+'.wav';this.voice=voice;voice.volume=this.volume;
        const done=()=>{if(this.voice!==voice||generation!==this.voiceGeneration)return;this.voice=null;this.nextVoice();};voice.onended=done;voice.onerror=()=>{if(generation!==this.voiceGeneration)return;if(this.audioStatus)this.audioStatus.textContent='音频加载失败';done();};
        void voice.play().then(()=>{if(generation===this.voiceGeneration&&this.audioStatus)this.audioStatus.textContent='';}).catch(error=>{if(generation!==this.voiceGeneration)return;if(this.audioStatus)this.audioStatus.textContent=error.name==='NotAllowedError'?'请点试听':'播放失败';done();});
    }
    private effect(kind: 'tile'|'button'|'win'|'drawn'|'start'): void {
        if(this.muted||!this.unlocked||document.hidden||!this.context||this.context.state!=='running')return;
        const ctx=this.context,now=ctx.currentTime;
        const notes=kind==='win'?[523,659,784,1047]:kind==='drawn'?[392,330,262]:kind==='start'?[392,523,659]:kind==='button'?[660]:[1050,720];
        notes.forEach((frequency,i)=>{const oscillator=ctx.createOscillator(),gain=ctx.createGain(),at=now+i*(kind==='tile'?.025:.10);oscillator.type=kind==='tile'?'triangle':'sine';oscillator.frequency.setValueAtTime(frequency,at);gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(this.volume*.12*(this.chatActive?.2:1),at+.006);gain.gain.exponentialRampToValueAtTime(.0001,at+.10);oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(at);oscillator.stop(at+.12);});
    }
    playDraw(): void { this.effect('tile'); }
    playDiscard(tile?: Tile): void { this.effect('tile'); if(tile)this.speak(tile.suit+tile.rank); }
    playChi(): void { this.speak('chi'); }
    playPeng(): void { this.speak('peng'); }
    playGang(kind='gang'): void { this.speak(kind); }
    playRiichi(shape?: string): void { this.speak(['danDiao','duiDao','jiaHu','jue'].includes(shape??'')?shape!:'riichi'); }
    playWin(mode='win',won=true): void { this.speak(mode==='selfDraw'?'selfDraw':mode==='robbingGang'?'robbingGang':'win');this.effect(won?'win':'drawn'); }
    playDrawn(): void { this.speak('drawn');this.effect('drawn'); }
    playStart(): void { this.speak('start');this.effect('start'); }
    playButton(): void { this.effect('button'); }
    playEvents(events: any[], localId: string, serverNow: number): void {
        const fresh=events.filter(e=>!e.at||serverNow-e.at<=2200);
        const spoken=fresh.filter(e=>e.type!=='draw');
        if(!spoken.length){if(fresh.some(e=>e.type==='draw'))this.playDraw();return;}
        // A delayed poll may contain several turns: never narrate old turns over the current table.
        const latest=spoken[spoken.length-1],cutoff=(latest.at??0)-250;
        const current=spoken.filter(e=>(e.at??0)>=cutoff);
        const terminal=current.find(e=>e.type==='win'||e.type==='drawn'||e.type==='start');
        this.resetVoice();this.eventBatch=true;
        try{for(const e of terminal?[terminal]:current.slice(-2))this.playEvent(e,localId);}
        finally{this.eventBatch=false;}
    }
    playEvent(event: any, localId: string): void {
        switch(event.type){case 'start':this.playStart();break;case 'draw':this.playDraw();break;case 'discard':this.playDiscard(event.tile);break;case 'chi':this.playChi();break;case 'peng':this.playPeng();break;case 'anGang':case 'mingGang':case 'jiaGang':case 'supplement':this.playGang(event.type);break;case 'riichi':this.playRiichi(event.shape);break;case 'win':this.playWin(event.mode,event.playerId===localId);break;case 'drawn':this.playDrawn();break;}
    }
}
