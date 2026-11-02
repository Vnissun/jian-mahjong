/**
 * WinChecker.ts - 胡牌判定（核心）
 * ------------------------------------------------------------
 * 集安麻将胡牌型态：
 *   1. 普通胡牌：4 面子 + 1 对将（14 张）
 *      - 面子 = 顺子（数牌连续 3 张）/ 刻子（同种 3 张）
 *      - 将 = 任意一对
 *   2. 七小对：14 张正好 7 对子
 *   3. 豪华七对 / 双豪七对 / 三豪七对：含 1 / 2 / 3 组四张同种
 *
 * 算法核心：
 *   - 枚举牌种拆解，再分配真实牌引用；固定副露不重新拆解。
 *   - 枚举"将"位置：去掉 1 对后递归拆解剩余
 *
 * 注意：本模块只判断"能否胡"，不做门槛校验（幺九/刻子/缺门），
 *       门槛校验由 HandValidator.ts 负责。
 */
import { Meld } from '../core/Player';
import { Tile } from '../core/Tile';
import { countByType, parseKey, tileKey, } from './HandUtils';
import { Suit } from '../core/Types';
// ============================================================
// 1. 类型定义
// ============================================================
/**
 * 胡牌拆解方案
 *  - pair：将（2 张同种）
 *  - melds：4 个面子（顺子或刻子）
 *  - 用于 PatternRecognizer 反推胡牌型态
 */
export interface WinPattern {
    /** 将（2 张） */
    pair: Tile[];
    /** 4 个面子（每个 3 张） */
    melds: Tile[][];
}
/**
 * 胡牌结果
 */
export interface WinCheckResult {
    /** 是否能胡 */
    canWin: boolean;
    /** 胡牌方式 */
    winType: WinTypeResolved;
    /** 一种合法拆解方案（普通胡时给出，七小对为 null） */
    pattern: WinPattern | null;
    /** 七小对信息（仅当 winType 是 7 小对时有效） */
    qiInfo: {
        isHaoHua: boolean;
        gangGroups: number;
    } | null;
}
/**
 * 胡牌型态分类（用于内部决策）
 */
export enum WinTypeResolved {
    None = 'none',// 不胡
    Standard = 'standard',// 普通胡（4 面子 1 将）
    QiXiaoDui = 'qiXiaoDui',// 七小对
    HaoHuaQiXiaoDui = 'haoHuaQiXiaoDui'
}
// ============================================================
// 2. 辅助：花色顺序 / 数牌判断
// ============================================================
/** Suit 是否为数牌花色 */
function isNumeralSuit(suit: string): boolean {
    return suit === Suit.Wan || suit === Suit.Tong || suit === Suit.Tiao;
}
/** Map.key 比较函数（万 → 筒 → 条 → 风 → 元；同花色按 rank 升序） */
function sortKeyCompare(a: string, b: string): number {
    const pa = parseKey(a);
    const pb = parseKey(b);
    const suitOrder: Record<string, number> = {
        [Suit.Wan]: 0, [Suit.Tong]: 100, [Suit.Tiao]: 200,
        [Suit.Feng]: 300, [Suit.Yuan]: 400,
    };
    return (suitOrder[pa.suit] + pa.rank) - (suitOrder[pb.suit] + pb.rank);
}
/**
 * 普通胡牌判定
 *  - 输入：长度满足 % 3 == 2 的牌组（实战 14 张；带副露时 11/8/5/2）
 *  - 算法：枚举每个"对子"做将，剩余递归拆面子
 *  - 返回：能否胡 + 任意一种拆解方案
 */
export function canHuStandard(tiles: Tile[]): {
    canWin: boolean;
    pattern: WinPattern | null;
} {
    const patterns = findAllWinPatterns(tiles);
    return { canWin: patterns.length > 0, pattern: patterns[0] ?? null };
}
// ============================================================
// 5. 枚举所有合法拆解方案（PatternRecognizer 用）
// ============================================================
/**
 * 找到所有合法的"4 面子 + 1 将"拆解方案
 *  - 用于 PatternRecognizer 反推"胡的牌"在哪个组里
 *  - 复杂度：14 张最坏约 50 种方案，可接受
 *
 * @param tiles 14 张牌
 */
