import { _decorator, Component, Node, Color, Label } from 'cc';
import { HumanActionOptions } from '../game/GameSession';
import { Tile } from '../core/Tile';
import { UIHelper, Palette } from './UIHelper';
const { ccclass } = _decorator;
@ccclass('ActionBar')
export class ActionBar extends Component {
    onDiscard?: () => void;
    onRiichi?: () => void;
    onPeng?: () => void;
    onChi?: () => void;
    onGang?: () => void;
    onWin?: () => void;
    onPass?: () => void;
    private buttons: Record<string, Node> = {};
    private choices: Node[] = [];
    onLoad(): void {
        for (const [key, text] of [['discard', '出牌'], ['riichi', '报听'], ['peng', '碰'], ['gang', '杠'], ['chi', '吃'], ['win', '胡'], ['pass', '过']]) {
            this.buttons[key] = UIHelper.artButton(this.node, key, ({riichi:'ting',win:'hu'})[key]||key, text, key==='pass'?88:108, 0, 0, () => {
                const fn = ({ discard: this.onDiscard, riichi: this.onRiichi, peng: this.onPeng, gang: this.onGang, chi: this.onChi, win: this.onWin, pass: this.onPass })[key];
                fn?.();
            });
        }
        this.hide();
    }
    showForTurn(o: HumanActionOptions): void { this.show({ discard: o.canDiscard && !o.autoDiscard, pass: !!o.autoDiscard && o.canWin, riichi: o.canRiichi, gang: o.canAnGang || o.canJiaGang || !!o.canSupplementGang, win: o.canWin }); }
    showForClaim(win: boolean, peng: boolean, gang: boolean, chi = false): void { this.show({ win, peng, gang, chi, pass: true }); }
    showChiChoices(options: Tile[][], target: Tile, choose: (tiles: Tile[]) => void): void {
        this.show({ pass: true });
        this.node.setPosition(245,this.node.position.y);
        this.buttons.pass.setPosition(-options.length * 85, 0);
        options.forEach((tiles, i) => {
            const text = [...tiles, target].sort((a, b) => a.rank - b.rank).map(t => t.rank).join(' · ') + target.name.slice(-1);
            this.choices.push(UIHelper.button(this.node, 'ChiChoice' + i, text, 156, 48, -options.length * 85 + 125 + i * 168, 0, () => choose(tiles)));
        });
    }
    showGangChoices(options: {
        label: string;
        run: () => void;
    }[], page = 0): void {
        this.show({ pass: true });
        this.node.setPosition(0, -96);
        // Large, separated targets above the hand; amber stands out from the felt.
        this.buttons.pass.setPosition(-355, 0);
        const pages = Math.max(1, Math.ceil(options.length / 8));
        page = Math.max(0, Math.min(page, pages - 1));
        options.slice(page * 8, page * 8 + 8).forEach((option, i) => {
            const n = UIHelper.button(this.node, 'GangChoice' + i, option.label,
                300, 92, -80 + (i % 2) * 316, Math.floor(i / 2) * 108,
                option.run, new Color(247, 200, 105));
            UIHelper.paint(n, new Color(247, 200, 105), 16, new Color(149, 82, 22));
            const label = n.getChildByName('Label')!.getComponent(Label)!;
            label.color = new Color(65, 39, 14);
            label.fontSize = 30;
            label.lineHeight = 38;
            label.isBold = true;
            label.enableWrapText = true;
            this.choices.push(n);
        });
        if (pages > 1) {
            this.choices.push(UIHelper.label(this.node, 'GangChoicePage',
                `${page + 1} / ${pages}`, 160, 36, -355, 292, 26, Palette.paper).node);
            for (const [delta, title, y] of [[-1, '上一页', 216], [1, '下一页', 108]] as const) {
                if (page + delta < 0 || page + delta >= pages) continue;
                this.choices.push(UIHelper.button(this.node, 'GangChoicePage' + delta,
                    title, 152, 92, -355, y, () => this.showGangChoices(options, page + delta), Palette.selected));
            }
        }
    }
    private clearChoices(): void {
        for (const n of this.choices) {
            n.removeFromParent();
            n.destroy();
        }
        this.choices = [];
    }
    private show(options: Record<string, boolean>): void {
        this.clearChoices();
        const keys = Object.keys(this.buttons).filter(k => options[k]);
        this.node.setPosition(keys.length>=4?245:370,-144);
        for (const k of Object.keys(this.buttons))
            this.buttons[k].active = !!options[k];
        keys.forEach((k, i) => this.buttons[k].setPosition((i - (keys.length - 1) / 2) * 110, 0));
        this.node.active = keys.length > 0;
    }
    hide(): void { this.clearChoices(); this.node.active = false; }
}
