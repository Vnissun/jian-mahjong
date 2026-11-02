/**
 * WallGenerator.ts - 牌墙生成 + 洗牌 + 发牌
 * ------------------------------------------------------------
 * 集安麻将"牌墙"由 136 张洗好的牌组成，分两段：
 *   1. 正常摸牌区（从头部 draw）
 *   2. 长毛区 / 海底区（从尾部 draw，杠后补牌用）
 *
 * 规则要点：
 *   - 杠后长毛：玩家开杠后，从牌墙末尾（长毛区）补 1 张牌，
 *     避免直接消耗正常牌墙，保证荒庄点正常。
 *   - 庄家发 14 张（开局即多 1 张准备出牌），闲家各 13 张。
 *   - 荒庄：正常牌墙摸完（长毛区不动），即流局。
 */

import { ALL_TILES } from '../data/TileCatalog';
import { Tile } from '../core/Tile';
import { Player } from '../core/Player';
import { SeatWind } from '../core/Types';

// ============================================================
// 1. 牌墙结构
// ============================================================

/**
 * 牌墙（Wall）
 *  - drawStack：正常摸牌区（从头摸）
 *  - kongStack：长毛区（杠后从尾部摸）
 *  - 全部使用 Tile[] 数组，drawIndex 跟踪当前摸到哪
 *
 * 设计：用单数组 + 两个指针更省内存，但为了易读性，分两个数组。
 */
export interface Wall {
    /** 正常摸牌区（按数组顺序从 0 摸到 length-1） */
    drawStack: Tile[];
    /** 长毛区（杠后从尾部摸，按 reverse 顺序） */
    kongStack: Tile[];
    /** 当前正常摸牌位置（drawStack 已摸张数） */
    drawIndex: number;
    /** 当前长毛摸牌位置（kongStack 已摸张数，从尾部数） */
    kongIndex: number;
}

// ============================================================
// 2. 洗牌
// ============================================================

/**
 * Fisher-Yates 洗牌算法
 *  - 原地打乱数组
 *  - 公平随机：每种排列等概率
 */
let serverRandomIndex: ((limit: number) => number) | undefined;
export function setWallRandomIndex(provider: (limit: number) => number): void { serverRandomIndex = provider; }
function randomIndex(limit: number): number {
    if (serverRandomIndex) return serverRandomIndex(limit);
    const crypto = globalThis.crypto;
    if (!crypto?.getRandomValues) return Math.floor(Math.random() * limit);
    const range = 0x100000000, ceiling = range - range % limit, buffer = new Uint32Array(1);
    do { crypto.getRandomValues(buffer); } while (buffer[0] >= ceiling);
    return buffer[0] % limit;
}
export function shuffle<T>(arr: T[]): T[] {
    const out = arr.slice(); // 不修改入参
    for (let i = out.length - 1; i > 0; i--) {
        // 取 [0, i] 内随机一个 j
        const j = randomIndex(i + 1);
        // 交换
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
    }
    return out;
}

// ============================================================
// 3. 牌墙生成
// ============================================================

/**
 * 默认每副牌的长毛区长度
 *  - 集安惯例：14 张（够 4 次杠补牌，绰绰有余）
 *  - 实际杠最多几次不好估，给 14 张安全冗余
 */
export const DEFAULT_KONG_STACK_SIZE = 14;

/**
 * 生成一份新牌墙
 *  - 从 ALL_TILES 复制一份并洗牌
 *  - 末尾 DEFAULT_KONG_STACK_SIZE 张作为长毛区
 *  - 其余作为正常摸牌区
 *
 * @param kongStackSize 长毛区张数（默认 14）
 */
export function createWall(kongStackSize: number = DEFAULT_KONG_STACK_SIZE): Wall {
    if (kongStackSize < 0 || kongStackSize > ALL_TILES.length) {
        throw new Error(`长毛区张数非法：${kongStackSize}`);
    }
    const shuffled = shuffle(ALL_TILES.slice());
    // 末尾切出长毛区
    const kongStack = shuffled.splice(shuffled.length - kongStackSize, kongStackSize);
    return {
        drawStack: shuffled,        // 剩下的 122 张为正常区
        kongStack,
        drawIndex: 0,
        kongIndex: 0,
    };
}

// ============================================================
// 4. 摸牌
// ============================================================

/**
 * 正常摸牌（从牌墙头部）
 *  - 返回 undefined 表示荒庄（正常区已摸空）
 */
export function drawTile(wall: Wall): Tile | undefined {
    if (wall.drawIndex >= wall.drawStack.length) {
        return undefined; // 荒庄
    }
    return wall.drawStack[wall.drawIndex++];
}

/**
 * 杠后补牌（长毛摸牌，从尾部）
 *  - 集安规则："杠后长毛，牌墙末尾补一张牌"
 *  - 返回 undefined 表示长毛区也空了（极少见）
 */
export function drawKongTile(wall: Wall): Tile | undefined {
    if (wall.kongIndex >= wall.kongStack.length) {
        return undefined;
    }
    // 从尾部反向摸
    return wall.kongStack[wall.kongStack.length - 1 - wall.kongIndex++];
}

/**
 * 牌墙剩余可摸张数（正常区）
 */
export function getRemainingCount(wall: Wall): number {
    return wall.drawStack.length - wall.drawIndex;
}

/**
 * 长毛区剩余张数
 */
export function getKongRemainingCount(wall: Wall): number {
    return wall.kongStack.length - wall.kongIndex;
}

// ============================================================
// 5. 发牌
// ============================================================

/**
 * 给 4 个玩家发初始手牌
 *  - 庄家 14 张（开局即有 1 张准备出牌）
 *  - 闲家 13 张
 *
 * 顺序：从牌墙头部连续摸，按 seat 顺序发 13 张给所有人，
 *      再额外摸 1 张给庄家。
 *
 * @param wall 牌墙
 * @param players [East, South, West, North] 4 个玩家
 * @param dealerSeat 庄家座位
 */
export function dealHands(
    wall: Wall,
    players: Player[],
    dealerSeat: SeatWind,
): void {
    if (players.length !== 4) {
        throw new Error(`发牌需要 4 人，当前 ${players.length}`);
    }

    // 13 张 × 4 人 = 52 张，先发给所有人
    for (let round = 0; round < 13; round++) {
        for (const p of players) {
            const t = drawTile(wall);
            if (!t) throw new Error('牌墙不够：发牌途中正常区已空');
            p.hand.push(t);
        }
    }
    // 庄家额外 1 张（共 14 张）
    const dealer = players.find(p => p.seat === dealerSeat);
    if (!dealer) throw new Error(`找不到庄家：${dealerSeat}`);
    const extra = drawTile(wall);
    if (!extra) throw new Error('牌墙不够：庄家第 14 张摸不到');
    dealer.hand.push(extra);
    dealer.state.isDealer = true;
}

// ============================================================
// 6. 工具：洗牌/发牌的整流程（封装一次性调用）
// ============================================================

/**
 * 开局：洗牌 + 发牌 一体化
 *  - 返回新牌墙
 *  - 玩家手牌会被填充
 */
export function setupNewRound(
    players: Player[],
    dealerSeat: SeatWind,
    kongStackSize: number = DEFAULT_KONG_STACK_SIZE,
    prepareWall?: (wall: Wall) => void,
): Wall {
    // 清空玩家手牌（保险起见）
    for (const p of players) {
        p.hand = [];
        p.melds = [];
        p.discards = [];
        p.state.isDealer = false;
    }
    const wall = createWall(kongStackSize);
    prepareWall?.(wall);
    dealHands(wall, players, dealerSeat);
    return wall;
}
