/**
 * PatternRecognizer.ts - 牌型识别
 * ------------------------------------------------------------
 * 任务：给定 14 张已胡的牌 + 其中"胡的那张牌 H"，
 *      识别出该胡属于哪种型态：
 *        - 对倒（×2）
 *        - 单吊（×2）
 *        - 夹胡（×2）
 *        - 撅（×4）
 *        - 混清一色（×2）
 *        - 纯清一色（×4）
 *
 * 算法思路：
 *   1. 枚举 14 张牌的所有合法"4 面子 + 1 将"拆解（findAllWinPatterns）
 *   2. 对每个拆解方案，找 H 所在的"组"：
 *      a) H 在 pair（将）里  → 单吊
 *      b) H 在刻子（3 张同种）里 → 对倒（pair 必为另一对）
 *      c) H 在顺子里 → 看位置：
 *         - H 是顺子中间张 → 夹胡
 *         - H 是边张：顺子 (1,2,3) 胡 3 / (7,8,9) 胡 7 → 撅
 *   3. 多种方案时取并集，最后返回最高倍数型态
 *
 * 同时识别大牌：
 *   - 混清一色（带字）×2
 *   - 纯清一色无字 ×4
 *
 * 注意：H 必须是 tiles14 中的实际对象引用（用 id 比较）
 */
import { Meld } from '../core/Player';
import { Tile } from '../core/Tile';
import { findAllWinPatterns, WinPattern } from './WinChecker';
import { isChunQing, isHunQing } from './HandValidator';
// ============================================================
// 1. 牌型枚举
// ============================================================
/**
 * 胡牌型态（用于倍数计算）
 *  - 普通胡：默认倍数 1（无标记）
 *  - 单吊 / 对倒 / 夹胡：×2
 *  - 撅：×4
 *  - 混清：×2
 *  - 纯清：×4
 *
 * 注：七小对走 WinChecker 的判定，本模块只处理普通胡的型态。
 */
export enum WinPatternType {
    PingHu = 'pingHu',// 平胡（无特殊型态）
    DuiDao = 'duiDao',// 对倒 ×2
    DanDiao = 'danDiao',// 单吊 ×2
    JiaHu = 'jiaHu',// 夹胡 ×2
    Jue = 'jue',// 撅（边胡）×4
    HunQing = 'hunQing',// 混清一色 ×2
    ChunQing = 'chunQing'
}
/**
 * 型态倍数（与 ScoringConfig.WIN_TYPE_MULTIPLIERS 保持一致）
 *  本地保留一份，便于识别后立即查倍数。
 */
export const PATTERN_MULTIPLIER: Record<WinPatternType, number> = {
    [WinPatternType.PingHu]: 1,
    [WinPatternType.DuiDao]: 2,
    [WinPatternType.DanDiao]: 2,
    [WinPatternType.JiaHu]: 2,
    [WinPatternType.Jue]: 4,
    [WinPatternType.HunQing]: 2,
    [WinPatternType.ChunQing]: 4,
};
// ============================================================
// 2. 识别结果
// ============================================================
/**
 * 牌型识别结果
 *  - patterns：所有命中的型态（一个胡可能同时含多种，例如对倒+纯清）
 *  - maxMultiplier：最高单型态倍数
 *  - 所有命中型态的乘积（结算时用）
 */
export interface PatternResult {
    /** 命中的所有型态 */
    patterns: WinPatternType[];
    /** 所有型态倍数乘积（清一色类 × 听牌型态类） */
    totalMultiplier: number;
    /** 最简单描述（用于 UI / 日志） */
    description: string;
}
// ============================================================
// 3. 核心：识别函数
// ============================================================
/**
 * 识别胡牌型态
 *
 * @param tiles14 14 张已胡的牌
 * @param winTile 胡的那张牌（必须是 tiles14 中的引用）
 */
