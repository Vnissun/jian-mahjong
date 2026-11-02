import { canRiichiGang, rebaseRiichiAfterGang } from './RiichiGang';
/**
 * ActionHandler.ts - 玩家动作执行器
 * ------------------------------------------------------------
 * 实现：碰、明杠（点炮杠）、暗杠、加杠
 *
 * 设计要点：
 *   1. ActionHandler 是无状态纯函数集合，操作传入的 Player 对象
 *   2. 所有动作成功后自动调用 refreshOpenState 更新开门状态
 *   3. 杠后补牌（长毛）由调用方处理：本模块只通知"需要补 1 张"
 *      调用方收到 result.supplementNeeded=true 后调用 WallGenerator.drawKongTile
 *   4. 加杠场景下需要触发抢杠胡判定（由 RobbingGangChecker 处理）
 *
 * 返回值统一：{ ok, error?, meld?, supplementNeeded? }
 */

import { Player, Meld } from '../core/Player';
import { Tile, isSameType } from '../core/Tile';
import { MeldType, RiichiType } from '../core/Types';
import { refreshOpenState } from './Opener';

// ============================================================
// 1. 通用工具
// ============================================================

/**
 * 从手牌中按 Tile 引用删除一张
 *  - 使用 id 比对
 */
function removeFromHand(player: Player, tile: Tile): boolean {
    const idx = player.hand.findIndex(t => t.id === tile.id);
    if (idx === -1) return false;
    player.hand.splice(idx, 1);
    return true;
}

/**
 * 从手牌中按牌种删除 N 张
 *  - 返回被删的 Tile 引用（按 id 顺序）
 */
function removeNByType(player: Player, sample: Tile, n: number): Tile[] {
    const removed: Tile[] = [];
    for (let i = player.hand.length - 1; i >= 0 && removed.length < n; i--) {
        if (isSameType(player.hand[i], sample)) {
            removed.push(player.hand.splice(i, 1)[0]);
        }
    }
    return removed;
}

/**
 * 校验玩家能否执行动作
 *  - 已胡 / 已荒庄 不能动作
 */
function checkPlayerCanAct(player: Player): string | null {
    if (player.state.isWon) return '玩家已胡牌，不能操作';
    if (player.state.isDrawn) return '本局已荒庄，不能操作';
    return null;
}

/** 是否报听中 */
function isRiichiActive(player: Player): boolean {
    return player.state.riichi !== RiichiType.None;
}

// ============================================================
// 2. 碰
// ============================================================

/**
 * 碰：他家打出的牌，自己手牌中有 2 张同种
 *  - 碰（任何牌）后开门
 *  - 碰后玩家需打出 1 张（由调用方处理出牌流程）
 *
 * @param player 当前玩家
 * @param targetTile 他家打出的牌
 */
export function peng(
    player: Player,
    targetTile: Tile,
): { ok: boolean; error?: string; meld?: Meld } {
    const err = checkPlayerCanAct(player);
    if (err) return { ok: false, error: err };

    // 找手牌中 2 张同种
    const sameTiles = player.hand.filter(t => isSameType(t, targetTile));
    if (sameTiles.length < 2) {
        return { ok: false, error: '手牌中无 2 张同种，不能碰' };
    }

    // 报听后禁止换牌：碰会改变手牌组成 → 报听玩家不能碰
    if (isRiichiActive(player)) {
        return { ok: false, error: '报听后禁止换牌，不能碰' };
    }

    // 移除 2 张
    const [a, b] = sameTiles;
    removeFromHand(player, a);
    removeFromHand(player, b);

    // 创建副露（targetTile 在末位 = openedTileIndex=2 表示横放）
    const meld: Meld = {
        type: MeldType.Peng,
        tiles: [a, b, targetTile],
        openedTileIndex: 2,
    };
    player.melds.push(meld);
    refreshOpenState(player);
    return { ok: true, meld };
}

// ============================================================
// 3. 明杠（点炮杠，他家打出 + 手牌 3 张同种）
// ============================================================

/**
 * 明杠：他家打出的牌，自己手牌中有 3 张同种
 *  - 数牌明杠 = 开门
 *  - 字牌明杠 = 字杠不算开门
 *  - 杠后需要补 1 张（长毛）
 *
 * @param player 当前玩家
 * @param targetTile 他家打出的牌
 */
export function mingGang(
    player: Player,
    targetTile: Tile,
): { ok: boolean; error?: string; meld?: Meld; supplementNeeded?: boolean } {
    const err = checkPlayerCanAct(player);
    if (err) return { ok: false, error: err };

    const sameTiles = player.hand.filter(t => isSameType(t, targetTile));
    if (sameTiles.length < 3) {
        return { ok: false, error: '手牌中无 3 张同种，不能明杠' };
    }

    if (!canRiichiGang(player, sameTiles.slice(0,3), { type:MeldType.MingGang, tiles:sameTiles.slice(0,3).concat(targetTile), openedTileIndex:3 }, 'ming')) return { ok:false, error:'报听后明杠须已开门且不影响原听口' };

    // 移除 3 张
    const [a, b, c] = sameTiles;
    removeFromHand(player, a);
    removeFromHand(player, b);
    removeFromHand(player, c);

    const meld: Meld = {
        type: MeldType.MingGang,
        tiles: [a, b, c, targetTile],
        openedTileIndex: 3,
    };
    player.melds.push(meld);
    refreshOpenState(player);
    // 杠后补牌
    rebaseRiichiAfterGang(player);
    return { ok: true, meld, supplementNeeded: true };
}

// ============================================================
// 4. 暗杠（自摸 4 张同种）
// ============================================================

