import { _decorator, Component, Node, Label, Graphics, Color, Button } from 'cc';
import { Player, Meld } from '../core/Player';
import { Tile, isSameType } from '../core/Tile';
import { MeldType, SeatWind } from '../core/Types';
import { TileView } from './TileView';
import { UIHelper, Palette } from './UIHelper';
import { sortedCopy } from '../game/HandUtils';
import { describeRiichi } from '../game/RiichiManager';
import { isMeldPublic } from '../game/TileVisibility';
import { TileResources } from './TileResources';
const {ccclass}=_decorator;
const ART='reference_ui/GameLayer/';
@ccclass('PlayerArea')
export class PlayerArea extends Component {
    handRow!:Node;
    meldsRow!:Node;
    discardsRow!:Node;
    nameLabel!:Label;
    scoreLabel!:Label;
    onTileClick?:(tile:Tile)=>void;
    onProfileClick?:(playerId:string)=>void;
    private playerId='';
    private avatarButton!:Button;
    private viewpoint=SeatWind.East;
    private human=false;
    private activeTurn=false;
    private selected?:number;
    private playable=new Set<number>();
    private tiles:TileView[]=[];
    private river:Tile[]=[];
    private profile!:Node;
    private dealer!:Node;
    private publicWait!:Label;
    configure(seat:SeatWind,river:Node):void {
        this.viewpoint=seat;this.discardsRow=river;
        this.handRow=UIHelper.node(this.node,'Hand',1100,118);
        this.meldsRow=UIHelper.node(this.node,'Melds',1100,118);
        // The reference places faces behind their hands; local player remains
        // at the bottom of every client's table, regardless of actual wind.
        const [x,y]=({east:[-564,-151],south:[558,46],west:[423,278],north:[-558,46]})[seat];
        this.profile=UIHelper.node(this.node.parent!,'PlayerProfile-'+seat,126,154,x,y);
        TileResources.image(this.profile,ART+'im_defaulthead_'+(seat===SeatWind.North||seat===SeatWind.West?'0':'1'),64,64,0,22);
        TileResources.image(this.profile,ART+'im_defaultheadbg',76,76,0,22);
        this.dealer=UIHelper.node(this.profile,'Dealer',30,30,33,52);TileResources.image(this.dealer,ART+'img_banker',30,30);
        this.nameLabel=UIHelper.label(this.profile,'Player-'+seat,'',122,25,0,-28,17);
        TileResources.image(this.profile,ART+'im_userscore',110,29,0,-54,'stretch');
        this.scoreLabel=UIHelper.label(this.profile,'Score-'+seat,'',104,26,0,-54,18,Palette.gold);
        this.publicWait=UIHelper.label(this.profile,'PublicWait','',145,30,0,-82,15,Palette.gold);
        const hit=UIHelper.node(this.profile,'AvatarHit',92,92,0,22);
        this.avatarButton=hit.addComponent(Button);this.avatarButton.transition=Button.Transition.NONE;
        hit.on(Button.EventType.CLICK,()=>{if(!this.human&&this.playerId)this.onProfileClick?.(this.playerId);});
    }
    private makeTile(parent:Node,tile:Tile,down:boolean,w:number,h:number,x:number,y:number,flat=false):TileView {
        const n=UIHelper.node(parent,'Tile-'+tile.id,w,h,x,y),tv=n.addComponent(TileView);
        tv.setTile(tile,down,flat,this.viewpoint);return tv;
    }
    private meldFaceDown(m:Meld,index:number,isLocal:boolean,reveal:boolean):boolean {
        if(reveal||isMeldPublic(m))return false;
        // Only the owner sees the upper, stacked tile of an ordinary concealed kong.
        const ownPreview=isLocal&&m.type===MeldType.AnGang&&m.tiles.length===4
            &&index===3&&m.tiles.every(t=>isSameType(t,m.tiles[0]));
        return !ownPreview;
    }
    refresh(p:Player,isHuman:boolean,selected?:number,drawnId?:number,displaySeat=p.seat,reveal=false):void {
        this.human=isHuman;this.selected=selected;
        this.playerId=p.id;this.avatarButton.interactable=!isHuman;
        this.nameLabel.string=p.name;
        this.nameLabel.color=this.activeTurn?Palette.gold:Palette.text;
        this.scoreLabel.string=(p.score>=0?'+':'')+p.score;
        this.dealer.active=p.state.isDealer;
        this.publicWait.string=describeRiichi(p);
        UIHelper.clear(this.handRow);UIHelper.clear(this.meldsRow);this.tiles=[];
        const drawn=isHuman?p.hand.find(t=>t.id===drawnId):undefined;
        const hand=sortedCopy(p.hand.filter(t=>t.id!==drawn?.id));if(drawn)hand.push(drawn);
        const side=displaySeat===SeatWind.South||displaySeat===SeatWind.North;
        const hidden=!isHuman&&!p.state.isWon&&!reveal;
        const groupSlots=p.melds.map(m=>m.tiles.length===4&&!m.specialGang?3:m.tiles.length);
        if(!side){
            const maxWidth=isHuman?1080:760,handStep=isHuman?72:45,groupStep=isHuman?50:34;
            const span=hand.length*handStep+groupSlots.reduce((n,c)=>n+c*groupStep+12,0)+(drawn?14:0);
            const fit=Math.min(1,maxWidth/Math.max(1,span));
            let cursor=-span*fit/2;
            const direction=displaySeat===SeatWind.West?-1:1;
            const point=(x:number)=>direction*x;
            p.melds.forEach((m,group)=>{
                const step=groupStep*fit;
                m.tiles.forEach((t,i)=>{
                    const stacked=m.tiles.length===4&&!m.specialGang&&i===3,slot=stacked?1:i;
                    const y=stacked?12:0;
                    this.makeTile(this.meldsRow,t,this.meldFaceDown(m,i,isHuman,reveal),step-1,(step-1)*118/76,point(cursor+(slot+.5)*step),y-(!isHuman?0:15),true);
                });cursor+=(groupSlots[group]*groupStep+12)*fit;
            });
            hand.forEach((t,i)=>{
                const w=(isHuman?71:44)*fit,h=w*118/76;
                const x=point(cursor+(i+.5)*handStep*fit+(drawn&&i===hand.length-1?14*fit:0));
                const tv=this.makeTile(this.handRow,t,hidden,w,h,x,0,!isHuman&&!hidden);
                if(isHuman)tv.onClick=tile=>{if(tile)this.onTileClick?.(tile);};this.tiles.push(tv);
            });
        }else{
            const handStep=hidden?27:54,groupStep=28,gap=12;
            const stackedTiles:Node[]=[];
            const span=hand.length*handStep+groupSlots.reduce((n,c)=>n+c*groupStep+gap,0);
            const fit=Math.min(1,405/Math.max(1,span+(hidden?40:0))),sign=displaySeat===SeatWind.North?-1:1;
            let cursor=-span*fit/2;
            p.melds.forEach((m,group)=>{
                m.tiles.forEach((t,i)=>{
                    const stacked=m.tiles.length===4&&!m.specialGang&&i===3,slot=stacked?1:i;
                    const tv=this.makeTile(this.meldsRow,t,this.meldFaceDown(m,i,isHuman,reveal),54*fit,51.3*fit,stacked?(displaySeat===SeatWind.South?5:-5):0,sign*(cursor+(slot+.5)*groupStep*fit)+(stacked?9:0),true);
                    if(stacked)stackedTiles.push(tv.node);
                });cursor+=(groupSlots[group]*groupStep+gap)*fit;
            });
            hand.forEach((t,i)=>{
                const tv=this.makeTile(this.handRow,t,hidden,hidden?28*fit:54*fit,hidden?67.2*fit:51.3*fit,0,sign*(cursor+(i+.5)*handStep*fit),!hidden);this.tiles.push(tv);
            });
            for(const row of [this.handRow,this.meldsRow])row.children.slice().sort((a,b)=>b.position.y-a.position.y).forEach((n,i)=>n.setSiblingIndex(i));
            stackedTiles.forEach(n=>n.setSiblingIndex(this.meldsRow.children.length-1));
        }
        this.river=p.discards.slice();this.drawRiver();this.applySelection();this.paintTurn();
    }
    setPlayable(ids:number[],selected?:number):void {this.playable=new Set(ids);this.selected=selected;this.applySelection();}
    inspectTile(id?:number):void {this.selected=id;this.applySelection();}
    private applySelection():void {
        for(const tv of this.tiles){tv.setHighlight(this.human&&this.playable.has(tv.tile!.id));tv.setSelected(this.human&&tv.tile?.id===this.selected);if(this.human)tv.node.setPosition(tv.node.position.x,tv.tile?.id===this.selected?16:0);}
    }
    setActive(on:boolean):void {this.activeTurn=on;if(this.nameLabel)this.nameLabel.color=on?Palette.gold:Palette.text;this.paintTurn();}
    private paintTurn():void {
        if(!this.profile)return;
        const g=this.profile.getComponent(Graphics)??this.profile.addComponent(Graphics);g.clear();
        if(this.activeTurn){g.strokeColor=new Color(255,222,84);g.lineWidth=2;g.roundRect(-40,-17,80,80,10);g.stroke();}
    }
    addDiscardTile(tile:Tile):void {if(!this.river.some(t=>t.id===tile.id)){this.river.push(tile);this.drawRiver();}}
    clearDiscards():void {this.river=[];if(this.discardsRow)UIHelper.clear(this.discardsRow);}
    private drawRiver():void {
        UIHelper.clear(this.discardsRow);
        const side=this.viewpoint===SeatWind.South||this.viewpoint===SeatWind.North;
        const perLine=side?11:Math.max(12,Math.ceil(this.river.length/3));
        const lines=Math.ceil(this.river.length/perLine);
        const w=side?54:Math.min(40,480/perLine),h=side?51.3:w*118/76;
        const sideStep=Math.min(56,174/Math.max(1,lines)),horizontalStep=h*.77;
        this.river.forEach((t,i)=>{
            const col=i%perLine,row=Math.floor(i/perLine);
            let x:number,y:number;
            if(side){const sign=this.viewpoint===SeatWind.North?1:-1;x=sign*row*sideStep;y=(this.viewpoint===SeatWind.North?1:-1)*(165-col*32);}
            else{x=(col-(perLine-1)/2)*w;y=(this.viewpoint===SeatWind.East?1:-1)*row*horizontalStep;}
            this.makeTile(this.discardsRow,t,false,w,h,x,y,true);
        });
        this.discardsRow.children.slice().sort((a,b)=>b.position.y-a.position.y).forEach((n,i)=>n.setSiblingIndex(i));
    }
    addMeld(_m:Meld,_human:boolean):void {}
    get isActive():boolean {return this.activeTurn;}
    get isHuman():boolean {return this.human;}
}
