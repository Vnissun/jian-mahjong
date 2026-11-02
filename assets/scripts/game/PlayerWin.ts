import { Player, readRiichiShapes, hasLockedRiichiHand } from '../core/Player';
import { Tile } from '../core/Tile';
import { Suit, MeldType, RiichiType } from '../core/Types';
import { checkWin, findAllWinPatterns, WinTypeResolved } from './WinChecker';
import { checkHandEligibility } from './HandValidator';
/** The concealed hand and fixed melds must be evaluated separately. */
export function evaluatePlayerWin(player: Player, winTile: Tile | null, allowQi: boolean, requireQiRiichi = true) {
    const concealed = player.hand.slice();
    if (winTile && !concealed.some(t => t.id === winTile.id))
        concealed.push(winTile);
    const allTiles = [...concealed, ...player.melds.flatMap(m => m.tiles)];
    let win = checkWin(concealed, allowQi, player.melds);
    if (requireQiRiichi && win.qiInfo && (player.state.riichi !== RiichiType.Normal
        || !readRiichiShapes(player).includes('danDiao'))) {
        // Without the required declaration, only a legal standard hand may win.
        win = checkWin(concealed, false, player.melds);
    }
    const isQi = win.winType === WinTypeResolved.QiXiaoDui
        || win.winType === WinTypeResolved.HaoHuaQiXiaoDui;
    const eligibility = checkHandEligibility(allTiles, isQi, player.melds.some(m => m.type !== MeldType.Chi));
    if (requireQiRiichi && player.state.riichi !== RiichiType.None && winTile) {
        const lockedHand = concealed.filter(t => t.id !== winTile.id);
        if (!hasLockedRiichiHand(player, lockedHand)
            || (player.state.riichiWaits.length && !player.state.riichiWaits.some(t => t.suit === winTile.suit && t.rank === winTile.rank))) {
            eligibility.ok = false;
            eligibility.reasons.push('报听后不可换手牌或改变听口');
        }
    }
    // Three identical tiles spread over sequences do not form a triplet.
    if (win.canWin && !isQi && !player.melds.some(m => m.type !== MeldType.Chi)
        && !findAllWinPatterns(concealed).some(pattern => (pattern.pair[0].suit === Suit.Yuan) || pattern.melds.some(group => group.every(t => t.suit === group[0].suit && t.rank === group[0].rank)))) {
        eligibility.ok = false;
        eligibility.reasons.push('合法拆解中无刻子（含一对中发白豁免）');
    }
    return { ...win, concealed, allTiles, eligibility,
        ok: !player.state.isWon && !player.state.isDrawn && win.canWin && eligibility.ok };
}
