import { _decorator, Component, Node, BlockInputEvents } from 'cc';
import { RoomConfig } from '../core/Room';
import { BASE_SCORE_OPTIONS, CAP_OPTIONS, ROUND_WIND_OPTIONS, DEFAULT_ROOM_CONFIG } from '../config/GameConfig';
import { UIHelper, Palette } from './UIHelper';
import { TileResources } from './TileResources';
const {ccclass}=_decorator;
@ccclass('RoomSetupPanel')
export class RoomSetupPanel extends Component {
    onCreateFriend?:(config:RoomConfig)=>void;
    onJoinFriend?:()=>void;
    private config={...DEFAULT_ROOM_CONFIG};
    private startGame?:(config:RoomConfig)=>void;
    private groups:{nodes:Node[];values:(number|boolean)[];key:keyof RoomConfig}[]=[];
    onLoad():void {
        const bg=UIHelper.backdrop(this.node,'Lobby');bg.addComponent(BlockInputEvents);
        const brand=UIHelper.label(bg,'Brand','集 安 麻 将',720,66,0,284,48,Palette.gold);brand.fontFamily='KaiTi';brand.isBold=true;
        UIHelper.label(bg,'Subtitle','好友同桌 · 集安玩法',650,28,0,239,20);
        const card=UIHelper.paper(bg,'Settings',1000,410,0,6);
        UIHelper.label(card,'SettingsTitle','房 间 设 置',400,38,0,147,25,Palette.paper);
        UIHelper.label(card,'Welcome','开一桌好牌\n聚一桌好友',310,100,-310,74,31,Palette.ink);
        for(const [i,code] of ['45','46','47'].entries()){
            const n=TileResources.image(card,'reference_ui/GameLayer/Mahjong/2/handmah_'+code,72,112,-390+i*77,-64);if(n)n.angle=(1-i)*6;
        }
        this.option(card,'底分','baseScore',BASE_SCORE_OPTIONS,90);
        this.option(card,'满贯','cap',CAP_OPTIONS,40);
        this.option(card,'封圈','totalRoundWinds',ROUND_WIND_OPTIONS,-10);
        this.option(card,'七小对','allowQiXiaoDui',[true,false],-60);
        this.option(card,'报听对踢','riichiDuel',[true,false],-110);
        UIHelper.label(card,'Rules','固定可吃牌 · 报听锁定听口 · 对踢开启双方相乘，关闭双方取高',650,28,135,-158,14,Palette.ink);
        UIHelper.button(bg,'CreateFriend','好友开房',260,63,-298,-258,()=>this.onCreateFriend?.({...this.config}));
        UIHelper.button(bg,'JoinFriend','加入房间',260,63,0,-258,()=>this.onJoinFriend?.());
        UIHelper.button(bg,'Start','单机练习',260,63,298,-258,()=>{this.node.active=false;this.startGame?.({...this.config});},Palette.selected);
        UIHelper.label(bg,'Help','报听自摸展示5秒后自动胡，期间可操作；别人点炮可选胡或过',1060,27,0,-320,17);
    }
    private option(parent:Node,title:string,key:keyof RoomConfig,values:readonly(number|boolean)[],y:number):void {
        UIHelper.label(parent,'Title-'+key,title,115,40,-96,y,20,Palette.ink);
        const step=Math.min(82,455/values.length);
        const nodes=values.map((v,i)=>UIHelper.button(parent,key+'-'+v,typeof v==='boolean'?(v?'开启':'关闭'):key==='cap'&&v===0?'无限':String(v),step-8,38,4+i*step,y,()=>{(this.config as any)[key]=v;this.refresh();}));
        this.groups.push({nodes,values:values.slice(),key});
    }
    private refresh():void {for(const g of this.groups)g.nodes.forEach((n,i)=>UIHelper.paint(n,this.config[g.key]===g.values[i]?Palette.selected:Palette.button,8,this.config[g.key]===g.values[i]?Palette.gold:Palette.line));}
    show(callback:(config:RoomConfig)=>void):void {this.startGame=callback;this.config={...DEFAULT_ROOM_CONFIG};this.node.active=true;this.refresh();}
    hide():void {this.node.active=false;}
}
