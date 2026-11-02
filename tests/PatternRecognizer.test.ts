/**
 * PatternRecognizer.test.ts - 牌型识别单元测试
 * ------------------------------------------------------------
 * 验证识别：对倒 / 单吊 / 夹胡 / 撅 / 混清一色 / 纯清一色 / 平胡
 *
 * 测试方法：构造 14 张能胡的牌 + 标记其中一张为 H（胡的那张），
 *          调用 recognizePattern，断言命中预期型态。
 *
 * 注意：H 必须是 tiles14 数组中的实际对象引用。
 */

import { describe, it, assertTrue, assertFalse, assertEqual, runAllTests } from './runner';
import { Tile, createTile } from '../assets/scripts/core/Tile';
import { Suit } from '../assets/scripts/core/Types';
import { recognizePattern, WinPatternType } from '../assets/scripts/game/PatternRecognizer';
import { checkWin } from '../assets/scripts/game/WinChecker';

// ============================================================
// 0. 牌工厂
// ============================================================

let _id = 0;
function resetId(): void { _id = 0; }
function w(r: number): Tile { return createTile(_id++, Suit.Wan, r); }
function t(r: number): Tile { return createTile(_id++, Suit.Tong, r); }
function s(r: number): Tile { return createTile(_id++, Suit.Tiao, r); }
function f(r: number): Tile { return createTile(_id++, Suit.Feng, r); }
function y(r: number): Tile { return createTile(_id++, Suit.Yuan, r); }

// 工具：检查命中型态集合
function hasPattern(patterns: WinPatternType[], target: WinPatternType): boolean {
    return patterns.includes(target);
}

// ============================================================
// 1. 听牌型态识别
// ============================================================

describe('PatternRecognizer 听牌型态', () => {

    it('单吊：13 张已成型 + 单张中凑成将', () => {
        resetId();
        const H = y(1);   // 胡中
        const tiles14 = [
            w(1), w(2), w(3),       // 顺子
            w(4), w(5), w(6),       // 顺子
            t(7), t(8), t(9),       // 顺子
            f(1), f(1), f(1),       // 东刻
            H,                       // 单张中，胡时凑成对
            y(1),                    // 另一张中凑对
        ];
        // 注：H 和最后一张 y(1) 是同种不同 id 的牌，胡时凑成中将
        const r = recognizePattern(tiles14, H);
        assertTrue(hasPattern(r.patterns, WinPatternType.DanDiao),
            `应识别单吊，实际：${r.description}`);
    });

    it('对倒：13 张含 2 对，胡成刻 + 另 1 对做将', () => {
        resetId();
        const H = f(1);   // 胡东
        const tiles14 = [
            w(1), w(2), w(3),
            w(4), w(5), w(6),
            t(7), t(8), t(9),
            H, f(1), f(1),          // 东对+胡=东刻（原本 2 张东）
            y(1), y(1),              // 中对做将
        ];
        const r = recognizePattern(tiles14, H);
        assertTrue(hasPattern(r.patterns, WinPatternType.DuiDao),
            `应识别对倒，实际：${r.description}`);
    });

    it('夹胡：1+3 夹 2（顺子中张）', () => {
        resetId();
        const H = w(2);   // 胡 2 万
        const tiles14 = [
            w(1), H, w(3),          // 顺子 1-2-3，H 在中间
            w(4), w(5), w(6),
            t(7), t(8), t(9),
            f(1), f(1), f(1),
            y(1), y(1),
        ];
        const r = recognizePattern(tiles14, H);
        assertTrue(hasPattern(r.patterns, WinPatternType.JiaHu),
            `应识别夹胡，实际：${r.description}`);
    });

    it('撅（边胡）：1+2 胡 3', () => {
        resetId();
        const H = w(3);   // 胡 3 万
        const tiles14 = [
            w(1), w(2), H,          // 顺子 1-2-3，H 在尾（边张）
            w(4), w(5), w(6),
            t(7), t(8), t(9),
            f(1), f(1), f(1),
            y(1), y(1),
        ];
        const r = recognizePattern(tiles14, H);
        assertTrue(hasPattern(r.patterns, WinPatternType.Jue),
            `应识别撅，实际：${r.description}`);
    });

    it('撅（边胡）：8+9 胡 7', () => {
        resetId();
        const H = w(7);   // 胡 7 万
        const tiles14 = [
            H, w(8), w(9),          // 顺子 7-8-9，H 在首（边张）
            w(4), w(5), w(6),
            t(1), t(2), t(3),
            f(1), f(1), f(1),
            y(1), y(1),
        ];
        const r = recognizePattern(tiles14, H);
        assertTrue(hasPattern(r.patterns, WinPatternType.Jue),
            `应识别撅，实际：${r.description}`);
    });

    it('普通顺子边张胡（3-4-5 胡 3）应不算撅', () => {
        resetId();
        const H = w(3);   // 胡 3 万
        const tiles14 = [
            H, w(4), w(5),          // 顺子 3-4-5，H 在首但非 1/9 边
            w(7), w(8), w(9),
            t(1), t(2), t(3),
            f(1), f(1), f(1),
            y(1), y(1),
        ];
        const r = recognizePattern(tiles14, H);
        assertFalse(hasPattern(r.patterns, WinPatternType.Jue),
            `3-4-5 胡 3 应不算撅，实际：${r.description}`);
        assertFalse(hasPattern(r.patterns, WinPatternType.JiaHu),
            `3-4-5 胡 3 应不算夹胡，实际：${r.description}`);
    });

    it('普通顺子边张胡（5-6-7 胡 7）应不算撅', () => {
        resetId();
        const H = w(7);
        const tiles14 = [
            w(5), w(6), H,
            w(1), w(2), w(3),
            t(4), t(5), t(6),
            f(1), f(1), f(1),
            y(1), y(1),
        ];
        const r = recognizePattern(tiles14, H);
        assertFalse(hasPattern(r.patterns, WinPatternType.Jue),
            `5-6-7 胡 7 应不算撅`);
    });
});

