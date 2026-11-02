import { Player, Meld } from '../core/Player';
import { Tile, isNumeral, isShunts } from '../core/Tile';
import { MeldType, RiichiType } from '../core/Types';
import { refreshOpenState } from './Opener';
/** Each option contains the two physical tiles taken from the caller's hand. */
export function getChiOptions(player: Player, target: Tile): Tile[][] {
    if (!isNumeral(target) || player.state.riichi !== RiichiType.None
        || player.state.isWon || player.state.isDrawn)
        return [];
    const options: Tile[][] = [];
    for (let start = target.rank - 2; start <= target.rank; start++) {
        if (start < 1 || start > 7)
            continue;
        const needed = [start, start + 1, start + 2].filter(rank => rank !== target.rank);
        const first = player.hand.find(t => t.suit === target.suit && t.rank === needed[0]);
        const second = player.hand.find(t => t.suit === target.suit && t.rank === needed[1]);
        if (first && second)
            options.push([first, second]);
    }
    return options;
}
export function chi(player: Player, target: Tile, selected: Tile[]): {
    ok: boolean;
    meld?: Meld;
} {
    if (selected.length !== 2 || selected[0].id === selected[1].id)
        return { ok: false };
    const match = getChiOptions(player, target).find(option => option.every(t => selected.some(s => s.id === t.id)));
    if (!match || !isShunts(match[0], match[1], target))
        return { ok: false };
    const tiles = [...match, target].sort((a, b) => a.rank - b.rank);
    const meld: Meld = { type: MeldType.Chi, tiles, openedTileIndex: tiles.findIndex(t => t.id === target.id) };
    player.hand = player.hand.filter(t => !match.some(s => s.id === t.id));
    player.melds.push(meld);
    refreshOpenState(player);
    return { ok: true, meld };
}
