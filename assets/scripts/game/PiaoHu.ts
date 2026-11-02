import { Meld } from '../core/Player';
import { Tile, isSameType } from '../core/Tile';
import { MeldType } from '../core/Types';
import { findAllWinPatterns } from './WinChecker';
/** Four triplet/gang groups and a pair; never a seven-pairs multiplier. */
export function isPiaoHu(allTiles: Tile[], melds: Meld[]): boolean {
    if (melds.length > 4 || melds.some(m => m.type === MeldType.Chi)) return false;
    const exposedIds = new Set(melds.flatMap(m => m.tiles.map(t => t.id)));
    const concealed = allTiles.filter(t => !exposedIds.has(t.id));
    if (concealed.length !== 14 - 3 * melds.length) return false;
    return findAllWinPatterns(concealed).some(pattern => pattern.melds.length + melds.length === 4
        && pattern.melds.every(group => group.every(t => isSameType(t, group[0]))));
}
