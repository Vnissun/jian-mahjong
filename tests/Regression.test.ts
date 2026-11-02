import { describe, it, assertTrue, assertFalse, assertEqual } from './runner';
import { createTile, Tile } from '../assets/scripts/core/Tile';
import { createPlayer, Player } from '../assets/scripts/core/Player';
import { createRoom } from '../assets/scripts/core/Room';
import { SeatWind, Suit, MeldType, RiichiType } from '../assets/scripts/core/Types';
import { DEFAULT_ROOM_CONFIG } from '../assets/scripts/config/GameConfig';
import { GameSession, SessionEvents, SessionPhase } from '../assets/scripts/game/GameSession';
import { shouldWin } from '../assets/scripts/game/AIBot';
import { evaluatePlayerWin } from '../assets/scripts/game/PlayerWin';
import { analyzeListening } from '../assets/scripts/game/RiichiManager';
import { findAllWinPatterns } from '../assets/scripts/game/WinChecker';
import { WinMode } from '../assets/scripts/game/SettlementEngine';
let id = 1000;
const tile = (suit: Suit, rank: number) => createTile(id++, suit, rank);
const w = (r: number) => tile(Suit.Wan, r), t = (r: number) => tile(Suit.Tong, r), s = (r: number) => tile(Suit.Tiao, r), y = () => tile(Suit.Yuan, 1);
function winningHand(): Tile[] { return [w(1), w(1), w(1), w(2), w(3), w(4), t(1), t(2), t(3), s(1), s(2), s(3), y(), y()]; }
function session(ai: SeatWind[] = [], events: SessionEvents = {}): GameSession {
    const players = [SeatWind.East, SeatWind.South, SeatWind.West, SeatWind.North].map((seat, i) => createPlayer('p' + i, '玩家' + i, seat));
    const room = createRoom('test', 'p0', { ...DEFAULT_ROOM_CONFIG }, players);
    const result = new GameSession(room, players, ai, events);
    result.startRound();
    return result;
}
function idlePlayers(game: GameSession): void { for (const p of game.players) {
    p.hand = [];
    p.melds = [];
    p.discards = [];
} }
describe('回归：自摸、副露与牌型', () => {
    it('14 张手牌能自摸，不重复加入摸到的牌', () => {
        const p = createPlayer('p', '玩家', SeatWind.East);
        p.hand = winningHand();
        assertTrue(shouldWin(p, p.hand[13], true));
        assertEqual(evaluatePlayerWin(p, p.hand[13], true).concealed.length, 14);
    });
    it('真人自摸按钮完成结算', () => {
        let mode: WinMode | undefined;
        const game = session([], { onWin: (_p, _t, _r, m) => mode = m });
        const p = game.players[0];
        p.hand = winningHand();
        game.lastDrawn = p.hand[13];
        assertTrue(game.computeHumanOptions(p, game.lastDrawn).canWin);
        assertTrue(game.playerSelfWin(p, game.lastDrawn));
        assertEqual(mode, WinMode.SelfDraw);
        assertEqual(game.players.reduce((n, p) => n + p.score, 0), 0, '结算分数守恒');
    });
    for (const kind of [MeldType.Peng, MeldType.AnGang])
        it(kind + ' 后 11 张暗手可以胡，副露参与门槛', () => {
            const p = createPlayer('p', '玩家', SeatWind.East);
            const full = winningHand();
            const group = full.splice(0, 3);
            if (kind === MeldType.AnGang)
                group.push(w(1));
            p.melds = [{ type: kind, tiles: group, openedTileIndex: kind === MeldType.Peng ? 2 : -1 }];
            p.hand = full;
            assertTrue(evaluatePlayerWin(p, full[10], true).ok);
            assertEqual(p.hand.length, 11);
        });
    it('分解中的每张物理牌只使用一次，特定胡牌可放在所有合法位置', () => {
        const hand = [w(1), w(1), w(1), w(2), w(2), w(2), w(3), w(3), w(3), w(4), w(5), w(6), w(7), w(7)];
        const patterns = findAllWinPatterns(hand);
        assertTrue(patterns.length > 0);
        for (const p of patterns)
            assertEqual(new Set([...p.pair, ...p.melds.flat()].map(t => t.id)).size, 14);
    });
    it('听牌枚举不允许第五张同种牌', () => {
        const p = createPlayer('p', '玩家', SeatWind.East);
        p.hand = [w(1), w(1), w(1), w(1), w(2), w(3), w(4), w(5), w(6), w(7), w(7), w(8), w(9)];
        assertFalse(analyzeListening(p, true).winningTiles.some(t => t.suit === Suit.Wan && t.rank === 1));
    });
    it('三个同种牌分属顺子时不算刻子', () => {
        const p = createPlayer('p', '玩家', SeatWind.East);
        p.hand = [w(1), w(2), w(3), w(2), w(3), w(4), w(3), w(4), w(5), w(6), w(7), w(8), w(9), w(9)];
        assertFalse(evaluatePlayerWin(p, p.hand[13], false).ok);
    });
});
describe('回归：行动与响应顺序', () => {
    it('无效出牌不会清掉等待状态，可以重试', () => {
        const game = session(), p = game.players[0];
        assertFalse(game.playerDiscard(p, w(9)));
        assertTrue(game.playerDiscard(p, p.hand[0]));
    });
    it('报听先选合法弃牌；以后只能打本次摸牌', () => {
        const game = session(), p = game.players[0];
        p.hand = winningHand();
        p.hand[13] = w(9);
        game.lastDrawn = p.hand[13];
        const discard = game.getRiichiDiscards(p).find(t => t.rank === 9)!;
        assertTrue(!!discard);
        assertTrue(game.playerDeclareRiichi(p, discard));
        assertTrue(p.state.riichi !== RiichiType.None);
        assertTrue(p.state.riichiShapes.length > 0, '真实玩家保存公开听法，不能只写模拟玩家');
        game.phase = SessionPhase.PlayerTurn;
        (game as any).waitingHumanTurn = p;
        const drawn = w(8);
        p.hand.push(drawn);
        game.lastDrawn = drawn;
        assertFalse(game.playerDiscard(p, p.hand[0]));
        assertTrue(game.playerDiscard(p, drawn));
    });
    it('后面的胡牌优先于下家的碰', () => {
        let winner: Player | undefined;
        const game = session([SeatWind.South, SeatWind.West], { scheduleAI: () => { }, onWin: p => winner = p });
        idlePlayers(game);
        const [east, south, west] = game.players, discard = w(1);
        east.hand = [discard];
        south.hand = [w(1), w(1)];
        west.hand = winningHand().slice(1);
        assertTrue(game.playerDiscard(east, discard));
        assertEqual(winner?.id, west.id);
        assertEqual(south.melds.length, 0, '碰不能截断胡牌');
        assertFalse(east.discards.some(t => t.id === discard.id));
    });
    it('AI 碰后无摸牌也会出牌，不会判荒庄', () => {
        const tasks: (() => void)[] = [];
        let drawn = false;
        let aiDiscard = false;
        const game = session([SeatWind.South], { scheduleAI: fn => tasks.push(fn), onDrawn: () => drawn = true, onDiscard: p => { if (p.seat === SeatWind.South)
                aiDiscard = true; } });
        idlePlayers(game);
        const [east, south] = game.players;
        const discard = w(1);
        east.hand = [discard];
        south.hand = [w(1), w(1), w(2), w(3), w(4), t(1), t(2), t(3), s(1), s(2), s(4), y(), y()];
        assertTrue(game.playerDiscard(east, discard));
        assertEqual(south.melds.length, 1);
        tasks.shift()!();
        assertTrue(aiDiscard);
        assertFalse(drawn);
    });
    it('真人可以选择抢杠胡，三家分别支付且不结算杠分', () => {
        let mode: WinMode | undefined, gangs = 0;
        const game = session([], { onWin: (_p, _t, _r, m) => mode = m, onGangSettlement: () => gangs++ });
        idlePlayers(game);
        const [east, south] = game.players;
        const target = w(1);
        east.hand = [target];
        east.melds = [{ type: MeldType.Peng, tiles: [w(1), w(1), w(1)], openedTileIndex: 2 }];
        // South needs one 1-wan to complete a sequence, not a fifth copy of a triplet.
        south.hand = [w(2), w(3), t(1), t(2), t(3), s(1), s(2), s(3), y(), y(), y(), t(9), t(9)];
        assertTrue(game.playerJiaGang(east, target));
        assertEqual(mode, undefined, '先等待真人选择');
        assertTrue(game.playerClaimWin(south));
        assertEqual(mode, WinMode.RobbingGang);
        assertEqual(gangs, 0);
        assertEqual(east.melds[0].type, MeldType.Peng);
        assertEqual(east.hand.length, 0);
        assertTrue(game.players[2].score < 0);
        assertTrue(game.players[3].score < 0);
        assertTrue(east.score < 0);
        assertEqual(game.players.reduce((n,p)=>n+p.score,0),0);
    });
    it('真人放弃抢杠后继续补牌，不能重复执行旧回合', () => {
        const game = session();
        idlePlayers(game);
        const [east, south] = game.players;
        const target = w(1);
        east.hand = [target];
        east.melds = [{ type: MeldType.Peng, tiles: [w(1), w(1), w(1)], openedTileIndex: 2 }];
        south.hand = [w(2), w(3), t(1), t(2), t(3), s(1), s(2), s(3), y(), y(), y(), t(9), t(9)];
        assertTrue(game.playerJiaGang(east, target));
        assertTrue(game.playerPass(south));
        assertEqual(east.melds[0].type, MeldType.JiaGang);
        assertEqual(game.phase, SessionPhase.PlayerTurn);
    });
    it('停止后已排队的 AI 不再行动', () => {
        const tasks: (() => void)[] = [];
        let discards = 0;
        const game = session([SeatWind.East], { scheduleAI: fn => tasks.push(fn), onDiscard: () => discards++ });
        game.stop();
        tasks.forEach(fn => fn());
        assertEqual(discards, 0);
        assertEqual(game.phase, SessionPhase.Finished);
    });
});
describe('回归：确定种子完整对局', () => {
    it('100 局全 AI：合法胡牌、136 张牌守恒、积分守恒，含碰杠及连庄', () => {
        const original = Math.random;
        let seed = 20261015, wins = 0, draws = 0, pengs = 0, gangs = 0;
        Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        const tasks: (() => void)[] = [];
        let game: GameSession;
        const verify = () => {
            const tiles = [...game.wall.drawStack.slice(game.wall.drawIndex), ...game.wall.kongStack.slice(0, game.wall.kongStack.length - game.wall.kongIndex),
                ...game.players.flatMap(p => [...p.hand, ...p.discards, ...p.melds.flatMap(m => m.tiles)])];
            assertEqual(tiles.length, 136);
            assertEqual(new Set(tiles.map(t => t.id)).size, 136);
            assertEqual(game.players.reduce((n, p) => n + p.score, 0), 0);
        };
        try {
            const players = [SeatWind.East, SeatWind.South, SeatWind.West, SeatWind.North].map((seat, i) => createPlayer('p' + i, 'AI' + i, seat));
            game = new GameSession(createRoom('stress', 'p0', { ...DEFAULT_ROOM_CONFIG, totalRoundWinds: 100 }, players), players, [SeatWind.East, SeatWind.South, SeatWind.West, SeatWind.North], {
                scheduleAI: fn => tasks.push(fn), onDiscard: verify, onPeng: () => { pengs++; verify(); }, onAnGang: () => { gangs++; verify(); },
                onMingGang: () => { gangs++; verify(); }, onJiaGang: () => { gangs++; verify(); }, onWin: () => { wins++; verify(); }, onDrawn: () => { draws++; verify(); }
            });
            for (let round = 0; round < 100; round++) {
                game.startRound();
                verify();
                let actions = 0;
                while (tasks.length) {
                    tasks.shift()!();
                    assertTrue(++actions < 500, '一局不能无限循环');
                }
                assertEqual(game.phase, SessionPhase.Settled);
            }
            assertEqual(wins + draws, 100);
            assertTrue(wins > 0);
            assertTrue(pengs > 0);
            assertTrue(gangs > 0);
        }
        finally {
            Math.random = original;
        }
    });
});
