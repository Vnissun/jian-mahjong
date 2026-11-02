/**
 * RoundManager.ts - 局/圈/庄管理
 * ------------------------------------------------------------
 * 集安规则：
 *   1. 吊庄：开局决定谁先做庄，东→南→西→北
 *   2. 庄家连庄：胜家庄继续做；荒庄庄家连庄
 *   3. 闲家胡：庄家下台，下家做庄
 *   4. 一封圈 = 4 庄（东→南→西→北 各 1 次）
 *   5. 北打完 4 庄后重新吊庄打乱座位，记 1 封圈
 *   6. 房间选封圈数（默认 3），全部完成则房间结束
 *   7. 荒庄：庄家连庄，杠分由 GameSession 在局末统一入账
 */

import { Room, RoomPhase } from '../core/Room';
import { Player } from '../core/Player';
import { SeatWind, Wind } from '../core/Types';

// ============================================================
// 1. 庄位顺序常量
// ============================================================

/** 庄位顺序：东 → 南 → 西 → 北 */
const DEALER_ORDER: SeatWind[] = [
    SeatWind.East,
    SeatWind.South,
    SeatWind.West,
    SeatWind.North,
];

/** 圈风顺序：东 → 南 → 西 → 北 */
const ROUND_WIND_ORDER: Wind[] = [
    Wind.East,
    Wind.South,
    Wind.West,
    Wind.North,
];

// ============================================================
// 2. 吊庄（开局决定首庄）
// ============================================================

/**
 * 吊庄：从 4 人中随机选 1 个做首庄
 *  - 实际规则：开局掷骰子决定庄位
 *  - 简化：直接传入指定座位（或随机）
 *
 * @param room 房间
 * @param firstDealer 首庄座位（不传则随机）
 */
export function initDealer(
    room: Room,
    firstDealer: SeatWind = randomSeat(),
): void {
    room.currentDealer = firstDealer;
    room.currentRoundWind = Wind.East;
    room.currentWindDeals = 0;
    room.completedWinds = 0;
    room.phase = RoomPhase.Playing;
}

/** 随机座位 */
function randomSeat(): SeatWind {
    const idx = Math.floor(Math.random() * 4);
    return DEALER_ORDER[idx];
}

// ============================================================
// 3. 庄家轮换
// ============================================================

/**
 * 内部：单纯推进庄位到下一个（不动封圈计数）
 *  - 用于闲家胡牌后
 */
function rotateToNextDealer(room: Room): void {
    const idx = DEALER_ORDER.indexOf(room.currentDealer);
    room.currentDealer = DEALER_ORDER[(idx + 1) % DEALER_ORDER.length];
    room.currentWindDeals++;
    // 4 庄打完一封圈
    if (room.currentWindDeals >= 4) {
        room.currentWindDeals = 0;
        room.completedWinds++;
        // 圈风切换：东 → 南 → 西 → 北 → 东...
        const wIdx = ROUND_WIND_ORDER.indexOf(room.currentRoundWind);
        room.currentRoundWind = ROUND_WIND_ORDER[(wIdx + 1) % ROUND_WIND_ORDER.length];
        // 注：北圈打完后"重新吊庄打乱座位"——具体打乱算法在后续 AI/网络阶段实现
        // 此处仅推进 completedWinds
    }
}

// ============================================================
// 4. 胡牌后推进
// ============================================================

/**
 * 胡牌后推进庄家
 *  - 庄家胡：连庄（currentDealer 不变，currentWindDeals 不变）
 *  - 闲家胡：庄家下台，下家做庄
 *
 * @param room 房间
 * @param winner 胡家
 * @returns 是否完成全部封圈
 */
export function advanceAfterWin(room: Room, winner: Player): boolean {
    const winnerIsDealer = winner.seat === room.currentDealer;
    if (!winnerIsDealer) {
        // 闲家胡：推进庄位
        rotateToNextDealer(room);
    }
    // 庄家胡：连庄，不动
    return checkRoomFinished(room);
}

// ============================================================
// 5. 荒庄推进
// ============================================================

/**
 * 荒庄推进：庄家连庄
 *  - currentDealer 不变
 *  - currentWindDeals 不变（荒庄不算封圈推进）
 *  - 杠分由会话层在荒庄时统一入账，本层只推进局次
 *
 * @param room 房间
 * @returns 是否完成全部封圈
 */
export function advanceAfterDraw(room: Room): boolean {
    // 庄家连庄，无变化
    return checkRoomFinished(room);
}

// ============================================================
// 6. 房间完成判定
// ============================================================

/**
 * 检查房间是否打完所有封圈
 *  - 房间结束：phase = Finished
 */
export function checkRoomFinished(room: Room): boolean {
    if (room.completedWinds >= room.config.totalRoundWinds) {
        room.phase = RoomPhase.Finished;
        return true;
    }
    return false;
}

// ============================================================
// 7. 工具：查询当前庄家玩家
// ============================================================

/**
 * 获取当前庄家玩家对象
 */
export function getCurrentDealerPlayer(room: Room, players: Player[]): Player {
    const dealer = players.find(p => p.seat === room.currentDealer);
    if (!dealer) throw new Error(`找不到庄家：${room.currentDealer}`);
    return dealer;
}

/**
 * 当前已完成的封圈数
 */
export function getCompletedWinds(room: Room): number {
    return room.completedWinds;
}

/**
 * 当前圈风
 */
export function getCurrentRoundWind(room: Room): Wind {
    return room.currentRoundWind;
}

/**
 * 本封圈已完成庄数（0~3，第 4 庄完成即推进封圈）
 */
export function getCurrentWindDeals(room: Room): number {
    return room.currentWindDeals;
}

/**
 * 房间是否已结束
 */
export function isRoomFinished(room: Room): boolean {
    return room.phase === RoomPhase.Finished;
}
