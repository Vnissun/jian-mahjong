/** Ji'an tactics. Opponent hands, locked waits and the wall are never inspected. */
import { Player, Meld, createDefaultPlayerState, readRiichiShapes } from '../core/Player';
import { Tile, isSameType, isYaojiu, isHonor, isNumeral } from '../core/Tile';
import { MeldType, RiichiType, Suit } from '../core/Types';
import { RoomConfig } from '../core/Room';
import { DEFAULT_ROOM_CONFIG } from '../config/GameConfig';
import { getGangBaseScore } from '../config/GangConfig';
import { ALL_TILES } from '../data/TileCatalog';
import { analyzeListening, RiichiChoice } from './RiichiManager';
import { countByType, tileKey } from './HandUtils';
import { handDistance } from './AIHand';
import { evaluatePlayerWin } from './PlayerWin';
import { isMeldPublic } from './TileVisibility';
import { canRiichiGang } from './RiichiGang';
import { getConcealedGangChoices, getSupplementGangChoices, ConcealedGangChoice, SupplementGangChoice } from './ConcealedGang';
import { computeWinMultiplier, applyCap, getRiichiMultiplier, WinMode } from './SettlementEngine';
const TILE_TYPES = ALL_TILES.filter((t, i, all) => all.findIndex(s => isSameType(s, t)) === i);

export interface AIContext { players: Player[]; config?: RoomConfig; remainingTiles?: number; }
export interface AIView { self: Player; opponents: Player[]; config: RoomConfig; visible: Map<string, number>; remainingTiles: number; }
export interface AIClaimDecision { action: 'peng' | 'mingGang' | 'pass'; }
export interface AIAnGangDecision { ok: boolean; tile?: Tile; }
export interface AIJiaGangDecision { ok: boolean; tile?: Tile; }
export interface AIDiscardPlan { tile: Tile; riichiKey?: string; score: number; distance: number; live: number; value: number; }

