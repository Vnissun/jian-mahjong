import { _decorator, Component, Node, EditBox, Label, BlockInputEvents } from 'cc';
import { UIHelper, Palette } from './UIHelper';
import { describeCap } from '../config/GameConfig';
import { TileResources } from './TileResources';
const { ccclass } = _decorator;
@ccclass('FriendRoomPanel')
export class FriendRoomPanel extends Component {
    onEnter?: (name: string, code?: string) => void;
    onLeave?: () => void;
    onReady?: () => void;
    onStart?: () => void;
    onAddBot?: () => void;
    onRemoveBot?: (memberId: string) => void;
    private entry!: Node;
    private waiting!: Node;
    private nickname!: EditBox;
    private codeInput!: EditBox;
    private invite!: EditBox;
    private message!: Label;
    private memberRows: {seat: string; label: Label; remove: Node; memberId: string}[] = [];
    private addBot!: Node;
    private roomTitle!: Label;
    private settings!: Label;
    private ready!: Node;
    private startButton!: Node;
    private join = false;
    private input(parent: Node, name: string, text: string, placeholder: string, x: number, y: number, w=480): EditBox {
        const node=UIHelper.node(parent,name,w,48,x,y); UIHelper.paint(node,Palette.paper,9,Palette.line);
        const edit=node.addComponent(EditBox); UIHelper.clear(node); edit.textLabel=UIHelper.label(node,'Text','',w-22,44,0,0,20,Palette.ink); edit.placeholderLabel=UIHelper.label(node,'Placeholder',placeholder,w-22,44,0,0,18,Palette.ink); edit.string=text;edit.maxLength=name==='Invite'?512:12;edit.inputMode=EditBox.InputMode.SINGLE_LINE;return edit;
    }
    onLoad(): void {
        const bg=UIHelper.backdrop(this.node,'FriendRoom');bg.addComponent(BlockInputEvents);
        UIHelper.paper(bg,'RoomSurface',1080,510,0,2);
        UIHelper.label(bg,'Brand','好友房 · 集安麻将',900,60,0,280,38,Palette.gold);
        this.entry=UIHelper.node(bg,'Entry',980,450,0,0);
        UIHelper.label(this.entry,'EntryTitle','好友入座',800,40,0,202,27,Palette.paper);
        UIHelper.label(this.entry,'NameTitle','你的昵称',180,40,-330,102,22,Palette.ink);
        this.nickname=this.input(this.entry,'Nickname',localStorage.getItem('mahjong-nickname')||'','输入昵称（最多12字）',50,102);
        UIHelper.label(this.entry,'CodeTitle','六位房间号',180,40,-330,30,22,Palette.ink);
        this.codeInput=this.input(this.entry,'Code','','好友发来的六位房间号',50,30);
        UIHelper.label(this.entry,'Hint','真人准备后由房主开局，空位可用机器人补齐\n开局前房主可添加或移除机器人，刷新页面可自动重连',860,70,0,-40,21,Palette.ink);
        UIHelper.button(this.entry,'Enter','确认进入',220,54,0,-150,()=>{const name=this.nickname.string.trim(),code=this.codeInput.string.trim();if(!name||name.length>12){this.setMessage('请输入 1–12 字昵称');return;}if(this.join&&!/^\d{6}$/.test(code)){this.setMessage('请输入六位数字房间号');return;}localStorage.setItem('mahjong-nickname',name);this.setMessage('正在连接…');this.onEnter?.(name,this.join?code:undefined);},Palette.selected);
        this.waiting=UIHelper.node(bg,'Waiting',1100,500,0,0);
        this.roomTitle=UIHelper.label(this.waiting,'RoomCode','',1000,48,0,205,30,Palette.paper);
        this.settings=UIHelper.label(this.waiting,'Settings','',1050,35,0,141,18,Palette.ink);
        for (const [i,seat] of ['east','south','west','north'].entries()) {
            const strip=UIHelper.node(this.waiting,'MemberCard-'+seat,1000,40,0,88-i*42);UIHelper.paint(strip,Palette.button,8);
            TileResources.image(strip,'reference_ui/GameLayer/im_defaulthead_'+(i%2),34,34,-470,0);
            const row={seat,label:UIHelper.label(this.waiting,'Member-'+seat,'',830,38,-80,88-i*42,23),remove:null! as Node,memberId:''};
            row.remove=UIHelper.button(this.waiting,'RemoveBot-'+seat,'移除机器人',142,34,435,88-i*42,()=>this.onRemoveBot?.(row.memberId));
            this.memberRows.push(row);
        }
        this.addBot=UIHelper.button(this.waiting,'AddBot','添加机器人',200,38,0,-78,()=>this.onAddBot?.());
        this.invite=this.input(this.waiting,'Invite','','邀请链接',-75,-130,760);
        UIHelper.button(this.waiting,'Copy','复制邀请',180,48,405,-130,()=>void this.copyInvite());
        this.ready=UIHelper.button(this.waiting,'Ready','准备',200,54,-130,-198,()=>this.onReady?.(),Palette.selected);
        this.startButton=UIHelper.button(this.waiting,'StartRoom','房主开局',200,54,130,-198,()=>this.onStart?.());
        this.message=UIHelper.label(bg,'Message','',1100,36,0,-292,19,Palette.gold);
        UIHelper.button(bg,'Back','退出房间 / 返回',240,44,0,-337,()=>this.onLeave?.());this.node.active=false;
    }
    showEntry(join: boolean, code=''): void {this.join=join;this.node.active=true;this.entry.active=true;this.waiting.active=false;this.codeInput.node.active=join;this.entry.getChildByName('CodeTitle')!.active=join;this.codeInput.string=code;this.setMessage(join?'输入昵称和房间号加入好友':'使用大厅所选规则创建房间');}
    showRoom(state: any): void {
        this.node.active=true;this.entry.active=false;this.waiting.active=true;
        this.roomTitle.string='房间 '+state.code+' · '+state.members.length+' / 4 人';
        this.settings.string='底分 '+state.config.baseScore+' · 满贯 '+describeCap(state.config.cap)+' · '+state.config.totalRoundWinds+' 封圈 · 可吃 · 七小对'+(state.config.allowQiXiaoDui?'开':'关')+' · 报听对踢'+(state.config.riichiDuel?'开':'关');
        const directions:any={east:'东',south:'南',west:'西',north:'北'};
        const isOwner=state.ownerId===state.localId;
        for(const row of this.memberRows){
            const m=state.members.find(m=>m.seat===row.seat);row.memberId=m?.id??'';
            row.label.string=directions[row.seat]+'  '+(m?m.name+(m.id===state.localId?'（你）':'')+(m.id===state.ownerId?' · 房主':'')+'  '+(m.isBot?'机器人 · 自动准备':m.autoPlay?'离线托管':!m.connected?'离线':m.ready?'已准备':'未准备'):'等待加入');
            row.remove.active=isOwner&&!!m?.isBot;
        }
        this.addBot.active=isOwner&&state.members.length<4;
        const url=new URL(window.location.href);url.search='';url.hash='';url.searchParams.set('room',state.code);this.invite.string=url.toString();
        const self=state.members.find(m=>m.id===state.localId);this.ready.getChildByName('Label')!.getComponent(Label)!.string=self?.ready?'取消准备':'准备';
        this.startButton.active=state.ownerId===state.localId;
        this.startButton.getChildByName('Label')!.getComponent(Label)!.string=state.members.length<4?'补齐机器人开局':'房主开局';
        this.setMessage('真人全部准备后房主开局；空位自动补齐机器人');
    }
    setMessage(text: string): void {this.message.string=text;}
    private async copyInvite(): Promise<void> {
        try {await navigator.clipboard.writeText(this.invite.string);this.setMessage('邀请链接已复制，可发给好友');}
        catch {this.invite.focus();this.setMessage('请选中邀请链接复制（Ctrl+C，手机长按复制）');}
    }
    hide(): void {this.node.active=false;}
}
