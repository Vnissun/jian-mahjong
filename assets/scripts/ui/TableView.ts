import { _decorator, Component, Node, Label, Color, UITransform } from 'cc';
import { SeatWind } from '../core/Types';
import { Tile, createTile } from '../core/Tile';
import { RiichiType } from '../core/Types';
import { describeRiichi } from '../game/RiichiManager';
import { countVisibleCopies } from '../game/TileVisibility';
import { GameSession, SessionPhase } from '../game/GameSession';
import { describeCap } from '../config/GameConfig';
import { getRemainingCount, getKongRemainingCount } from '../game/WallGenerator';
import { PlayerArea } from './PlayerArea';
import { UIHelper, Palette } from './UIHelper';
import { TileResources } from './TileResources';
import { TileView } from './TileView';
import { ThrowEffects } from './ThrowEffects';
const { ccclass } = _decorator;
@ccclass('TableView')
export class TableView extends Component {
    private areas = new Map<SeatWind, PlayerArea>();
    private status!: Label;
    private remaining!: Label;
    private messageLabel!: Label;
    private direction!: Label;
    private tileInfo!: Label;
    private waitInfo!: Label;
    private onlineLabel!: Label;
    private wallView!: Node;
    private wallCounts = "";
    private inspected: Tile | null = null;
    private discardMarker!: Node;
    private gangClaimView!: Node;
    private gangClaimKey = '';
    private chatBubbles=new Map<SeatWind,{node:Node;hide:()=>void}>();
    private throwEffects:ThrowEffects|null=null;
    clearChat():void {for(const bubble of this.chatBubbles.values()){this.unschedule(bubble.hide);bubble.node.destroy();}this.chatBubbles.clear();this.throwEffects?.clear();}
    showThrow(from:SeatWind,to:SeatWind,id:string,sender:string):void {
        if(!this.throwEffects)this.throwEffects=UIHelper.node(this.node,'ThrowEffects',1280,720).addComponent(ThrowEffects);
        this.throwEffects.node.setSiblingIndex(this.node.children.length-1);
        const point=(seat:SeatWind)=>{const n=this.node.getChildByName('PlayerProfile-'+this.displaySeat(seat));return n?{x:n.position.x,y:n.position.y+22}:null;};
        const start=point(from),end=point(to);if(start&&end)this.throwEffects.play(id,start,end,sender);
    }
    showChat(seat:SeatWind,text:string,emoji=false,fromName?:string):void {
        const old=this.chatBubbles.get(seat);if(old){this.unschedule(old.hide);old.node.destroy();}
        const view=this.displaySeat(seat),[x,y]=({east:[-350,-114],south:[445,92],west:[215,251],north:[-445,92]})[view];
        const n=UIHelper.node(this.node,'Chat-'+seat,emoji?112:260,emoji?90:76,x,y);
        UIHelper.paint(n,new Color(255,240,193,248),16,new Color(189,147,68));
        UIHelper.label(n,'Text',text,emoji?100:242,emoji?78:66,0,0,emoji?49:21,Palette.ink);
        if(fromName)UIHelper.label(n,'From',fromName+'送来',104,22,0,-32,13,Palette.ink);
        const hide=()=>{n.destroy();this.chatBubbles.delete(seat);};this.chatBubbles.set(seat,{node:n,hide});this.scheduleOnce(hide,emoji?3.5:5);
    }
    localSeat: SeatWind = SeatWind.East;
    private displaySeat(seat: SeatWind): SeatWind {
        const order = [SeatWind.East, SeatWind.South, SeatWind.West, SeatWind.North];
        return order[(order.indexOf(seat) - order.indexOf(this.localSeat) + 4) % 4];
    }
    onHumanTileClick?: (tile: Tile) => void;
    onProfileClick?: (playerId:string) => void;
    private turnLights: Node[] = [];
    onLoad(): void {
        UIHelper.backdrop(this.node,'Felt');
        TileResources.image(this.node,'reference_ui/GameLayer/bg_center',507,506);
        this.wallView=UIHelper.node(this.node,'TileWall',1000,500);
        const lightPositions=[[0,-98,280,134],[-98,0,134,280],[0,98,280,134],[98,0,134,280]];
        for(let i=0;i<4;i++){
            const [x,y,w,h]=lightPositions[i];
            const light=TileResources.image(this.node,'reference_ui/GameLayer/time'+i,w,h,x,y)!;light.active=false;this.turnLights.push(light);
        }
        const centre=UIHelper.node(this.node,'Compass',132,131);
        TileResources.image(centre,'reference_ui/GameLayer/time_bg',132,131);
        this.direction=UIHelper.label(centre,'Turn','东 · 行动',120,26,0,91,18,Palette.gold);
        this.remaining=UIHelper.label(centre,'Remaining','',82,68,0,0,19,Palette.gold);
        UIHelper.label(this.node,'Title','集 安 麻 将',230,38,-453,332,25,Palette.gold);
        this.status=UIHelper.label(this.node,'Status','',690,22,8,344,16);
        this.onlineLabel=UIHelper.label(this.node,'OnlineStatus','',730,22,0,319,16,Palette.gold);
        this.messageLabel=UIHelper.label(this.node,'Message','',1050,22,30,-347,20,Palette.gold);
        const positions:[SeatWind,number,number,number,number][]=[
            [SeatWind.East,36,-289,0,-172],[SeatWind.West,0,266,0,166],
            [SeatWind.South,474,24,330,10],[SeatWind.North,-474,24,-330,10]
        ];
        for(const [seat,x,y,rx,ry] of positions){
            const n=UIHelper.node(this.node,'Seat-'+seat,1100,120,x,y);
            const river=UIHelper.node(this.node,'River-'+seat,480,370,rx,ry);
            const area=n.addComponent(PlayerArea);area.configure(seat,river);this.areas.set(seat,area);
            area.onProfileClick=id=>this.onProfileClick?.(id);
        }
        this.areas.get(SeatWind.East)!.onTileClick=t=>this.onHumanTileClick?.(t);
        const info=UIHelper.node(this.node,'TileInfo',920,32,12,-217);
        UIHelper.paint(info,new Color(0,40,24,145),8);
        this.tileInfo=UIHelper.label(info,'Selected','点击手牌查看余牌数',900,30,0,0,23,Palette.gold);
        this.waitInfo=UIHelper.label(info,'Waits','',900,16,0,-8,13,Palette.muted);
        this.waitInfo.node.active=false;
        this.discardMarker=UIHelper.node(this.node,'LastDiscardMarker',20,30);
        TileResources.image(this.discardMarker,'reference_ui/GameLayer/img_sign',20,30);
        this.discardMarker.active=false;
        this.gangClaimView=UIHelper.node(this.node,'PendingGangClaim',100,120,127,0);
        this.gangClaimView.active=false;
    }
    showOnlineStatus(text: string): void { this.onlineLabel.string = text; }
    refreshAll(s: GameSession, selected?: number): void {
        const reveal = s.phase === SessionPhase.Settled || s.phase === SessionPhase.Finished
            || s.players.some(p => p.state.isWon) || s.players.every(p => p.state.isDrawn);
        for (const p of s.players)
            this.areas.get(this.displaySeat(p.seat))?.refresh(p, p.seat === this.localSeat, selected, p.seat === s.currentSeat ? s.lastDrawn?.id : undefined, this.displaySeat(p.seat), reveal);
        const addition=s.pendingRobbingGang,key=addition?addition.gangPlayer.id+':'+addition.gangTile.id:'';
        if(key!==this.gangClaimKey){
            this.gangClaimKey=key;UIHelper.clear(this.gangClaimView);this.gangClaimView.active=!!addition;
            if(addition){
                UIHelper.node(this.gangClaimView,'Tile',48,74,0,12).addComponent(TileView).setTile(addition.gangTile,false);
                UIHelper.label(this.gangClaimView,'Kind',addition.supplementMeldIndex!==undefined?'补毛':'加杠',110,28,0,-42,19,Palette.gold);
            }
        }
        const river=s.lastDiscarder?this.getArea(s.lastDiscarder.seat)?.discardsRow:undefined;
        const last=s.lastDiscard?river?.getChildByName('Tile-'+s.lastDiscard.id):null;
        this.discardMarker.active=!!last;
        if(last&&river)this.discardMarker.setPosition(river.position.x+last.position.x,river.position.y+last.position.y+last.getComponent(UITransform)!.height/2+9);
        this.status.string = '第 ' + (s.room.completedWinds + 1) + ' / ' + s.config.totalRoundWinds + ' 封圈 · 底分 ' + s.config.baseScore + ' · 满贯 ' + describeCap(s.config.cap) + ' · 可吃 · 七小对' + (s.allowQi ? '开' : '关') + ' · 对踢' + (s.config.riichiDuel ? '开' : '关');
        this.refreshWall(getRemainingCount(s.wall), getKongRemainingCount(s.wall));
        this.remaining.string = '余牌 ' + getRemainingCount(s.wall) + '\n补牌 ' + getKongRemainingCount(s.wall);
        if (this.inspected && !s.getPlayer(this.localSeat).hand.some(t => t.id === this.inspected!.id))
            this.inspected = null;
        this.updateTileInfo(s);
    }
    private refreshWall(normal: number, supplement: number): void {
        const key=normal+':'+supplement;if(key===this.wallCounts)return;this.wallCounts=key;
        UIHelper.clear(this.wallView);
        const present=(index:number)=>index<122?index>=122-normal:index<122+supplement;
        // Compact two-high stacks use only the reference's concealed tile art.
        for(let stack=0;stack<68;stack++){
            const count=Number(present(stack*2))+Number(present(stack*2+1));if(!count)continue;
            const edge=Math.floor(stack/17),slot=stack%17,along=(slot-8)*18;
            const n=UIHelper.node(this.wallView,'WallStack-'+stack,22,22);
            if(edge===0)n.setPosition(along,-194);
            else if(edge===1)n.setPosition(423,10+(slot-8)*19);
            else if(edge===2)n.setPosition(-along,213);
            else n.setPosition(-423,10-(slot-8)*19);
            for(let level=0;level<count;level++)TileResources.image(n,'reference_ui/GameLayer/Mahjong/'+(edge%2?'1':'2')+'/mingmah_00',edge%2?24:17,edge%2?23:26,0,level*4);
        }
        this.wallView.children.slice().sort((a,b)=>b.position.y-a.position.y).forEach((n,i)=>n.setSiblingIndex(i));
    }