/** Construct public fields individually, without spreading private opponent state. */
export function buildAIView(player: Player, context?: AIContext): AIView {
    const opponents: Player[] = (context?.players ?? []).filter(p => p.id !== player.id).map(p => ({
        id: p.id, name: p.name, seat: p.seat, score: p.score, hand: [], discards: p.discards.slice(),
        melds: p.melds.map(m => ({ type: m.type, openedTileIndex: m.openedTileIndex,
            specialGang: m.specialGang, tiles: isMeldPublic(m) ? m.tiles.slice() : [] })),
        state: { ...createDefaultPlayerState(), isDealer: p.state.isDealer,
            riichi: p.state.riichi, riichiShapes: readRiichiShapes(p),
            isStanding: p.state.isStanding, isOpen: p.state.isOpen,
            isWon: p.state.isWon, isDrawn: p.state.isDrawn },
    }));
    const ids = new Set<number>(), visible = new Map<string, number>();
    const add = (t: Tile) => { if (ids.has(t.id)) return; ids.add(t.id);
        const k = tileKey(t); visible.set(k, (visible.get(k) ?? 0) + 1); };
    player.hand.forEach(add);
    for (const p of [player, ...opponents]) { p.discards.forEach(add); p.melds.forEach(m => m.tiles.forEach(add)); }
    return { self: player, opponents, visible, config: context?.config ?? DEFAULT_ROOM_CONFIG,
        remainingTiles: context?.remainingTiles ?? 60 };
}
function unseen(view: AIView, tile: Tile): number { return Math.max(0, 4 - (view.visible.get(tileKey(tile)) ?? 0)); }
function focusSuit(p: Player): { suit?: Suit; groups: number } {
    const counts = new Map<Suit, number>();
    for (const m of p.melds) {
        const n = m.tiles.filter(isNumeral);
        if (n.length && n.every(t => t.suit === n[0].suit)) counts.set(n[0].suit, (counts.get(n[0].suit) ?? 0) + 1);
    }
    if (counts.size !== 1) return { groups: 0 };
    const [suit, groups] = Array.from(counts.entries())[0]; return { suit, groups };
}
/** Point exposure estimate. A previously discarded tile is not guaranteed safe. */
export function discardDanger(tile: Tile, view: AIView): number {
    let danger = 0;
    for (const p of view.opponents) {
        if (p.state.isWon || p.state.isDrawn) continue;
        const reported = p.state.riichi !== RiichiType.None, shapes = p.state.riichiShapes;
        const jue = p.state.riichi === RiichiType.Jue || shapes.includes('jue');
        if (jue) {
            if (!isNumeral(tile) || (tile.rank !== 3 && tile.rank !== 7)) continue;
            if ((tile.rank === 3 ? [1, 2] : [8, 9]).some(rank => unseen(view, { ...tile, rank }) === 0)) continue;
        } else if (reported && shapes.length && !shapes.some(shape => {
            if (shape === 'danDiao') return unseen(view, tile) >= 1;
            if (shape === 'duiDao') return unseen(view, tile) >= 2;
            if (shape === 'jiaHu') return isNumeral(tile) && tile.rank > 1 && tile.rank < 9
                && unseen(view, { ...tile, rank: tile.rank - 1 }) > 0 && unseen(view, { ...tile, rank: tile.rank + 1 }) > 0;
            return true;
        })) continue;
        if (isHonor(tile) && unseen(view, tile) === 0) continue;
        const focus = focusSuit(p), matching = focus.groups >= 2 && (tile.suit === focus.suit || isHonor(tile));
        const ready = reported ? 1 : Math.min(.75, .04 + p.melds.length * .13 + p.discards.length * .006);
        let probability = jue ? .30 : isHonor(tile) ? .075 : .095;
        if (matching) probability *= isHonor(tile) ? 1.45 : 2.2;
        if (!reported && p.discards.some(t => isSameType(t, tile))) probability *= .7;
        let loss = 2 * (p.state.isStanding ? 2 : 1) * (view.self.state.isStanding ? 2 : 1)
            * (p.state.isDealer || view.self.state.isDealer ? 2 : 1);
        loss *= view.config.riichiDuel ? getRiichiMultiplier(p) * getRiichiMultiplier(view.self)
            : Math.max(getRiichiMultiplier(p), getRiichiMultiplier(view.self));
        if (matching) loss *= 4;
        danger += Math.min(.7, probability) * ready * applyCap(loss, view.config.cap);
    }
    return danger;
}
interface HandQuality { distance: number; live: number; value: number; choice?: RiichiChoice; attack: number; }
function waitValue(player: Player, tile: Tile, view: AIView, allowQi: boolean, choice?: RiichiChoice): number {
    const winner = { ...player, state: { ...player.state,
        riichi: choice ? (choice.shape === 'jue' ? RiichiType.Jue : RiichiType.Normal) : RiichiType.None } };
    const result = evaluatePlayerWin(player, { ...tile, id: -1 }, allowQi, false);
    const payers = view.opponents.length ? view.opponents : [{ ...player, id: 'ai-estimated-payer', state: createDefaultPlayerState() }];
    let sum = 0;
    for (const payer of payers) {
        const { mul } = computeWinMultiplier({ winner, winTiles: result.allTiles, winTile: tile,
            winMode: WinMode.DianPao, firer: payer, allPlayers: [winner, ...payers],
            currentDealer: [winner, ...payers].find(p => p.state.isDealer)?.seat ?? winner.seat,
            isAfterGang: false, isAfterGangSpecial: false, isGangShangKaiHua: false,
            qiInfo: result.qiInfo, roomConfig: view.config }, payer);
        sum += applyCap(mul, view.config.cap);
    }
    return sum / payers.length;
}
function quality(player: Player, allowQi: boolean, view: AIView): HandQuality {
    const distance = Math.max(0, handDistance(player.hand, player.melds.length, allowQi));
    let live = 0, value = 0, choice: RiichiChoice | undefined, best = -Infinity;
    if (distance === 0) {
        const analysis = analyzeListening(player, allowQi);
        for (const c of [undefined, ...(analysis.declarationChoices ?? [])]) {
            let n = 0, total = 0;
            for (const t of c?.winningTiles ?? analysis.winningTiles) {
                const result = evaluatePlayerWin(player, { ...t, id: -1 }, allowQi, false);
                if (!c && result.qiInfo) continue;
                const left = unseen(view, t); if (!left) continue;
                n += left; total += left * waitValue(player, t, view, allowQi, c);
            }
            if (!n) continue;
            const average = total / n, merit = Math.log2(1 + n) * 5 + Math.log2(1 + average) * 2;
            if (merit > best || (merit === best && c && !choice)) { best = merit; live = n; value = average; choice = c; }
        }
    }
    const all = player.hand.concat(player.melds.flatMap(m => m.tiles)), counts = countByType(all);
    const suits = new Set(all.filter(isNumeral).map(t => t.suit));
    const pairs = allowQi && !player.melds.length && Array.from(counts.values()).filter(n => n >= 2).length >= 5;
    let penalty = !all.some(isYaojiu) ? 6 : 0;
    if (suits.size === 2) penalty += 8;
    if (!pairs && !player.melds.some(m => m.type !== MeldType.Chi)
        && !Array.from(counts.entries()).some(([k, n]) => n >= 3 || (k.startsWith('yuan:') && n >= 2))) penalty += 4;
    const effective = distance === 0 && !live ? 1 : distance;
    return { distance: effective, live, value, choice, attack: -effective * 15 - penalty + (live ? 12 + best : 0) };
}
function reserveValue(player: Player, view: AIView): number {
    const counts = countByType(player.hand); let bonus = 0;
    for (const [key, count] of counts) {
        const tile = player.hand.find(t => tileKey(t) === key)!, left = unseen(view, tile);
        if (count >= 2 && left) bonus += getGangBaseScore(tile) * (count === 3 ? 1.5 : .25);
        if (count === 4) bonus += getGangBaseScore(tile) * 2;
        if (count === 1 && isNumeral(tile)) for (const d of [-1, 1])
            if (tile.rank + d >= 1 && tile.rank + d <= 9 && counts.has(tile.suit + ':' + (tile.rank + d))) bonus += .12;
    }
    const winds = [1, 2, 3, 4].filter(rank => counts.has('feng:' + rank));
    if (winds.length === 3) {
        const missing = [1, 2, 3, 4].find(rank => !winds.includes(rank))!;
        if (unseen(view, { ...player.hand.find(t => t.suit === Suit.Feng)!, rank: missing }) > 0) bonus += 5;
    }
    const dragons = [1, 2, 3].filter(rank => counts.has('yuan:' + rank));
    if (dragons.length >= 2 && player.hand.filter(t => t.suit === Suit.Yuan).length >= 3) {
        const sample = player.hand.find(t => t.suit === Suit.Yuan)!;
        if ([1, 2, 3].filter(rank => !dragons.includes(rank)).every(rank => unseen(view, { ...sample, rank }) > 0)) bonus += 3;
    }
    for (const t of player.hand) if (player.melds.some(m => m.specialGang === (t.suit === Suit.Feng ? 'winds' : t.suit === Suit.Yuan ? 'dragons' : 'none'))) bonus += 2;
    return bonus;
}
export function planDiscard(player: Player, allowQi: boolean, drawnTile?: Tile, context?: AIContext): AIDiscardPlan {
    if (!player.hand.length) throw new Error('AI 出牌时手牌为空');
    if (player.state.riichi !== RiichiType.None && drawnTile) return { tile: drawnTile, score: 0, distance: 0, live: 0, value: 0 };
    const view = buildAIView(player, context), seen = new Set<string>(), plans: AIDiscardPlan[] = [];
    for (const tile of player.hand) {
        if (seen.has(tileKey(tile))) continue; seen.add(tileKey(tile));
        const after = { ...player, hand: player.hand.filter(t => t.id !== tile.id) }, q = quality(after, allowQi, view);
        const self = q.choice ? { ...player, state: { ...player.state, riichi: q.choice.shape === 'jue' ? RiichiType.Jue : RiichiType.Normal } } : player;
        const danger = discardDanger(tile, { ...view, self });
        const defend = view.opponents.some(p => p.state.riichi === RiichiType.Jue);
        const weight = q.live >= 3 && q.value >= 24 ? .8 : defend && q.value < 24 ? 3.6 : 2.2;
        const score = q.attack + reserveValue(after, view) * (defend ? .45 : 1)
            - danger * weight * (view.remainingTiles < 20 ? 1.2 : 1);
        plans.push({ tile, riichiKey: q.choice?.key, score, distance: q.distance, live: q.live, value: q.value });
    }
    plans.sort((a, b) => b.score - a.score);
    // One-draw lookahead on the leading alternatives, weighted by unseen copies.
    // No actual draw order or wall contents are consulted.
    for (const plan of plans.slice(0, 3)) {
        if (plan.live) continue;
        const hand = player.hand.filter(t => t.id !== plan.tile.id);
        const before = handDistance(hand, player.melds.length, allowQi);
        let improving = 0;
        for (const sample of TILE_TYPES) {
            const left = unseen(view, sample);
            if (left && handDistance(hand.concat({ ...sample, id: -1 }), player.melds.length, allowQi) < before) improving += left;
        }
        plan.score += Math.log2(1 + improving);
    }
    return plans.sort((a, b) => b.score - a.score)[0];
}
export function pickDiscard(player: Player, allowQi: boolean, drawnTile?: Tile, context?: AIContext): Tile { return planDiscard(player, allowQi, drawnTile, context).tile; }
export function chooseRiichi(player: Player, allowQi: boolean, context?: AIContext): RiichiChoice | undefined { return quality(player, allowQi, buildAIView(player, context)).choice; }
export function decideRiichi(player: Player, allowQi: boolean): boolean { return player.state.riichi === RiichiType.None && !!chooseRiichi(player, allowQi); }
export function shouldWin(player: Player, tile: Tile, allowQi: boolean): boolean { return evaluatePlayerWin(player, tile, allowQi).ok; }

