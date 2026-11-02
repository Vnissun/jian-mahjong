/**
 * Opener.ts - 开门状态判定
 * ------------------------------------------------------------
 * 集安规则："开门判定：碰、明杠算开门；暗杠、字杠不算开门。"
 *
 * 字面解读：
 *   - 碰（任何牌）          → 开门
 *   - 吃                    → 开门
 *   - 明杠 / 加杠（数牌）   → 开门
 *   - 字杠（字牌的杠，含明杠/暗杠/加杠） → 不算开门
 *   - 暗杠（任何牌）        → 不算开门
 *
 * 玩家 isOpen 状态由其所有副露决定：
 *   - 任意一个"贡献开门"的副露存在 → isOpen = true
 *   - 全部为"不贡献开门"的副露    → isOpen = false
 *
 * 站立（未开门）的判定：isOpen = false → 站立 ×2 结算加成
 */

import { Player, Meld } from '../core/Player';
import { Tile, isHonor } from '../core/Tile';
import { MeldType } from '../core/Types';

// ============================================================
// 1. 单副露贡献判定
// ============================================================

/**
 * 判断单个副露是否"贡献开门"
 *  - 碰（任何牌）：开门
 *  - 吃：开门
 *  - 明杠 / 加杠：仅数牌贡献开门；字牌（字杠）不贡献
 *  - 暗杠：永不贡献
 */
export function meldContributesOpen(meld: Meld): boolean {
    switch (meld.type) {
        case MeldType.Peng:
        case MeldType.Chi:
            return true;
        case MeldType.MingGang:
        case MeldType.JiaGang:
            // 数牌杠贡献开门，字牌杠不贡献（字杠不算开门）
            return !isHonor(meld.tiles[0]);
        case MeldType.AnGang:
            return false;
        default:
            return false;
    }
}

// ============================================================
// 2. 玩家开门状态
// ============================================================

/**
 * 计算玩家是否"开门"
 *  - 任意一个贡献开门的副露存在即开门
 */
export function computeIsOpen(player: Player): boolean {
    return player.melds.some(m => meldContributesOpen(m));
}

/**
 * 是否"字杠"（用于调试/日志）
 *  - 字牌的明杠、加杠、暗杠都是字杠
 */
export function isHonorGang(meld: Meld): boolean {
    const isGang = meld.type === MeldType.MingGang
        || meld.type === MeldType.AnGang
        || meld.type === MeldType.JiaGang;
    return isGang && meld.tiles.length > 0 && isHonor(meld.tiles[0]);
}

/**
 * 刷新玩家的开门状态
 *  - 由 ActionHandler 在执行碰/杠后调用
 */
export function refreshOpenState(player: Player): void {
    player.state.isOpen = computeIsOpen(player);
    // 站立 = 未开门
    player.state.isStanding = !player.state.isOpen;
}
