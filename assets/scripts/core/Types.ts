/**
 * Types.ts - 集安麻将核心类型定义
 * ------------------------------------------------------------
 * 本文件集中定义游戏所有的"枚举"和"基础类型"。
 * 后续 Player / Room / Tile / 配置表 都会引用这里的内容。
 * 把枚举集中放在一起的好处：
 *   1. 改规则时只在一处查找（例如新增一个胡型）。
 *   2. 跨文件互相引用类型时避免循环依赖。
 *
 * 注意：Cocos Creator 脚本默认使用 ES 模块，请用 `import { XX } from './Types'` 形式。
 *
 * 文件结构：
 *   - 牌相关枚举：花色 Suit / 字牌子类 HonorType
 *   - 方位枚举：Wind / SeatWind
 *   - 动作枚举：ActionType / MeldType / GangType
 *   - 胡型枚举：WinType / RiichiType
 *   - 局阶段：RoundPhase
 *   - 通用接口：KeyValue / Id
 */

// ============================================================
// 1. 牌相关枚举
// ============================================================

/**
 * 牌的花色（Suit）
 * 集安麻将共 5 种花色：万、筒、条、风、元
 *  - 万 / 筒 / 条 = 数牌（1~9）
 *  - 风 / 元      = 字牌
 */
export enum Suit {
    Wan = 'wan',      // 万子（一万~九万）
    Tong = 'tong',    // 筒子（一筒~九筒，南方称"饼"）
    Tiao = 'tiao',    // 条子（一条~九条，南方称"索"）
    Feng = 'feng',    // 风牌（东南西北）
    Yuan = 'yuan',    // 元牌（中发白）
}

/**
 * 字牌子分类（仅用于显示与规则判断，不影响数据结构）
 */
export enum HonorType {
    Feng = 'feng',    // 风牌
    Yuan = 'yuan',    // 元牌（中发白）
}

// ============================================================
// 2. 方位枚举（座位 / 圈风 / 场风）
// ============================================================

/**
 * 风位（东南西北）
 * 既用于座位方向 SeatWind，也用于圈风 RoundWind、玩家门风 PlayerWind。
 * 顺时针顺序：东 → 南 → 西 → 北 （与麻将约定一致）。
 */
export enum Wind {
    East = 'east',
    South = 'south',
    West = 'west',
    North = 'north',
}

/**
 * 座位方位（4 个玩家分别坐哪个方向）
 * 集安麻将：开局吊庄后东→南→西→北依次为庄。
 */
export enum SeatWind {
    East = 'east',
    South = 'south',
    West = 'west',
    North = 'north',
}

// ============================================================
// 3. 动作 / 副露枚举
// ============================================================

/**
 * 玩家可执行的动作类型（用于消息 / 历史记录 / UI 按钮）
 */
export enum ActionType {
    Discard = 'discard',   // 出牌（打一张到牌河）
    Chi = 'chi',            // 吃牌（需开启"允许吃牌"开关）
    Peng = 'peng',          // 碰牌
    MingGang = 'mingGang',  // 明杠（别人打出的牌，自己手中有 3 张相同）
    AnGang = 'anGang',      // 暗杠（自己手中有 4 张相同）
    JiaGang = 'jiaGang',    // 加杠（已碰的牌再补第 4 张）
    Riichi = 'riichi',      // 报听
    Win = 'win',            // 胡牌
    Pass = 'pass',          // 过（放弃本次吃碰杠胡）
    Draw = 'draw',          // 摸牌
}

/**
 * 副露（Meld）类型
 * 副露 = 玩家面前亮出来的"碰/杠/吃"组合。
 */
export enum MeldType {
    Chi = 'chi',             // 吃（顺子 3 张）
    Peng = 'peng',           // 碰（同种 3 张）
    MingGang = 'mingGang',   // 明杠（同种 4 张，已开门）
    AnGang = 'anGang',       // 暗杠（同种 4 张，未开门，4 张全扣）
    JiaGang = 'jiaGang',     // 加杠（已碰后补 1 张成杠，开门状态）
}

/**
 * 杠类型（独立于 MeldType 用于结算）
 *  - AnGang：暗杠
 *  - MingGang：明杠（含加杠，加杠也属于"已开门"杠）
 *  注意：暗杠不能抢杠胡；明杠 / 加杠 可以被抢杠胡。
 */
export enum GangType {
    AnGang = 'anGang',
    MingGang = 'mingGang',
}

/**
 * 杠分基础档位（根据牌的种类决定基础分，详见 GangConfig）
 */
export enum GangBaseLevel {
    Normal = 1,   // 普通数字（非特殊牌）
    Honor = 4,    // 东南西北中发白 / 二饼 / 八万四张
    Special = 2,  // 幺鸡 / 一饼 / 四张中发白
}

// ============================================================
// 4. 胡牌类型枚举
// ============================================================

/**
 * 胡牌型态（影响倍数）
 * 对倒 / 单吊 / 夹胡 / 撅 = 单张听牌的 4 种形态
 * 混清一色 / 纯清一色 = 缺门豁免 / 大牌
 * 七小对 / 豪华七小对 = 对子胡
 */
export enum WinType {
    PingHu = 'pingHu',        // 平胡（基础胡牌，无特殊型态）
    DuiDao = 'duiDao',        // 对倒（两对子等一张成刻）
    DanDiao = 'danDiao',      // 单吊（单张等成对）
    JiaHu = 'jiaHu',          // 夹胡（中间张夹胡，如 1/3 夹 2）
    Jue = 'jue',              // 撅（边胡：12 胡 3、89 胡 7）
    HunQing = 'hunQing',      // 混清一色（带字牌）
    ChunQing = 'chunQing',    // 纯清一色（无字）
    QiXiaoDui = 'qiXiaoDui',  // 七小对
    HaoHuaQiXiaoDui = 'haoHuaQiXiaoDui', // 豪华七小对（含 1 组四张）
}

/**
 * 报听类型（用于倍数区分）
 *  - 普通：×2
 *  - 撅（边胡）：×4
 * 多人报听只取一次报听倍数（不叠加）。
 */
export enum RiichiType {
    None = 'none',       // 未报听
    Normal = 'normal',   // 普通报听 ×2
    Jue = 'jue',         // 撅报听 ×4
}

// ============================================================
// 5. 局阶段
// ============================================================

/**
 * 一局（Round）所处的阶段
 */
export enum RoundPhase {
    Idle = 'idle',               // 等待开局
    Dealing = 'dealing',         // 发牌
    PlayerTurn = 'playerTurn',   // 玩家轮次（出牌/摸牌中）
    Awaiting = 'awaiting',       // 等待其他玩家回应（吃/碰/杠/胡）
    RobbingGang = 'robbingGang', // 抢杠胡判定窗口
    Settled = 'settled',         // 本局结算完成
    Drawn = 'drawn',             // 荒庄（流局）
}

// ============================================================
// 6. 通用接口
// ============================================================

/** 简单键值对（用于配置） */
export interface KeyValue<T = any> {
    [key: string]: T;
}

/** 玩家 / 用户唯一 ID */
export type UserId = string;

/** 牌的唯一 ID（0~135） */
export type TileId = number;