function afterMeld(player: Player, removed: Tile[], meld: Meld, replace = -1): Player {
    const melds = player.melds.slice(); if (replace >= 0) melds[replace] = meld; else melds.push(meld);
    const open = meld.type === MeldType.Chi || meld.type === MeldType.Peng
        || ((meld.type === MeldType.MingGang || meld.type === MeldType.JiaGang) && isNumeral(meld.tiles[0]));
    return { ...player, hand: player.hand.filter(t => !removed.some(r => r.id === t.id)), melds,
        state: { ...player.state, isStanding: player.state.isStanding && !open, isOpen: player.state.isOpen || open } };
}
function acceptGang(player: Player, after: Player, allowQi: boolean, gain: number, context?: AIContext): boolean {
    if (player.state.riichi !== RiichiType.None) return true;
    const view = buildAIView(player, context), before = player.hand.length % 3 === 2 ? planDiscard(player, allowQi, undefined, context) : quality(player, allowQi, view);
    const result = quality(after, allowQi, view);
    if (before.live && (!result.live || result.distance > before.distance)) return false;
    return result.distance <= before.distance + (gain >= 8 && before.distance >= 2 ? 1 : 0);
}
export function chooseConcealedGang(player: Player, allowQi: boolean, context?: AIContext): ConcealedGangChoice | undefined {
    return getConcealedGangChoices(player).slice().sort((a, b) => (b.specialGang ? 4 : getGangBaseScore(b.tiles[0]) * 2)
        - (a.specialGang ? 4 : getGangBaseScore(a.tiles[0]) * 2)).find(c => {
        const meld: Meld = { type: MeldType.AnGang, tiles: c.tiles, openedTileIndex: -1, specialGang: c.specialGang };
        return acceptGang(player, afterMeld(player, c.tiles, meld), allowQi, (c.specialGang ? 4 : getGangBaseScore(c.tiles[0]) * 2) * (player.state.isDealer ? 6 : 4), context);
    });
}
export function decideAnGang(player: Player, allowQi: boolean): AIAnGangDecision {
    const c = chooseConcealedGang(player, allowQi); return c && !c.specialGang ? { ok: true, tile: c.tiles[0] } : { ok: false };
}
export function chooseSupplement(player: Player, allowQi: boolean, context?: AIContext): SupplementGangChoice | undefined {
    return getSupplementGangChoices(player).find(c => {
        const meld = player.melds[c.meldIndex];
        return acceptGang(player, afterMeld(player, [c.tile], { ...meld, tiles: meld.tiles.concat(c.tile) }, c.meldIndex), allowQi, 4, context);
    });
}
export function decideJiaGang(player: Player, players: Player[], allowQi: boolean, context?: AIContext): AIJiaGangDecision {
    const view = buildAIView(player, context ?? { players });
    for (const [index, m] of player.melds.entries()) {
        if (m.type !== MeldType.Peng) continue;
        const tile = player.hand.find(t => isSameType(t, m.tiles[0])); if (!tile) continue;
        const meld = { ...m, type: MeldType.JiaGang, tiles: m.tiles.concat(tile) };
        if (!canRiichiGang(player, [tile], meld, 'jia', index)) continue;
        const gain = getGangBaseScore(tile) * (player.state.isDealer ? 6 : 4);
        if (discardDanger(tile, view) * 2.5 > gain) continue;
        if (acceptGang(player, afterMeld(player, [tile], meld, index), allowQi, gain, context)) return { ok: true, tile };
    }
    return { ok: false };
}
export function decideClaimPengGang(player: Player, tile: Tile, allowQi: boolean, context?: AIContext): AIClaimDecision {
    const same = player.hand.filter(t => isSameType(t, tile)), view = buildAIView(player, context);
    if (same.length >= 3) {
        const meld = { type: MeldType.MingGang, tiles: same.slice(0, 3).concat(tile), openedTileIndex: 3 };
        const gain = getGangBaseScore(tile) * (player.state.isDealer ? 6 : 4);
        if (canRiichiGang(player, same.slice(0, 3), meld, 'ming') && acceptGang(player, afterMeld(player, same.slice(0, 3), meld), allowQi, gain, context)) return { action: 'mingGang' };
    }
    if (same.length < 2 || player.state.riichi !== RiichiType.None) return { action: 'pass' };
    const before = quality(player, allowQi, view), removed = same.slice(0, 2);
    const after = afterMeld(player, removed, { type: MeldType.Peng, tiles: removed.concat(tile), openedTileIndex: 2 });
    const plan = planDiscard(after, allowQi, undefined, context);
    if (before.live && (!plan.live || plan.value < before.value)) return { action: 'pass' };
    const danger = discardDanger(plan.tile, buildAIView(after, context));
    if (danger > 4 && plan.value < 24) return { action: 'pass' };
    if (plan.distance < before.distance || (plan.live > before.live && plan.value >= before.value)) return { action: 'peng' };
    if (!before.live && getGangBaseScore(tile) >= 2 && unseen(view, tile) > 0 && plan.distance <= before.distance && danger < 2) return { action: 'peng' };
    return { action: 'pass' };
}
export function chooseChi(player: Player, tile: Tile, choices: Tile[][], allowQi: boolean, context?: AIContext): Tile[] | undefined {
    if (player.state.riichi !== RiichiType.None) return undefined;
    const before = quality(player, allowQi, buildAIView(player, context)); let best: { tiles: Tile[]; plan: AIDiscardPlan } | undefined;
    for (const selected of choices) {
        const after = afterMeld(player, selected, { type: MeldType.Chi, tiles: selected.concat(tile), openedTileIndex: 2 });
        const plan = planDiscard(after, allowQi, undefined, context);
        if (before.live && (!plan.live || plan.value < before.value)) continue;
        if (discardDanger(plan.tile, buildAIView(after, context)) > 4 && plan.value < 24) continue;
        if (plan.distance >= before.distance && !(plan.live > before.live && plan.value >= before.value)) continue;
        if (!best || plan.score > best.plan.score) best = { tiles: selected, plan };
    }
    return best?.tiles;
}
