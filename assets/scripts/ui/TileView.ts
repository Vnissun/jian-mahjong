import { _decorator, Component, Node, Graphics, UITransform, Color } from 'cc';
import { Tile } from '../core/Tile';
import { SeatWind, Suit } from '../core/Types';
import { UIHelper } from './UIHelper';
import { TileResources } from './TileResources';
const { ccclass } = _decorator;
const BASE='reference_ui/GameLayer/Mahjong/';
/** Source artwork has its own seat perspective. Never rotate complete tile sprites. */
@ccclass('TileView')
export class TileView extends Component {
    private _tile: Tile | null = null;
    private down=false;
    private highlight=false;
    private selected=false;
    private flat=false;
    private viewpoint=SeatWind.East;
    onClick?: (tile: Tile | null) => void;
    onLoad():void {this.node.on(Node.EventType.TOUCH_END,this.click,this);}
    onDestroy():void {this.node.off(Node.EventType.TOUCH_END,this.click,this);}
    private click():void {if(!this.down)this.onClick?.(this._tile);}
    setTile(tile:Tile|null,down:boolean,flat=false,viewpoint=SeatWind.East):void {this._tile=tile;this.down=down;this.flat=flat;this.viewpoint=viewpoint;this.render();}
    setHighlight(on:boolean):void {if(this.highlight!==on){this.highlight=on;this.render();}}
    setSelected(on:boolean):void {if(this.selected!==on){this.selected=on;this.render();}}
    get tile():Tile|null {return this._tile;}
    get isFaceDown():boolean {return this.down;}
    get isStandingBack():boolean {return this.down&&!this.flat;}
    get isHighlighted():boolean {return this.highlight;}
    static code(tile:Tile):string {
        // Reference art uses circles=1, characters=2, bamboo=3, honors=4.
        if(tile.suit===Suit.Feng)return '4'+tile.rank;
        if(tile.suit===Suit.Yuan)return '4'+(tile.rank+4);
        return ({wan:'2',tong:'1',tiao:'3'})[tile.suit]+tile.rank;
    }
    static path(tile:Tile|null,down:boolean,flat:boolean,seat:SeatWind):string {
        if(down&&!flat)return BASE+({east:'hand_top',south:'hand_right',west:'hand_top',north:'hand_left'})[seat];
        const direction=seat===SeatWind.South?'1':seat===SeatWind.North?'3':'2';
        return BASE+direction+'/'+(!flat&&!down?'handmah_':'mingmah_')+(down?'00':tile?this.code(tile):'00');
    }
    private render():void {
        UIHelper.clear(this.node);
        const tf=this.node.getComponent(UITransform)!,w=tf.width,h=tf.height;
        const g=this.node.getComponent(Graphics)??this.node.addComponent(Graphics);g.clear();
        if(this.selected){g.fillColor=new Color(255,220,65,125);g.roundRect(-w/2-3,-h/2-3,w+6,h+6,6);g.fill();}
        const art=TileResources.image(this.node,TileView.path(this._tile,this.down,this.flat,this.viewpoint),w,h);
        if(!art){g.fillColor=new Color(243,239,214);g.roundRect(-w/2,-h/2,w,h,4);g.fill();}
        if(this.highlight&&!this.down&&!this.flat){
            const mark=UIHelper.node(this.node,'Playable',5,5,w/2-5,h/2-5);UIHelper.paint(mark,new Color(243,216,110,200),2);
        }
    }
}
