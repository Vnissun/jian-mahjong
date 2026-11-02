/**
 * ActionHandler.test.ts - 碰 / 杠 / 加杠 / 开门 单元测试
 * ------------------------------------------------------------
 * 验证：
 *   - 碰成功 + 开门状态
 *   - 碰失败（无 2 张同种）
 *   - 报听后不能碰
 *   - 明杠成功 + 数牌开门 + 补牌
 *   - 字明杠不算开门（字杠特例）
 *   - 暗杠成功 + 不开门 + 补牌
 *   - 字暗杠不算开门
 *   - 加杠成功 + 继承开门 + 补牌
 *   - 加杠可被抢（注入回调返回 true）
 *   - 出牌到牌河
 */

import { describe, it, assertTrue, assertFalse, assertEqual, runAllTests } from './runner';
import { createTile, Tile } from '../assets/scripts/core/Tile';
import { Suit, MeldType, SeatWind, RiichiType } from '../assets/scripts/core/Types';
import { createPlayer, Player } from '../assets/scripts/core/Player';
import { peng, mingGang, anGang, jiaGang, discard } from '../assets/scripts/game/ActionHandler';
import { computeIsOpen } from '../assets/scripts/game/Opener';

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
// 1. 碰
// ============================================================

describe('ActionHandler - 碰', () => {
    it('碰成功：手牌含 2 张东 + 他家打出 1 东 → 开门', () => {
        resetId();
        const player = newPlayer();
        player.hand = [w(1), w(2), w(3), w(4), w(5), w(6),
                        t(7), t(8), t(9), f(1), f(1), y(1), y(2)];  // 13 张含 2 张东
        const target = f(1);  // 他家打出东
        const r = peng(player, target);
        assertTrue(r.ok, `碰应成功，error=${r.error}`);
        assertEqual(player.hand.length, 11, '碰后手牌应剩 11 张');
        assertEqual(player.melds.length, 1, '应有 1 个副露');
        assertEqual(player.melds[0].type, MeldType.Peng, '类型应为碰');
        assertEqual(player.melds[0].tiles.length, 3, '碰副露应 3 张');
        assertTrue(player.state.isOpen, '碰后应开门');
        assertFalse(player.state.isStanding, '碰后不应站立');
    });

    it('碰失败：手牌仅 1 张同种', () => {
        resetId();
        const player = newPlayer();
        player.hand = [w(1), w(2), w(3), w(4), w(5), w(6),
                        t(7), t(8), t(9), f(1), y(1), y(2), y(3)];  // 仅 1 张东
        const r = peng(player, f(1));
        assertFalse(r.ok, '应失败');
        assertTrue(r.error!.includes('2 张'), `错误信息应提示张数，实际：${r.error}`);
    });

    it('报听后不能碰', () => {
        resetId();
        const player = newPlayer();
        player.hand = [w(1), w(2), w(3), w(4), w(5), w(6),
                        t(7), t(8), t(9), f(1), f(1), y(1), y(2)];
        player.state.riichi = RiichiType.Normal;
        const r = peng(player, f(1));
        assertFalse(r.ok, '报听后碰应失败');
        assertTrue(r.error!.includes('报听'), `错误信息应提示报听，实际：${r.error}`);
    });
});

// ============================================================
// 2. 明杠
// ============================================================

