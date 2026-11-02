import { resources, Texture2D, SpriteFrame, Rect, Size, Node, Sprite, UITransform, Layers, sys, screen } from 'cc';
import { ART_BOUNDS } from './ArtworkBounds';

/** Shared artwork; original PNGs remain untouched and retain their aspect ratio. */
export class TileResources {
    private static frames = new Map<string, SpriteFrame>();
    private static loading: Promise<void> | null = null;
    static preload(progress?: (loaded: number, total: number) => void): Promise<void> {
        if (this.loading) return this.loading;
        const paths = Object.keys(ART_BOUNDS);
        this.loading = new Promise(resolve => {
            let completed = 0, cursor = 0;
            const next = () => {
                if (cursor >= paths.length) return;
                const path = paths[cursor++];
                resources.load(path + '/texture', Texture2D, (err, texture) => {
                    if (texture && !err) {
                        const [x,y,w,h] = ART_BOUNDS[path];
                        const frame = new SpriteFrame();frame.texture = texture;
                        frame.rect = new Rect(x,y,w,h);frame.originalSize = new Size(w,h);
                        this.frames.set(path,frame);
                    } else console.warn('[Artwork] Missing resource:', path);
                    progress?.(++completed,paths.length);
                    if (completed === paths.length) resolve(); else next();
                });
            };
            for (let i=0;i<Math.min(8,paths.length);i++) next();
        });
        return this.loading;
    }
    static get(path: string): SpriteFrame | undefined { return this.frames.get(path); }
    static image(parent: Node, path: string, w: number, h: number, x=0, y=0, fit: 'contain'|'stretch' = 'contain'): Node | null {
        const frame = this.frames.get(path);if (!frame) return null;
        const node = new Node('Art-' + path);node.layer=Layers.Enum.UI_2D;node.parent=parent;node.setPosition(x,y);
        // The mobile stage fills a wide viewport. Compensate its horizontal
        // scale for bitmap artwork so tiles and circular buttons keep shape.
        const stretch=sys.isMobile&&screen.windowSize.height>0?screen.windowSize.width/screen.windowSize.height/(1280/720):1;
        const scale=Math.min(w*stretch/frame.rect.width,h/frame.rect.height);
        const sprite=node.addComponent(Sprite);sprite.spriteFrame=frame;sprite.sizeMode=Sprite.SizeMode.CUSTOM;
        node.getComponent(UITransform)!.setContentSize(fit==='stretch'?w:frame.rect.width*scale/stretch,fit==='stretch'?h:frame.rect.height*scale);
        return node;
    }
}
