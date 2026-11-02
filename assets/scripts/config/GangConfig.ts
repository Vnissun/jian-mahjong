/**
 * GangConfig.ts - 杠分独立结算配置表
 * ------------------------------------------------------------
 * 集安规则：杠分独立结算，不参与满贯。
 *
 * 杠分计算公式：
 *   杠分 = 杠基础分 × 杠类型倍数 × 庄家倍数
 *
 *   其中：
 *     - 杠基础分：由牌的种类决定（普通数字 / 字牌 / 特殊牌）
 *     - 杠类型倍数：明杠 ×1，暗杠 ×2
 *     - 庄家倍数：任一付款方或收款方为庄家 ×2，每笔只计一次
 *
 * 杠分基础档（按牌种类）：
 *   ┌ 普通数字（2~9 非特殊）        ×1
 *   ├ 幺鸡 / 一饼 / 四张中发白       = 2
 *   ├ 二饼 / 八万四张                = 4
 *   └ 四张相同风牌                  = 1
 *
 * 特殊牌定义：
 *   - "幺鸡"：一条（rank=1，suit=Tiao）
 *   - "一饼"：一筒（rank=1，suit=Tong）
 *   - "二饼"：二筒（rank=2，suit=Tong）
 *   - "八万四张"：八万（rank=8，suit=Wan）—— 即"四张八万"
 *   - "四张中发白"：中发白的任意一种四张
 *   - "四张相同风牌"：东/南/西/北的任意一种四张（普通杠基础1）
 */

import { Tile } from '../core/Tile';
import { Suit } from '../core/Types';

// ============================================================
// 1. 杠类型倍数
// ============================================================

/**
 * 杠类型倍数（明杠 vs 暗杠）
 *  - 明杠（含加杠）×1
 *  - 暗杠        ×2
 */
export const GANG_TYPE_MULTIPLIER = {
    MingGang: 1,  // 明杠、加杠
    AnGang: 2,    // 暗杠
} as const;

// ============================================================
// 2. 庄家倍数
// ============================================================

/**
 * 庄家倍数（开杠时如果是庄家杠，杠分全部 ×2）
 */
export const GANG_DEALER_MULTIPLIER = {
    Dealer: 2,    // 庄家杠
    NonDealer: 1, // 非庄家杠
} as const;

// ============================================================
// 3. 杠基础分档
// ============================================================

/**
 * 杠基础分档（按牌种类）
 */
export const GANG_BASE_SCORE = {
    /** 普通数字牌（非特殊）基础分 = 1 */
    Normal: 1,
    /** 幺鸡 / 一饼 / 四张中发白 基础分 = 2 */
    Special: 2,
    /** 二饼 / 八万四张 基础分 = 4 */
    Honor: 4,
    /** 四张同风牌基础分 = 1 */
    WindDragon: 1,
} as const;

// ============================================================
// 4. 牌 → 基础分 查询
// ============================================================

/**
 * 判断一张牌属于哪种"杠基础档"
 * 返回对应基础分。
 *
 * 规则细则：
 *   - 一条（幺鸡） → Special (2)
 *   - 一筒（一饼） → Special (2)
 *   - 中发白（任意一种） → Special (2)
 *   - 二筒（二饼） → Honor (4)
 *   - 八万 → Honor (4)
 *   - 东南西北四张相同 → WindDragon (1)
 *   - 其他数牌 → Normal (1)
 *
 * 此查询用于四张相同牌的杠。四风组合、三元组合基础为 2，补毛基础为 1，
 * 由结算时根据副露类型处理；每笔付款任一方为庄家时翻倍。
 */
export function getGangBaseScore(tile: Tile): number {
    // 中发白（元牌）基础 = 2
    if (tile.suit === Suit.Yuan) return GANG_BASE_SCORE.Special;

    // 东南西北四张相同（风牌）基础 = 1
    if (tile.suit === Suit.Feng) return GANG_BASE_SCORE.WindDragon;

    // 一筒（一饼）基础 = 2
    if (tile.suit === Suit.Tong && tile.rank === 1) return GANG_BASE_SCORE.Special;

    // 二筒（二饼）基础 = 4
    if (tile.suit === Suit.Tong && tile.rank === 2) return GANG_BASE_SCORE.Honor;

    // 一条（幺鸡）基础 = 2
    if (tile.suit === Suit.Tiao && tile.rank === 1) return GANG_BASE_SCORE.Special;

    // 八万基础 = 4
    if (tile.suit === Suit.Wan && tile.rank === 8) return GANG_BASE_SCORE.Honor;

    // 其他数字牌基础 = 1
    return GANG_BASE_SCORE.Normal;
}

// ============================================================
// 5. 杠分最终计算（占位接口，结算引擎阶段细化）
// ============================================================

/**
 * 计算一次杠的得分（杠分独立结算，不参与满贯）
 *  - isDealer：开杠玩家是否为庄家
 *  - isAnGang：是否暗杠（true=暗杠×2，false=明杠/加杠×1）
 *
 * 计算公式：基础分 × 杠类型倍数 × 庄家倍数
 */
export function computeGangScore(
    tile: Tile,
    isDealer: boolean,
    isAnGang: boolean,
): number {
    const base = getGangBaseScore(tile);
    const typeMul = isAnGang ? GANG_TYPE_MULTIPLIER.AnGang : GANG_TYPE_MULTIPLIER.MingGang;
    const dealerMul = isDealer ? GANG_DEALER_MULTIPLIER.Dealer : GANG_DEALER_MULTIPLIER.NonDealer;
    return base * typeMul * dealerMul;
}

// ============================================================
// 6. 杠分显示名（UI 渲染）
// ============================================================

export const GANG_BASE_LABELS: Record<string, string> = {
    Normal: '普通数字',
    Special: '幺鸡/一饼/四张中发白',
    Honor: '二饼/八万四张',
    WindDragon: '东南西北',
};
