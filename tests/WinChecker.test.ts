/**
 * WinChecker.test.ts - 胡牌判定 + 门槛校验 单元测试
 * ------------------------------------------------------------
 * 包含多组手牌样例，验证：
 *   - 是否能胡（结构判定）
 *   - 胡牌方式（普通胡 / 七小对 / 豪华七小对）
 *   - 门槛校验（幺九 / 刻子 / 缺门 / 清一色豁免）
 *
 * 在 Cocos Creator 中：把 TestEntry 组件挂到场景，start() 里调用 runAllTests()。
 * 在 Node 中：ts-node 直接执行 main 函数。
 */

import { describe, it, assertTrue, assertFalse, assertEqual, runAllTests } from './runner';
import { Tile, createTile } from '../assets/scripts/core/Tile';
import { Suit } from '../assets/scripts/core/Types';
import { checkWin, WinTypeResolved, canWin } from '../assets/scripts/game/WinChecker';
import {
    fullCheck, checkHandEligibility,
    hasYaojiu, hasKeziOrYuanPair,
    isChunQing, isHunQing,
} from '../assets/scripts/game/HandValidator';
import { hasMissingSuit } from '../assets/scripts/game/HandUtils';

// ============================================================
// 0. 牌工厂（每个 it 内独立维护 id 序列，避免跨用例冲突）
// ============================================================

let _id = 0;
function resetId(): void { _id = 0; }
function w(r: number): Tile { return createTile(_id++, Suit.Wan, r); }   // 万
function t(r: number): Tile { return createTile(_id++, Suit.Tong, r); } // 筒
function s(r: number): Tile { return createTile(_id++, Suit.Tiao, r); } // 条
function f(r: number): Tile { return createTile(_id++, Suit.Feng, r); } // 风（1东 2南 3西 4北）
function y(r: number): Tile { return createTile(_id++, Suit.Yuan, r); } // 元（1中 2发 3白）

// ============================================================
// 1. 普通胡牌判定（结构判定）
// ============================================================

describe('WinChecker 普通胡牌', () => {
    it('标准 4 面子 1 将：万 1-2-3 + 万 4-5-6 + 筒 7-8-9 + 东刻 + 中对', () => {
        resetId();
        const tiles = [
            w(1), w(2), w(3),
            w(4), w(5), w(6),
            t(7), t(8), t(9),
            f(1), f(1), f(1),   // 东刻
            y(1), y(1),          // 中对
        ];
        const r = checkWin(tiles);
        assertTrue(r.canWin, '应能胡');
        assertEqual(r.winType, WinTypeResolved.Standard, '应为普通胡');
    });

    it('全刻子胡：3 个刻子 + 1 顺子 + 1 对将', () => {
        resetId();
        const tiles = [
            w(1), w(1), w(1),
            t(2), t(2), t(2),
            s(3), s(3), s(3),
            w(5), w(6), w(7),
            y(2), y(2),          // 发对做将
        ];
        const r = checkWin(tiles);
        assertTrue(r.canWin, '应能胡');
        assertEqual(r.winType, WinTypeResolved.Standard, '应为普通胡');
    });

    it('七小对：7 个对子', () => {
        resetId();
        const tiles = [
            w(1), w(1), w(2), w(2),
            t(3), t(3), t(4), t(4),
            s(5), s(5), s(6), s(6),
            y(1), y(1),          // 中对
        ];
        const r = checkWin(tiles);
        assertTrue(r.canWin, '应能胡');
        assertEqual(r.winType, WinTypeResolved.QiXiaoDui, '应为七小对');
        assertTrue(r.qiInfo != null && !r.qiInfo.isHaoHua, '不应为豪华');
    });

    it('豪华七小对：1 组 4 张 + 5 组 2 张', () => {
        resetId();
        const tiles = [
            w(1), w(1), w(1), w(1),   // 万1 四张（豪华）
            t(3), t(3), t(4), t(4),
            s(5), s(5), s(6), s(6),
            y(1), y(1),                // 中对
        ];
        const r = checkWin(tiles);
        assertTrue(r.canWin, '应能胡');
        assertEqual(r.winType, WinTypeResolved.HaoHuaQiXiaoDui, '应为豪华七小对');
        assertTrue(r.qiInfo != null && r.qiInfo.isHaoHua, '应为豪华');
        assertEqual(r.qiInfo!.gangGroups, 1, '应含 1 组 4 张');
    });

    it('不胡牌：14 张全不同（无对子）', () => {
        resetId();
        const tiles = [
            w(1), w(2), w(3), w(4), w(5),
            t(1), t(2), t(3), t(4), t(5),
            s(1), s(2), s(3), s(4),
        ];
        const r = checkWin(tiles);
        assertFalse(r.canWin, '不应能胡');
    });

    it('不胡牌：有对子但拆不开', () => {
        resetId();
        const tiles = [
            w(1), w(1),                // 万1 对做将候选
            w(3), w(5), w(7), w(9),    // 万奇数张（无连续无刻）
            t(1), t(3), t(5), t(7),
            s(1), s(3), s(5), s(7),
        ];
        const r = checkWin(tiles);
        assertFalse(r.canWin, '不应能胡（拆不出 4 面子）');
    });

    it('字牌顺子不能成顺：东南西三张（应判失败）', () => {
        resetId();
        // 风 1(东)+2(南)+3(西) 不算顺子，因为字牌不能成顺
        // 给一组看似顺子但实不胡的样例
        const tiles = [
            f(1), f(2), f(3),          // 三字张，不能成顺
            w(1), w(2), w(3),
            t(4), t(5), t(6),
            s(7), s(8), s(9),
            y(1), y(1),
        ];
        const r = checkWin(tiles);
        assertFalse(r.canWin, '字牌不能成顺，应不能胡');
    });
});

