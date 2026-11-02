/**
 * GangSettlement.ts - 杠积分独立结算
 * ------------------------------------------------------------
 * 集安规则：
 *   - 杠分独立结算，不参与满贯
 *   - 杠基础分按牌种：
 *     · 普通数字        ×1
 *     · 幺鸡/一饼/四张中发白 ×2
 *     · 二饼/八万四张    ×4
 *     · 四张相同风牌     ×1
 *   - 杠类型倍数：明杠×1，暗杠×2
 *   - 每笔付款任一方为庄家 ×2；特殊组合基础 2，补毛基础 1
 *
 * 分摊方式：明杠、暗杠、加杠与补毛均由另外三家各付一份。
 * 不看谁供牌，不能由供牌者包付；每笔收付任一方为庄家只乘一次 ×2。
 *
 * 开杠时只记录，胡牌或荒庄时统一入账
 */
import { Player, Meld } from '../core/Player';
import { Tile } from '../core/Tile';
import { MeldType, SeatWind } from '../core/Types';
import { GANG_TYPE_MULTIPLIER, GANG_DEALER_MULTIPLIER, getGangBaseScore } from '../config/GangConfig';
import { RoomConfig } from '../core/Room';
// ============================================================
// 1. 类型定义
// ============================================================
/**
 * 杠结算类别（所有类别均由其他三家分别付款）
 */
export enum GangSettlementMode {
    Supplement = 'supplement',
    /** 明杠：其他三家各付 */
    MingGang = 'mingGang',
    /** 暗杠：3 家各付 */
    AnGang = 'anGang',
    /** 加杠：3 家各付 */
    JiaGang = 'jiaGang'
}
/**
 * 杠结算上下文
 */
export interface GangContext {
    /** 开杠玩家 */
    gangPlayer: Player;
    /** 副露 */
    meld: Meld;
    /** 杠的那张牌（用于取基础分） */
    gangTile: Tile;
    /** 全部玩家 */
    allPlayers: Player[];
    /** 当前庄家座位 */
    currentDealer: SeatWind;
    /** 房间配置（底分） */
    roomConfig: RoomConfig;
    /** 结算方式 */
    mode: GangSettlementMode;
    /** 供牌方（兼容原调用，杠分不依赖此字段） */
    firer?: Player;
}
/**
 * 杠结算结果
 */
export interface GangSettlementResult {
    mode?: GangSettlementMode;
    /** 开杠玩家 ID */
    gangPlayerId: string;
    /** 开杠玩家积分变化（正数） */
    gangPlayerDelta: number;
    /** 各付出方 ID → 积分变化（负数） */
    payerDeltas: Record<string, number>;
    /** 杠基础分（按牌种） */
    baseScore: number;
    /** 杠类型倍数 */
    typeMultiplier: number;
    /** 庄家倍数 */
    dealerMultiplier: number;
    /** 单份 / 全额 */
    unitAmount: number;
    /** 总额（gangPlayer 获得） */
    totalAmount: number;
}
// ============================================================
// 2. 杠分计算
// ============================================================
/**
 * 计算一次杠的"全额"
 *  - base × type × dealer
 *  - 全额 = 3 家各付时的总额
 *
 * @param gangTile 杠的牌
 * @param isDealer 开杠玩家是否庄家
 * @param isAnGang 是否暗杠（true=暗杠×2，false=明杠/加杠×1）
 */
export function computeGangAmount(gangTile: Tile, isDealer: boolean, isAnGang: boolean, baseScore: number = 1, fixedBase?: number): {
    baseFromTile: number;
    typeMul: number;
    dealerMul: number;
    unit: number; // 单份（每家应付）
    total: number; // 全额（3 家各付时的总额）
} {
    // 牌种基础分（GangConfig 内已含分类逻辑）
    const baseFromTile = fixedBase ?? getGangBaseScore(gangTile);
    const typeMul = isAnGang ? GANG_TYPE_MULTIPLIER.AnGang : GANG_TYPE_MULTIPLIER.MingGang;
    const dealerMul = isDealer ? GANG_DEALER_MULTIPLIER.Dealer : GANG_DEALER_MULTIPLIER.NonDealer;
    // 单份 = 牌种基础 × 杠类型倍数 × 庄家倍数 × 底分
    const unit = baseFromTile * typeMul * dealerMul * baseScore;
    // Nominal three-share amount. settleGang applies each payer's dealer
    // multiplier and computes the actual total for non-dealer kong owners.
    const total = unit * 3;
    return { baseFromTile, typeMul, dealerMul, unit, total };
}
// ============================================================
// 3. 杠分摊结算
// ============================================================
/**
 * 杠分结算主入口
 *  - 开杠时计算并暂存，局末才应用到积分
 *  - 不参与胡牌满贯
 */
export function settleGang(ctx: GangContext): GangSettlementResult {
    const isDealer = ctx.gangPlayer.seat === ctx.currentDealer;
    const isAnGang = ctx.mode === GangSettlementMode.AnGang;
    const baseScore = ctx.roomConfig.baseScore;
    const isSupplement = ctx.mode === GangSettlementMode.Supplement;
    const calc = computeGangAmount(ctx.gangTile, isDealer, isAnGang, baseScore, isSupplement ? 1 : ctx.meld.specialGang ? 2 : undefined);
    const result: GangSettlementResult = {
        mode: ctx.mode,
        gangPlayerId: ctx.gangPlayer.id,
        gangPlayerDelta: 0,
        payerDeltas: {},
        baseScore: calc.baseFromTile,
        typeMultiplier: calc.typeMul,
        dealerMultiplier: calc.dealerMul,
        unitAmount: calc.unit,
        totalAmount: calc.total,
    };
    // Every kong is paid by all other players. The supplier never pays
    // additional shares. Apply the dealer multiplier separately to each pair.
    for (const p of ctx.allPlayers) {
        if (p.id === ctx.gangPlayer.id)
            continue;
        const amount = calc.baseFromTile * calc.typeMul * baseScore
            * (isDealer || p.seat === ctx.currentDealer ? GANG_DEALER_MULTIPLIER.Dealer : GANG_DEALER_MULTIPLIER.NonDealer);
        result.payerDeltas[p.id] = -amount;
    }
    result.gangPlayerDelta = -Object.values(result.payerDeltas).reduce((a, b) => a + b, 0);
    result.totalAmount = result.gangPlayerDelta;
    return result;
}
// ============================================================
// 4. 应用杠分到玩家积分
// ============================================================
/**
 * 把杠分结算结果应用到玩家积分
 *  - 胡牌或荒庄时应用，独立于胡牌满贯
 */
export function applyGangSettlement(players: Player[], result: GangSettlementResult): void {
    for (const p of players) {
        if (p.id === result.gangPlayerId) {
            p.score += result.gangPlayerDelta;
        }
        else if (result.payerDeltas[p.id] != null) {
            p.score += result.payerDeltas[p.id];
        }
    }
}
// ============================================================
// 5. 工具：从副露推断结算方式
// ============================================================
/**
 * 从副露类型推断结算方式
 *  - MingGang / JiaGang / AnGang
 */
export function getGangMode(meldType: MeldType): GangSettlementMode | null {
    switch (meldType) {
        case MeldType.MingGang: return GangSettlementMode.MingGang;
        case MeldType.AnGang: return GangSettlementMode.AnGang;
        case MeldType.JiaGang: return GangSettlementMode.JiaGang;
        default: return null; // 碰、吃不是杠
    }
}
