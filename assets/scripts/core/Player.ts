/**
 * Player.ts - 玩家数据结构与状态标记
 * ------------------------------------------------------------
 * 一个 Player 描述单个玩家在一局中的全部状态：
 *   - 身份信息（id、昵称、座位方向）
 *   - 手牌（手上的暗牌）
 *   - 副露（碰/杠/吃，已亮明的组合）
 *   - 弃牌（自己打出到牌河的牌）
 *   - 状态标记（庄家、报听、站立、开门、是否已胡）
 *   - 实时积分
 *
 * 注意：这里只定义"数据"，不涉及行为逻辑（出牌/碰杠判断在后续阶段实现）。
 */
import { Tile, isHonor } from './Tile';
import { MeldType, RiichiType, SeatWind, Suit, UserId } from './Types';
// ============================================================
// 1. 副露（Meld）
// ============================================================
/**
 * 副露（Meld）：玩家面前亮出来的一组牌
 *  - 碰（Peng）：3 张同种
 *  - 明杠（MingGang）：4 张同种，明着亮出来
 *  - 暗杠（AnGang）：4 张同种，全扣；不算开门
 *  - 加杠（JiaGang）：已碰后补 1 张成杠；视为开门
 *  - 吃（Chi）：3 张数牌顺子
 *
 * 字段说明：
 *  - openedTileIndex：用于"吃 / 碰 / 明杠"标记哪张牌是从别人那里要来的（开门的来源）
 *      例如别人打出 5 万，我碰，则 melds[i].tiles 中索引位置对应那张 = "5 万（来自他家）"。
 *      AnGang 没有来源（4 张全自己摸），openedTileIndex 设为 -1。
 */
export interface Meld {
    /** 副露类型 */
    readonly type: MeldType;
    /** 构成副露的牌（3 或 4 张，按 id 排序） */
    readonly tiles: Tile[];
    /**
     * "他家来源"的牌在 tiles 中的索引（用于 UI 渲染横放）
     *  - Chi/Peng/MingGang/JiaGang：0~3
     *  - AnGang：-1
     */
    readonly openedTileIndex: number;
    /** Public four-wind / three-dragon concealed gang; ordinary AnGang stays hidden. */
    readonly specialGang?: 'winds' | 'dragons';
}
// ============================================================
// 2. 玩家状态标记
// ============================================================
/**
 * 玩家的局内状态标记（一组布尔/枚举）
 * 所有"是否 XX" 的开关集中管理，方便结算时统一查询。
 */
export interface PlayerState {
    /** 是否为庄家（影响 ×2 与杠分 ×2） */
    isDealer: boolean;
    /** 是否报听（报听后不能换牌） */
    riichi: RiichiType;
    /** Publicly announced wait shapes: danDiao / duiDao / jiaHu / jue / pingHu. */
    riichiShapes: string[];
    riichiWaits: {
        suit: Suit;
        rank: number;
    }[];
    riichiLockedHandIds: number[];
    riichiMeldSignature: string;
    /** 是否站立（未开门：没有任何碰/明杠/加杠） */
    isStanding: boolean;
    /** 是否开门（碰 / 明杠 / 加杠 任意一个即视为开门；暗杠不算） */
    isOpen: boolean;
    /** 本局是否已胡牌 */
    isWon: boolean;
    /** 是否点炮（本局是否放炮过） */
    isFired: boolean;
    /** 是否被抢杠胡（本局开杠时被人抢杠胡） */
    isRobbed: boolean;
    /** 是否流局（荒庄时） */
    isDrawn: boolean;
}
/**
 * 初始状态：所有标记为 false / None
 */
export function createDefaultPlayerState(): PlayerState {
    return {
        isDealer: false,
        riichi: RiichiType.None,
        riichiShapes: [],
        riichiWaits: [],
        riichiLockedHandIds: [],
        riichiMeldSignature: '',
        isStanding: true, // 默认站立（未开门）
        isOpen: false,
        isWon: false,
        isFired: false,
        isRobbed: false,
        isDrawn: false,
    };
}
// ============================================================
// 3. 玩家主体接口
// ============================================================
/**
 * 单个玩家在一局中的数据
 */