// ============================================================
// 2. 门槛校验
// ============================================================

describe('HandValidator 门槛校验', () => {
    it('含幺九 + 含刻子 + 不缺门 → 通过', () => {
        resetId();
        const tiles = [
            w(1), w(2), w(3),   // 1万=幺九
            s(4), s(5), s(6),
            t(7), t(8), t(9),
            f(1), f(1), f(1),   // 东刻
            y(1), y(1),          // 中对
        ];
        const e = checkHandEligibility(tiles, false);
        assertTrue(e.ok, `应通过，但原因：${e.reasons.join(',')}`);
    });

    it('缺门（非清一色）→ 不通过', () => {
        resetId();
        // 万 + 筒 + 字（缺条），不是清一色
        const tiles = [
            w(1), w(2), w(3),
            w(4), w(5), w(6),
            t(7), t(8), t(9),
            f(1), f(1), f(1),
            y(1), y(1),
        ];
        const e = checkHandEligibility(tiles, false);
        assertFalse(e.ok, '应不通过');
        assertTrue(e.reasons.some(r => r.includes('缺门')), '应有缺门原因');
    });

    it('无幺九 → 不通过', () => {
        resetId();
        // 全部 2-7 之间，无 1/9/字
        const tiles = [
            w(2), w(3), w(4),
            w(5), w(6), w(7),
            t(2), t(3), t(4),
            t(5), t(6), t(7),
            s(5), s(5),   // 条 5 对做将（不是中发白）
        ];
        const e = checkHandEligibility(tiles, false);
        assertFalse(e.ok, '应不通过');
        assertTrue(e.reasons.some(r => r.includes('幺九')), '应有无幺九原因');
    });

    it('无刻子（也无中发白对）→ 不通过', () => {
        resetId();
        // 全顺子 + 风对做将（非中发白）
        const tiles = [
            w(1), w(2), w(3),   // 有幺九
            w(5), w(6), w(7),
            t(2), t(3), t(4),
            t(5), t(6), t(7),
            f(2), f(2),          // 南对做将（风牌，非中发白）
        ];
        const e = checkHandEligibility(tiles, false);
        assertFalse(e.ok, '应不通过');
        assertTrue(e.reasons.some(r => r.includes('刻子')), '应有无刻子原因');
    });

    it('一对中发白豁免刻子 → 通过', () => {
        resetId();
        const tiles = [
            w(1), w(2), w(3),
            w(5), w(6), w(7),
            t(2), t(3), t(4),
            s(5), s(6), s(7),
            y(1), y(1),          // 中对（豁免刻子要求）
        ];
        const e = checkHandEligibility(tiles, false);
        assertTrue(e.ok, `应通过，但原因：${e.reasons.join(',')}`);
    });

    it('纯清一色豁免缺门 → 通过', () => {
        resetId();
        // 纯万，含 1/9
        const tiles = [
            w(1), w(2), w(3),
            w(4), w(5), w(6),
            w(7), w(8), w(9),
            w(9), w(9), w(9),   // 万9刻
            w(1), w(1),           // 万1对做将
        ];
        assertTrue(isChunQing(tiles), '应为纯清一色');
        const e = checkHandEligibility(tiles, false);
        assertTrue(e.ok, `应通过，但原因：${e.reasons.join(',')}`);
    });

    it('混清一色豁免缺门 → 通过', () => {
        resetId();
        // 万 + 字
        const tiles = [
            w(1), w(2), w(3),
            w(4), w(5), w(6),
            w(7), w(8), w(9),
            f(1), f(1), f(1),   // 东刻
            y(1), y(1),          // 中对
        ];
        assertTrue(isHunQing(tiles), '应为混清一色');
        const e = checkHandEligibility(tiles, false);
        assertTrue(e.ok, `应通过，但原因：${e.reasons.join(',')}`);
    });

    it('七小对豁免刻子要求 → 通过', () => {
        resetId();
        // 七小对，无刻子（全是 2 张），但有中发白对+幺九+不缺门
        const tiles = [
            w(1), w(1), w(2), w(2),
            t(3), t(3), t(4), t(4),
            s(5), s(5), s(6), s(6),
            y(1), y(1),          // 中对
        ];
        const e = checkHandEligibility(tiles, true);
        assertTrue(e.ok, `七小对应通过，但原因：${e.reasons.join(',')}`);
    });

    it('七小对缺门 → 不通过', () => {
        resetId();
        // 七小对，但只万+筒+中（缺条），非清一色
        const tiles = [
            w(1), w(1), w(2), w(2),
            w(3), w(3), t(4), t(4),
            t(5), t(5), t(6), t(6),
            y(1), y(1),
        ];
        // 注意：万+筒+中 不算清一色（清一色要数牌同色）
        const e = checkHandEligibility(tiles, true);
        assertFalse(e.ok, '七小对缺门应不通过');
    });
});

