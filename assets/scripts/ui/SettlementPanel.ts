import { _decorator, Component, Node, Label, Color, BlockInputEvents } from 'cc';
import { SettlementResult, WinMode } from '../game/SettlementEngine';
import { GangSettlementResult } from '../game/GangSettlement';
import { Player } from '../core/Player';
import { Tile } from '../core/Tile';
import { describeCap } from '../config/GameConfig';
import { UIHelper, Palette } from './UIHelper';
import { TileResources } from './TileResources';
import { TileView } from './TileView';
import { SeatWind } from '../core/Types';
import { sortedCopy } from '../game/HandUtils';
const { ccclass } = _decorator;
const labels: Record<string, string> = { dealerMul:'庄家',riichiMul:'双方报听取高',winnerStandingMul:'胡家站立',payerStandingMul:'付款方站立',selfDrawMul:'自摸',dianPaoMul:'点炮责任',gangHouMul:'杠后追加',qingMul:'清一色',sanJiaQingMul:'三家清',siJiaQingMul:'四家清',qiXiaoDuiBaseMul:'七小对基础',piaoHuMul:'飘胡' };
const luxuryNames: Record<number,string> = {2:'豪华七对',4:'双豪七对',8:'三豪七对'};
@ccclass('SettlementPanel')
export class SettlementPanel extends Component {
    onNext?: () => void;
    onEnd?: () => void;
    private content!: Node;
    private next!: Node;
    private shade!: Node;
    private dock!: Node;
    private dockNext!: Node;
    private signed(n: number): string { return (n >= 0 ? '+' : '') + n; }
    private gangDelta(gangs: GangSettlementResult[], id: string): number {
        return gangs.reduce((n,g)=>n+(g.gangPlayerId===id?g.gangPlayerDelta:g.payerDeltas[id]??0),0);
    }
    onLoad(): void {
        this.shade=UIHelper.node(this.node,'Shade',1280,720);
        UIHelper.paint(this.shade,new Color(0,15,12,210),0);this.shade.addComponent(BlockInputEvents);
        const card=UIHelper.paper(this.shade,'Card',980,624);
        this.content=UIHelper.node(card,'Content',840,510,0,20);
        this.next=UIHelper.button(card,'Next','下一局',180,50,-235,-265,()=>this.onNext?.(),Palette.selected);
        UIHelper.button(card,'ReviewTable','查看牌桌',180,50,0,-265,()=>this.setTableReview(true));
        UIHelper.button(card,'End','返回大厅',180,50,235,-265,()=>this.onEnd?.());
        this.dock=UIHelper.node(this.node,'TableReviewDock',650,42,0,333);UIHelper.paint(this.dock,Palette.panel,14,Palette.ink);
        UIHelper.button(this.dock,'Return','返回结算',180,34,-215,0,()=>this.setTableReview(false));
        this.dockNext=UIHelper.button(this.dock,'Next','下一局',180,34,0,0,()=>this.onNext?.(),Palette.selected);
        UIHelper.button(this.dock,'End','返回大厅',180,34,215,0,()=>this.onEnd?.());
        this.hide();
    }
    setTableReview(review: boolean): void { this.shade.active=!review;this.dock.active=review; }
    private showCard(): void {
        // A settled long-poll refresh must preserve the player's selected view.
        const reviewing=this.node.active&&this.dock.active;
        UIHelper.clear(this.content);this.node.active=true;this.next.active=true;this.dockNext.active=true;
        this.setFinished(false);this.setTableReview(reviewing);
    }
    private showGangSummary(gangs: GangSettlementResult[], players: Player[]): void {
        UIHelper.label(this.content,'GangTitle','本局杠分汇总（含补毛）· 局末统一入账，不参与满贯',800,23,0,-166,15,new Color(129,105,64));
        players.forEach((p,i)=>{const n=this.gangDelta(gangs,p.id);UIHelper.label(this.content,'Gang-'+p.id,p.name+'：杠分 '+this.signed(n),390,24,-200+(i%2)*400,-193-Math.floor(i/2)*27,17,n>0?new Color(45,120,53):Palette.ink);});
    }
    show(result: SettlementResult, gangs: GangSettlementResult[], players: Player[], mode: WinMode, winner: Player, winTile?: Tile): void {
        this.showCard();
        UIHelper.label(this.content,'Title',winner.name+' · '+(mode===WinMode.SelfDraw?'自摸胡牌':(players.find(p=>p.id===result.firerId)?.name??'玩家')+(mode===WinMode.RobbingGang?'被抢杠胡':'点炮')),800,50,0,238,30,Palette.paper);
        
        const gang=this.gangDelta(gangs,winner.id);
        UIHelper.label(this.content,'Total','本次积分 '+this.signed(result.winnerDelta+gang)+'，当前总分 '+winner.score,800,35,0,202,25,Palette.gold);
        const luxury=luxuryNames[result.breakdown.qiXiaoDuiLuxuryMul];
        UIHelper.label(this.content,'Hint','胡牌 +'+result.winnerDelta+' · 杠分 '+this.signed(gang)+' · 底分 '+result.baseScore+' · 满贯 '+describeCap(result.cap)+(luxury?' · '+luxury:''),800,28,0,155,17,new Color(129,105,64));
        const row=UIHelper.node(this.content,'WinningTiles',800,81,0,94);UIHelper.paint(row,new Color(86,127,69,46),12);
        const hand=sortedCopy(winner.hand.filter(t=>t.id!==winTile?.id));
        const entries=[...winner.melds.flatMap(m=>sortedCopy(m.tiles).map(t=>({t,flat:true}))),...hand.map(t=>({t,flat:false}))];
        const step=Math.min(37,680/Math.max(1,entries.length+2));
        const left=-(entries.length*step+60)/2;
        entries.forEach(({t,flat},i)=>{const n=UIHelper.node(row,'WinHand-'+t.id,step-2,55,left+i*step,0);n.addComponent(TileView).setTile(t,false,flat,SeatWind.East);});
        if(winTile){const x=left+entries.length*step+24;const n=UIHelper.node(row,'WinningTile',36,55,x,0);n.addComponent(TileView).setTile(winTile,false);UIHelper.label(row,'WinTileLabel','胡',24,24,x+34,0,17,Palette.ink);}
        players.filter(p=>p.id!==winner.id).forEach((p,i)=>{
            const detail=result.payerDetails[p.id],y=22-i*63,n=this.gangDelta(gangs,p.id);
            const factors=Object.entries(detail.breakdown).filter(([k,v])=>k!=='totalMul'&&v>1).map(([k,v])=>(k==='qingMul'?(v===4?'纯清一色':'混清一色'):k==='qiXiaoDuiLuxuryMul'?luxuryNames[v]:k==='riichiMul'&&result.riichiDuel?'报听对踢':labels[k])+' ×'+v);
            UIHelper.label(this.content,'Payer-'+p.id,p.name+(p.id===result.firerId?(mode===WinMode.RobbingGang?'（被抢杠）':'（点炮）'):'')+'：本次 '+this.signed(n-detail.amount)+' · 胡牌 -'+detail.amount+' · 杠分 '+this.signed(n)+' · 当前积分 '+p.score,860,30,0,y,20,Palette.ink);
            UIHelper.label(this.content,'Factors-'+p.id,'原始 ×'+detail.rawMultiplier+' → ×'+detail.cappedMultiplier+' · '+(factors.join(' · ')||'基础 ×1'),860,32,0,y-27,16,new Color(129,105,64));
        });
        this.showGangSummary(gangs,players);
    }
    showDrawn(players: Player[], gangs: GangSettlementResult[]): void {
        this.showCard();UIHelper.label(this.content,'Title','荒庄 · 庄家连庄',800,40,0,238,29,Palette.paper);
        UIHelper.label(this.content,'Hint','正常牌墙已摸完，本局杠分统一结算',750,45,0,110,22,new Color(129,105,64));
        this.scores(players,gangs);this.showGangSummary(gangs,players);
    }
    private scores(players: Player[], gangs?: GangSettlementResult[]): void {
        players.forEach((p,i)=>UIHelper.label(this.content,'Score-'+p.id,p.name+(p.state.isDealer?'（庄）':'')+(gangs?' · 本次 '+this.signed(this.gangDelta(gangs,p.id)):'')+' · 当前积分 '+p.score,740,36,0,38-i*37,22,Palette.ink));
    }
    setFinished(finished: boolean): void {for(const n of [this.next,this.dockNext])n.getChildByName('Label')!.getComponent(Label)!.string=finished?'查看总分':'下一局';}
    showFinal(players: Player[]): void {
        this.showCard();UIHelper.label(this.content,'Title','本桌结束 · 最终积分',800,40,0,238,29,Palette.paper);
        
        this.scores(players);this.next.active=false;this.dockNext.active=false;
    }
    hide(): void {this.node.active=false;if(this.next)this.next.active=true;if(this.dockNext)this.dockNext.active=true;if(this.shade)this.shade.active=true;if(this.dock)this.dock.active=false;}
}