describe('ActionHandler - 明杠（点炮杠）', () => {
    it('数牌明杠：开门 + 需补牌', () => {
        resetId();
        const player = newPlayer();
        // 13 张含 3 张万9
        player.hand = [w(1), w(2), w(3), w(5), w(6), w(7),
                        t(8), t(9), t(1), w(9), w(9), w(9), y(1)];
        const target = w(9);  // 他家打出万9
        const r = mingGang(player, target);
        assertTrue(r.ok, `明杠应成功，error=${r.error}`);
        assertEqual(player.hand.length, 10, '明杠后手牌应剩 10 张');
        assertEqual(player.melds[0].type, MeldType.MingGang, '类型应为明杠');
        assertEqual(player.melds[0].tiles.length, 4, '明杠副露应 4 张');
        assertTrue(player.state.isOpen, '数牌明杠应开门');
        assertTrue(r.supplementNeeded, '应需要补牌');
    });

    it('字明杠：字杠不算开门', () => {
        resetId();
        const player = newPlayer();
        // 13 张含 3 张东
        player.hand = [w(1), w(2), w(3), w(5), w(6), w(7),
                        t(8), t(9), t(1), f(1), f(1), f(1), y(1)];
        const target = f(1);  // 他家打出东
        const r = mingGang(player, target);
        assertTrue(r.ok, `字明杠应成功，error=${r.error}`);
        assertEqual(player.melds[0].type, MeldType.MingGang, '类型应为明杠');
        assertFalse(player.state.isOpen, '字杠不应开门');
        assertTrue(player.state.isStanding, '字杠后应仍站立');
        assertTrue(r.supplementNeeded, '字杠仍需补牌');
    });

    it('报听后不能明杠', () => {
        resetId();
        const player = newPlayer();
        player.hand = [w(1), w(2), w(3), w(5), w(6), w(7),
                        t(8), t(9), t(1), w(9), w(9), w(9), y(1)];
        player.state.riichi = RiichiType.Jue;
        const r = mingGang(player, w(9));
        assertFalse(r.ok, '报听后明杠应失败');
    });
});

// ============================================================
// 3. 暗杠
// ============================================================

describe('ActionHandler - 暗杠', () => {
    it('数牌暗杠：不算开门 + 需补牌', () => {
        resetId();
        const player = newPlayer();
        // 14 张（摸牌后）含 4 张万9
        player.hand = [w(1), w(2), w(3), w(5), w(6), w(7),
                        t(8), t(9), t(1), w(9), w(9), w(9), w(9), y(1)];
        const r = anGang(player, w(9));
        assertTrue(r.ok, `暗杠应成功，error=${r.error}`);
        assertEqual(player.hand.length, 10, '暗杠后手牌应剩 10 张');
        assertEqual(player.melds[0].type, MeldType.AnGang, '类型应为暗杠');
        assertEqual(player.melds[0].openedTileIndex, -1, '暗杠 openedTileIndex 应为 -1');
        assertFalse(player.state.isOpen, '暗杠不算开门');
        assertTrue(player.state.isStanding, '暗杠后应站立');
        assertTrue(r.supplementNeeded, '暗杠仍需补牌');
    });

    it('字暗杠：不算开门', () => {
        resetId();
        const player = newPlayer();
        // 14 张含 4 张东
        player.hand = [w(1), w(2), w(3), w(5), w(6), w(7),
                        t(8), t(9), t(1), f(1), f(1), f(1), f(1), y(1)];
        const r = anGang(player, f(1));
        assertTrue(r.ok, `字暗杠应成功，error=${r.error}`);
        assertEqual(player.melds[0].type, MeldType.AnGang, '类型应为暗杠');
        assertFalse(player.state.isOpen, '字暗杠不算开门');
    });

    it('暗杠失败：手牌无 4 张同种', () => {
        resetId();
        const player = newPlayer();
        player.hand = [w(1), w(2), w(3), w(5), w(6), w(7),
                        t(8), t(9), t(1), w(9), w(9), w(9), y(1), y(2)];  // 仅 3 张万9
        const r = anGang(player, w(9));
        assertFalse(r.ok, '暗杠应失败');
        assertTrue(r.error!.includes('4 张'), `错误信息应提示 4 张，实际：${r.error}`);
    });
});

// ============================================================
// 4. 加杠
// ============================================================