    private updateTileInfo(session: GameSession): void {
        const owner = session.getPlayer(this.localSeat);
        if (this.inspected) {
            const count = countVisibleCopies(session.players, owner, this.inspected);
            this.tileInfo.string = this.inspected.name + ' · 余牌 ' + count.remaining + ' 张';
        }
        else
            this.tileInfo.string = '点击手牌查看余牌数';
        if (owner.state.riichi !== RiichiType.None) {
            const waits = owner.state.riichiWaits.map((kind, i) => {
                const tile = createTile(-1 - i, kind.suit, kind.rank), count = countVisibleCopies(session.players, owner, tile);
                return tile.name + ' ' + count.remaining + ' 张';
            });
            this.tileInfo.string += ' · 听牌：' + waits.join(' / ');
        }
    }
    inspectTile(session: GameSession, tile: Tile): void { this.inspected = tile; this.areas.get(SeatWind.East)?.inspectTile(tile.id); this.updateTileInfo(session); }
    clearInspection(): void { this.inspected = null; this.areas.get(SeatWind.East)?.inspectTile(); }
    showMessage(text: string, duration?: number): void {
        this.unschedule(this.hideMessage);
        this.messageLabel.string = text.startsWith('轮到你：')?'轮到你出牌':text.startsWith('已报听 · 自动打出')?'已报听 · 自动出牌':text;
        if (duration && duration < 90)
            this.scheduleOnce(this.hideMessage, duration);
    }
    private hideMessage(): void { this.messageLabel.string = ''; }
    highlightTurn(seat: SeatWind): void {
        this.areas.forEach((a, s) => a.setActive(s === this.displaySeat(seat)));
        const index=({east:0,north:1,west:2,south:3})[this.displaySeat(seat)];
        this.turnLights.forEach((n,i)=>n.active=i===index);
        this.direction.string = ({ [SeatWind.East]: '东', [SeatWind.South]: '南', [SeatWind.West]: '西', [SeatWind.North]: '北' })[seat] + ' · 行动';
    }
    setPlayable(ids: number[], selected?: number): void { this.areas.get(SeatWind.East)?.setPlayable(ids, selected); }
    clearAllDiscards(): void { this.areas.forEach(a => a.clearDiscards()); }
    addDiscard(seat: SeatWind, tile: Tile): void { this.areas.get(this.displaySeat(seat))?.addDiscardTile(tile); }
    getArea(seat: SeatWind): PlayerArea | null { return this.areas.get(this.displaySeat(seat)) ?? null; }
}