export function findAllWinPatterns(tiles: Tile[]): WinPattern[] {
    if (tiles.length < 2 || tiles.length > 14 || tiles.length % 3 !== 2)
        return [];
    const counts = countByType(tiles);
    if (Array.from(counts.values()).some(c => c > 4))
        return [];
    const order = Array.from(counts.keys()).sort(sortKeyCompare);
    const shapes: {
        pair: string;
        melds: string[][];
    }[] = [];
    const groups: string[][] = [];
    const search = (pair: string): void => {
        const first = order.find(k => (counts.get(k) ?? 0) > 0);
        if (!first) {
            shapes.push({ pair, melds: groups.map(g => g.slice()) });
            return;
        }
        const { suit, rank } = parseKey(first);
        const choices = [[first, first, first]];
        if (isNumeralSuit(suit) && rank <= 7)
            choices.push([first, `${suit}:${rank + 1}`, `${suit}:${rank + 2}`]);
        for (const group of choices) {
            const needed = new Map<string, number>();
            group.forEach(k => needed.set(k, (needed.get(k) ?? 0) + 1));
            if (Array.from(needed).some(([k, c]) => (counts.get(k) ?? 0) < c))
                continue;
            needed.forEach((c, k) => counts.set(k, counts.get(k)! - c));
            groups.push(group);
            search(pair);
            groups.pop();
            needed.forEach((c, k) => counts.set(k, counts.get(k)! + c));
        }
    };
    for (const key of order) {
        const c = counts.get(key)!;
        if (c < 2)
            continue;
        counts.set(key, c - 2);
        search(key);
        counts.set(key, c);
    }
    const patterns: WinPattern[] = [];
    for (const shape of shapes) {
        const pools = new Map<string, Tile[]>();
        tiles.forEach(t => { const k = tileKey(t); pools.set(k, [...(pools.get(k) ?? []), t]); });
        const take = (keys: string[]) => keys.map(k => pools.get(k)!.shift()!);
        const pattern = { pair: take([shape.pair, shape.pair]), melds: shape.melds.map(take) };
        patterns.push(pattern);
        // Swap identical copies so callers can classify a specific winning tile.
        for (const tile of tiles) {
            const locations = [pattern.pair, ...pattern.melds];
            const origin = locations.find(g => g.some(t => t.id === tile.id))!;
            for (let i = 0; i < locations.length; i++) {
                if (locations[i] === origin)
                    continue;
                const j = locations[i].findIndex(t => tileKey(t) === tileKey(tile));
                if (j < 0)
                    continue;
                const copy = locations.map(g => g.slice()), oi = locations.indexOf(origin), oj = origin.findIndex(t => t.id === tile.id);
                [copy[oi][oj], copy[i][j]] = [copy[i][j], copy[oi][oj]];
                patterns.push({ pair: copy[0], melds: copy.slice(1) });
            }
        }
    }
    return patterns;
}
// ============================================================
// 6. 七小对判定
// ============================================================
/**
 * 七小对判定
 *  - 输入：14 张牌
 *  - 规则：正好 7 对子（每对同种 2 张）
 *  - 每组四张同种占两个对子；1 / 2 / 3 组分别为豪华 / 双豪 / 三豪七对
 */
export function checkQiXiaoDui(tiles: Tile[]): {
    isQi: boolean;
    isHaoHua: boolean;
    gangGroups: number;
} {
    if (tiles.length !== 14) {
        return { isQi: false, isHaoHua: false, gangGroups: 0 };
    }
    const counts = countByType(tiles);
    let pairsCount = 0; // 折算后的对子数（4 张算 2 对）
    let gangGroups = 0; // 4 张组数
    for (const [, c] of counts) {
        if (c === 2) {
            pairsCount++;
        }
        else if (c === 4) {
            pairsCount += 2;
            gangGroups++;
        }
        else {
            // 出现 1 张或 3 张的 → 不是七小对
            return { isQi: false, isHaoHua: false, gangGroups: 0 };
        }
    }
    const isQi = pairsCount === 7;
    return {
        isQi,
        isHaoHua: isQi && gangGroups >= 1,
        gangGroups,
    };
}
// ============================================================
// 7. 主入口：综合胡牌判定
// ============================================================
/**
 * 胡牌综合判定
 *  - 同时检查普通胡和七小对
 *  - 同时满足时优先返回"七小对"（倍数更高）
 *
 * @param tiles 14 张牌（手牌 + 胡的那张）
 * @param allowQiXiaoDui 房间是否开启七小对
 */
export function checkWin(tiles: Tile[], allowQiXiaoDui: boolean = true, melds: Meld[] = []): WinCheckResult {
    const allTiles = [...tiles, ...melds.flatMap(m => m.tiles)];
    if (melds.length > 4 || tiles.length !== 14 - 3 * melds.length
        || Array.from(countByType(allTiles).values()).some(c => c > 4)) {
        return { canWin: false, winType: WinTypeResolved.None, pattern: null, qiInfo: null };
    }
    // 1. 七小对优先
    if (allowQiXiaoDui && melds.length === 0) {
        const qi = checkQiXiaoDui(tiles);
        if (qi.isQi) {
            return {
                canWin: true,
                winType: qi.isHaoHua
                    ? WinTypeResolved.HaoHuaQiXiaoDui
                    : WinTypeResolved.QiXiaoDui,
                pattern: null,
                qiInfo: { isHaoHua: qi.isHaoHua, gangGroups: qi.gangGroups },
            };
        }
    }
    // 2. 普通胡
    const std = canHuStandard(tiles);
    if (std.canWin) {
        return {
            canWin: true,
            winType: WinTypeResolved.Standard,
            pattern: std.pattern,
            qiInfo: null,
        };
    }
    // 3. 不胡
    return {
        canWin: false,
        winType: WinTypeResolved.None,
        pattern: null,
        qiInfo: null,
    };
}
/**
 * 便利方法：只问"是否能胡"
 */
export function canWin(tiles: Tile[], allowQiXiaoDui: boolean = true): boolean {
    return checkWin(tiles, allowQiXiaoDui).canWin;
}
