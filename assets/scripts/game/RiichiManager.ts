import { evaluatePlayerWin } from './PlayerWin';
/** Only 单吊、夹、撅、对倒 may be declared. Ordinary two-sided waits stay unlocked. */
import { Player, readRiichiShapes, meldSignature } from '../core/Player';
import { Tile } from '../core/Tile';
import { RiichiType } from '../core/Types';
import { findAllWinPatterns } from './WinChecker';
import { ALL_TILES } from '../data/TileCatalog';
import { WinPatternType } from './PatternRecognizer';
// ============================================================
// 1. 听牌分析
// ============================================================
/**
 * 听牌分析结果
 */
export interface ListenAnalysis {
    /** 是否听牌 */
    isListening: boolean;
    /** 听的牌列表（按 id 去重） */
    winningTiles: Tile[];
    /** 听牌型态集合（含撅的话则撕报听） */
    patternTypes: Set<WinPatternType>;
    /** 是否含"撅"型态 */
    hasJue: boolean;
    hasQiWait?: boolean;
    declarationChoices?: RiichiChoice[];
}
/**
 * 分析玩家是否听牌 + 听什么
 *  - 13 张手牌 + 任意一张（遍历剩余牌池）→ 能否胡 + 门槛通过
 *
 * @param player 玩家
 * @param allowQiXiaoDui 是否允许七小对
 * @param remainingTiles 剩余牌池（用于枚举可能胡的牌）
 */
export function analyzeListening(player: Player, allowQiXiaoDui: boolean, remainingTiles: readonly Tile[] = ALL_TILES): ListenAnalysis {
    const hand13 = player.hand;
    if (hand13.length !== 13 - 3 * player.melds.length) {
        return { isListening: false, winningTiles: [], patternTypes: new Set(), hasJue: false };
    }
    const winningTiles: Tile[] = [];
    const patternTypes = new Set<WinPatternType>();
    let hasJue = false;
    let hasQiWait = false;
    const candidates: { tile: Tile; shapes: Set<WinPatternType> }[] = [];
    // 遍历每种牌（按牌种去重，避免重复判定）
    const seenKeys = new Set<string>();
    for (const candidate of remainingTiles) {
        const key = `${candidate.suit}:${candidate.rank}`;
        if (seenKeys.has(key))
            continue;
        seenKeys.add(key);
        // 13 + 1 = 14，能否胡？
        // Use a fresh identity: the candidate must not alias a tile in hand.
        const virtualTile = { ...candidate, id: -1 };
        const evaluation = evaluatePlayerWin(player, virtualTile, allowQiXiaoDui, false);
        if (!evaluation.ok)
            continue;
        // 听到了
        winningTiles.push(candidate);
        const shapes = new Set<WinPatternType>();
        candidates.push({ tile: candidate, shapes });
        if (evaluation.qiInfo) {
            shapes.add(WinPatternType.DanDiao);
            hasQiWait = true;
            patternTypes.add(WinPatternType.DanDiao);
            continue;
        }
        // 分析听牌型态（是否含撅）
        const patterns = findAllWinPatterns(evaluation.concealed);
        for (const p of patterns) {
            const r = classifyListen(p, virtualTile);
            if (r === WinPatternType.Jue)
                hasJue = true;
            if (r) {
                patternTypes.add(r);
                shapes.add(r);
            }
        }
    }
    return {
        isListening: winningTiles.length > 0,
        winningTiles,
        patternTypes,
        hasJue,
        hasQiWait,
        declarationChoices: buildChoices(candidates),
    };
}
/**
 * 根据拆解方案判定听牌型态（精简版）
 *  - 撕（边胡）= 顺子 (1,2,3) 缺 3 / (7,8,9) 缺 7
 *  - 夹胡 = 顺子中张缺
 *  - 对倒 = 缺一张成刻+另 1 对做将
 *  - 单吊 = 缺一张成将
 *
 * 此函数复用 PatternRecognizer 思路，简化为只关心"是否撕"
 */
