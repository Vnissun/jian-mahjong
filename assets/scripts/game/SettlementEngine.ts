import { isPiaoHu } from './PiaoHu';
import { Player, readRiichiShapes } from '../core/Player';
import { Tile } from '../core/Tile';
import { RoomConfig } from '../core/Room';
import { SeatWind, RiichiType } from '../core/Types';
import { PatternResult } from './PatternRecognizer';
import { isChunQing, isHunQing } from './HandValidator';
import { RIICHI_MULTIPLIERS, SEAT_STATE_MULTIPLIERS, WIN_TYPE_MULTIPLIERS, QI_XIAO_DUI_RULES, PATTERN_MULTIPLIERS } from '../config/ScoringConfig';
export enum WinMode {
    SelfDraw = 'selfDraw',
    DianPao = 'dianPao',
    RobbingGang = 'robbingGang'
}
export interface WinContext {
    winner: Player;
    winTiles: Tile[];
    winTile: Tile;
    winMode: WinMode;
    firer?: Player;
    allPlayers: Player[];
    currentDealer: SeatWind;
    /** Legacy field retained for callers; never used as a table-wide multiplier. */
    combinedRiichiMul?: number;
    isAfterGang: boolean;
    isAfterGangSpecial: boolean;
    isGangShangKaiHua: boolean;
    patternResult?: PatternResult;
    qiInfo?: {
        isHaoHua: boolean;
        gangGroups: number;
    };
    roomConfig: RoomConfig;
}
export interface MultiplierBreakdown {
    dealerMul: number;
    riichiMul: number;
    winnerStandingMul: number;
    payerStandingMul: number;
    selfDrawMul: number;
    dianPaoMul: number;
    gangHouMul: number;
    qingMul: number;
    sanJiaQingMul: number;
    siJiaQingMul: number;
    qiXiaoDuiBaseMul: number;
    qiXiaoDuiLuxuryMul: number;
    piaoHuMul: number;
    totalMul: number;
}
export interface PayerSettlement {
    payerId: string;
    rawMultiplier: number;
    cappedMultiplier: number;
    isCapped: boolean;
    amount: number;
    breakdown: MultiplierBreakdown;
}
export interface SettlementResult {
    winnerId: string;
    winnerDelta: number;
    payerDeltas: Record<string, number>;
    payerDetails: Record<string, PayerSettlement>;
    firerId?: string;
    /** Maximum across payers, for legacy consumers; UI uses payerDetails. */
    rawMultiplier: number;
    cappedMultiplier: number;
    isCapped: boolean;
    breakdown: MultiplierBreakdown;
    baseScore: number;
    cap: number;
    riichiDuel?: boolean;
}
export function getRiichiMultiplier(player: Player): number {
    return player.state.riichi === RiichiType.Jue ? RIICHI_MULTIPLIERS.Jue
        : player.state.riichi === RiichiType.Normal ? RIICHI_MULTIPLIERS.Normal : 1;
}
/** Every payment is a separate winner-payer comparison. Each factor is applied once. */
export function computeWinMultiplier(ctx: WinContext, payer?: Player): {
    mul: number;
    breakdown: MultiplierBreakdown;
} {
    payer ??= ctx.firer ?? ctx.allPlayers.find(p => p.id !== ctx.winner.id);
    if (!payer || payer.id === ctx.winner.id)
        throw new Error('结算需要另一名付款玩家');
    const selfDraw = ctx.winMode === WinMode.SelfDraw;
    const responsible = !selfDraw && ctx.firer?.id === payer.id;
    const afterGang = ctx.isAfterGangSpecial || (selfDraw && ctx.isGangShangKaiHua);
    const sanJiaQing = !ctx.qiInfo && !ctx.winner.state.isStanding
        && ctx.allPlayers.filter(p => p.id !== ctx.winner.id).every(p => p.state.isStanding);
    const siJiaQing = !ctx.qiInfo && ctx.allPlayers.every(p => p.state.isStanding);
    // These fixed bases already include standing; do not charge it a second time.
    const fixedClearBase = sanJiaQing || siJiaQing;
    const bd: MultiplierBreakdown = {
        dealerMul: ctx.winner.seat === ctx.currentDealer || payer.seat === ctx.currentDealer ? SEAT_STATE_MULTIPLIERS.Dealer : 1,
        riichiMul: ctx.roomConfig.riichiDuel
            ? getRiichiMultiplier(ctx.winner) * getRiichiMultiplier(payer)
            : Math.max(getRiichiMultiplier(ctx.winner), getRiichiMultiplier(payer)),
        winnerStandingMul: !fixedClearBase && ctx.winner.state.isStanding ? SEAT_STATE_MULTIPLIERS.Standing : 1,
        payerStandingMul: !fixedClearBase && payer.state.isStanding ? SEAT_STATE_MULTIPLIERS.Standing : 1,
        selfDrawMul: selfDraw ? PATTERN_MULTIPLIERS.SelfDraw : 1,
        dianPaoMul: responsible ? PATTERN_MULTIPLIERS.DianPao : 1,
        gangHouMul: afterGang && (selfDraw || responsible) ? PATTERN_MULTIPLIERS.GangHouExtra : 1,
        qingMul: isChunQing(ctx.winTiles) ? WIN_TYPE_MULTIPLIERS.ChunQing
            : isHunQing(ctx.winTiles) ? WIN_TYPE_MULTIPLIERS.HunQing : 1,
        sanJiaQingMul: sanJiaQing ? SEAT_STATE_MULTIPLIERS.SanJiaQing : 1,
        siJiaQingMul: siJiaQing ? SEAT_STATE_MULTIPLIERS.SiJiaQing : 1,
        // Seven pairs already includes its fixed four-family-clear base; do not multiply it twice.
        qiXiaoDuiBaseMul: ctx.qiInfo ? QI_XIAO_DUI_RULES.Base : 1,
        // Four identical tiles retained in the concealed seven-pairs hand count as
        // two pairs, with one extra doubling per group (up to three groups).
        qiXiaoDuiLuxuryMul: ctx.qiInfo ? QI_XIAO_DUI_RULES.LuxuryPerQuad ** ctx.qiInfo.gangGroups : 1,
        piaoHuMul: !ctx.qiInfo && isPiaoHu(ctx.winTiles, ctx.winner.melds) ? PATTERN_MULTIPLIERS.PiaoHu : 1,
        totalMul: 1,
    };
    bd.totalMul = Object.entries(bd).filter(([key]) => key !== 'totalMul').reduce((n, [, value]) => n * value, 1);
    return { mul: bd.totalMul, breakdown: bd };
}
export function applyCap(multiplier: number, cap: number): number { return cap === 0 ? multiplier : Math.min(multiplier, cap); }
export function settleWin(ctx: WinContext): SettlementResult {
    if (ctx.qiInfo && (ctx.winner.state.riichi !== RiichiType.Normal
        || !readRiichiShapes(ctx.winner).includes('danDiao')))
        throw new Error('七小对须先报听单吊');
    if (ctx.winMode !== WinMode.SelfDraw && (!ctx.firer || ctx.firer.id === ctx.winner.id))
        throw new Error('点炮/抢杠需要合法责任方');
    const payers = ctx.allPlayers.filter(p => p.id !== ctx.winner.id);
    if (payers.length !== 3)
        throw new Error('胡牌需要另外三家分别结算');
    const result: SettlementResult = {
        winnerId: ctx.winner.id, winnerDelta: 0, payerDeltas: {}, payerDetails: {},
        firerId: ctx.winMode === WinMode.SelfDraw ? undefined : ctx.firer?.id,
        rawMultiplier: 1, cappedMultiplier: 1, isCapped: false,
        breakdown: computeWinMultiplier(ctx, payers[0]).breakdown,
        baseScore: ctx.roomConfig.baseScore, cap: ctx.roomConfig.cap,
        riichiDuel: !!ctx.roomConfig.riichiDuel,
    };
    for (const payer of payers) {
        const { mul, breakdown } = computeWinMultiplier(ctx, payer);
        const capped = applyCap(mul, result.cap), amount = capped * result.baseScore;
        result.payerDetails[payer.id] = { payerId: payer.id, rawMultiplier: mul,
            cappedMultiplier: capped, isCapped: result.cap > 0 && mul > result.cap, amount, breakdown };
        result.payerDeltas[payer.id] = -amount;
        result.winnerDelta += amount;
        if (mul >= result.rawMultiplier)
            result.breakdown = breakdown;
        result.rawMultiplier = Math.max(result.rawMultiplier, mul);
        result.cappedMultiplier = Math.max(result.cappedMultiplier, capped);
        result.isCapped ||= result.cap > 0 && mul > result.cap;
    }
    return result;
}
export function applySettlement(players: Player[], result: SettlementResult): void {
    for (const player of players) {
        if (player.id === result.winnerId) {
            player.score += result.winnerDelta;
            player.state.isWon = true;
        }
        else {
            player.score += result.payerDeltas[player.id] ?? 0;
            player.state.isFired = player.id === result.firerId;
        }
    }
}