/**
 * 暗杠：自己手牌中有 4 张同种
 *  - 暗杠不算开门（无论数牌字牌）
 *  - 暗杠不能被抢杠胡
 *  - 杠后补 1 张
 *
 * @param player 当前玩家
 * @param sampleTile 4 张同种中的任意一张（用于定位）
 */
export function anGang(
    player: Player,
    sampleTile: Tile,
): { ok: boolean; error?: string; meld?: Meld; supplementNeeded?: boolean } {
    const err = checkPlayerCanAct(player);
    if (err) return { ok: false, error: err };

    const sameTiles = player.hand.filter(t => isSameType(t, sampleTile));
    if (sameTiles.length < 4) {
        return { ok: false, error: '手牌中无 4 张同种，不能暗杠' };
    }

    if (!canRiichiGang(player, sameTiles.slice(0,4), { type:MeldType.AnGang, tiles:sameTiles.slice(0,4), openedTileIndex:-1 }, 'an')) return { ok:false, error:'暗杠会拆动报听所需牌或改变听口' };

    // 移除 4 张
    const [a, b, c, d] = sameTiles;
    removeFromHand(player, a);
    removeFromHand(player, b);
    removeFromHand(player, c);
    removeFromHand(player, d);

    const meld: Meld = {
        type: MeldType.AnGang,
        tiles: [a, b, c, d],
        openedTileIndex: -1,   // 暗杠没有来源牌
    };
    player.melds.push(meld);
    refreshOpenState(player);
    rebaseRiichiAfterGang(player);
    return { ok: true, meld, supplementNeeded: true };
}

// ============================================================
// 5. 加杠（已碰后手牌再凑 1 张同种 → 升级为杠）
// ============================================================

/**
 * 加杠：玩家已碰过某牌种，手中又有 1 张同种 → 把碰升级为杠
 *  - 加杠视为开门（继承碰的开门状态）
 *  - 加杠可被抢杠胡！（重要）
 *  - 杠后补 1 张
 *
 * @param player 当前玩家
 * @param sampleTile 手中要加杠的那张牌
 * @param onRobbingCheck 抢杠胡判定回调（由调用方注入）
 *        - 调用方应在回调中检查其他玩家能否胡这张加杠的牌
 *        - 返回 true 表示有人抢杠胡 → 加杠失败
 */
export function jiaGang(
    player: Player,
    sampleTile: Tile,
    onRobbingCheck?: (player: Player, tile: Tile) => boolean,
): { ok: boolean; error?: string; meld?: Meld; supplementNeeded?: boolean; robbed?: boolean } {
    const err = checkPlayerCanAct(player);
    if (err) return { ok: false, error: err };

    const pendingIndex = player.melds.findIndex(m=>m.type===MeldType.Peng && isSameType(m.tiles[0],sampleTile));
    if (pendingIndex >= 0 && !canRiichiGang(player, [sampleTile], { ...player.melds[pendingIndex], type:MeldType.JiaGang, tiles:player.melds[pendingIndex].tiles.concat(sampleTile) }, 'jia', pendingIndex)) return { ok:false, error:'加杠会改变原听口' };

    // 找到对应的"碰"副露
    const pengIdx = player.melds.findIndex(m =>
        m.type === MeldType.Peng
        && m.tiles.length === 3
        && isSameType(m.tiles[0], sampleTile)
    );
    if (pengIdx === -1) {
        return { ok: false, error: '未找到对应的碰副露，不能加杠' };
    }

    // 手牌中要有 1 张同种
    const inHand = player.hand.find(t => isSameType(t, sampleTile));
    if (!inHand) {
        return { ok: false, error: '手牌中无该种牌，不能加杠' };
    }

    // 抢杠胡判定：加杠可被抢
    if (onRobbingCheck) {
        const robbed = onRobbingCheck(player, inHand);
        if (robbed) {
            // 被抢杠胡：加杠失败，但碰副露保持原状（按规则）
            // 集安规则未明，这里默认：被抢则本动作失败
            return { ok: false, error: '被抢杠胡，加杠失败', robbed: true };
        }
    }

    // 执行升级：碰 → 加杠
    removeFromHand(player, inHand);
    const peng = player.melds[pengIdx];
    const newMeld: Meld = {
        type: MeldType.JiaGang,
        tiles: [...peng.tiles, inHand],
        openedTileIndex: peng.openedTileIndex,
    };
    player.melds[pengIdx] = newMeld;
    refreshOpenState(player);
    rebaseRiichiAfterGang(player);
    return { ok: true, meld: newMeld, supplementNeeded: true };
}

// ============================================================
// 6. 出牌
// ============================================================

/**
 * 出牌：从手牌中打出一张到牌河
 *  - 报听玩家可以出牌（只要不改变其他手牌组成）
 *  - 实际报听规则要求"听牌不变"，即出牌后仍维持原听牌型态
 *    简化：报听玩家出牌时，调用方应校验出牌后仍是听牌状态
 *
 * @param player 当前玩家
 * @param tile 要打出的牌
 */
export function discard(
    player: Player,
    tile: Tile,
): { ok: boolean; error?: string } {
    const err = checkPlayerCanAct(player);
    if (err) return { ok: false, error: err };

    const removed = removeFromHand(player, tile);
    if (!removed) {
        return { ok: false, error: '手牌中无此牌' };
    }
    player.discards.push(tile);
    return { ok: true };
}

// ============================================================
// 7. 摸牌
// ============================================================

/**
 * 摸牌：从牌墙摸一张到手牌
 *  - 摸牌不改变开门/报听状态
 */
export function draw(player: Player, tile: Tile): { ok: boolean; error?: string } {
    const err = checkPlayerCanAct(player);
    if (err) return { ok: false, error: err };
    player.hand.push(tile);
    return { ok: true };
}
