import { Node, Layers, UITransform, Graphics, Color, Label, LabelOutline, Button, Sprite, SpriteFrame, Texture2D, ImageAsset, builtinResMgr, BlockInputEvents } from 'cc';
import { TileResources } from './TileResources';
export const Palette = {
    table: new Color(14, 77, 53), inset: new Color(23, 110, 66), panel: new Color(12, 68, 45),
    gold: new Color(255, 226, 115), text: new Color(255, 251, 227), muted: new Color(180, 211, 173),
    button: new Color(25, 133, 52), selected: new Color(189, 121, 31), line: new Color(143, 180, 123),
    ink: new Color(79, 58, 36), paper: new Color(254, 246, 201)
};
export class UIHelper {
    private static white: SpriteFrame | null = null;
    static getWhiteSF(): SpriteFrame | null {
        if (this.white)
            return this.white;
        const builtin = builtinResMgr.get<SpriteFrame>('default-sprite-spriteFrame');
        if (builtin)
            return this.white = builtin;
        const img = new ImageAsset();
        img.reset({ _data: new Uint8Array([255, 255, 255, 255]), width: 1, height: 1, format: Texture2D.PixelFormat.RGBA8888, _compressed: false } as any);
        const tex = new Texture2D();
        tex.image = img;
        const sf = new SpriteFrame();
        sf.texture = tex;
        return this.white = sf;
    }
    static node(parent: Node, name: string, w: number, h: number, x = 0, y = 0): Node {
        const n = new Node(name);
        n.layer = Layers.Enum.UI_2D;
        n.parent = parent;
        n.addComponent(UITransform).setContentSize(w, h);
        n.setPosition(x, y);
        return n;
    }
    static paint(n: Node, color: Color, radius = 12, border?: Color): void {
        const tf = n.getComponent(UITransform)!, g = n.getComponent(Graphics) ?? n.addComponent(Graphics);
        g.clear();
        g.fillColor = color;
        g.roundRect(-tf.width / 2, -tf.height / 2, tf.width, tf.height, radius);
        g.fill();
        if (border) {
            g.strokeColor = border;
            g.lineWidth = 1.5;
            g.stroke();
        }
    }
    static label(parent: Node, name: string, text: string, w: number, h: number, x = 0, y = 0, size = 22, color = Palette.text): Label {
        const n = this.node(parent, name, w, h, x, y), lab = n.addComponent(Label);
        lab.string = text;
        lab.fontSize = size;
        lab.lineHeight = size + 6;
        lab.color = color;
        lab.horizontalAlign = Label.HorizontalAlign.CENTER;
        lab.verticalAlign = Label.VerticalAlign.CENTER;
        lab.overflow = Label.Overflow.SHRINK;
        return lab;
    }
    static button(parent: Node, name: string, text: string, w: number, h: number, x: number, y: number, action: () => void, color = Palette.button): Node {
        const n = this.node(parent, name, w, h, x, y);
        if(name==='Lobby'){
            TileResources.image(n,'reference_ui/GameLayer/bt_exit',w,h);
            const btn=n.addComponent(Button);btn.transition=Button.Transition.SCALE;
            n.on(Button.EventType.CLICK,()=>{document.dispatchEvent(new Event('mahjong-button'));action();});return n;
        }
        this.paint(n, color, 10, Palette.line);
        const btn = n.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        const shine=this.node(n,'Shine',w-6,Math.max(4,h*.27),0,h*.28);
        this.paint(shine,new Color(255,255,225,24),8);
        this.label(n, 'Label', text, w - 12, h, 0, 0, Math.min(23,h*.46));
        n.on(Button.EventType.CLICK, () => { document.dispatchEvent(new Event('mahjong-button')); action(); });
        return n;
    }
    static artButton(parent: Node, name: string, art: string, text: string, size: number, x: number, y: number, action: () => void): Node {
        const n=this.node(parent,name,size,size,x,y);
        const simple=art==='pass';
        TileResources.image(n,'reference_ui/GameLayer/'+(simple?'btn_action1':'btn_action0'),size,size);
        const flag=({hu:'hu',gang:'gang',peng:'peng',pass:'guo'})[art];
        if(flag)TileResources.image(n,'reference_ui/GameLayer/flag_'+flag,size*.62,size*.62,simple?0:size*.04,size*.03);
        else {const lab=this.label(n,'Label',text,size*.76,size*.65,size*.04,0,art==='discard'?28:42,art==='discard'?new Color(164,65,21):Palette.gold);lab.fontFamily='KaiTi';lab.isBold=true;
            const outline=lab.node.addComponent(LabelOutline);outline.color=art==='discard'?new Color(255,248,209):new Color(127,60,38);outline.width=art==='discard'?1.5:3;}
        const btn=n.addComponent(Button);btn.transition=Button.Transition.SCALE;btn.zoomScale=.94;
        n.on(Button.EventType.CLICK,()=>{document.dispatchEvent(new Event('mahjong-button'));action();});
        return n;
    }
    static backdrop(parent: Node, name='Backdrop'): Node {
        const bg=this.node(parent,name,1280,720);
        TileResources.image(bg,'reference_ui/'+(name==='Felt'?'GameLayer/bg_game':'HelloLayer/im_bg'),1280,720,0,0,'stretch');
        if(name!=='Felt'){const veil=this.node(bg,'Veil',1280,720);this.paint(veil,new Color(15,35,19,120),0);}
        return bg;
    }
    static paper(parent: Node,name:string,w:number,h:number,x=0,y=0):Node {
        const n=this.node(parent,name,w,h,x,y);
        const art=TileResources.image(n,'reference_ui/SetLayer/im_bg',w,h,0,0,'stretch');
        if(art){const sprite=art.getComponent(Sprite)!,sf=sprite.spriteFrame!;sf.insetLeft=18;sf.insetRight=18;sf.insetTop=52;sf.insetBottom=18;sprite.type=Sprite.Type.SLICED;}
        return n;
    }
    static confirmExit(parent:Node,onConfirm:()=>void):void {
        if(parent.getChildByName('ExitConfirmation'))return;
        const overlay=this.node(parent,'ExitConfirmation',1280,720);
        this.paint(overlay,new Color(0,19,12,200),0);overlay.addComponent(BlockInputEvents);
        const card=this.paper(overlay,'Card',570,270);
        this.label(card,'Title','退出对局',480,40,0,85,25,Palette.paper);
        this.label(card,'Question','正在对局中，是否退出',500,48,0,18,26,Palette.ink);
        const close=()=>{overlay.removeFromParent();overlay.destroy();};
        this.button(card,'Cancel','取消',180,48,-115,-77,close);
        this.button(card,'Confirm','确认退出',180,48,115,-77,()=>{close();onConfirm();},Palette.selected);
    }
    static clear(parent: Node): void { for (const n of parent.children.slice()) {
        n.removeFromParent();
        n.destroy();
    } }
}
