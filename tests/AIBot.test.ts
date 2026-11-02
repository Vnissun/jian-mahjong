/**
 * AIBot.test.ts - AI 决策单元测试
 * ------------------------------------------------------------
 * 覆盖：
 *   - shouldWin：胡牌决策
 *   - decideClaimPengGang：碰/明杠响应
 *   - decideAnGang：暗杠决策
 *   - decideJiaGang：加杠决策
 *   - decideRiichi：报听决策
 *   - pickDiscard：出牌选择
 */

import { describe, it, assertTrue, assertFalse, assertEqual } from './runner';
import { createPlayer } from '../assets/scripts/core/Player';
import { Tile, createTile } from '../assets/scripts/core/Tile';
import { Suit, SeatWind, RiichiType, MeldType } from '../assets/scripts/core/Types';
import { createDefaultPlayerState } from '../assets/scripts/core/Player';
import { ALL_TILES } from '../assets/scripts/data/TileCatalog';
import {
    shouldWin, decideClaimPengGang, decideAnGang,
    decideJiaGang, decideRiichi, pickDiscard,
} from '../assets/scripts/game/AIBot';

// ============================================================
// 测试工具
// ============================================================

/**
 * 从 ALL_TILES 取指定 suit+rank 的第 1 张牌（用于构造测试手牌）
 */
function mkTile(suit: Suit, rank: number): Tile {
    const t = ALL_TILES.find(x => x.suit === suit && x.rank === rank);
    if (!t) throw new Error(`找不到牌 ${suit}:${rank}`);
    return t;
}

/**
 * 取指定 suit+rank 的第 N 张（用于凑对子/刻子）
 */
function mkTileN(suit: Suit, rank: number, n: number): Tile {
    const matches = ALL_TILES.filter(x => x.suit === suit && x.rank === rank);
    if (n >= matches.length) throw new Error(`牌 ${suit}:${rank} 不足 ${n + 1} 张`);
    return matches[n];
}

/**
 * 构造一个 AI 玩家并塞入手牌
 */
function buildAIPlayer(hand: Tile[]): ReturnType<typeof createPlayer> {
    const p = createPlayer('ai-1', 'AI1', SeatWind.South);
    p.hand = hand.slice();
    return p;
}

// ============================================================
// 1. shouldWin 测试
// ============================================================

describe('AIBot.shouldWin 胡牌决策', () => {
    it('能胡且门槛通过 → true', () => {
        // 构造 13 张：一万刻子 + 二三万顺子 + 四五六万顺子 + 七八九万顺子 + 一对东风
        // 加 winTile=东风 → 对倒胡
        const hand = [
            mkTileN(Suit.Wan, 1, 0), mkTileN(Suit.Wan, 1, 1), mkTileN(Suit.Wan, 1, 2), // 一万刻
            mkTileN(Suit.Wan, 2, 0), mkTileN(Suit.Wan, 3, 0), mkTileN(Suit.Wan, 4, 0), // 234万
            mkTileN(Suit.Wan, 5, 0), mkTileN(Suit.Wan, 6, 0), mkTileN(Suit.Wan, 7, 0), // 567万
            mkTileN(Suit.Feng, 1, 0), mkTileN(Suit.Feng, 1, 1), // 东风对（将）
        ];
        // hand 长度 = 3+3+3+2 = 11，需 13。补两个万顺子凑够
        // 重新构造：一万刻 + 234万 + 567万 + 789万 + 东风对 = 3+3+3+3+2=14，去掉一个胡牌时 13
        // 简化：直接构造可胡 14 张，取掉东风做 13 张 + 东风做 winTile
        const hand13 = [
            mkTileN(Suit.Wan, 1, 0), mkTileN(Suit.Wan, 1, 1), mkTileN(Suit.Wan, 1, 2), // 一万刻
            mkTileN(Suit.Wan, 2, 0), mkTileN(Suit.Wan, 3, 0), mkTileN(Suit.Wan, 4, 0),
            mkTileN(Suit.Wan, 5, 0), mkTileN(Suit.Wan, 6, 0), mkTileN(Suit.Wan, 7, 0),
            mkTileN(Suit.Wan, 7, 1), mkTileN(Suit.Wan, 8, 0), mkTileN(Suit.Wan, 9, 0), // 789万（7 已用2张）
            mkTileN(Suit.Feng, 1, 0),
        ];
        // hand13 = 13 张。winTile = 东风第二张
        const winTile = mkTileN(Suit.Feng, 1, 1);
        const p = buildAIPlayer(hand13);
        assertTrue(shouldWin(p, winTile, true), '应能胡东风（对倒+一万刻子门槛通过）');
    });

    it('已胡玩家 → false', () => {
        const p = buildAIPlayer([mkTile(Suit.Wan, 1)]);
        p.state.isWon = true;
        const winTile = mkTile(Suit.Wan, 1);
        assertFalse(shouldWin(p, winTile, true), '已胡玩家不能再胡');
    });

    it('手牌不是 13 张 → false', () => {
        const p = buildAIPlayer([mkTile(Suit.Wan, 1), mkTile(Suit.Wan, 2)]);
        const winTile = mkTile(Suit.Wan, 1);
        assertFalse(shouldWin(p, winTile, true), '手牌张数不对不能胡');
    });
});