export function recognizePattern(tiles14: Tile[], winTile: Tile, melds: Meld[] = []): PatternResult {
    const patterns = new Set<WinPatternType>();
    const completeTiles = [...tiles14, ...melds.flatMap(m => m.tiles)];
    // ---- 1. 听牌型态判定（对倒/单吊/夹胡/撅） ----
    const allPatterns = findAllWinPatterns(tiles14);
    for (const p of allPatterns) {
        classifyByPattern(p, winTile, patterns);
    }
    // 如果没有任何听牌型态，至少是平胡
    if (patterns.size === 0 || (patterns.size === 1 && patterns.has(WinPatternType.PingHu))) {
        patterns.add(WinPatternType.PingHu);
    }
    // ---- 2. 大牌判定（清一色类） ----
    // 清一色与听牌型态独立，可叠加
    if (isHunQing(completeTiles)) {
        patterns.add(WinPatternType.HunQing);
    }
    else if (isChunQing(completeTiles)) {
        patterns.add(WinPatternType.ChunQing);
    }
    // ---- 3. 计算总倍数 ----
    // 清一色类与听牌型态类分别取最高，再相乘
    const listenTypes = [WinPatternType.DuiDao, WinPatternType.DanDiao,
        WinPatternType.JiaHu, WinPatternType.Jue];
    const qingTypes = [WinPatternType.HunQing, WinPatternType.ChunQing];
    let listenMul = 1;
    for (const t of listenTypes) {
        if (patterns.has(t)) {
            listenMul = Math.max(listenMul, PATTERN_MULTIPLIER[t]);
        }
    }
    // 平胡不算倍数
    if (listenMul === 1 && !patterns.has(WinPatternType.PingHu)) {
        // 没有任何听牌型态但被强行加 PingHu 时
    }
    let qingMul = 1;
    for (const t of qingTypes) {
        if (patterns.has(t)) {
            qingMul = Math.max(qingMul, PATTERN_MULTIPLIER[t]);
        }
    }
    const totalMultiplier = listenMul * qingMul;
    const description = describePatterns(patterns);
    return {
        patterns: Array.from(patterns),
        totalMultiplier,
        description,
    };
}
/**
 * 根据单个拆解方案，把 H 所在组的角色加入 patterns 集合
 */
function classifyByPattern(p: WinPattern, winTile: Tile, out: Set<WinPatternType>): void {
    // 1. H 在将（pair）里 → 单吊
    if (p.pair.some(t => t.id === winTile.id)) {
        out.add(WinPatternType.DanDiao);
        return;
    }
    // 2. H 在某个面子中
    for (const meld of p.melds) {
        if (!meld.some(t => t.id === winTile.id))
            continue;
        // 判断这个面子是刻子还是顺子
        const isTriplet = meld[0].suit === meld[1].suit
            && meld[1].suit === meld[2].suit
            && meld[0].rank === meld[1].rank
            && meld[1].rank === meld[2].rank;
        if (isTriplet) {
            // 刻子：H + 2 张同种 → 对倒（pair 必为另一对）
            out.add(WinPatternType.DuiDao);
        }
        else {
            // 顺子：判定 H 在顺子中的位置
            const ranks = meld.map(t => t.rank).slice().sort((a, b) => a - b);
            const minRank = ranks[0];
            const maxRank = ranks[2];
            // 顺子必须连续（来自算法保证，此处仅取值）
            // winTile 在顺子中的位置
            const idx = ranks.indexOf(winTile.rank);
            if (idx === 1) {
                // 中间张 → 夹胡
                out.add(WinPatternType.JiaHu);
            }
            else if (idx === 2 && maxRank === 3) {
                // (1,2,3) 胡 3 → 撅（边胡张）
                out.add(WinPatternType.Jue);
            }
            else if (idx === 0 && minRank === 7) {
                // (7,8,9) 胡 7 → 撅（边胡张）
                out.add(WinPatternType.Jue);
            }
            // 其他边张（如 (3,4,5) 胡 3、(5,6,7) 胡 7）算普通顺子胡，不加任何型态
        }
        return; // 一个面子里找到了就跳出
    }
}
// ============================================================
// 4. 描述 / 工具
// ============================================================
/** 型态中文名（UI 显示） */
const PATTERN_LABELS: Record<WinPatternType, string> = {
    [WinPatternType.PingHu]: '平胡',
    [WinPatternType.DuiDao]: '对倒',
    [WinPatternType.DanDiao]: '单吊',
    [WinPatternType.JiaHu]: '夹胡',
    [WinPatternType.Jue]: '撅',
    [WinPatternType.HunQing]: '混清一色',
    [WinPatternType.ChunQing]: '纯清一色',
};
/**
 * 把命中型态集合转为中文描述
 */
export function describePatterns(patterns: Set<WinPatternType>): string {
    const list = Array.from(patterns).map(p => PATTERN_LABELS[p]);
    return list.join(' + ') || '平胡';
}
/**
 * 取单个型态的中文名
 */
export function getPatternLabel(p: WinPatternType): string {
    return PATTERN_LABELS[p];
}
