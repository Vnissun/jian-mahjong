/**
 * GameConfig.ts - 开房配置选项 + 默认值
 * ------------------------------------------------------------
 * 集安麻将开房时的所有可选参数集中在此：
 *   - 底分：1 / 2 / 5
 *   - 满贯（胡牌倍数封顶）：32 / 64 / 128 / 256 / 无限（0）
 *   - 封圈数量（默认 3）
 *   - 固定允许吃牌；报听对踢默认关闭
 *   - 是否开启七小对（默认 true）
 *
 * 设计要点：
 *   - 把所有"预定义选项"放一个地方，UI 可直接遍历渲染选择按钮。
 *   - 默认配置单独导出，开房时作为初始值。
 *   - 改规则时只动这里，不会影响逻辑代码。
 */

import { RoomConfig } from '../core/Room';

// ============================================================
// 1. 各项可选值
// ============================================================

/**
 * 底分档位（影响每分对应的积分）
 * 集安规则可选：1 / 2 / 5
 */
export const BASE_SCORE_OPTIONS: ReadonlyArray<number> = Object.freeze([1, 2, 5]);

/**
 * 满贯档位（胡牌倍数封顶值）
 * 集安规则可选：32 / 64 / 128 / 256
 *  - 杠分不计入满贯。
 *  - 满贯后超出部分按满贯值计（不叠加更多）。
 */
// Zero is JSON-safe and means unlimited, never a zero-point cap.
export const CAP_OPTIONS: ReadonlyArray<number> = Object.freeze([32, 64, 128, 256, 0]);
export function describeCap(cap: number): string { return cap === 0 ? '无限' : String(cap); }

/**
 * 封圈数量可选值
 *  - 默认 3 封圈
 *  - 1 封圈 = 4 庄（东→南→西→北 各当 1 次庄）
 */
export const ROUND_WIND_OPTIONS: ReadonlyArray<number> = Object.freeze([1, 2, 3, 4, 8]);

// ============================================================
// 2. 规则开关默认值
// ============================================================

/**
 * 集安默认规则：
 *   - 固定允许吃牌
 *   - 允许七小对（默认 true）
 *   - 允许碰、明杠、暗杠、加杠（始终允许，不做开关）
 *   - 不开宝牌、不开包牌（集安固定规则，不做开关）
 */
export const DEFAULT_ALLOW_CHI: boolean = true;
export const DEFAULT_ALLOW_QI_XIAO_DUI: boolean = true;

// ============================================================
// 3. 默认开房配置
// ============================================================

/**
 * 默认开房配置（用户进入"开房"界面时的初始值）
 *  - 底分：1
 *  - 满贯：32
 *  - 封圈：3
 *  - 允许吃：true
 *  - 允许七小对：true
 */
export const DEFAULT_ROOM_CONFIG: RoomConfig = {
    baseScore: 1,
    cap: 32,
    totalRoundWinds: 3,
    allowChi: DEFAULT_ALLOW_CHI,
    allowQiXiaoDui: DEFAULT_ALLOW_QI_XIAO_DUI,
    riichiDuel: false,
};

// ============================================================
// 4. 工厂 + 校验
// ============================================================

/**
 * 根据选择构造一份 RoomConfig（带合法性校验）
 * 任意非法值会回退到默认值并打印警告。
 */
export function buildRoomConfig(
    baseScore: number,
    cap: number,
    totalRoundWinds: number,
    allowChi: boolean,
    allowQiXiaoDui: boolean,
    riichiDuel = false,
): RoomConfig {
    const safe = <T>(v: T, opts: ReadonlyArray<T>, def: T, label: string): T => {
        if (opts.includes(v)) return v;
        console.warn(`[GameConfig] 非法 ${label}：${v}，回退默认 ${def}`);
        return def;
    };
    return {
        baseScore: safe(baseScore, BASE_SCORE_OPTIONS, DEFAULT_ROOM_CONFIG.baseScore, '底分'),
        cap: safe(cap, CAP_OPTIONS, DEFAULT_ROOM_CONFIG.cap, '满贯'),
        totalRoundWinds: safe(totalRoundWinds, ROUND_WIND_OPTIONS, DEFAULT_ROOM_CONFIG.totalRoundWinds, '封圈'),
        allowChi: true,
        allowQiXiaoDui,
        riichiDuel,
    };
}