// ============================================================
// 3. 综合校验（fullCheck）
// ============================================================

describe('fullCheck 综合（胡牌 + 门槛）', () => {
    it('合法胡牌 → finalOk = true', () => {
        resetId();
        const tiles = [
            w(1), w(2), w(3),
            s(4), s(5), s(6),
            t(7), t(8), t(9),
            f(1), f(1), f(1),
            y(1), y(1),
        ];
        const r = fullCheck(tiles);
        assertTrue(r.finalOk, '应最终合法');
    });

    it('能胡但缺门 → finalOk = false', () => {
        resetId();
        const tiles = [
            w(1), w(2), w(3),
            w(4), w(5), w(6),
            t(7), t(8), t(9),
            f(1), f(1), f(1),
            y(1), y(1),
            // 缺条但能胡（万+筒+字，混清豁免……等）
        ];
        // 注：万+筒+字 = 混清一色豁免（数牌只有万），所以 finalOk 反而 true
        // 这里改为：万+筒+条+字，缺条时门槛失败
        // 重新构造：
        const tiles2 = [
            w(1), w(2), w(3),
            w(4), w(5), w(6),
            t(7), t(8), t(9),
            f(1), f(1), f(1),   // 东刻
            y(1), y(1),           // 中对
        ];
        // 这里只有万+筒+字（缺条），但万+筒+字... 实际上"万+筒+东+中"既不纯清也不混清，
        // 因为混清要求数牌同色（单一数牌花色）+字。万+筒是两种数牌花色，所以不是清一色
        // → 不豁免 → 缺门 → 不通过
        const r = fullCheck(tiles2);
        assertFalse(r.finalOk, '万+筒+字缺条，应不通过');
    });
});

// ============================================================
// 4. 单项判定工具
// ============================================================

describe('单项判定工具', () => {
    it('hasYaojiu：含字牌算幺九', () => {
        resetId();
        assertTrue(hasYaojiu([w(5), y(1)]), '中应算幺九');
        assertTrue(hasYaojiu([w(1), t(5)]), '1万算幺九');
        assertFalse(hasYaojiu([w(5), t(5)]), '无幺九');
    });

    it('hasKeziOrYuanPair：一对中发白视为刻', () => {
        resetId();
        assertTrue(hasKeziOrYuanPair([y(1), y(1), w(5)]), '中对应视为刻');
        assertTrue(hasKeziOrYuanPair([w(5), w(5), w(5)]), '万5刻应算');
        assertFalse(hasKeziOrYuanPair([f(2), f(2), w(5)]), '南对应不算（非中发白）');
    });

    it('hasMissingSuit：万+筒+条齐全不算缺门', () => {
        resetId();
        assertFalse(hasMissingSuit([w(1), t(2), s(3)]), '三色齐全不缺门');
        assertTrue(hasMissingSuit([w(1), t(2), f(1)]), '缺条算缺门');
    });

    it('isChunQing：纯万（无字）', () => {
        resetId();
        assertTrue(isChunQing([w(1), w(2), w(3)]), '纯万应判纯清');
        assertFalse(isChunQing([w(1), w(2), y(1)]), '万+中应为混清非纯清');
    });
});

// ============================================================
// 5. 执行入口
// ============================================================

/**
 * 一键执行所有测试（在 Cocos Creator 组件 start() 中调用）
 */
export function runWinCheckerTests(): string {
    return runAllTests();
}
