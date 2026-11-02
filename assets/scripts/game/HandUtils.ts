/**
 * HandUtils.ts - 手牌工具方法
 * ------------------------------------------------------------
 * 集中所有"按手牌做计算"的工具：
 *   - 排序（按 suit → rank → id）
 *   - 计数（同种牌出现次数）
 *   - 按花色分组
 *   - 数牌花色集合（用于缺门判断）
 *
 * 这些工具不依赖任何业务逻辑，是 WinChecker / HandValidator 的基础。
 */

import { Tile, isNumeral } from '../core/Tile';
import { Suit } from '../core/Types';

// ============================================================
// 1. 排序
// ============================================================

/**
 * 牌的"排序键"
 *  - 用一个数字编码：suit 序号 × 100 + rank
 *  - 顺序：万(0) < 筒(100) < 条(200) < 风(300) < 元(400)
 */
export function tileSortKey(tile: Tile): number {
    const suitOrder: Record<Suit, number> = {
        [Suit.Wan]: 0,
        [Suit.Tong]: 100,
        [Suit.Tiao]: 200,
        [Suit.Feng]: 300,
        [Suit.Yuan]: 400,
    };
    return suitOrder[tile.suit] + tile.rank;
}

/**
 * 排序手牌（原地修改）
 *  顺序：万 1~9 → 筒 1~9 → 条 1~9 → 风东南西北 → 元中发白
 */
export function sortTiles(tiles: Tile[]): Tile[] {
    return tiles.sort((a, b) => tileSortKey(a) - tileSortKey(b));
}

/**
 * 复制并排序（不修改原数组）
 */
export function sortedCopy(tiles: Tile[]): Tile[] {
    return sortTiles(tiles.slice());
}

// ============================================================
// 2. 计数（核心数据结构）
// ============================================================

/**
 * 牌种 Key
 *  - 用 `${suit}:${rank}` 作为 Map key
 *  - 同种牌（4 张相同）共享一个 key
 */
export function tileKey(tile: Tile): string {
    return `${tile.suit}:${tile.rank}`;
}

/**
 * 从 Key 反解析回 suit + rank
 */
export function parseKey(key: string): { suit: Suit; rank: number } {
    const [suit, rankStr] = key.split(':');
    return { suit: suit as Suit, rank: parseInt(rankStr, 10) };
}

/**
 * 按牌种计数
 *  - 返回 Map<tileKey, count>
 *  - 例：3 张一万 → { 'wan:1': 3 }
 */
export function countByType(tiles: Tile[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const t of tiles) {
        const k = tileKey(t);
        counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
}

/**
 * 根据 Key 查找原始 Tile（用于反查名字等）
 *  - 取该 key 下第一张即可
 */
export function findTileByKey(tiles: Tile[], key: string): Tile | undefined {
    return tiles.find(t => tileKey(t) === key);
}

// ============================================================
// 3. 按花色分组
// ============================================================

/**
 * 按花色分组
 *  - 返回 Record<Suit, Tile[]>
 *  - 空花色也占位（空数组）
 */
export function groupBySuit(tiles: Tile[]): Record<Suit, Tile[]> {
    const out: Record<Suit, Tile[]> = {
        [Suit.Wan]: [],
        [Suit.Tong]: [],
        [Suit.Tiao]: [],
        [Suit.Feng]: [],
        [Suit.Yuan]: [],
    };
    for (const t of tiles) {
        out[t.suit].push(t);
    }
    return out;
}

// ============================================================
// 4. 数牌花色集合（用于缺门判断）
// ============================================================

/**
 * 手牌中出现过的数牌花色集合
 *  - 仅数牌（万/筒/条）参与判断
 *  - 字牌不参与
 *
 * 缺门规则：万/筒/条 三色中只要少一种就算缺门
 *  - 完整集 = {Wan, Tong, Tiao}
 *  - 实际集 != 完整集 → 缺门
 */
export function getNumeralSuitSet(tiles: Tile[]): Set<Suit> {
    const out = new Set<Suit>();
    for (const t of tiles) {
        if (isNumeral(t)) out.add(t.suit);
    }
    return out;
}

/**
 * 是否缺门
 *  - 万 / 筒 / 条 三色齐全才算不缺门
 */
export function hasMissingSuit(tiles: Tile[]): boolean {
    const suitSet = getNumeralSuitSet(tiles);
    return !(suitSet.has(Suit.Wan) && suitSet.has(Suit.Tong) && suitSet.has(Suit.Tiao));
}

// ============================================================
// 5. 复制
// ============================================================

/**
 * 深拷贝手牌（仅复制 Tile 引用，因为 Tile 是不可变的）
 *  - Tile 实例本身不可变，无需深拷贝
 */
export function cloneTiles(tiles: Tile[]): Tile[] {
    return tiles.slice();
}
