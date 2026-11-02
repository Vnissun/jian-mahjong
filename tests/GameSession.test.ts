/**
 * GameSession.test.ts - 对局流程控制器测试
 * ------------------------------------------------------------
 * 覆盖：
 *   - 开局发牌（庄家 14 张 / 闲家 13 张）
 *   - 事件回调触发（onDeal / onDraw / onDiscard / ...）
 *   - 全 AI 自动对局能正常结束（胡牌或荒庄）
 *   - computeHumanOptions 选项计算
 *   - 庄家轮换 / 房间结束判定
 */

import { describe, it, assertTrue, assertFalse, assertEqual } from './runner';
import { createPlayer } from '../assets/scripts/core/Player';
import { SeatWind, Suit } from '../assets/scripts/core/Types';
import { createRoom, Room, RoomConfig } from '../assets/scripts/core/Room';
import { DEFAULT_ROOM_CONFIG } from '../assets/scripts/config/GameConfig';
import { GameSession, SessionPhase, SessionEvents } from '../assets/scripts/game/GameSession';
import { WinMode } from '../assets/scripts/game/SettlementEngine';
import { Tile } from '../assets/scripts/core/Tile';

// ============================================================
// 测试工具
// ============================================================

/**
 * 构造一个全 AI 房间（4 个 AI 玩家）
 */
function buildAllAISession(events: SessionEvents = {}): GameSession {
    const players = [
        createPlayer('p0', 'AI0', SeatWind.East),
        createPlayer('p1', 'AI1', SeatWind.South),
        createPlayer('p2', 'AI2', SeatWind.West),
        createPlayer('p3', 'AI3', SeatWind.North),
    ];
    const room = createRoom('R001', 'p0', { ...DEFAULT_ROOM_CONFIG }, players);
    return new GameSession(room, players,
        [SeatWind.East, SeatWind.South, SeatWind.West, SeatWind.North], events);
}

/**
 * 构造一个"人类在东位 + 3 个 AI"的会话
 */
function buildHumanSession(events: SessionEvents = {}): GameSession {
    const players = [
        createPlayer('human', '你', SeatWind.East),
        createPlayer('ai1', 'AI1', SeatWind.South),
        createPlayer('ai2', 'AI2', SeatWind.West),
        createPlayer('ai3', 'AI3', SeatWind.North),
    ];
    const room = createRoom('R002', 'human', { ...DEFAULT_ROOM_CONFIG }, players);
    return new GameSession(room, players,
        [SeatWind.South, SeatWind.West, SeatWind.North], events);
}

// ============================================================
// 1. 开局发牌
// ============================================================

describe('GameSession 开局发牌', () => {
    it('startRound 后庄家 14 张 / 闲家 13 张', () => {
        const session = buildHumanSession();
        session.startRound();
        const dealer = session.getPlayer(session.room.currentDealer);
        assertEqual(dealer.hand.length, 14, '庄家应 14 张');
        for (const p of session.players) {
            if (p.seat === session.room.currentDealer) continue;
            assertEqual(p.hand.length, 13, '闲家应 13 张');
        }
    });

    it('startRound 后阶段为 PlayerTurn', () => {
        const session = buildHumanSession();
        session.startRound();
        assertEqual(session.phase, SessionPhase.PlayerTurn, '开局后应进入 PlayerTurn');
    });

    it('startRound 触发 onDeal 事件', () => {
        let dealt = false;
        const session = buildAllAISession({
            onDeal: () => { dealt = true; },
        });
        session.startRound();
        assertTrue(dealt, 'onDeal 应被触发');
    });

    it('开局后庄家 isDealer=true', () => {
        const session = buildHumanSession();
        session.startRound();
        const dealer = session.getPlayer(session.room.currentDealer);
        assertTrue(dealer.state.isDealer, '庄家标记应为 true');
    });
});

// ============================================================
// 2. 全 AI 自动对局
// ============================================================

describe('GameSession 全 AI 自动对局', () => {
    it('一局自动进行直到胡牌或荒庄（到达终态）', () => {
        const events: SessionEvents = {
            onWin: () => { /* 记录胡牌 */ },
            onDrawn: () => { /* 记录荒庄 */ },
        };
        const session = buildAllAISession(events);
        session.startRound();
        // 全 AI，startRound 内部已自动驱动到终态
        assertTrue(
            session.phase === SessionPhase.Settled
            || session.phase === SessionPhase.Finished,
            '一局应到达 Settled 或 Finished 终态',
        );
    });

    it('胡牌后 onWin 事件触发且至少一家积分变化', () => {
        let winFired = false;
        let scoreChanged = false;
        const events: SessionEvents = {
            onWin: (winner, tile, result) => {
                winFired = true;
                // 胡家积分应为正
                if (result.winnerDelta > 0) scoreChanged = true;
            },
        };
        const session = buildAllAISession(events);
        session.startRound();
        if (session.phase === SessionPhase.Settled) {
            // 若是胡牌结束（非荒庄）则 winFired 应为 true
            const anyWon = session.players.some(p => p.state.isWon);
            if (anyWon) {
                assertTrue(winFired, '胡牌结束应触发 onWin');
                assertTrue(scoreChanged, '胡家积分应增加');
            }
        }
    });

    it('荒庄时 onDrawn 触发且庄家连庄', () => {
        let drawnFired = false;
        const events: SessionEvents = {
            onDrawn: () => { drawnFired = true; },
        };
        const session = buildAllAISession(events);
        const dealerBefore = session.room.currentDealer;
        session.startRound();
        if (session.phase === SessionPhase.Settled) {
            const allDrawn = session.players.every(p => p.state.isDrawn);
            if (allDrawn) {
                assertTrue(drawnFired, '荒庄应触发 onDrawn');
                assertEqual(session.room.currentDealer, dealerBefore, '荒庄庄家连庄');
            }
        }
    });
});

// ============================================================
// 3. computeHumanOptions
// ============================================================

describe('GameSession.computeHumanOptions 人类选项', () => {
    it('开局后人类庄家可出牌（14 张）', () => {
        const session = buildHumanSession();
        // 强制人类为庄家
        session.room.currentDealer = SeatWind.East;
        session.startRound();
        // startRound 内部会调用 beginPlayerTurn，由于人类，会 emit onHumanTurn
        // 直接调 computeHumanOptions 验证
        const human = session.getPlayer(SeatWind.East);
        const drawn = session.lastDrawn;
        const opts = session.computeHumanOptions(human, drawn);
        assertTrue(opts.canDiscard, '14 张时应可出牌');
    });

    it('13 张时不可出牌', () => {
        const session = buildHumanSession();
        session.startRound();
        const human = session.getPlayer(SeatWind.East);
        // 构造 13 张状态
        const hand13 = human.hand.slice(0, 13);
        const saved = human.hand;
        human.hand = hand13;
        const opts = session.computeHumanOptions(human, null);
        assertFalse(opts.canDiscard, '13 张时不可出牌');
        human.hand = saved; // 恢复
    });
});

// ============================================================
// 4. 房间结束
// ============================================================

describe('GameSession 房间结束', () => {
    it('isFinished 在房间结束时为 true', () => {
        const session = buildAllAISession();
        // 把封圈设为 1，加快结束
        session.room.config.totalRoundWinds = 1;
        session.startRound();
        // 一局结束后，若已完成 1 封圈，房间结束
        if (session.room.completedWinds >= 1) {
            assertTrue(session.isFinished(), '封圈完成应判定房间结束');
        }
    });
});
