import { _decorator, Component, Node, Graphics, Color, UIOpacity } from 'cc';
import { UIHelper, Palette } from './UIHelper';
import { TileResources } from './TileResources';

type Flight = {node:Node; sprite:Node; trail:Graphics; impact:Node; opacity:UIOpacity;
    start:{x:number;y:number}; end:{x:number;y:number}; elapsed:number; id:string};
const { ccclass } = _decorator;

/** Cosmetic only: positions use the viewer's rotated seats, never game state. */
@ccclass('ThrowEffects')
export class ThrowEffects extends Component {
    private flights:Flight[]=[];
    play(id:string,start:{x:number;y:number},end:{x:number;y:number},sender:string):void {
        if(this.flights.length>=12)this.flights.shift()!.node.destroy();
        const node=UIHelper.node(this.node,'Throw-'+id,1,1);
        const trail=UIHelper.node(node,'Trail',1,1).addComponent(Graphics);
        const sprite=UIHelper.node(node,'Projectile',76,76,start.x,start.y);
        if(!TileResources.image(sprite,'social/'+id,76,76)){
            UIHelper.label(sprite,'Fallback',({poop:'💩',tomato:'🍅',egg:'🥚',slipper:'🩴',bomb:'💣'})[id],76,76,0,0,56);
        }
        const impact=UIHelper.node(node,'Impact',150,150,end.x,end.y);
        const g=impact.addComponent(Graphics);
        const color=({poop:new Color(121,69,32,225),tomato:new Color(218,45,29,230),
            egg:new Color(255,210,51,235),slipper:new Color(71,191,210,220),bomb:new Color(255,139,34,235)})[id];
        g.fillColor=color;
        // Distinct splashes, with no texture downloads or external animation runtime.
        for(let i=0;i<10;i++){
            const angle=i*Math.PI/5,inner=i%2?26:38;
            g.ellipse(Math.cos(angle)*inner,Math.sin(angle)*inner,8+i%3*3,6+i%4*2);g.fill();
        }
        g.circle(0,0,id==='slipper'?22:31);g.fill();
        if(id==='egg'){g.fillColor=new Color(255,250,221,240);g.ellipse(-16,7,28,21);g.fill();g.fillColor=color;g.circle(7,-2,17);g.fill();}
        if(id==='bomb'){
            g.strokeColor=new Color(255,234,118);g.lineWidth=5;
            for(let i=0;i<8;i++){const a=i*Math.PI/4;g.moveTo(Math.cos(a)*41,Math.sin(a)*41);g.lineTo(Math.cos(a)*62,Math.sin(a)*62);g.stroke();}
        }
        if(id==='slipper'){g.strokeColor=new Color(255,255,230);g.lineWidth=4;for(let i=0;i<3;i++){g.moveTo(-16+i*12,-18);g.lineTo(-8+i*12,20);g.stroke();}}
        TileResources.image(impact,'social/'+id,48,48,0,5);
        if(id==='poop'||id==='tomato')for(let i=0;i<3;i++){
            const puff=UIHelper.node(impact,'Stink-'+i,1,1,-26+i*26,20+i%2*6),s=puff.addComponent(Graphics);
            s.strokeColor=new Color(167,204,93,220);s.lineWidth=3;s.moveTo(0,0);s.bezierCurveTo(-14,10,14,19,0,31);s.stroke();
        }
        UIHelper.label(impact,'From',sender+'送来',172,24,0,-70,15,Palette.gold);
        const opacity=impact.addComponent(UIOpacity);impact.active=false;
        this.flights.push({node,sprite,trail,impact,opacity,start,end,elapsed:0,id});
    }
    update(dt:number):void {
        for(let i=this.flights.length-1;i>=0;i--){
            const f=this.flights[i];f.elapsed+=dt;
            if(f.elapsed>=2.6){f.node.destroy();this.flights.splice(i,1);continue;}
            if(f.elapsed<.85){
                const t=f.elapsed/.85,x=f.start.x+(f.end.x-f.start.x)*t,
                    y=f.start.y+(f.end.y-f.start.y)*t+Math.sin(t*Math.PI)*150;
                f.sprite.setPosition(x,y);f.sprite.angle=t*540;
                const scale=.65+Math.sin(t*Math.PI)*.5;f.sprite.setScale(scale,scale,1);
                f.trail.clear();f.trail.fillColor=new Color(255,231,159,90);
                for(let j=1;j<=4;j++){const p=Math.max(0,t-j*.035);f.trail.circle(f.start.x+(f.end.x-f.start.x)*p,f.start.y+(f.end.y-f.start.y)*p+Math.sin(p*Math.PI)*150,6-j);f.trail.fill();}
            }else{
                f.sprite.active=false;f.trail.clear();f.impact.active=true;
                const t=f.elapsed-.85,scale=t<.18?.3+t/.18*.9:t<.32?1.2-(t-.18)/.14*.2:1;
                f.impact.setScale(scale,scale,1);
                f.impact.setPosition(f.end.x+Math.sin(t*65)*Math.max(0,1-t/.35)*5,f.end.y+(f.id==='poop'||f.id==='tomato'?Math.max(0,t-.5)*8:0));
                f.opacity.opacity=255*Math.min(1,(2.6-f.elapsed)/.65);
            }
        }
    }
    clear():void {for(const f of this.flights)f.node.destroy();this.flights=[];}
    onDestroy():void {this.clear();}
}
