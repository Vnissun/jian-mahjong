/**
 * RobbingGangChecker.test.ts - 抢杠胡单元测试
 * ------------------------------------------------------------
 * 验证：
 *   - 加杠可抢：其他玩家 13 张 + 加杠牌 = 胡牌
 *   - 加杠无人能抢
 *   - 暗杠不可抢（isRobbableGangType = false）
 *   - 明杠不可抢
 *   - 抢胡者门槛不通过 → 不能抢
 */

import { describe, it, assertTrue, assertFalse, assertEqual, runAllTests } from './runner';
import { createTile, Tile } from '../assets/scripts/core/Tile';
import { Suit, SeatWind, MeldType } from '../assets/scripts/core/Types';
import { createPlayer, Player } from '../assets/scripts/core/Player';
import {
    canRobJiaGang, findRobbingGangPlayer,
    isRobbableGangType,
} from '../assets/scripts/game/RobbingGangChecker';

let _id = 0;
function resetId(): void { _id = 0; }
function w(r: number): Tile { return createTile(_id++, Suit.Wan, r); }
function t(r: number): Tile { return createTile(_id++, Suit.Tong, r); }
function s(r: number): Tile { return createTile(_id++, Suit.Tiao, r); }
function f(r: number): Tile { return createTile(_id++, Suit.Feng, r); }
function y(r: number): Tile { return createTile(_id++, Suit.Yuan, r); }

function newPlayer(seat: SeatWind = SeatWind.South): Player {
    return createPlayer('robber', 'B', seat);
}

// ============================================================
// 1. 加杠可抢判定
// ============================================================

describe('RobbingGangChecker - 加杠可抢', () => {
    it('加杠牌正好让 B 胡牌 → 可抢', () => {
        resetId();
        const robber = newPlayer();
        // B 手牌 13 张 + 加杠牌万9 = 14 张能胡（万9刻+顺子+顺子+东刻+中对）
        // 13 张：少 1 张万9
        robber.hand = [
            w(1), w(2), w(3),
            w(4), w(5), w(6),
            t(7), t(8), t(9),
            f(1), f(1), f(1),
            w(9), w(9),   // 2 张万9（缺 1 张成刻）
        ];
        // 等等：13 张应该是 14 - 1 = 13。我列了 14 张。修正：
        robber.hand = [
            w(1), w(2), w(3),
            w(4), w(5), w(6),
            t(7), t(8), t(9),
            f(1), f(1), f(1),
            y(1),  // 中做将
            // 缺 1 张万9（加杠万9正好成刻）—— 但这样没有万9了，B 手里没万9
        ];
        // 重新设计：B 想抢杠胡"万9"加杠，B 手里应有 2 张万9
        // 14 张胡牌 = 万1-2-3 + 万4-5-6 + 筒7-8-9 + 东刻 + 万9刻
        // 不对，那是 14 张（含万9刻 3 张），B 听万9时手里有 2 张万9
        // 13 张 = 万1-2-3 + 万4-5-6 + 筒7-8-9 + 东刻 + 万9 × 2
        robber.hand = [
            w(1), w(2), w(3),
            w(4), w(5), w(6),
            t(7), t(8), t(9),
            f(1), f(1), f(1),   // 东刻
            w(9), w(9),          // 2 张万9
        ];
        // 但这 14 张。改 13 张：少一张万9
        robber.hand = [
            w(1), w(2), w(3),
            w(4), w(5), w(6),
            t(7), t(8), t(9),
            f(1), f(1),
            w(9), w(9),
        ];
        // 13 张：万1-2-3, 万4-5-6, 筒7-8-9, 东对+万9对2对
        // 加杠牌 = 万9 → 14 张 = 万1-2-3 + 万4-5-6 + 筒7-8-9 + 东对(将) + 万9刻
        // 但这样万9刻+东对将 → 缺门：万+筒+东 → 缺条
        // 没条 → 缺门门槛失败
        // 改：把东对换成条对
        robber.hand = [
            w(1), w(2), w(3),
            w(4), w(5), w(6),
            t(7), t(8), t(9),
            s(1), s(1),  // 条对将
            w(9), w(9),   // 2 张万9，缺 1 成刻
        ];
        // 13 张：加万9后 → 万1-2-3 + 万4-5-6 + 筒7-8-9 + 条对将 + 万9刻 = 14 张
        // 含幺九：1万、9万、条1 ✓
        // 不缺门：万+筒+条 ✓
        // 有刻子：万9刻 ✓
        // → 可抢
        const gangTile = w(9);
        const r = canRobJiaGang(robber, gangTile, true);
        assertTrue(r.canRob, `应可抢，reason=${r.reason}`);
    });

    it('加杠牌不能让 B 胡 → 不能抢', () => {
        resetId();
        const robber = newPlayer();
        // B 手牌 13 张，加杠万9 → 14 张不能胡
        robber.hand = [
            w(1), w(2), w(3),
            w(5), w(6), w(7),
            t(1), t(2), t(3),
            t(4), t(5), t(6),
            y(1),
        ];
        const r = canRobJiaGang(robber, w(9), true);
        assertFalse(r.canRob, '不应可抢');
    });

    it('门槛不通过 → 不能抢', () => {
        resetId();
        const robber = newPlayer();
        // B 13 张 + 万9 = 能胡但缺门（无条）
        robber.hand = [
            w(1), w(2), w(3),
            w(4), w(5), w(6),
            t(7), t(8), t(9),
            t(5), t(5),  // 筒对将
            w(9),         // 万9 单张
        ];
        // 13 张加万9 = 14 张 = 万1-2-3 + 万4-5-6 + 筒7-8-9 + 筒对将 + 万9 ... 不能胡
        // 重新设计：让 14 张能胡但缺门
        // 14 张胡：万1-2-3 + 万4-5-6 + 筒7-8-9 + 筒5对将 + 万9刻 → 14 张
        // 但万9 刻需要 3 张万9，B 手里 2 张万9 + 加杠 1 张 = 3 张。OK。
        robber.hand = [
            w(1), w(2), w(3),
            w(4), w(5), w(6),
            t(7), t(8), t(9),
            t(5), t(5),   // 筒5对将
            w(9), w(9),    // 2 张万9
        ];
        // 等等，14 张 = 3+3+3+2+2 = 13，少一张。再加 1 张万9 = 14 张胡
        // 13 张手牌 + 加杠万9 = 14 张 = 万1-2-3 + 万4-5-6 + 筒7-8-9 + 筒5对将 + 万9刻
        // 不对：万9刻需要 3 张万9。手牌已有 2 张万9，加杠 1 张 = 3 张 → 万9刻 ✓
        // 数牌花色：万+筒 = 缺条 → 缺门门槛失败
        const gangTile = w(9);
        const r = canRobJiaGang(robber, gangTile, true);
        assertFalse(r.canRob, '缺门应不能抢');
        assertTrue(r.reason!.includes('门槛') || r.reason!.includes('缺门'),
            `应提示门槛/缺门，实际：${r.reason}`);
    });
});

