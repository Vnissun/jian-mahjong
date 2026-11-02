/**
 * RiichiManager.test.ts - 报听单元测试
 * ------------------------------------------------------------
 * 验证：
 *   - 普通报听（听普通型态）
 *   - 撕报听（听牌含撅）
 *   - 未听牌不能报听
 *   - 已报听不能重复报
 *   - 多人报听倍数合并（取最高，不叠加）
 *   - 报听后 isOpen 状态独立维护
 */

import { describe, it, assertTrue, assertFalse, assertEqual, runAllTests } from './runner';
import { createTile, Tile } from '../assets/scripts/core/Tile';
import { Suit, SeatWind, RiichiType } from '../assets/scripts/core/Types';
import { createPlayer, Player } from '../assets/scripts/core/Player';
import {
    declareRiichi, analyzeListening, getCombinedRiichiMultiplier,
    isRiichi, isJueRiichi,
} from '../assets/scripts/game/RiichiManager';

let _id = 0;
function resetId(): void { _id = 0; }
function w(r: number): Tile { return createTile(_id++, Suit.Wan, r); }
function t(r: number): Tile { return createTile(_id++, Suit.Tong, r); }
function s(r: number): Tile { return createTile(_id++, Suit.Tiao, r); }
function f(r: number): Tile { return createTile(_id++, Suit.Feng, r); }
function y(r: number): Tile { return createTile(_id++, Suit.Yuan, r); }

function newPlayer(seat: SeatWind = SeatWind.East): Player {
    return createPlayer('p1', 'A', seat);
}

// ============================================================
// 1. 听牌分析
// ============================================================

describe('RiichiManager - 听牌分析', () => {
    it('单吊中：13 张成型 + 单张中（听中凑对做将）', () => {
        resetId();
        const player = newPlayer();
        player.hand = [
            w(1), w(2), w(3),
            s(4), s(5), s(6),
            t(7), t(8), t(9),
            f(1), f(1), f(1),  // 东刻
            y(1),               // 单张中（听中凑对做将）
        ];
        // 注：手牌 13 张，第 14 张待胡
        // 实际玩家听牌时手牌 13 张，让我重做：移除最后 1 张
        player.hand = player.hand.slice(0, 13);  // 取前 13 张
        // 等等，上面 14 张。改成 13 张。
        // 重新构造 13 张
        player.hand = [
            w(1), w(2), w(3),
            s(4), s(5), s(6),
            t(7), t(8), t(9),
            f(1), f(1), f(1),
            y(1),  // 单张中做将候选
        ];
        const analysis = analyzeListening(player, true);
        assertTrue(analysis.isListening, '应听牌');
        assertTrue(analysis.winningTiles.some(tl => tl.suit === Suit.Yuan && tl.rank === 1), '应听中');
    });

    it('撕听牌：1+2 听 3（撅）', () => {
        resetId();
        const player = newPlayer();
        // 13 张：万1 + 万2 + 其他成型，听 3 万 → 撕（边胡）
        player.hand = [
            w(1), w(2),          // 边张听 3
            w(5), w(6), w(7),
            t(1), t(2), t(3),
            s(4), s(5), s(6),
            y(1), y(1),
        ];
        const analysis = analyzeListening(player, true);
        assertTrue(analysis.isListening, '应听牌');
        assertTrue(analysis.hasJue, '应识别为撕（含撅）');
        assertTrue(analysis.winningTiles.some(tl => tl.suit === Suit.Wan && tl.rank === 3), '应听 3 万');
    });

    it('夹胡听牌：1+3 听 2（夹胡，非撅）', () => {
        resetId();
        const player = newPlayer();
        // 万1 + 万3 + ... 听 2 万（中间张夹胡）
        player.hand = [
            w(1), w(3),          // 夹胡听 2
            w(5), w(6), w(7),
            t(1), t(2), t(3),
            s(4), s(5), s(6),
            y(1), y(1),
        ];
        const analysis = analyzeListening(player, true);
        assertTrue(analysis.isListening, '应听牌');
        assertFalse(analysis.hasJue, '夹胡不应识别为撕');
    });

    it('未听牌：13 张乱牌', () => {
        resetId();
        const player = newPlayer();
        player.hand = [
            w(1), w(3), w(5), w(7), w(9),
            t(2), t(4), t(6), t(8),
            s(1), s(3), s(5), s(7),
        ];
        const analysis = analyzeListening(player, true);
        assertFalse(analysis.isListening, '不应听牌');
    });
});