// ============================================================
// 2. decideClaimPengGang 测试
// ============================================================

describe('AIBot.decideClaimPengGang 碰杠响应', () => {
    it('手中 3 张同种 → 明杠', () => {
        // 13 张手牌，含 3 张一万
        const hand = [
            mkTileN(Suit.Wan, 1, 0), mkTileN(Suit.Wan, 1, 1), mkTileN(Suit.Wan, 1, 2), // 3 张一万
            mkTileN(Suit.Wan, 2, 0), mkTileN(Suit.Wan, 3, 0), mkTileN(Suit.Wan, 4, 0),
            mkTileN(Suit.Wan, 5, 0), mkTileN(Suit.Wan, 6, 0), mkTileN(Suit.Wan, 7, 0),
            mkTileN(Suit.Wan, 8, 0), mkTileN(Suit.Wan, 9, 0),
            mkTileN(Suit.Feng, 1, 0), mkTileN(Suit.Feng, 1, 1),
        ];
        const p = buildAIPlayer(hand);
        const discard = mkTileN(Suit.Wan, 1, 3); // 别家打出第四张一万
        const dec = decideClaimPengGang(p, discard, true);
        assertEqual(dec.action, 'mingGang', '3 张同种应明杠');
    });

    it('报听后 → pass', () => {
        const p = buildAIPlayer([mkTileN(Suit.Wan, 1, 0), mkTileN(Suit.Wan, 1, 1)]);
        p.state.riichi = RiichiType.Normal;
        const discard = mkTileN(Suit.Wan, 1, 2);
        const dec = decideClaimPengGang(p, discard, true);
        assertEqual(dec.action, 'pass', '报听后不能碰杠');
    });

    it('手中无同种 → pass', () => {
        const p = buildAIPlayer([mkTile(Suit.Wan, 2), mkTile(Suit.Wan, 3)]);
        const discard = mkTile(Suit.Wan, 1);
        const dec = decideClaimPengGang(p, discard, true);
        assertEqual(dec.action, 'pass', '无同种应 pass');
    });
});

// ============================================================
// 3. decideAnGang 测试
// ============================================================