// ============================================================
// 2. 杠类型可抢性
// ============================================================

describe('RobbingGangChecker - 杠类型可抢', () => {
    it('加杠可抢', () => {
        assertTrue(isRobbableGangType(MeldType.JiaGang), '加杠应可抢');
    });

    it('暗杠不可抢', () => {
        assertFalse(isRobbableGangType(MeldType.AnGang), '暗杠不可抢');
    });

    it('明杠（点炮杠）不可抢', () => {
        assertFalse(isRobbableGangType(MeldType.MingGang), '明杠不可抢');
    });

    it('碰不可抢（不是杠）', () => {
        assertFalse(isRobbableGangType(MeldType.Peng), '碰不是杠，不可抢');
    });
});

// ============================================================
// 3. 多人抢杠胡查找
// ============================================================

describe('RobbingGangChecker - findRobbingGangPlayer', () => {
    it('4 人中 B 能抢 → 返回 B', () => {
        resetId();
        const gangPlayer = createPlayer('ganger', 'G', SeatWind.East);
        const p2 = createPlayer('p2', 'B', SeatWind.South);
        const p3 = createPlayer('p3', 'C', SeatWind.West);
        const p4 = createPlayer('p4', 'D', SeatWind.North);

        // p2 能抢：13 张 + 万9 = 胡
        p2.hand = [
            w(1), w(2), w(3),
            w(4), w(5), w(6),
            t(7), t(8), t(9),
            s(1), s(1),
            w(9), w(9),
        ];
        // p3, p4 不能抢（13 张乱）
        p3.hand = [w(1), w(2), w(3), w(5), w(6), w(7),
                    t(1), t(2), t(3), t(4), t(5), t(6), y(1)];
        p4.hand = [w(1), w(2), w(3), w(5), w(6), w(7),
                    t(1), t(2), t(3), t(4), t(5), t(6), y(1)];

        const r = findRobbingGangPlayer(
            [gangPlayer, p2, p3, p4],
            gangPlayer,
            w(9),
            true,
        );
        assertTrue(r.canRob, '应找到抢胡者');
        assertEqual(r.robber!.id, 'p2', '应返回 p2');
    });

    it('无人能抢 → 返回 canRob=false', () => {
        resetId();
        const gangPlayer = createPlayer('ganger', 'G', SeatWind.East);
        const p2 = createPlayer('p2', 'B', SeatWind.South);
        const p3 = createPlayer('p3', 'C', SeatWind.West);
        const p4 = createPlayer('p4', 'D', SeatWind.North);

        // 全部乱手牌
        p2.hand = [w(1), w(3), w(5), w(7), w(9),
                    t(2), t(4), t(6), t(8),
                    s(1), s(3), s(5), s(7)];
        p3.hand = p2.hand.slice();
        p4.hand = p2.hand.slice();

        const r = findRobbingGangPlayer(
            [gangPlayer, p2, p3, p4],
            gangPlayer,
            w(9),
            true,
        );
        assertFalse(r.canRob, '应无人能抢');
    });
});

export function runRobbingGangCheckerTests(): string {
    return runAllTests();
}
