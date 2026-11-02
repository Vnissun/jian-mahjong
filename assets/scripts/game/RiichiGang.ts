import { Player, Meld, meldSignature, readRiichiShapes } from '../core/Player';
import { Tile, isSameType, createTile } from '../core/Tile';
import { MeldType, RiichiType } from '../core/Types';
import { getRiichiChoices } from './RiichiManager';
import { findAllWinPatterns, checkQiXiaoDui } from './WinChecker';
export type RiichiGangKind = 'an' | 'ming' | 'jia' | 'supplement';
/** Validate the complete proposed change before touching physical tiles. */
export function canRiichiGang(player: Player, removed: Tile[], meld: Meld, kind: RiichiGangKind, meldIndex = -1): boolean {
    if (player.state.riichi === RiichiType.None) return true;
    const state = player.state;
    if (!state.riichiLockedHandIds.length || !state.riichiWaits.length || state.riichiMeldSignature !== meldSignature(player)) return false;
    if (kind === 'ming' && (!state.isOpen || state.isStanding)) return false;
    const locked = new Set(state.riichiLockedHandIds);
    if (!state.riichiLockedHandIds.every(id => player.hand.some(t => t.id === id))) return false;
    if (new Set(removed.map(t=>t.id)).size !== removed.length || removed.some(t=>!player.hand.some(x=>x.id===t.id))) return false;
    if ((kind === 'an' || kind === 'ming') && removed.filter(t=>locked.has(t.id)).length !== 3) return false;
    if ((kind === 'jia' || kind === 'supplement') && (removed.length !== 1 || locked.has(removed[0].id))) return false;
    const afterHand = player.hand.filter(t=>!removed.some(x=>x.id===t.id));
    if (afterHand.some(t=>!locked.has(t.id))) return false;
    const melds = player.melds.slice();
    if (meldIndex >= 0) melds[meldIndex] = meld; else melds.push(meld);
    if (kind === 'an' || kind === 'ming') {
        const original = player.hand.filter(t=>locked.has(t.id));
        const triplet = removed.filter(t=>locked.has(t.id));
        for (const [i,wait] of state.riichiWaits.entries()) {
            const complete = original.concat(createTile(-999-i,wait.suit,wait.rank));
            if (checkQiXiaoDui(complete).isQi) return false;
            const patterns = findAllWinPatterns(complete);
            // A tile needed in a pair or sequence cannot be taken away to form a gang.
            if (!patterns.length || patterns.some(p=>!p.melds.some(group=>group.length===3 && group.every(t=>isSameType(t,triplet[0])) && triplet.every(t=>group.some(x=>x.id===t.id))))) return false;
        }
    }
    const simulated: Player = { ...player, hand: afterHand, melds, state: { ...state, riichi: RiichiType.None } };
    const key=(tiles: {suit:any;rank:number}[])=>tiles.map(t=>t.suit+':'+t.rank).sort().join(',');
    // Preserve the declared shape and exact selected waits; never widen the declaration.
    return getRiichiChoices(simulated,true).some(c=>readRiichiShapes(player).includes(c.shape) && key(c.winningTiles)===key(state.riichiWaits));
}
export function rebaseRiichiAfterGang(player: Player): void {
    if (player.state.riichi === RiichiType.None) return;
    player.state.riichiLockedHandIds = player.hand.map(t=>t.id).sort((a,b)=>a-b);
    player.state.riichiMeldSignature = meldSignature(player);
}