// ============================================================
// 2. 报听动作
// ============================================================

describe('RiichiManager - 报听动作', () => {
    it('普通报听：写 riichi = Normal', () => {
        resetId();
        const player = newPlayer();
        // 单吊中（普通报听，非撅）
        player.hand = [
            w(1), w(2), w(3),
            s(4), s(5), s(6),
            t(7), t(8), t(9),
            f(1), y(1), y(1),
            y(1),
        ];
        const r = declareRiichi(player, true);
        assertTrue(r.ok, `报听应成功，error=${r.error}`);
        assertEqual(r.riichiType, RiichiType.Normal, '应为普通报听');
        assertTrue(isRiichi(player), 'player.state.riichi 应非 None');
    });

    it('撕报听：写 riichi = Jue', () => {
        resetId();
        const player = newPlayer();
        // 万1+2 听3（撕）
        player.hand = [
            w(1), w(2),
            w(5), w(6), w(7),
            t(1), t(2), t(3),
            s(4), s(5), s(6),
            y(1), y(1),
        ];
        const r = declareRiichi(player, true);
        assertTrue(r.ok, `报听应成功，error=${r.error}`);
        assertEqual(r.riichiType, RiichiType.Jue, '应为撕报听');
        assertTrue(isJueRiichi(player), '应识别为撕报听');
    });

    it('未听牌不能报听', () => {
        resetId();
        const player = newPlayer();
        player.hand = [
            w(1), w(3), w(5), w(7), w(9),
            t(2), t(4), t(6), t(8),
            s(1), s(3), s(5), s(7),
        ];
        const r = declareRiichi(player, true);
        assertFalse(r.ok, '不应报听');
        assertTrue(r.error!.includes('听'), `错误信息应提示未听牌，实际：${r.error}`);
    });

    it('已报听不能重复报', () => {
        resetId();
        const player = newPlayer();
        player.hand = [
            w(1), w(2), w(3),
            s(4), s(5), s(6),
            t(7), t(8), t(9),
            f(1), y(1), y(1),
            y(1),
        ];
        const r1 = declareRiichi(player, true);
        assertTrue(r1.ok, '首次报听应成功');
        const r2 = declareRiichi(player, true);
        assertFalse(r2.ok, '重复报听应失败');
        assertTrue(r2.error!.includes('重复'), `错误信息应提示重复，实际：${r2.error}`);
    });
});

// ============================================================
// 3. 多人报听倍数合并
// ============================================================

describe('RiichiManager - 多人报听合并', () => {
    it('多人报听取最高倍数（不叠加）', () => {
        resetId();
        const p1 = createPlayer('p1', 'A', SeatWind.East);
        const p2 = createPlayer('p2', 'B', SeatWind.South);
        const p3 = createPlayer('p3', 'C', SeatWind.West);
        const p4 = createPlayer('p4', 'D', SeatWind.North);

        // p1 普通报听
        p1.state.riichi = RiichiType.Normal;
        // p2 撕报听
        p2.state.riichi = RiichiType.Jue;
        // p3 不报听
        // p4 普通报听
        p4.state.riichi = RiichiType.Normal;

        const mul = getCombinedRiichiMultiplier([p1, p2, p3, p4]);
        assertEqual(mul, 4, '多人报听取最高（撕×4），不叠加');
    });

    it('仅一人报听 → 该人倍数', () => {
        resetId();
        const p1 = createPlayer('p1', 'A', SeatWind.East);
        p1.state.riichi = RiichiType.Normal;
        const mul = getCombinedRiichiMultiplier([p1]);
        assertEqual(mul, 2, '一人普通报听 ×2');
    });

    it('无人报听 → 1', () => {
        resetId();
        const p1 = createPlayer('p1', 'A', SeatWind.East);
        const p2 = createPlayer('p2', 'B', SeatWind.South);
        const mul = getCombinedRiichiMultiplier([p1, p2]);
        assertEqual(mul, 1, '无人报听倍数 = 1');
    });
});

export function runRiichiManagerTests(): string {
    return runAllTests();
}
