/**
 * RoundManager.test.ts - 局/圈/庄管理单元测试
 * ------------------------------------------------------------
 * 验证：
 *   - 吊庄：initDealer 设置首庄/圈风/封圈计数
 *   - 庄家胡：连庄（currentDealer/currentWindDeals 都不变）
 *   - 闲家胡：庄家下台，下家做庄；4 庄打完推进一封圈
 *   - 荒庄：庄家连庄，currentWindDeals 不动
 *   - 封圈完成：圈风 东→南→西→北 切换
 *   - 房间结束：3 封圈打完 → phase=Finished
 *   - 荒庄杠分保留不退回（GangSettlement 已实时结算）
 */

import { describe, it, assertTrue, assertFalse, assertEqual, runAllTests } from './runner';
import { createPlayer, Player } from '../assets/scripts/core/Player';
import { createRoom, Room, RoomPhase } from '../assets/scripts/core/Room';
import { DEFAULT_ROOM_CONFIG } from '../assets/scripts/config/GameConfig';
import { SeatWind, Wind } from '../assets/scripts/core/Types';
import {
    initDealer,
    advanceAfterWin,
    advanceAfterDraw,
    checkRoomFinished,
    getCurrentDealerPlayer,
    getCompletedWinds,
    getCurrentRoundWind,
    getCurrentWindDeals,
    isRoomFinished,
} from '../assets/scripts/game/RoundManager';
import {
    GangSettlementMode,
    settleGang,
    applyGangSettlement,
} from '../assets/scripts/game/GangSettlement';
import { createTile, Tile } from '../assets/scripts/core/Tile';
import { Suit, MeldType } from '../assets/scripts/core/Types';

let _id = 0;
function w(r: number): Tile { return createTile(_id++, Suit.Wan, r); }

// 工具：DEALER_ORDER 内部维护（与 RoundManager 一致）
const DEALER_ORDER: SeatWind[] = [
    SeatWind.East, SeatWind.South, SeatWind.West, SeatWind.North,
];

/** 构造 4 玩家 + 房间（默认 3 封圈） */
function makeRoom(totalWinds: number = 3): { room: Room; players: Player[] } {
    const players: Player[] = [
        createPlayer('p1', 'A', SeatWind.East),
        createPlayer('p2', 'B', SeatWind.South),
        createPlayer('p3', 'C', SeatWind.West),
        createPlayer('p4', 'D', SeatWind.North),
    ];
    const config = { ...DEFAULT_ROOM_CONFIG, totalRoundWinds: totalWinds };
    const room = createRoom('R001', 'p1', config, players);
    return { room, players };
}

/** 构造一个明杠副露（4 张万 r） */
function makeMingGang(r: number) {
    const tiles = [w(r), w(r), w(r), w(r)];
    return { type: MeldType.MingGang, tiles, openedTileIndex: 0 };
}

// ============================================================
// 1. 吊庄
// ============================================================

describe('RoundManager - 吊庄', () => {
    it('initDealer：默认从 East 开始，圈风=东，封圈计数清零', () => {
        const { room } = makeRoom();
        initDealer(room, SeatWind.East);
        assertEqual(room.currentDealer, SeatWind.East, '首庄=东');
        assertEqual(room.currentRoundWind, Wind.East, '圈风=东');
        assertEqual(room.currentWindDeals, 0, '本圈庄数=0');
        assertEqual(room.completedWinds, 0, '已完成封圈=0');
        assertEqual(room.phase, RoomPhase.Playing, '阶段=进行中');
    });

    it('initDealer：可指定任意座位为首庄', () => {
        const { room } = makeRoom();
        initDealer(room, SeatWind.South);
        assertEqual(room.currentDealer, SeatWind.South, '首庄=南');
        assertEqual(room.currentRoundWind, Wind.East, '圈风仍=东');
    });
});

// ============================================================
// 2. 庄家胡 → 连庄
// ============================================================

describe('RoundManager - 庄家胡连庄', () => {
    it('庄家胡：currentDealer 不变，currentWindDeals 不变', () => {
        const { room, players } = makeRoom();
        initDealer(room, SeatWind.East);
        const dealer = players[0];  // East 是庄家
        const finished = advanceAfterWin(room, dealer);
        // 庄家胡 → 连庄
        assertEqual(room.currentDealer, SeatWind.East, '庄家胡后庄位不变');
        assertEqual(room.currentWindDeals, 0, 'currentWindDeals 仍=0');
        assertFalse(finished, '房间不应结束');
    });
});

