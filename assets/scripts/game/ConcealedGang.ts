import { canRiichiGang, rebaseRiichiAfterGang } from './RiichiGang';
import { Player, Meld } from '../core/Player';
import { Tile } from '../core/Tile';
import { Suit, MeldType, RiichiType } from '../core/Types';
import { anGang } from './ActionHandler';
import { refreshOpenState } from './Opener';
export interface ConcealedGangChoice {
    tiles: Tile[];
    specialGang?: 'winds' | 'dragons';
    label: string;
}
/** Held tiles may be accumulated over multiple turns; no last-drawn restriction. */
export function getConcealedGangChoices(player: Player): ConcealedGangChoice[] {
    if (player.state.isWon || player.state.isDrawn)
        return [];
    const groups = new Map<string, Tile[]>(), choices: ConcealedGangChoice[] = [];
    for (const tile of player.hand) {
        const key = tile.suit + ':' + tile.rank;
        groups.set(key, (groups.get(key) ?? []).concat(tile));
    }
    for (const tiles of Array.from(groups.values()))
        if (tiles.length === 4)
            choices.push({ tiles, label: tiles[0].name + ' 暗杠' });
    const winds = [1, 2, 3, 4].map(rank => player.hand.find(t => t.suit === Suit.Feng && t.rank === rank));
    if (winds.every(Boolean))
        choices.push({ tiles: winds as Tile[], specialGang: 'winds', label: '东南西北 四风杠（公开）' });
    const dragons = [1, 2, 3].map(rank => player.hand.find(t => t.suit === Suit.Yuan && t.rank === rank));
    if (dragons.every(Boolean)) {
        const base = dragons as Tile[], seen = new Set<string>();
        for (const extra of player.hand) {
            if (extra.suit !== Suit.Yuan || base.some(t => t.id === extra.id))
                continue;
            const key = extra.suit + ':' + extra.rank;
            if (seen.has(key))
                continue;
            seen.add(key);
            choices.push({ tiles: base.concat(extra), specialGang: 'dragons', label: '中发白＋' + extra.name + '（公开）' });
        }
    }
    return choices.filter(c => canRiichiGang(player, c.tiles, { type: MeldType.AnGang, tiles: c.tiles, openedTileIndex: -1, specialGang: c.specialGang }, 'an'));
}
export function concealedGang(player: Player, selected: Tile[]): {
    ok: boolean;
    meld?: Meld;
} {
    if (selected.length !== 4 || new Set(selected.map(t => t.id)).size !== 4)
        return { ok: false };
    const choice = getConcealedGangChoices(player).find(c => c.tiles.every(t => selected.some(s => s.id === t.id)));
    if (!choice)
        return { ok: false };
    if (!choice.specialGang)
        return anGang(player, choice.tiles[0]);
    const meld: Meld = { type: MeldType.AnGang, tiles: choice.tiles.slice(), openedTileIndex: -1, specialGang: choice.specialGang };
    player.hand = player.hand.filter(t => !choice.tiles.some(s => s.id === t.id));
    player.melds.push(meld);
    refreshOpenState(player);
    rebaseRiichiAfterGang(player);
    return { ok: true, meld };
}
export interface SupplementGangChoice {
    meldIndex: number;
    tile: Tile;
    label: string;
}
export function getSupplementGangChoices(player: Player): SupplementGangChoice[] {
    if (player.state.isWon || player.state.isDrawn)
        return [];
    const choices: SupplementGangChoice[] = [];
    player.melds.forEach((meld, meldIndex) => {
        if (!meld.specialGang)
            return;
        const suit = meld.specialGang === 'winds' ? Suit.Feng : Suit.Yuan, seen = new Set<string>();
        if (meld.type !== MeldType.AnGang || meld.tiles.length < 4 || meld.tiles.some(t => t.suit !== suit))
            return;
        for (const tile of player.hand) {
            if (tile.suit !== suit || seen.has(tile.suit + ':' + tile.rank))
                continue;
            if (!canRiichiGang(player, [tile], { ...meld, tiles: meld.tiles.concat(tile) }, 'supplement', meldIndex)) continue;
            seen.add(tile.suit + ':' + tile.rank);
            choices.push({ meldIndex, tile, label: (meld.specialGang === 'winds' ? '四风' : '三元') + '补毛 ' + tile.name });
        }
    });
    return choices;
}
export function supplementGang(player: Player, meldIndex: number, tile: Tile): {
    ok: boolean;
    meld?: Meld;
} {
    const choice = getSupplementGangChoices(player).find(c => c.meldIndex === meldIndex && c.tile.id === tile.id);
    if (!choice)
        return { ok: false };
    const old = player.melds[meldIndex], meld: Meld = { ...old, tiles: old.tiles.concat(choice.tile) };
    player.hand = player.hand.filter(t => t.id !== tile.id);
    player.melds[meldIndex] = meld;
    refreshOpenState(player);
    rebaseRiichiAfterGang(player);
    return { ok: true, meld };
}
