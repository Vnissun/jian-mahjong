/** Small, cross-browser PCM WAV messages: no server transcoder or codec dependency. */
export function encodeVoiceWav(chunks: Float32Array[], sampleRate: number): ArrayBuffer {
    const length=chunks.reduce((n,c)=>n+c.length,0),input=new Float32Array(length);
    let offset=0;for(const chunk of chunks){input.set(chunk,offset);offset+=chunk.length;}
    const count=Math.min(160000,Math.floor(length*16000/sampleRate)),buffer=new ArrayBuffer(44+count*2),view=new DataView(buffer);
    const text=(at:number,s:string)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};
    text(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,count*2,true);
    const ratio=sampleRate/16000;
    for(let i=0;i<count;i++){const from=Math.floor(i*ratio),end=Math.max(from+1,Math.floor((i+1)*ratio));let sum=0;for(let j=from;j<end&&j<input.length;j++)sum+=input[j];const v=Math.max(-1,Math.min(1,sum/(end-from)));view.setInt16(44+i*2,Math.round(v*(v<0?32768:32767)),true);}
    return buffer;
}
