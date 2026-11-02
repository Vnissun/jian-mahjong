/**
 * Tile.ts - 牌的数据结构与工具方法
 * ------------------------------------------------------------
 * 集安麻将 136 张牌的统一数据结构：
 *   - 万 1~9、筒 1~9、条 1~9  （数牌，每花色 9 种）
 *   - 风：东南西北            （字牌，4 种）
 *   - 元：中发白              （字牌，3 种）
 * 合计 9+9+9+4+3 = 34 种 × 4 张 = 136 张。
 *
 * 注意：
 *   - 每张牌有一个全局唯一 id（0~135）用于区分"同样的 4 张"。
 *   - 同一种牌的 suit + rank 完全相同，但 id 不同。
 */

import { Suit, TileId } from './Types';

// ============================================================
// 1. 牌的数据结构
// ============================================================

/**
 * 单张牌的不可变描述
 *  - id：全局唯一编号（0~135）
 *  - suit：花色（万/筒/条/风/元）
 *  - rank：点数（数牌 1~9，风牌 1~4，元牌 1~3）
 *  - name：中文名（"一万"、"东风"等，方便日志/UI）
 */
export interface Tile {
    /** 全局唯一 id（0~135） */
    readonly id: TileId;
    /** 花色 */
    readonly suit: Suit;
    /** 点数（数牌 1~9；风牌 1~4；元牌 1~3） */
    readonly rank: number;
    /** 中文显示名 */
    readonly name: string;
}

// ============================================================
// 2. 牌的判断工具
// ============================================================

/**
 * 判断是否为字牌（风牌 + 元牌）
 * 集安规则：字牌一律算幺九。
 */
export function isHonor(tile: Tile): boolean {
    return tile.suit === Suit.Feng || tile.suit === Suit.Yuan;
}

/**
 * 判断是否为老头牌（数牌 1 或 9）
 * 注意：老头牌是数牌范畴，不含字牌。
 */
export function isTerminal(tile: Tile): boolean {
    if (isHonor(tile)) return false;
    return tile.rank === 1 || tile.rank === 9;
}

/**
 * 判断是否为幺九牌
 * 集安规则：
 *   1. 数牌的 1 和 9；
 *   2. 所有字牌（东南西北中发白）也算幺九。
 * 胡牌硬性条件：手牌必须含至少 1 张幺九。
 */
export function isYaojiu(tile: Tile): boolean {
    return isTerminal(tile) || isHonor(tile);
}

/**
 * 判断是否为数牌（万/筒/条）
 */
export function isNumeral(tile: Tile): boolean {
    return tile.suit === Suit.Wan
        || tile.suit === Suit.Tong
        || tile.suit === Suit.Tiao;
}

/**
 * 判断两张牌是否为同一种（id 可以不同，但 suit + rank 相同）
 * 用于碰 / 杠 / 顺子判定。
 */
export function isSameType(a: Tile, b: Tile): boolean {
    return a.suit === b.suit && a.rank === b.rank;
}

/**
 * 判断三张数牌能否组成顺子（必须同花色，rank 连续）
 * 仅数牌可成顺子；字牌不能。
 */
export function isShunts(a: Tile, b: Tile, c: Tile): boolean {
    if (!isNumeral(a) || !isNumeral(b) || !isNumeral(c)) return false;
    if (a.suit !== b.suit || b.suit !== c.suit) return false;
    const ranks = [a.rank, b.rank, c.rank].sort((x, y) => x - y);
    return ranks[1] - ranks[0] === 1 && ranks[2] - ranks[1] === 1;
}

/**
 * 判断三张牌能否组成刻子（同种 3 张）
 * 字牌和数牌都行。
 */
export function isTriplets(a: Tile, b: Tile, c: Tile): boolean {
    return isSameType(a, b) && isSameType(b, c);
}

/**
 * 判断四张牌能否组成杠子（同种 4 张）
 */
export function isGangTiles(a: Tile, b: Tile, c: Tile, d: Tile): boolean {
    return isSameType(a, b) && isSameType(b, c) && isSameType(c, d);
}

// ============================================================
// 3. 牌的显示与命名
// ============================================================

/**
 * 数牌的中文点数
 */
const WAN_NAMES = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const TONG_NAMES = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const TIAO_NAMES = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

/**
 * 风牌中文名（按 rank 1~4）
 */
const FENG_NAMES = ['东', '南', '西', '北'];

/**
 * 元牌中文名（按 rank 1~3）
 */
const YUAN_NAMES = ['中', '发', '白'];

/**
 * 根据 suit + rank 生成中文名
 *  - 万 / 筒 / 条："一万"、"一筒"、"一条"
 *  - 风："东"、"南"、"西"、"北"
 *  - 元："中"、"发"、"白"
 */
export function getTileName(suit: Suit, rank: number): string {
    switch (suit) {
        case Suit.Wan: return `${WAN_NAMES[rank - 1]}万`;
        case Suit.Tong: return `${TONG_NAMES[rank - 1]}筒`;
        case Suit.Tiao: return `${TIAO_NAMES[rank - 1]}条`;
        case Suit.Feng: return FENG_NAMES[rank - 1];
        case Suit.Yuan: return YUAN_NAMES[rank - 1];
        default: return `未知牌(${suit}:${rank})`;
    }
}

/**
 * 构造一张牌实例（内部使用，外部通常直接用 TileCatalog 里的预定义表）
 */
export function createTile(id: TileId, suit: Suit, rank: number): Tile {
    return {
        id,
        suit,
        rank,
        name: getTileName(suit, rank),
    };
}
