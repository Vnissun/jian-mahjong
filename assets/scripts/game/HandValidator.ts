/**
 * HandValidator.ts - 胡牌门槛校验
 * ------------------------------------------------------------
 * 集安麻将胡牌硬性条件（在 WinChecker 通过后必须再校验）：
 *   1. 必须有幺九（字牌算幺九）
 *   2. 必须有刻子（一对中发白视为刻）
 *   3. 禁止缺门，清一色豁免缺门
 *
 * 七小对特殊规则：
 *   - 必须带幺九
 *   - 不能缺门
 *   - 允许清一色
 *   - 七小对豁免"必须有刻子"（七小对全是 2 张）
 *
 * 清一色类型：
 *   - 纯清一色（无字）：×4
 *   - 混清一色（带字）：×2
 *   - 二者均豁免"缺门"
 *
 * 注意：本模块仅做"门槛校验"，不做胡牌判定。
 *       调用方先用 WinChecker 判定能否胡，再用本模块校验门槛。
 */
import { Tile, isHonor, isNumeral, isYaojiu } from '../core/Tile';
import { countByType, hasMissingSuit, getNumeralSuitSet } from './HandUtils';
import { Suit } from '../core/Types';
import { checkWin, WinTypeResolved } from './WinChecker';
// ============================================================
// 1. 单项校验
// ============================================================
/**
 * 校验 1：手牌是否含至少 1 张幺九牌
 *  - 数牌 1 和 9 算幺九
 *  - 字牌（风+元）一律算幺九
 */
export function hasYaojiu(tiles: Tile[]): boolean {
    return tiles.some(t => isYaojiu(t));
}
/**
 * 校验 2：手牌是否含刻子
 *  - 普通情况：3 张同种即一个刻子
 *  - 特殊豁免："一对中发白"也视为刻（即 2 张中 / 2 张发 / 2 张白 任一即满足）
 *
 * @param tiles 全部 14 张（含胡的那张）
 */
export function hasKeziOrYuanPair(tiles: Tile[]): boolean {
    const counts = countByType(tiles);
    for (const [key, c] of counts) {
        // 普通刻子（任意 3 张同种）
        if (c >= 3)
            return true;
    }
    // 一对中发白（Yuan suit 任一种 >= 2 张）
    for (const [key, c] of counts) {
        const { suit } = parseKeySafe(key);
        if (suit === Suit.Yuan && c >= 2)
            return true;
    }
    return false;
}
/**
 * 简单解析 Key 为 suit + rank（仅取 suit）
 *  - 重复小工具避免循环依赖 HandUtils.parseKey
 */
function parseKeySafe(key: string): {
    suit: Suit;
    rank: number;
} {
    const [suit, rankStr] = key.split(':');
    return { suit: suit as Suit, rank: parseInt(rankStr, 10) };
}
// ============================================================
// 2. 清一色判定
// ============================================================
/**
 * 是否"纯清一色"
 *  - 所有数牌同花色 + 无字牌
 *  - 纯清豁免缺门 + 倍数 ×4
 */
export function isChunQing(tiles: Tile[]): boolean {
    const numSuits = getNumeralSuitSet(tiles);
    const hasHonor = tiles.some(t => isHonor(t));
    return numSuits.size === 1 && !hasHonor;
}
/**
 * 是否"混清一色"
 *  - 数牌同花色 + 至少 1 张字牌
 *  - 混清豁免缺门 + 倍数 ×2
 */
export function isHunQing(tiles: Tile[]): boolean {
    const numSuits = getNumeralSuitSet(tiles);
    const hasHonor = tiles.some(t => isHonor(t));
    return numSuits.size === 1 && hasHonor;
}
/**
 * 是否"清一色"（混清或纯清）
 *  - 用于门槛校验的缺门豁免判断
 */
export function isQingYiSe(tiles: Tile[]): boolean {
    return isChunQing(tiles) || isHunQing(tiles);
}
// ============================================================
// 3. 综合门槛校验
// ============================================================
/**
 * 门槛校验结果
 */
export interface EligibilityResult {
    /** 是否通过门槛 */
    ok: boolean;
    /** 未通过的原因（多语言时改成 code） */
    reasons: string[];
}
/**
 * 胡牌门槛综合校验
 *  - 调用方传入 WinChecker 的判定结果 + 全部 14 张牌
 *
 * @param tiles 14 张（手牌 + 胡的那张）
 * @param isQiXiaoDui 是否为七小对胡型（含豪华）
 */
export function checkHandEligibility(tiles: Tile[], isQiXiaoDui: boolean, hasFixedTriplet = false): EligibilityResult {
    const reasons: string[] = [];
    // 1. 必须有幺九
    if (!hasYaojiu(tiles)) {
        reasons.push('手牌无幺九');
    }
    // 2. 必须有刻子（七小对豁免）
    if (!isQiXiaoDui && !hasFixedTriplet && !hasKeziOrYuanPair(tiles)) {
        reasons.push('手牌无刻子（含一对中发白豁免）');
    }
    // 3. 禁止缺门（清一色豁免）
    //   - 清一色（纯 / 混）豁免缺门
    if (!isQingYiSe(tiles) && hasMissingSuit(tiles)) {
        reasons.push('手牌缺门（非清一色）');
    }
    return { ok: reasons.length === 0, reasons };
}
/**
 * 综合校验：能否合法胡牌（含胡牌判定 + 门槛校验）
 *  - 内部组合 WinChecker.checkWin + checkHandEligibility
 *  - 返回 finalOk = 能胡牌 且 门槛通过
 *
 * @param tiles 14 张牌
 * @param allowQiXiaoDui 房间是否开启七小对
 */
export function fullCheck(tiles: Tile[], allowQiXiaoDui: boolean = true): {
    canWin: boolean;
    winType: WinTypeResolved;
    eligibility: EligibilityResult;
    finalOk: boolean;
} {
    const win = checkWin(tiles, allowQiXiaoDui);
    if (!win.canWin) {
        return {
            canWin: false,
            winType: WinTypeResolved.None,
            eligibility: { ok: false, reasons: ['不能胡牌（结构不合法）'] },
            finalOk: false,
        };
    }
    const isQi = win.winType === WinTypeResolved.QiXiaoDui
        || win.winType === WinTypeResolved.HaoHuaQiXiaoDui;
    const eligibility = checkHandEligibility(tiles, isQi);
    return {
        canWin: true,
        winType: win.winType,
        eligibility,
        finalOk: eligibility.ok,
    };
}