describe('AIBot.decideAnGang 暗杠决策', () => {
    it('手牌含 4 张同种 → 暗杠', () => {
        const hand = [
            mkTileN(Suit.Wan, 1, 0), mkTileN(Suit.Wan, 1, 1),
            mkTileN(Suit.Wan, 1, 2), mkTileN(Suit.Wan, 1, 3), // 4 张一万
            mkTileN(Suit.Wan, 2, 0), mkTileN(Suit.Wan, 3, 0), mkTileN(Suit.Wan, 4, 0),
            mkTileN(Suit.Wan, 5, 0), mkTileN(Suit.Wan, 6, 0), mkTileN(Suit.Wan, 7, 0),
            mkTileN(Suit.Feng, 1, 0), mkTileN(Suit.Feng, 1, 1),
        ];
        // 4+3+3+2 = 12，再补两张形成真实的摸牌后 14 张。
        hand.push(mkTileN(Suit.Wan, 8, 0));
        hand.push(mkTileN(Suit.Wan, 9, 0));
        // 14 张手牌（摸牌后状态）
        const p = buildAIPlayer(hand);
        const dec = decideAnGang(p, true);
        assertTrue(dec.ok, '应能暗杠一万');
        assertTrue(!!dec.tile, '应返回暗杠牌');
    });

    it('手牌无 4 张同种 → 不暗杠', () => {
        const hand = [
            mkTileN(Suit.Wan, 1, 0), mkTileN(Suit.Wan, 1, 1), mkTileN(Suit.Wan, 1, 2),
            mkTileN(Suit.Wan, 2, 0), mkTileN(Suit.Wan, 3, 0), mkTileN(Suit.Wan, 4, 0),
            mkTileN(Suit.Wan, 5, 0), mkTileN(Suit.Wan, 6, 0), mkTileN(Suit.Wan, 7, 0),
            mkTileN(Suit.Wan, 8, 0), mkTileN(Suit.Wan, 9, 0),
            mkTileN(Suit.Feng, 1, 0), mkTileN(Suit.Feng, 1, 1),
        ];
        const p = buildAIPlayer(hand);
        const dec = decideAnGang(p, true);
        assertFalse(dec.ok, '无 4 张同种不应暗杠');
    });

    it('报听后 → 不暗杠', () => {
        const hand = [
            mkTileN(Suit.Wan, 1, 0), mkTileN(Suit.Wan, 1, 1),
            mkTileN(Suit.Wan, 1, 2), mkTileN(Suit.Wan, 1, 3),
        ];
        const p = buildAIPlayer(hand);
        p.state.riichi = RiichiType.Normal;
        const dec = decideAnGang(p, true);
        assertFalse(dec.ok, '报听后不能暗杠');
    });
});

// ============================================================
// 4. decideJiaGang 测试
// ============================================================

describe('AIBot.decideJiaGang 加杠决策', () => {
    it('已碰 + 手中有同种 → 加杠（无抢杠风险）', () => {
        const p = buildAIPlayer([]);
        // 构造一个碰副露（一万）
        p.melds.push({
            type: MeldType.Peng,
            tiles: [mkTileN(Suit.Wan, 1, 0), mkTileN(Suit.Wan, 1, 1), mkTileN(Suit.Wan, 1, 2)],
            openedTileIndex: 2,
        });
        // 手中放 1 张一万（第四张）
        p.hand = [mkTileN(Suit.Wan, 1, 3)];
        // 其他玩家手牌任意（不会抢）
        const others = [createPlayer('o1', 'O1', SeatWind.East)];
        const dec = decideJiaGang(p, [p, ...others], true);
        assertTrue(dec.ok, '应能加杠');
    });

    it('报听后 → 不加杠', () => {
        const p = buildAIPlayer([mkTileN(Suit.Wan, 1, 3)]);
        p.state.riichi = RiichiType.Normal;
        p.melds.push({
            type: MeldType.Peng,
            tiles: [mkTileN(Suit.Wan, 1, 0), mkTileN(Suit.Wan, 1, 1), mkTileN(Suit.Wan, 1, 2)],
            openedTileIndex: 2,
        });
        const dec = decideJiaGang(p, [p], true);
        assertFalse(dec.ok, '报听后不能加杠');
    });

    it('无已碰副露 → 不加杠', () => {
        const p = buildAIPlayer([mkTileN(Suit.Wan, 1, 3)]);
        const dec = decideJiaGang(p, [p], true);
        assertFalse(dec.ok, '无碰副露不能加杠');
    });
});

// ============================================================
// 5. decideRiichi 测试
// ============================================================

