import { Player, Meld } from '../core/Player';
import { Tile, isSameType } from '../core/Tile';
import { MeldType } from '../core/Types';
export function isMeldPublic(meld: Meld): boolean {
    return meld.type !== MeldType.AnGang || !!meld.specialGang;
}
/** Estimate only from what this player can see; never inspect opponents' hidden hands. */
export function countVisibleCopies(players: Player[], observer: Player, sample: Tile) {
    const publicIds = new Set<number>(), ownIds = new Set<number>();
    const add = (set: Set<number>, tiles: Tile[]) => tiles.forEach(t => { if (isSameType(t, sample))
        set.add(t.id); });
    for (const p of players) {
        add(publicIds, p.discards);
        for (const meld of p.melds) {
            if (isMeldPublic(meld))
                add(publicIds, meld.tiles);
            else if (p.id === observer.id)
                add(ownIds, meld.tiles);
        }
        if (p.id !== observer.id && p.state.isWon)
            add(publicIds, p.hand);
    }
    add(ownIds, observer.hand);
    const ownOnly = Array.from(ownIds).filter(id => !publicIds.has(id)).length;
    return { publicCount: publicIds.size, ownCount: ownOnly,
        unexposed: Math.max(0, 4 - publicIds.size), remaining: Math.max(0, 4 - publicIds.size - ownOnly) };
}
