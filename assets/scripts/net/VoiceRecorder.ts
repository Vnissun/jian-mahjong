import { encodeVoiceWav } from './VoiceWav';
/** Each recording owns its resources, including permission requests that resolve after cancellation. */
export class VoiceRecorder {
    private context:AudioContext;
    private stream:MediaStream|null=null;
    private nodes:AudioNode[]=[];
    private chunks:Float32Array[]=[];
    private count=0;
    private cancelled=false;
    private active=false;
    constructor(){const AC=window.AudioContext||(window as any).webkitAudioContext;this.context=new AC();void this.context.resume().catch(()=>{});}
    async start():Promise<void>{
        const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}});
        if(this.cancelled){stream.getTracks().forEach(t=>t.stop());return;}this.stream=stream;const ctx=this.context;await ctx.resume();if(this.cancelled)return;
        const source=ctx.createMediaStreamSource(stream);this.nodes.push(source);
        const capture=(samples:Float32Array)=>{if(!this.active)return;const n=Math.min(samples.length,Math.max(0,ctx.sampleRate*10-this.count));if(n){this.chunks.push(samples.slice(0,n));this.count+=n;}};
        let node:AudioNode|null=null;
        if(ctx.audioWorklet)try{
            const url=URL.createObjectURL(new Blob(["class Capture extends AudioWorkletProcessor{process(inputs){const c=inputs[0]?.[0];if(c){const b=new Float32Array(c);this.port.postMessage(b,[b.buffer]);}return true;}}registerProcessor('voice-capture',Capture);"],{type:'application/javascript'}));
            try{await ctx.audioWorklet.addModule(url);}finally{URL.revokeObjectURL(url);}if(this.cancelled)return;
            const worklet=new AudioWorkletNode(ctx,'voice-capture');worklet.port.onmessage=e=>capture(e.data);node=worklet;
        }catch{if(this.cancelled)return;}
        if(!node){const legacy=ctx.createScriptProcessor(4096,1,1);legacy.onaudioprocess=e=>capture(e.inputBuffer.getChannelData(0));node=legacy;}
        const silence=ctx.createGain();silence.gain.value=0;this.nodes.push(node,silence);source.connect(node);node.connect(silence);silence.connect(ctx.destination);this.active=true;
    }
    stop():ArrayBuffer {
        this.cancelled=true;this.active=false;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;for(const n of this.nodes)n.disconnect();this.nodes=[];void this.context.close().catch(()=>{});
        const bytes=encodeVoiceWav(this.chunks,this.context.sampleRate);this.chunks=[];return bytes;
    }
}