// ============================================================
// 2. 大牌识别
// ============================================================

describe('PatternRecognizer 大牌识别', () => {

    it('纯清一色（纯万，无字）', () => {
        resetId();
        const H = w(5);   // 中张胡
        const tiles14 = [
            w(1), w(2), w(3),
            w(4), H, w(6),          // 顺子，H 在中间 = 夹胡
            w(7), w(8), w(9),
            w(9), w(9), w(9),       // 万9刻
            w(1), w(1),              // 万1对做将
        ];
        const r = recognizePattern(tiles14, H);
        assertTrue(hasPattern(r.patterns, WinPatternType.ChunQing), `应识别纯清，实际：${r.description}`);
        assertTrue(hasPattern(r.patterns, WinPatternType.JiaHu), `应同时识别夹胡`);
        assertEqual(r.totalMultiplier, 4 * 2, '纯清 ×4 + 夹胡 ×2 = ×8');
    });

    it('混清一色（万 + 字）', () => {
        resetId();
        const H = w(5);
        const tiles14 = [
            w(1), w(2), w(3),
            w(4), H, w(6),
            w(7), w(8), w(9),
            f(1), f(1), f(1),       // 东刻（字）
            y(1), y(1),              // 中对（字）
        ];
        const r = recognizePattern(tiles14, H);
        assertTrue(hasPattern(r.patterns, WinPatternType.HunQing), `应识别混清，实际：${r.description}`);
        assertEqual(r.totalMultiplier, 2 * 2, '混清 ×2 + 夹胡 ×2 = ×4');
    });

    it('普通牌（无清一色无特殊听牌）', () => {
        resetId();
        const H = w(7);
        const tiles14 = [
            w(5), w(6), H,          // 顺子 5-6-7，H 边张但非边胡（7 不算撅）
            w(1), w(2), w(3),
            t(4), t(5), t(6),
            f(1), f(1), f(1),
            y(1), y(1),
        ];
        const r = recognizePattern(tiles14, H);
        // 仅含平胡
        assertTrue(hasPattern(r.patterns, WinPatternType.PingHu), `应至少有平胡，实际：${r.description}`);
        assertEqual(r.totalMultiplier, 1, '平胡倍数 = 1');
    });
});

// ============================================================
// 3. 集成校验：先能胡，再识别型态
// ============================================================

describe('集成：胡牌判定 + 型态识别', () => {
    it('夹胡 + 混清：先 checkWin 再 recognizePattern', () => {
        resetId();
        const H = w(2);
        const tiles14 = [
            w(1), H, w(3),
            w(4), w(5), w(6),
            w(7), w(8), w(9),
            f(1), f(1), f(1),
            y(1), y(1),
        ];
        const win = checkWin(tiles14);
        assertTrue(win.canWin, '应能胡');
        const pat = recognizePattern(tiles14, H);
        assertTrue(hasPattern(pat.patterns, WinPatternType.JiaHu), '应识别夹胡');
        assertTrue(hasPattern(pat.patterns, WinPatternType.HunQing), '应识别混清');
        assertEqual(pat.totalMultiplier, 4, '夹胡 ×2 + 混清 ×2 = ×4');
    });
});

// ============================================================
// 4. 执行入口
// ============================================================

export function runPatternRecognizerTests(): string {
    return runAllTests();
}