// ============================================================
// 3. 闲家胡 → 推进庄位
// ============================================================

describe('RoundManager - 闲家胡推进', () => {
    it('闲家胡一次：庄位 东→南，currentWindDeals=1', () => {
        const { room, players } = makeRoom();
        initDealer(room, SeatWind.East);
        const winner = players[1];  // South 闲家胡
        const finished = advanceAfterWin(room, winner);
        assertEqual(room.currentDealer, SeatWind.South, '庄位推进到南');
        assertEqual(room.currentWindDeals, 1, '本圈庄数=1');
        assertFalse(finished, '房间不应结束');
    });

    it('闲家胡两次：庄位 东→南→西', () => {
        const { room, players } = makeRoom();
        initDealer(room, SeatWind.East);
        advanceAfterWin(room, players[1]);  // South 胡
        advanceAfterWin(room, players[2]);  // West 胡
        assertEqual(room.currentDealer, SeatWind.West, '庄位推进到西');
        assertEqual(room.currentWindDeals, 2, '本圈庄数=2');
    });

    it('闲家胡三次：庄位 东→南→西→北，currentWindDeals=3', () => {
        const { room, players } = makeRoom();
        initDealer(room, SeatWind.East);
        advanceAfterWin(room, players[1]);
        advanceAfterWin(room, players[2]);
        advanceAfterWin(room, players[3]);
        assertEqual(room.currentDealer, SeatWind.North, '庄位推进到北');
        assertEqual(room.currentWindDeals, 3, '本圈庄数=3');
    });
});

// ============================================================
// 4. 一封圈完成
// ============================================================

describe('RoundManager - 一封圈完成', () => {
    it('4 次闲家胡：东→南→西→北，第 4 次回东 + completedWinds=1', () => {
        const { room, players } = makeRoom();
        initDealer(room, SeatWind.East);
        // 依次让闲家胡（每次庄位都在推进）
        // 第 1 庄：East 庄，South 胡推进到 South
        advanceAfterWin(room, players[1]);
        // 第 2 庄：South 庄，West 胡推进到 West
        advanceAfterWin(room, players[2]);
        // 第 3 庄：West 庄，North 胡推进到 North
        advanceAfterWin(room, players[3]);
        // 第 4 庄：North 庄，East 胡推进到 East（回到起点，完成 1 封圈）
        advanceAfterWin(room, players[0]);

        assertEqual(room.currentDealer, SeatWind.East, '庄位回到东');
        assertEqual(room.completedWinds, 1, '已完成 1 封圈');
        assertEqual(room.currentRoundWind, Wind.South, '圈风切换到南');
        assertEqual(room.currentWindDeals, 0, '本圈庄数清零');
    });

    it('2 封圈完成：圈风 东→南→西', () => {
        const { room, players } = makeRoom();
        initDealer(room, SeatWind.East);
        // 8 次闲家胡 = 2 封圈
        for (let i = 0; i < 8; i++) {
            const dealerIdx = DEALER_ORDER.indexOf(room.currentDealer);
            // 闲家 = 下一个座位
            const winner = players[(dealerIdx + 1) % 4];
            advanceAfterWin(room, winner);
        }
        assertEqual(room.completedWinds, 2, '已完成 2 封圈');
        assertEqual(room.currentRoundWind, Wind.West, '圈风=西');
    });
});

// ============================================================
// 5. 荒庄处理
// ============================================================