export interface Player {
    /** 玩家唯一 ID（微信 openid / 自定义用户 ID） */
    readonly id: UserId;
    /** 昵称 */
    name: string;
    /** 座位方向（东/南/西/北） */
    seat: SeatWind;
    /** 手牌（手上的暗牌，未亮明，不含副露牌） */
    hand: Tile[];
    /** 已亮明的副露（碰/杠/吃）列表 */
    melds: Meld[];
    /** 自己打出的弃牌（牌河），按时间顺序 */
    discards: Tile[];
    /** 实时积分（开局 0，每局结算更新） */
    score: number;
    /** 局内状态标记 */
    state: PlayerState;
}
// ============================================================
// 4. 玩家工具方法
// ============================================================
/**
 * 工厂方法：创建一个初始玩家
 *  - 开局分数 = 0
 *  - 手牌 / 副露 / 弃牌均为空
 *  - 状态 = 默认状态
 */
export function createPlayer(id: UserId, name: string, seat: SeatWind): Player {
    return {
        id,
        name,
        seat,
        hand: [],
        melds: [],
        discards: [],
        score: 0,
        state: createDefaultPlayerState(),
    };
}
/** Also repairs legacy builds that accidentally stored [Set] instead of strings. */
export function readRiichiShapes(player: Player): string[] {
    const valid = ['danDiao', 'duiDao', 'jiaHu', 'jue', 'pingHu'];
    const source: unknown[] = Array.isArray(player.state.riichiShapes) ? player.state.riichiShapes : [];
    return Array.from(new Set(source.flatMap(value => typeof value === 'string' ? [value]
        : value instanceof Set ? Array.from(value).filter((v): v is string => typeof v === 'string') : [])
        .filter(value => valid.includes(value))));
}
export function meldSignature(player: Player): string {
    return player.melds.map(m => m.type + ':' + m.tiles.map(t => t.id).sort((a, b) => a - b).join(',')).join('|');
}
export function hasLockedRiichiHand(player: Player, hand: Tile[]): boolean {
    if (!player.state.riichiLockedHandIds.length)
        return true;
    return hand.map(t => t.id).sort((a, b) => a - b).join(',') === player.state.riichiLockedHandIds.join(',')
        && meldSignature(player) === player.state.riichiMeldSignature;
}
export function copyRiichiDeclaration(source: Player, target: Player): void {
    target.state.riichi = source.state.riichi;
    target.state.riichiShapes = readRiichiShapes(source);
    target.state.riichiWaits = source.state.riichiWaits.map(t => ({ ...t }));
    target.state.riichiLockedHandIds = source.state.riichiLockedHandIds.slice();
    target.state.riichiMeldSignature = source.state.riichiMeldSignature;
}
/**
 * 获取玩家所有"相关"的牌（手牌 + 副露所有牌）
 * 用于胡牌判断（必须把手牌 + 副露一起看）。
 */
export function getAllPlayerTiles(player: Player): Tile[] {
    const out: Tile[] = [...player.hand];
    for (const meld of player.melds) {
        out.push(...meld.tiles);
    }
    return out;
}
/**
 * 计算玩家手牌张数（不含副露）
 * 集安麻将：开局 13 张，摸牌后 14 张，出牌后 13 张……
 */
export function getHandCount(player: Player): number {
    return player.hand.length;
}
/**
 * 检查玩家是否"开门"
 *  集安规则："开门判定：碰、明杠算开门；暗杠、字杠不算开门。"
 *
 *  - 碰（任何牌）/ 吃：开门
 *  - 明杠 / 加杠 + 数牌：开门
 *  - 明杠 / 加杠 + 字牌（字杠）：不算开门
 *  - 暗杠（任何牌）：不算开门
 *
 * 任意一个"贡献开门"的副露存在即视为开门。
 * 推荐使用 game/Opener.ts 的 computeIsOpen / refreshOpenState 维护实时状态。
 */
export function checkIsOpen(player: Player): boolean {
    return player.melds.some(m => {
        if (m.type === MeldType.Peng || m.type === MeldType.Chi)
            return true;
        if (m.type === MeldType.MingGang || m.type === MeldType.JiaGang) {
            // 字杠不算开门
            return m.tiles.length > 0 && !isHonor(m.tiles[0]);
        }
        return false; // AnGang 不算
    });
}
/**
 * 检查玩家是否"站立"（未开门）
 * 站立 ×2 的结算加成条件。
 */
export function checkIsStanding(player: Player): boolean {
    return !checkIsOpen(player);
}