describe('ActionHandler - 加杠', () => {
    it('加杠成功：继承碰开门 + 补牌', () => {
        resetId();
        const player = newPlayer();
        // 已有 1 个碰副露（数牌万9），手牌含 1 张万9
        const pengTile1 = w(9), pengTile2 = w(9), pengFromOther = w(9);
        player.melds = [{
            type: MeldType.Peng,
            tiles: [pengTile1, pengTile2, pengFromOther],
            openedTileIndex: 2,
        }];
        // 手牌 10 张（已碰+出牌后状态）+ 1 张万9 = 11 张（摸牌后）
        player.hand = [w(1), w(2), w(3), w(5), w(6), w(7),
                        t(8), t(9), t(1), y(1), w(9)];
        const sampleInHand = player.hand[player.hand.length - 1];  // 最后一张是万9
        const r = jiaGang(player, sampleInHand);
        assertTrue(r.ok, `加杠应成功，error=${r.error}`);
        assertEqual(player.melds[0].type, MeldType.JiaGang, '类型应为加杠');
        assertEqual(player.melds[0].tiles.length, 4, '加杠副露应 4 张');
        assertTrue(player.state.isOpen, '加杠继承碰开门');
        assertTrue(r.supplementNeeded, '加杠后需补牌');
    });

    it('加杠失败：未找到对应碰副露', () => {
        resetId();
        const player = newPlayer();
        player.hand = [w(1), w(2), w(3), w(5), w(6), w(7),
                        t(8), t(9), t(1), w(9)];
        const r = jiaGang(player, w(9));
        assertFalse(r.ok, '应失败');
        assertTrue(r.error!.includes('碰'), `错误信息应提示无碰副露，实际：${r.error}`);
    });

    it('加杠被抢：返回 robbed=true', () => {
        resetId();
        const player = newPlayer();
        const pengFromOther = w(9);
        player.melds = [{
            type: MeldType.Peng,
            tiles: [w(9), w(9), pengFromOther],
            openedTileIndex: 2,
        }];
        player.hand = [w(1), w(2), w(3), w(5), w(6), w(7),
                        t(8), t(9), t(1), y(1), w(9)];
        // 注入抢杠回调：返回 true 模拟被抢
        const onRobCheck = () => true;
        const r = jiaGang(player, w(9), onRobCheck);
        assertFalse(r.ok, '加杠应失败（被抢）');
        assertTrue(r.robbed, '应标记为被抢');
    });
});

// ============================================================
// 5. 出牌
// ============================================================

describe('ActionHandler - 出牌', () => {
    it('出牌到牌河', () => {
        resetId();
        const player = newPlayer();
        const a = w(5);
        player.hand = [w(1), w(2), w(3), a, w(6), w(7),
                        t(8), t(9), t(1), y(1), y(1), y(2), y(2)];
        const r = discard(player, a);
        assertTrue(r.ok);
        assertEqual(player.hand.length, 12, '出牌后手牌应 12 张');
        assertEqual(player.discards.length, 1, '牌河应有 1 张');
        assertEqual(player.discards[0].id, a.id, '牌河最后一张应是打出的牌');
    });
});

// ============================================================
// 6. 开门状态独立校验
// ============================================================

describe('Opener - 开门判定', () => {
    it('computeIsOpen：碰任何牌都开门', () => {
        resetId();
        const player = newPlayer();
        player.melds = [{
            type: MeldType.Peng,
            tiles: [f(1), f(1), f(1)],  // 字牌碰
            openedTileIndex: 2,
        }];
        assertTrue(computeIsOpen(player), '字牌碰也应开门');
    });

    it('computeIsOpen：暗杠不算开门', () => {
        resetId();
        const player = newPlayer();
        player.melds = [{
            type: MeldType.AnGang,
            tiles: [w(9), w(9), w(9), w(9)],  // 数牌暗杠
            openedTileIndex: -1,
        }];
        assertFalse(computeIsOpen(player), '数牌暗杠不算开门');
    });
});

export function runActionHandlerTests(): string {
    return runAllTests();
}