function classifyListen(p: any, candidate: Tile): WinPatternType | null {
    // 在 pair 位置 → 单吊
    if (p.pair.some((t: Tile) => t.id === candidate.id)) {
        return WinPatternType.DanDiao;
    }
    // 在某个 meld 中
    for (const meld of p.melds) {
        if (!meld.some((t: Tile) => t.id === candidate.id))
            continue;
        // 刻子 → 对倒
        const isTriplet = meld[0].suit === meld[1].suit
            && meld[1].suit === meld[2].suit
            && meld[0].rank === meld[1].rank
            && meld[1].rank === meld[2].rank;
        if (isTriplet)
            return WinPatternType.DuiDao;
        // 顺子 → 看位置
        const ranks = meld.map((t: Tile) => t.rank).slice().sort((a: number, b: number) => a - b);
        const idx = ranks.indexOf(candidate.rank);
        if (idx === 1)
            return WinPatternType.JiaHu;
        if (idx === 2 && ranks[2] === 3)
            return WinPatternType.Jue;
        if (idx === 0 && ranks[0] === 7)
            return WinPatternType.Jue;
        return null;
    }
    return null;
}
export interface RiichiChoice {
    key: string;
    shape: WinPatternType;
    winningTiles: Tile[];
    label: string;
}
const SHAPE_LABELS: Record<string, string> = { danDiao: '单吊', duiDao: '对倒', jiaHu: '夹胡', jue: '撅' };
function buildChoices(candidates: { tile: Tile; shapes: Set<WinPatternType> }[]): RiichiChoice[] {
    const choices: RiichiChoice[] = [];
    for (const shape of [WinPatternType.DanDiao, WinPatternType.JiaHu, WinPatternType.Jue, WinPatternType.DuiDao]) {
        const tiles = candidates.filter(c => c.shapes.has(shape)).map(c => c.tile);
        const groups = shape === WinPatternType.DuiDao ? (tiles.length ? [tiles] : []) : tiles.map(t => [t]);
        for (const winningTiles of groups) {
            const key = shape + ':' + winningTiles.map(t => t.suit + ':' + t.rank).join(',');
            choices.push({ key, shape, winningTiles, label: SHAPE_LABELS[shape] + ' · 听 ' + winningTiles.map(t => t.name).join('/') });
        }
    }
    return choices;
}
export function getRiichiChoices(player: Player, allowQi: boolean): RiichiChoice[] {
    return analyzeListening(player, allowQi).declarationChoices ?? [];
}
// ============================================================
// 2. 报听动作
// ============================================================
/**
 * 报听结果
 */
export interface RiichiResult {
    ok: boolean;
    error?: string;
    /** 报听类型（普通 / 撕） */
    riichiType?: RiichiType;
}
/**
 * 玩家声明报听
 *  - 必须当前听牌
 *  - 自动判定普通报听 / 撕报听
 *  - 写入 PlayerState.riichi
 *
 * @param player 玩家
 * @param allowQiXiaoDui 是否允许七小对
 */
export function declareRiichi(player: Player, allowQiXiaoDui: boolean, choiceKey?: string): RiichiResult {
    if (player.state.riichi !== RiichiType.None) {
        return { ok: false, error: '已报听，不能重复报听' };
    }
    if (player.state.isWon || player.state.isDrawn) {
        return { ok: false, error: '玩家已结束本局，不能报听' };
    }
    const analysis = analyzeListening(player, allowQiXiaoDui);
    if (!analysis.isListening) {
        return { ok: false, error: '未听牌，不能报听' };
    }
    const choices = analysis.declarationChoices ?? [];
    if (!choices.length)
        return { ok: false, error: '两面普通听不能报听，可继续换牌' };
    if (!choiceKey && choices.filter(c => c.shape === WinPatternType.DanDiao).length > 1)
        return { ok: false, error: '请选择单吊的一张听牌，选择后不可换听' };
    const choice = choiceKey ? choices.find(c => c.key === choiceKey) : choices[0];
    if (!choice)
        return { ok: false, error: '无效的报听听口' };
    const type = choice.shape === WinPatternType.Jue ? RiichiType.Jue : RiichiType.Normal;
    player.state.riichi = type;
    player.state.riichiShapes = [choice.shape];
    player.state.riichiWaits = choice.winningTiles.map(t => ({ suit: t.suit, rank: t.rank }));
    player.state.riichiLockedHandIds = player.hand.map(t => t.id).sort((a, b) => a - b);
    player.state.riichiMeldSignature = meldSignature(player);
    return { ok: true, riichiType: type };
}
/**
 * 撤销报听（调试用；实战中不允许）
 */
export function revokeRiichi(player: Player): void {
    player.state.riichi = RiichiType.None;
    player.state.riichiShapes = [];
    player.state.riichiWaits = [];
    player.state.riichiLockedHandIds = [];
    player.state.riichiMeldSignature = '';
}
export function describeRiichi(player: Player): string {
    if (player.state.riichi === RiichiType.None)
        return '';
    const labels: Record<string, string> = { danDiao: '单吊', duiDao: '对倒', jiaHu: '夹胡', jue: '撅', pingHu: '普通听' };
    const shapes = readRiichiShapes(player).map(s => labels[s] ?? s).join('/');
    return (shapes || (player.state.riichi === RiichiType.Jue ? '撅' : '普通听')) + '报听';
}
// ============================================================
// 3. 多人报听倍数合并
// ============================================================
/**
 * 兼容旧工具的全桌报听统计，不用于积分结算。
 * 当前积分必须比较胡家与每一付款方，见 SettlementEngine。
 *
 * @param players 所有玩家
 * @returns 合并后的报听倍数（1 = 无报听，2 = 普通，4 = 撕）
 */
export function getCombinedRiichiMultiplier(players: Player[]): number {
    let max = 1;
    for (const p of players) {
        if (p.state.riichi === RiichiType.Normal) {
            max = Math.max(max, 2);
        }
        else if (p.state.riichi === RiichiType.Jue) {
            max = Math.max(max, 4);
        }
    }
    return max;
}
/**
 * 检查玩家是否报听
 */
export function isRiichi(player: Player): boolean {
    return player.state.riichi !== RiichiType.None;
}
/**
 * 是否撕报听
 */
export function isJueRiichi(player: Player): boolean {
    return player.state.riichi === RiichiType.Jue;
}