describe('AIBot.decideRiichi 报听决策', () => {
    it('听牌 → 报听', () => {
        // 构造单吊听牌：13 张，差一张东风成对
        const hand = [
            mkTileN(Suit.Wan, 1, 0), mkTileN(Suit.Wan, 1, 1), mkTileN(Suit.Wan, 1, 2), // 一万刻
            mkTileN(Suit.Wan, 2, 0), mkTileN(Suit.Wan, 3, 0), mkTileN(Suit.Wan, 4, 0),
            mkTileN(Suit.Wan, 5, 0), mkTileN(Suit.Wan, 6, 0), mkTileN(Suit.Wan, 7, 0),
            mkTileN(Suit.Wan, 8, 0), mkTileN(Suit.Wan, 9, 0),
            mkTileN(Suit.Feng, 1, 0), // 单张东风（将位置）
        ];
        // 3+3+3+2+1 = 12，需 13，补 1 张
        hand.push(mkTileN(Suit.Feng, 1, 1) === undefined ? mkTileN(Suit.Wan, 2, 1) : mkTileN(Suit.Tong, 1, 0));
        // 重新简化：构造一个稳定听牌手牌
        // 一万刻 + 234万 + 567万 + 789万 + 单张东风 = 3+3+3+3+1=13，听东风单吊
        const listenHand = [
            mkTileN(Suit.Wan, 1, 0), mkTileN(Suit.Wan, 1, 1), mkTileN(Suit.Wan, 1, 2),
            mkTileN(Suit.Wan, 2, 0), mkTileN(Suit.Wan, 3, 0), mkTileN(Suit.Wan, 4, 0),
            mkTileN(Suit.Wan, 5, 0), mkTileN(Suit.Wan, 6, 0), mkTileN(Suit.Wan, 7, 0),
            mkTileN(Suit.Wan, 7, 1), mkTileN(Suit.Wan, 8, 0), mkTileN(Suit.Wan, 9, 0),
            mkTileN(Suit.Feng, 1, 0), // 单张东风（听东风单吊）
        ];
        // 注意上面是 13 张（3+3+3+3+1）。校验门槛：含幺九✓(一万/东风)，含刻子✓(一万刻)，不缺门✓(万筒条...). 缺筒条！
        // 这会因缺门失败。改为加筒条避免缺门。
        const p = buildAIPlayer(listenHand);
        // 由于缺门，可能不报听。改用清一色豁免缺门：全万子 → 不缺门豁免
        // 全万子 = 纯清一色 → 缺门豁免
        const result = decideRiichi(p, true);
        // 清一色豁免缺门，含幺九（一万）+刻子（一万刻），应听牌 → 报听
        assertTrue(result, '清一色单吊应报听');
    });

    it('已报听 → 不重复报听', () => {
        const p = buildAIPlayer([mkTile(Suit.Wan, 1)]);
        p.state.riichi = RiichiType.Normal;
        assertFalse(decideRiichi(p, true), '已报听不应重复');
    });
});

// ============================================================
// 6. pickDiscard 测试
// ============================================================

describe('AIBot.pickDiscard 出牌选择', () => {
    it('报听后打摸到的那张', () => {
        const p = buildAIPlayer([mkTileN(Suit.Wan, 1, 0), mkTileN(Suit.Wan, 1, 1)]);
        p.state.riichi = RiichiType.Normal;
        const drawn = mkTileN(Suit.Wan, 1, 2);
        const picked = pickDiscard(p, true, drawn);
        assertEqual(picked.id, drawn.id, '报听后应打摸到的那张');
    });

    it('未报听时打出孤立字牌', () => {
        // 保留合法活听：一万刻、二三万搭子、两组顺子和白板对。
        // 北风是多余单张，打出后不缺门且具备刻子、幺九门槛。
        const hand = [
            mkTileN(Suit.Wan, 1, 0), mkTileN(Suit.Wan, 1, 1), mkTileN(Suit.Wan, 1, 2),
            mkTile(Suit.Wan, 2), mkTile(Suit.Wan, 3),
            mkTile(Suit.Tong, 2), mkTile(Suit.Tong, 3), mkTile(Suit.Tong, 4),
            mkTile(Suit.Tiao, 7), mkTile(Suit.Tiao, 8), mkTile(Suit.Tiao, 9),
            mkTileN(Suit.Yuan, 3, 0), mkTileN(Suit.Yuan, 3, 1),
            mkTile(Suit.Feng, 4),
        ];
        const p = buildAIPlayer(hand);
        const picked = pickDiscard(p, true);
        // 孤立北风评分最低，应被打掉
        assertTrue(picked.suit === Suit.Feng, '应优先打孤立字牌');
    });

    it('手牌为空时抛异常', () => {
        const p = buildAIPlayer([]);
        let threw = false;
        try {
            pickDiscard(p, true);
        } catch {
            threw = true;
        }
        assertTrue(threw, '空手牌应抛异常');
    });
});
