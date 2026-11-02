import { evaluatePlayerWin } from './PlayerWin';
/**
 * RobbingGangChecker.ts - 抢杠胡判定
 * ------------------------------------------------------------
 * 集安规则：
 *   1. 仅"加杠"可被抢（即碰后手牌再补第 4 张变杠时，他人可抢）
 *   2. 暗杠不能抢
 *   3. 明杠（点炮杠）也不能抢（明杠是从他家打出的牌，已经被点炮流程处理）
 *   4. 抢胡者：开杠人单独付分
 *
 * 判定方法：
 *   - 给定被抢的牌（加杠那张）+ 其他某玩家的 13 张手牌
 *   - 判定 13 + 1 能否胡 + 门槛通过
 *   - 通过 → 可抢
 */
import { Player } from '../core/Player';
import { Tile } from '../core/Tile';
import { canWin, WinTypeResolved } from './WinChecker';
import { checkHandEligibility } from './HandValidator';
import { MeldType, RiichiType } from '../core/Types';
// ============================================================
// 1. 抢杠胡判定
// ============================================================
/**
 * 抢杠胡判定结果
 */
export interface RobbingGangResult {
    /** 是否能抢 */
    canRob: boolean;
    /** 抢胡的玩家 */
    robber?: Player;
    /** 不能抢的原因 */
    reason?: string;
}
/**
 * 判定加杠是否可被某玩家抢
 *  - 前提：gangTile 是加杠的那张牌
 *  - 判定：该玩家手牌 13 + gangTile 能否胡 + 门槛通过
 *
 * @param robber 想抢的玩家
 * @param gangTile 加杠的牌（被抢的那张）
 * @param allowQiXiaoDui 是否允许七小对
 */
export function canRobJiaGang(robber: Player, gangTile: Tile, allowQiXiaoDui: boolean = true): {
    canRob: boolean;
    reason?: string;
} {
    if (robber.state.isWon || robber.state.isDrawn) {
        return { canRob: false, reason: '玩家已结束本局' };
    }
    if (robber.state.riichi !== RiichiType.None) {
        // 报听玩家可以抢杠胡（不换牌）—— 集安惯例
        // 这里允许
    }
    const evaluation = evaluatePlayerWin(robber, gangTile, allowQiXiaoDui);
    if (!evaluation.ok)
        return { canRob: false, reason: '结构或胡牌门槛不满足' };
    return { canRob: true };
}
/**
 * 在所有其他玩家中找抢杠胡的人
 *  - 返回第一个能抢的玩家
 *  - 调用方收到结果后处理"开杠人单独付分"
 *
 * @param allPlayers 所有玩家
 * @param gangPlayer 开杠人（不会被检查）
 * @param gangTile 加杠的牌
 * @param allowQiXiaoDui 是否允许七小对
 */
export function findRobbingGangPlayer(allPlayers: Player[], gangPlayer: Player, gangTile: Tile, allowQiXiaoDui: boolean = true): RobbingGangResult {
    for (const p of allPlayers) {
        if (p.id === gangPlayer.id)
            continue;
        const r = canRobJiaGang(p, gangTile, allowQiXiaoDui);
        if (r.canRob) {
            return { canRob: true, robber: p };
        }
    }
    return { canRob: false, reason: '无人能抢' };
}
// ============================================================
// 2. 暗杠 / 明杠的"不能抢"校验
// ============================================================
/**
 * 检查某副露类型是否可被抢
 *  - 加杠：可抢
 *  - 暗杠：不可抢
 *  - 明杠（点炮杠）：不可抢（已被点炮流程处理）
 */
export function isRobbableGangType(meldType: MeldType): boolean {
    return meldType === MeldType.JiaGang;
}
/**
 * 工具：开杠前的"能否被抢"前置判断
 *  - 调用方在执行加杠前调用此函数
 *  - 若返回 robber 非空 → 加杠失败，转胡牌流程
 *
 * @param allPlayers 所有玩家
 * @param gangPlayer 开杠人
 * @param gangTile 加杠牌
 * @param allowQiXiaoDui 是否允许七小对
 */
export function checkBeforeJiaGang(allPlayers: Player[], gangPlayer: Player, gangTile: Tile, allowQiXiaoDui: boolean = true): RobbingGangResult {
    return findRobbingGangPlayer(allPlayers, gangPlayer, gangTile, allowQiXiaoDui);
}