describe('RoundManager - 荒庄处理', () => {
    it('荒庄：庄家连庄，currentWindDeals 不变', () => {
        const { room } = makeRoom();
        initDealer(room, SeatWind.East);
        const finished = advanceAfterDraw(room);
        assertEqual(room.currentDealer, SeatWind.East, '荒庄后庄位不变');
        assertEqual(room.currentWindDeals, 0, 'currentWindDeals 不变');
        assertEqual(room.completedWinds, 0, 'completedWinds 不变');
        assertFalse(finished, '房间不应结束');
    });

    it('荒庄不推进封圈计数', () => {
        const { room } = makeRoom();
        initDealer(room, SeatWind.South);
        const beforeDeals = room.currentWindDeals;
        const beforeWinds = room.completedWinds;
        advanceAfterDraw(room);
        assertEqual(room.currentWindDeals, beforeDeals, '本圈庄数不变');
        assertEqual(room.completedWinds, beforeWinds, '已完成封圈不变');
    });

    it('荒庄杠分保留不退回：gangPlayer 积分不变', () => {
        // 验证荒庄不触发杠分退回
        // 杠分实时结算时不退回（荒庄前已结算，荒庄后不退）
        const { room, players } = makeRoom();
        initDealer(room, SeatWind.East);
        players.forEach(p => p.score = 0);

        // 模拟 East 开一次明杠（点炮方 South）
        _id = 0;
        const gangTile = w(5);
        const gangMeld = makeMingGang(5);
        const gangCtx = {
            gangPlayer: players[0],
            meld: gangMeld as any,
            gangTile,
            allPlayers: players,
            currentDealer: SeatWind.East,
            roomConfig: room.config,
            mode: GangSettlementMode.MingGang,
            firer: players[1],
        };
        const gRes = settleGang(gangCtx);
        applyGangSettlement(players, gRes);

        const eastBefore = players[0].score;
        const southBefore = players[1].score;

        // 荒庄推进
        advanceAfterDraw(room);

        // 杠分应保留不退回
        assertEqual(players[0].score, eastBefore, 'East 杠分保留不退回');
        assertEqual(players[1].score, southBefore, 'South 已付杠分不退回');
    });
});

// ============================================================
// 6. 房间结束判定
// ============================================================

describe('RoundManager - 房间结束', () => {
    it('3 封圈打完：isRoomFinished=true，phase=Finished', () => {
        const { room, players } = makeRoom(3);  // 3 封圈
        initDealer(room, SeatWind.East);
        // 12 次闲家胡 = 3 封圈
        let finished = false;
        for (let i = 0; i < 12; i++) {
            const dealerIdx = DEALER_ORDER.indexOf(room.currentDealer);
            const winner = players[(dealerIdx + 1) % 4];
            finished = advanceAfterWin(room, winner);
        }
        assertTrue(finished, '3 封圈后应返回 true');
        assertEqual(room.completedWinds, 3, '已完成 3 封圈');
        assertEqual(room.phase, RoomPhase.Finished, '房间阶段=Finished');
        assertTrue(isRoomFinished(room), 'isRoomFinished 应=true');
    });

    it('2 封圈未完：phase 仍=Playing', () => {
        const { room, players } = makeRoom(3);
        initDealer(room, SeatWind.East);
        for (let i = 0; i < 8; i++) {  // 只打 2 封圈
            const dealerIdx = DEALER_ORDER.indexOf(room.currentDealer);
            const winner = players[(dealerIdx + 1) % 4];
            advanceAfterWin(room, winner);
        }
        assertEqual(room.phase, RoomPhase.Playing, '2 封圈未完仍=Playing');
        assertFalse(isRoomFinished(room), '2/3 封圈未结束');
    });

    it('checkRoomFinished：未达阈值返回 false', () => {
        const { room } = makeRoom(3);
        initDealer(room, SeatWind.East);
        assertFalse(checkRoomFinished(room), '0/3 应未结束');
    });
});

// ============================================================
// 7. 工具方法
// ============================================================

describe('RoundManager - 工具方法', () => {
    it('getCurrentDealerPlayer：返回当前庄家玩家', () => {
        const { room, players } = makeRoom();
        initDealer(room, SeatWind.West);
        const dealer = getCurrentDealerPlayer(room, players);
        assertEqual(dealer.id, 'p3', 'West 座位对应 p3');
    });

    it('getCompletedWinds / getCurrentRoundWind / getCurrentWindDeals', () => {
        const { room, players } = makeRoom();
        initDealer(room, SeatWind.East);
        advanceAfterWin(room, players[1]);
        advanceAfterWin(room, players[2]);
        assertEqual(getCompletedWinds(room), 0, '未完成封圈');
        assertEqual(getCurrentRoundWind(room), Wind.East, '圈风=东');
        assertEqual(getCurrentWindDeals(room), 2, '本圈已 2 庄');
    });
});

export function runRoundManagerTests(): string {
    return runAllTests();
}
