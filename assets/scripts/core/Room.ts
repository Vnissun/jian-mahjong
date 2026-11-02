/**
 * Room.ts - 房间数据结构与配置
 * ------------------------------------------------------------
 * 一个 Room 描述一桌的"局外"信息（玩家、配置、积分）。
 * 一桌包含多个"封圈"（RoundWind），每封圈包含 4 个庄，
 * 每庄是一局（Round）。
 *
 * 房间配置（RoomConfig）= 玩家开局时选择的可调参数：
 *   - 底分（1 / 2 / 5）
 *   - 满贯（32 / 64 / 128 / 256）
 *   - 封圈数量（默认 3）
 *   - 是否允许吃牌（默认禁）
 *   - 是否开启七小对
 *
 * 集安规则要点：
 *   - 庄家连庄：胜家庄继续；荒庄（流局）庄家连庄。
 *   - 吊庄：北打完 4 庄后，重新打乱座位，记 1 封圈。
 */

import { Player } from './Player';
import { SeatWind, Wind } from './Types';

// ============================================================
// 1. 房间配置接口
// ============================================================

/**
 * 房间可调参数（开房时由房主选择）
 * 所有值都从 GameConfig.ts 的预定义选项里选一个。
 */
export interface RoomConfig {
    /** 底分：1 / 2 / 5 */
    baseScore: number;
    /** 满贯：32 / 64 / 128 / 256；0 表示无限，不封顶 */
    cap: number;
    /** 封圈数量（默认 3） */
    totalRoundWinds: number;
    /** 保留兼容字段，房间始终允许吃牌 */
    allowChi: boolean;
    /** 是否开启七小对胡型（默认 true） */
    allowQiXiaoDui: boolean;
    /** 开启时双方报听倍数相乘；默认关闭，取较高者 */
    riichiDuel?: boolean;
}

// ============================================================
// 2. 房间主结构
// ============================================================

/**
 * 房间当前所处的大阶段
 */
export enum RoomPhase {
    Waiting = 'waiting',       // 等待开局（人未齐）
    Playing = 'playing',       // 进行中
    Finished = 'finished',     // 全部封圈打完
}

/**
 * 房间主体（一桌）
 */
export interface Room {
    /** 房间号（开房生成的 6 位码） */
    readonly roomId: string;
    /** 房主 ID */
    readonly ownerId: string;

    /** 房间配置（不可改，开局后冻结） */
    config: RoomConfig;

    /** 4 个玩家，按 SeatWind 顺序：[East, South, West, North] */
    players: Player[];

    /** 当前圈风（每封圈换一次） */
    currentRoundWind: Wind;
    /** 当前庄家的座位方向 */
    currentDealer: SeatWind;
    /** 已完成封圈数 */
    completedWinds: number;
    /** 本封圈已完成的庄数（0~3，第 4 庄完成即封圈） */
    currentWindDeals: number;

    /** 房间阶段 */
    phase: RoomPhase;
}

// ============================================================
// 3. 工厂方法
// ============================================================

/**
 * 创建一个房间
 *  - 初始圈风 = 东
 *  - 初始庄 = 东（开局吊庄，东先打）
 *  - 已完成封圈 = 0
 *  - 玩家列表顺序固定 [东, 南, 西, 北]
 */
export function createRoom(
    roomId: string,
    ownerId: string,
    config: RoomConfig,
    players: Player[],
): Room {
    if (players.length !== 4) {
        throw new Error(`房间必须 4 人，当前 ${players.length} 人`);
    }
    return {
        roomId,
        ownerId,
        config: { ...config, allowChi: true, riichiDuel: config.riichiDuel ?? false },
        players,
        currentRoundWind: Wind.East,
        currentDealer: SeatWind.East,
        completedWinds: 0,
        currentWindDeals: 0,
        phase: RoomPhase.Waiting,
    };
}

// ============================================================
// 4. 房间工具方法
// ============================================================

/**
 * 房间是否已经打完所有封圈
 */
export function isRoomFinished(room: Room): boolean {
    return room.completedWinds >= room.config.totalRoundWinds;
}

/**
 * 获取当前庄家玩家
 */
export function getCurrentDealer(room: Room): Player {
    return room.players.find(p => p.seat === room.currentDealer)!;
}

/**
 * 推进到下一庄（庄家连庄不算）
 * 顺序：东 → 南 → 西 → 北 → （回到东 → 完成封圈）
 */
export function advanceNextDealer(room: Room): void {
    const order: SeatWind[] = [
        SeatWind.East,
        SeatWind.South,
        SeatWind.West,
        SeatWind.North,
    ];
    const idx = order.indexOf(room.currentDealer);
    const next = order[(idx + 1) % order.length];
    room.currentDealer = next;
    room.currentWindDeals++;

    if (room.currentWindDeals >= 4) {
        // 一封圈完成，进入下一圈风
        room.currentWindDeals = 0;
        room.completedWinds++;
        // 圈风切换：东→南→西→北
        const windOrder: Wind[] = [Wind.East, Wind.South, Wind.West, Wind.North];
        const wIdx = windOrder.indexOf(room.currentRoundWind);
        room.currentRoundWind = windOrder[(wIdx + 1) % windOrder.length];
        // 重新吊庄，打乱座位（具体打乱算法在后续阶段实现）
    }
}
