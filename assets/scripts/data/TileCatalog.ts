/**
 * TileCatalog.ts - 136 张牌的完整数据表
 * ------------------------------------------------------------
 * 本文件导出整副牌的数据，是游戏中"牌池"的来源。
 * 任何发牌 / 摸牌 / 洗牌都从这里取，且每张牌只能出现一次（用 id 唯一标识）。
 *
 * 牌分布（每种 4 张）：
 *   - 万 1~9     : 9 × 4 = 36 张
 *   - 筒 1~9     : 9 × 4 = 36 张
 *   - 条 1~9     : 9 × 4 = 36 张
 *   - 风东南西北 : 4 × 4 = 16 张
 *   - 元中发白   : 3 × 4 = 12 张
 * 合计 = 136 张
 *
 * id 编号方案：
 *   - 万  : 0~35   (rank r 的 4 张为 id = (r-1)*4 + 0/1/2/3)
 *   - 筒  : 36~71
 *   - 条  : 72~107
 *   - 风  : 108~123
 *   - 元  : 124~135
 */

import { Suit } from '../core/Types';
import { createTile, Tile } from '../core/Tile';

// ============================================================
// 1. 生成 136 张牌的工厂
// ============================================================

/**
 * 花色对应的 id 起始值（每花色之间隔 36，但风、元只占 16/12 张）
 * 为简化，我们直接循环生成所有牌。
 */
const SUIT_DEFS: Array<{ suit: Suit; ranks: number }> = [
    { suit: Suit.Wan, ranks: 9 },    // 万 1~9
    { suit: Suit.Tong, ranks: 9 },   // 筒 1~9
    { suit: Suit.Tiao, ranks: 9 },   // 条 1~9
    { suit: Suit.Feng, ranks: 4 },    // 风东南西北
    { suit: Suit.Yuan, ranks: 3 },    // 元中发白
];

/**
 * 生成所有 136 张牌，按 id 顺序排列。
 * 每一种牌（同 suit+rank）4 张。
 */
function buildAllTiles(): Tile[] {
    const tiles: Tile[] = [];
    let id = 0;
    for (const def of SUIT_DEFS) {
        for (let r = 1; r <= def.ranks; r++) {
            for (let copy = 0; copy < 4; copy++) {
                // 4 张同种牌，rank 相同，id 递增
                tiles.push(createTile(id, def.suit, r));
                id++;
            }
        }
    }
    if (id !== 136) {
        // 自检：必须正好 136 张
        throw new Error(`牌表生成错误：期望 136 张，实际 ${id} 张`);
    }
    return tiles;
}

// ============================================================
// 2. 导出整副牌
// ============================================================

/**
 * 整副 136 张牌（不可变）
 * 任何模块要"摸牌"都从这里克隆一份再洗。
 */
export const ALL_TILES: ReadonlyArray<Tile> = Object.freeze(buildAllTiles());

/**
 * 牌总数（满牌状态）
 */
export const TOTAL_TILES = ALL_TILES.length; // 136

/**
 * 根据 id 反查牌
 */
const TILE_BY_ID: Map<number, Tile> = new Map(ALL_TILES.map(t => [t.id, t] as const));

/**
 * 用 id 快速取牌
 *  - 找不到时返回 undefined（不应该发生在正常流程）
 */
export function getTileById(id: number): Tile | undefined {
    return TILE_BY_ID.get(id);
}

// ============================================================
// 3. 按花色分组的索引（便于 UI 渲染、规则判断）
// ============================================================

/**
 * 按花色分组的牌（不含重复 4 张，仅 1 张代表）
 * 用于：UI 展示牌型图谱 / 测试枚举
 */
export const TILES_BY_SUIT: Readonly<Record<Suit, ReadonlyArray<Tile>>> = Object.freeze({
    [Suit.Wan]: ALL_TILES.filter(t => t.suit === Suit.Wan && t.rank === 1).length
        ? uniqueBySuit(Suit.Wan)
        : [],
    [Suit.Tong]: uniqueBySuit(Suit.Tong),
    [Suit.Tiao]: uniqueBySuit(Suit.Tiao),
    [Suit.Feng]: uniqueBySuit(Suit.Feng),
    [Suit.Yuan]: uniqueBySuit(Suit.Yuan),
});

/** 取某花色的去重牌列表（每种仅 1 张） */
function uniqueBySuit(suit: Suit): Tile[] {
    const seen = new Set<number>();
    const out: Tile[] = [];
    for (const t of ALL_TILES) {
        if (t.suit === suit && !seen.has(t.rank)) {
            seen.add(t.rank);
            out.push(t);
        }
    }
    return out;
}

// ============================================================
// 4. 测试 / 调试导出
// ============================================================

/**
 * 打印整副牌（调试用）
 */
export function debugPrintAllTiles(): void {
    console.log('--- 集安麻将牌表（共', ALL_TILES.length, '张）---');
    for (const t of ALL_TILES) {
        console.log(`id=${t.id}\t${t.name}\t(${t.suit}:${t.rank})`);
    }
}
