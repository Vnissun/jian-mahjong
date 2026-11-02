/** 当前结算清单：每笔积分在胡家与付款方之间单独计算。 */
export const WIN_TYPE_MULTIPLIERS = {
    HunQing: 2,
    ChunQing: 4,
} as const;
export const RIICHI_MULTIPLIERS = { Normal: 2, Jue: 4 } as const;
export const SEAT_STATE_MULTIPLIERS = { Dealer: 2, Standing: 2, SanJiaQing: 4, SiJiaQing: 16 } as const;
export const QI_XIAO_DUI_RULES = { Base: 8, LuxuryPerQuad: 2 } as const;
export const PATTERN_MULTIPLIERS = { SelfDraw: 2, DianPao: 2, GangHouExtra: 2, PiaoHu: 2 } as const;
export const ALL_MULTIPLIERS = Object.freeze({
    winType: { ...WIN_TYPE_MULTIPLIERS }, riichi: { ...RIICHI_MULTIPLIERS },
    seatState: { ...SEAT_STATE_MULTIPLIERS }, pattern: { ...PATTERN_MULTIPLIERS },
});
export function computeFinalMultiplier(multipliers: number[], cap: number): number {
    const total=multipliers.reduce((n,m)=>n*m,1);
    return cap===0?total:Math.min(total,cap);
}
