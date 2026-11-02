import { canRiichiGang } from './RiichiGang';
import { evaluatePlayerWin } from './PlayerWin';
import { chi, getChiOptions } from './ChiHandler';
import { concealedGang, getConcealedGangChoices, getSupplementGangChoices, supplementGang } from './ConcealedGang';
/**
 * GameSession.ts - 单机对局流程控制器
 * ------------------------------------------------------------
 * 把"牌墙 / 玩家 / AI 决策 / 结算"串成一个完整的对局流程。
 * 纯逻辑类，不依赖 Cocos。UI 层通过 SessionEvents 回调驱动渲染。
 *
 * 职责：
 *   1. 开局洗牌发牌（setupNewRound）
 *   2. 轮流摸打出牌（East→South→West→North 顺时针）
 *   3. 处理碰/明杠/暗杠/加杠/报听/胡牌/抢杠胡
 *   4. 杠后补牌（长毛区摸牌）
 *   5. 荒庄判定（正常牌墙摸空）
 *   6. 胡牌结算（SettlementEngine）+ 杠分结算（GangSettlement）
 *   7. 庄家轮换（RoundManager）+ 封圈推进
 *
 * 人类玩家操作由外部通过 playerXxx 方法输入；
 * AI 玩家由本类内部调用 AIBot 自动决策。
 *
 * 流程是"事件驱动 + 回调"：每个关键节点 emit 一个事件，
 * UI 层订阅事件后更新画面 / 播动画。
 */
import { Room, RoomConfig } from '../core/Room';
import { Player, Meld, copyRiichiDeclaration, hasLockedRiichiHand } from '../core/Player';
import { Tile, isSameType } from '../core/Tile';
import { SeatWind, MeldType, RiichiType } from '../core/Types';
import { Wall, setupNewRound, drawTile, drawKongTile, getRemainingCount, } from './WallGenerator';
import { sortTiles } from './HandUtils';
import { checkWin, WinTypeResolved } from './WinChecker';
import { checkHandEligibility } from './HandValidator';
import { recognizePattern, PatternResult } from './PatternRecognizer';
import { peng, mingGang, anGang, jiaGang, discard, draw, } from './ActionHandler';
import { analyzeListening, declareRiichi, getRiichiChoices } from './RiichiManager';
import { checkBeforeJiaGang } from './RobbingGangChecker';
import { settleWin, applySettlement, WinContext, WinMode, SettlementResult, } from './SettlementEngine';
import { settleGang, applyGangSettlement, GangContext, GangSettlementMode, GangSettlementResult, getGangMode, } from './GangSettlement';
import { advanceAfterWin, advanceAfterDraw, checkRoomFinished } from './RoundManager';
import { shouldWin, decideClaimPengGang, decideJiaGang, planDiscard, chooseRiichi,
    chooseConcealedGang, chooseSupplement, chooseChi, AIContext } from './AIBot';
// ============================================================
// 1. 事件定义（UI 订阅）
// ============================================================
/** 对局事件回调集合（UI 层实现并注入） */
export interface SessionEvents {
    onBeforeDeal?: (wall: Wall, players: Player[], dealerSeat: SeatWind) => void;
    onBeforeDraw?: (wall: Wall, player: Player, isKongSupplement: boolean) => void;
    scheduleAI?: (action: () => void, player?: Player) => void;
    scheduleClaim?: (action: () => void, player: Player) => void;
    scheduleAutoDiscard?: (action: () => boolean, delayMs: number) => void;
    scheduleSelfWin?: (action: () => boolean, delayMs: number) => void;
    onSelfWinPreview?: (player:Player,tile:Tile,deadline:number) => void;
    /** 开局发牌完成 */
    onDeal?: (wall: Wall, dealerSeat: SeatWind) => void;
    /** 玩家摸牌 */
    onDraw?: (player: Player, tile: Tile, isKongSupplement: boolean) => void;
    /** 玩家出牌 */
    onDiscard?: (player: Player, tile: Tile) => void;
    /** 玩家碰 */
    onPeng?: (player: Player, meld: Meld, fromPlayer: Player) => void;
    onChi?: (player: Player, meld: Meld, fromPlayer: Player) => void;
    /** 玩家明杠 */
    onMingGang?: (player: Player, meld: Meld, fromPlayer: Player) => void;
    /** 玩家暗杠 */
    onAnGang?: (player: Player, meld: Meld) => void;
    onSupplementGang?: (player: Player, meld: Meld, tile: Tile) => void;
    onGangClaim?: (player: Player, tile: Tile, isSupplement: boolean) => void;
    /** 玩家加杠 */
    onJiaGang?: (player: Player, meld: Meld) => void;
    /** 玩家报听 */
    onRiichi?: (player: Player, riichiType: RiichiType) => void;
    /** 胡牌 */
    onWin?: (winner: Player, winTile: Tile, result: SettlementResult, winMode: WinMode) => void;
    /** 局末发布杠分结算；局内不公开分值 */
    onGangSettlement?: (player: Player, result: GangSettlementResult) => void;
    /** 荒庄 */
    onDrawn?: () => void;
    /** 一局结束（可继续下一局或房间结束） */
    onRoundEnd?: (roomFinished: boolean) => void;
    /** 请求人类玩家行动（出牌/报听/暗杠/加杠/胡） */
    onBeforeGangDraw?: (player: Player) => void;
    onHumanTurn?: (player: Player, drawnTile: Tile | null) => void;
    /** 请求人类玩家对别家出牌的响应（碰/明杠/胡/过） */
    onHumanClaim?: (player: Player, discardTile: Tile, fromPlayer: Player, canWin: boolean, canPeng: boolean, canMingGang: boolean, canChi?: boolean) => void;
    /** 轮次变化（当前行动玩家） */
    onTurnChange?: (currentSeat: SeatWind) => void;
}
// ============================================================
// 2. 会话状态
// ============================================================
/** 会话阶段 */
export enum SessionPhase {
    Idle = 'idle',// 未开始
    Dealing = 'dealing',// 发牌中
    PlayerTurn = 'playerTurn',// 玩家行动（摸/打/暗杠/加杠/报听/胡）
    AwaitingClaims = 'awaiting',// 等待他家对出牌的碰杠胡响应
    GangSupplement = 'gangSupplement',// 杠后补牌
    Settled = 'settled',// 本局结算完成
    Finished = 'finished'
}
/** 人类玩家的行动请求选项（UI 按钮显隐依据） */
export interface HumanActionOptions {
    autoDiscard?: boolean; // 报听后由对局计时器自动打出新摸牌
    canDiscard: boolean; // 可出牌
    canAnGang: boolean; // 可暗杠
    canSupplementGang?: boolean;
    canJiaGang: boolean; // 可加杠
    canRiichi: boolean; // 可报听
    canWin: boolean; // 可胡（自摸）
    drawnTile: Tile | null; // 本次摸到的牌
}
// ============================================================
// 3. GameSession 主体
// ============================================================
/**
 * 单机对局会话控制器
 * - 一个 GameSession 对应"一桌多局"
 * - startRound() 开始一局；局结束自动推进庄家
 */
export class GameSession {
    /** 房间 */
    readonly room: Room;
    /** 4 个玩家（按 East/South/West/North） */
    readonly players: Player[];
    /** AI 玩家座位集合（East 默认是人类） */
    readonly aiSeats: Set<SeatWind>;
    /** 事件回调 */
    events: SessionEvents;
    /** 牌墙 */
    wall!: Wall;
    /** 当前阶段 */
    phase: SessionPhase = SessionPhase.Idle;
    /** 当前行动玩家座位 */
    currentSeat: SeatWind = SeatWind.East;
    /** 上一张被打出的牌 */
    lastDiscard: Tile | null = null;
    /** 上一张打出牌的玩家 */
    lastDiscarder: Player | null = null;
    /** 本次刚摸的牌（供报听出牌校验用） */
    lastDrawn: Tile | null = null;
    pendingSelfWin: {playerId:string;tileId:number;deadline:number} | null = null;
    /** 本局是否发生过杠（影响"杠后"倍数） */
    hadGangThisRound = false;
    /** 杠后是否即将进入"杠后自摸/点炮 ×4" */
    isAfterGangSpecial = false;
    /** 杠上开花标记：杠后摸牌即胡 */
    isGangShangKaiHua = false;
    /** Pending exposed addition: ordinary added kong, or a wind/dragon supplement. */
    pendingRobbingGang: {
        gangPlayer: Player;
        gangTile: Tile;
        supplementMeldIndex?: number;
    } | null = null;
    /** 等待人类响应的玩家队列（按座位顺时针，从打出者下家开始） */
    private pendingClaimQueue: Player[] = [];
    private claimStage: 'win' | 'meld' | 'chi' | 'rob' | 'robMeld' = 'win';
    private generation = 0;
    /** Kept private until the hand ends, so concealed-kong values cannot leak. */
    private pendingGangSettlements: GangSettlementResult[] = [];
    /** 当前正在等待的人类玩家 */
    private waitingHumanClaim: Player | null = null;
    private waitingAIClaim: Player | null = null;
    /** 当前正在等待的人类行动玩家 */
    private pendingGangDraw: Player | null = null;
    private waitingHumanTurn: Player | null = null;
    constructor(room: Room, players: Player[], aiSeats: SeatWind[], events: SessionEvents = {}) {
        this.room = room;
        this.players = players;
        this.aiSeats = new Set(aiSeats);
        this.events = events;
    }
    /** 是否为 AI 玩家 */
    isAI(player: Player): boolean {
        return this.aiSeats.has(player.seat);
    }
    /** Switch transport control without changing the player's seat, hand or score. */
    setAutoControl(player: Player, enabled: boolean): void {
        if (enabled === this.isAI(player)) return;
        if (enabled) this.aiSeats.add(player.seat); else this.aiSeats.delete(player.seat);
        if (enabled && this.waitingHumanClaim === player) {
            this.waitingHumanClaim = null;
            this.pendingClaimQueue.unshift(player);
            this.processClaimQueue();
        } else if (!enabled && this.waitingAIClaim === player) {
            this.waitingAIClaim = null;
            this.pendingClaimQueue.unshift(player);
            this.processClaimQueue();
        } else if (this.pendingGangDraw === player && enabled) {
            this.pendingGangDraw = null;
            this.supplementAfterGang(player);
        } else if (this.phase === SessionPhase.PlayerTurn && this.currentSeat === player.seat) {
            this.waitingHumanTurn = null;
            this.beginPlayerTurn(player, this.lastDrawn);
        }
    }
    /** 按 seat 取玩家 */
    getPlayer(seat: SeatWind): Player {
        return this.players.find(p => p.seat === seat)!;
    }
    /** 按 id 取玩家 */
    getPlayerById(id: string): Player | undefined {
        return this.players.find(p => p.id === id);
    }
    /** 房间配置 */
    get config(): RoomConfig {
        return this.room.config;
    }
    /** 是否允许七小对 */
    get allowQi(): boolean {
        return this.room.config.allowQiXiaoDui;
    }
    // ========================================================
    // 4. 开局
    // ========================================================
    /**
     * 开始一局
     *  - 洗牌发牌
     *  - 庄家先行动
     */
    startRound(): void {
        this.pendingSelfWin = null;
        this.pendingGangDraw = null;
        this.waitingAIClaim = null;
        if (this.isFinished())
            return;
        this.generation++;
        // 重置一局状态
        this.pendingGangSettlements = [];
        this.hadGangThisRound = false;
        this.isAfterGangSpecial = false;
        this.isGangShangKaiHua = false;
        this.pendingRobbingGang = null;
        this.lastDiscard = null;
        this.lastDiscarder = null;
        this.lastDrawn = null;
        this.pendingClaimQueue = [];
        this.waitingHumanClaim = null;
        this.waitingHumanTurn = null;
        // 重置玩家局内状态
        for (const p of this.players) {
            p.hand = [];
            p.melds = [];
            p.discards = [];
            p.state.isDealer = (p.seat === this.room.currentDealer);
            p.state.isWon = false;
            p.state.isFired = false;
            p.state.isRobbed = false;
            p.state.isDrawn = false;
            p.state.riichi = RiichiType.None;
            p.state.riichiShapes = [];
            p.state.riichiWaits = [];
            p.state.riichiLockedHandIds = [];
            p.state.riichiMeldSignature = '';
            p.state.isStanding = true;
            p.state.isOpen = false;
        }
        this.phase = SessionPhase.Dealing;
        // 洗牌 + 发牌
        this.wall = setupNewRound(this.players, this.room.currentDealer, undefined,
            wall => this.events.onBeforeDeal?.(wall, this.players, this.room.currentDealer));
        this.events.onDeal?.(this.wall, this.room.currentDealer);
        // 庄家先行动（庄家已 14 张，直接进入出牌阶段）
        this.currentSeat = this.room.currentDealer;
        // 庄家第 14 张视为"摸的牌"
        const dealer = this.getPlayer(this.currentSeat);
        this.lastDrawn = dealer.hand[dealer.hand.length - 1] ?? null;
        this.phase = SessionPhase.PlayerTurn;
        this.events.onTurnChange?.(this.currentSeat);
        this.beginPlayerTurn(dealer, this.lastDrawn);
    }
    // ========================================================
    // 5. 玩家行动入口
    // ========================================================
    /**
     * 进入某玩家行动回合
     * - 人类：emit onHumanTurn，等待 UI 调用 playerXxx
     * - AI：自动决策
     *
     * @param player 当前玩家
     * @param drawnTile 本次摸到的牌（庄家开局时为第 14 张）
     */
    private beginPlayerTurn(player: Player, drawnTile: Tile | null): void {
        // 该玩家已胡 / 荒庄 → 跳过（不应发生）
        if (player.state.isWon || player.state.isDrawn) {
            this.advanceToNextTurn();
            return;
        }
        // Display a declared winning draw before auto settlement. Human legal
        // actions remain available during the preview.
        if (this.autoRiichiSelfWin(player, drawnTile)) return;
        if (this.isAI(player)) {
            // AI 自动行动
            const generation = this.generation;
            const action = () => {
                if (generation === this.generation && this.phase === SessionPhase.PlayerTurn
                    && this.currentSeat === player.seat && this.isAI(player))
                    this.runAITurn(player, drawnTile);
            };
            if (this.events.scheduleAI)
                this.events.scheduleAI(action, player);
            else
                action();
        }
        else {
            // 人类：通知 UI
            this.waitingHumanTurn = player;
            // 计算可执行选项（UI 显隐按钮）
            const options = this.computeHumanOptions(player, drawnTile);
            this.events.onHumanTurn?.(player, drawnTile);
            if (options.autoDiscard && !options.canWin && drawnTile) {
                const generation = this.generation;
                this.events.scheduleAutoDiscard?.(() => {
                    if (generation !== this.generation || this.phase !== SessionPhase.PlayerTurn
                        || this.waitingHumanTurn !== player || this.currentSeat !== player.seat
                        || this.lastDrawn?.id !== drawnTile.id || !player.hand.some(t => t.id === drawnTile.id)) return false;
                    return this.playerDiscard(player, drawnTile);
                }, options.canAnGang || options.canJiaGang || options.canSupplementGang ? 2800 : 850);
            }
        }
    }
    private autoRiichiSelfWin(player: Player, drawnTile: Tile | null): boolean {
        if (this.phase !== SessionPhase.PlayerTurn || this.currentSeat !== player.seat
            || player.state.riichi === RiichiType.None || !drawnTile
            || this.lastDrawn?.id !== drawnTile.id || !player.hand.some(t=>t.id===drawnTile.id)
            || !evaluatePlayerWin(player, drawnTile, this.allowQi).ok) return false;
        this.waitingHumanTurn = null;
        if (this.events.scheduleSelfWin) {
            let pending=this.pendingSelfWin;
            if(!pending||pending.playerId!==player.id||pending.tileId!==drawnTile.id){
                pending={playerId:player.id,tileId:drawnTile.id,deadline:Date.now()+5000};this.pendingSelfWin=pending;
                const expected=pending,generation=this.generation;
                this.events.scheduleSelfWin(()=>{
                    if(this.pendingSelfWin!==expected||generation!==this.generation||Date.now()<expected.deadline
                        ||this.phase!==SessionPhase.PlayerTurn||this.currentSeat!==player.seat
                        ||this.lastDrawn?.id!==drawnTile.id||!evaluatePlayerWin(player,drawnTile,this.allowQi).ok)return false;
                    this.pendingSelfWin=null;this.handleWin(player,drawnTile,WinMode.SelfDraw);return true;
                },5000);
            }
            this.events.onSelfWinPreview?.(player,drawnTile,pending.deadline);
            if(!this.isAI(player)){this.waitingHumanTurn=player;this.events.onHumanTurn?.(player,drawnTile);}
            return true;
        }
        this.handleWin(player, drawnTile, WinMode.SelfDraw);
        return true;
    }
    /**
     * 计算人类玩家可执行的行动选项（UI 按钮显隐依据）
     */
    computeHumanOptions(player: Player, drawnTile: Tile | null): HumanActionOptions {
        const hand14 = player.hand;
        const canWin = !!drawnTile && evaluatePlayerWin(player, drawnTile, this.allowQi).ok;
        // 暗杠：手牌有 4 张同种
        const counts = new Map<string, number>();
        for (const t of hand14) {
            const k = `${t.suit}:${t.rank}`;
            counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        const canAnGang = getConcealedGangChoices(player).length > 0;
        // 加杠：有已碰副露 + 手牌有同种
        let canJiaGang = false;
        {
            for (const [index, meld] of player.melds.entries()) {
                if (meld.type !== MeldType.Peng)
                    continue;
                if (player.hand.some(t => isSameType(t, meld.tiles[0]) && canRiichiGang(player,[t],{...meld,type:MeldType.JiaGang,tiles:meld.tiles.concat(t)},'jia',index))) {
                    canJiaGang = true;
                    break;
                }
            }
        }
        const canRiichi = player.state.riichi === RiichiType.None
            && this.getRiichiDiscards(player).length > 0;
        return {
            autoDiscard: player.state.riichi !== RiichiType.None && !!drawnTile && this.pendingSelfWin?.playerId!==player.id,
            canDiscard: hand14.length === 14 - 3 * player.melds.length,
            canAnGang,
            canSupplementGang: getSupplementGangChoices(player).length > 0,
            canJiaGang,
            canRiichi,
            canWin,
            drawnTile,
        };
    }
    // ========================================================
    // 6. AI 自动回合
    // ========================================================
    /**
     * 执行一次完整 AI 回合
     *  1. 自摸检查 → 胡则结算
     *  2. 暗杠决策 → 杠则补牌回到步骤 1
     *  3. 加杠决策 → 杠则补牌回到步骤 1
     *  4. 报听决策
     *  5. 选牌打出 → 进入他家响应流程
     */
    private runAITurn(player: Player, drawnTile: Tile | null): void {
        const context = this.aiContext();
        if (!drawnTile) {
            this.discardAITurn(player, null, context);
            return;
        }
        // 1. 自摸检查
        if (shouldWin(player, drawnTile, this.allowQi)) {
            this.handleWin(player, drawnTile, WinMode.SelfDraw);
            return;
        }
        const supplement = chooseSupplement(player, this.allowQi, context);
        if (supplement) {
            this.doSupplementGang(player, supplement.meldIndex, supplement.tile);
            return;
        }
        // 2. 暗杠
        const concealed = chooseConcealedGang(player, this.allowQi, context);
        if (concealed) {
            this.doSelectedConcealedGang(player, concealed.tiles);
            return;
        }
        // 3. 加杠
        const jiaGangDec = decideJiaGang(player, this.players, this.allowQi, context);
        if (jiaGangDec.ok && jiaGangDec.tile) {
            this.doJiaGang(player, jiaGangDec.tile);
            return;
        }
        this.discardAITurn(player, drawnTile, context);
    }
    private aiContext(): AIContext {
        return { players: this.players, config: this.config, remainingTiles: getRemainingCount(this.wall) };
    }
    private discardAITurn(player: Player, drawnTile: Tile | null, context: AIContext): void {
        const plan = planDiscard(player, this.allowQi, drawnTile ?? undefined, context);
        if (player.state.riichi === RiichiType.None && plan.riichiKey) {
            const simulated = { ...player, hand: player.hand.filter(t => t.id !== plan.tile.id),
                state: { ...player.state } };
            const r = declareRiichi(simulated, this.allowQi, plan.riichiKey);
            if (r.ok && r.riichiType) {
                copyRiichiDeclaration(simulated, player);
                this.events.onRiichi?.(player, r.riichiType);
            }
        }
        // 5. 选牌打出
        this.doDiscard(player, plan.tile);
    }
    // ========================================================
    // 7. 人类玩家行动方法（UI 调用）
    // ========================================================
    /**
     * 人类出牌
     */
    playerDiscard(player: Player, tile: Tile): boolean {
        if (this.phase !== SessionPhase.PlayerTurn || this.waitingHumanTurn !== player)
            return false;
        if (player.state.riichi !== RiichiType.None && tile.id !== this.lastDrawn?.id)
            return false;
        if (player.state.riichi !== RiichiType.None
            && !hasLockedRiichiHand(player, player.hand.filter(t => t.id !== tile.id)))
            return false;
        return this.doDiscard(player, tile);
    }
    getRiichiDiscards(player: Player): Tile[] {
        if (player.state.riichi !== RiichiType.None)
            return [];
        return player.hand.filter((tile, i) => getRiichiChoices({ ...player, hand: player.hand.filter((_, j) => j !== i) }, this.allowQi).length > 0);
    }
    /**
     * 人类报听：确认弃牌及听口后声明，之后只能打出新摸牌
     */
    playerDeclareRiichi(player: Player, tile: Tile | null = this.lastDrawn, choiceKey?: string): boolean {
        if (this.waitingHumanTurn !== player || !tile || this.phase !== SessionPhase.PlayerTurn)
            return false;
        if (!this.getRiichiDiscards(player).some(t => t.id === tile.id))
            return false;
        const simulated = { ...player, hand: player.hand.filter(t => t.id !== tile.id), state: { ...player.state } };
        const r = declareRiichi(simulated, this.allowQi, choiceKey);
        if (!r.ok || !r.riichiType)
            return false;
        copyRiichiDeclaration(simulated, player);
        // The declaration discard is chosen explicitly; later turns are locked.
        this.lastDrawn = tile;
        this.events.onRiichi?.(player, r.riichiType);
        return this.playerDiscard(player, tile);
    }
    /**
     * 人类暗杠
     */
    playerAnGang(player: Player, tile: Tile): boolean {
        if (this.waitingHumanTurn !== player)
            return false;
        if (!getConcealedGangChoices(player).some(c=>!c.specialGang && c.tiles.some(t=>t.id===tile.id)))
            return false;
        this.waitingHumanTurn = null;
        this.doAnGang(player, tile);
        return true;
    }
    getConcealedGangChoices(player: Player) { return getConcealedGangChoices(player); }
    getSupplementGangChoices(player: Player) { return getSupplementGangChoices(player); }
    playerSupplementGang(player: Player, meldIndex: number, tile: Tile): boolean {
        if (this.phase !== SessionPhase.PlayerTurn || this.waitingHumanTurn !== player)
            return false;
        return this.doSupplementGang(player, meldIndex, tile);
    }
    private doSupplementGang(player: Player, meldIndex: number, tile: Tile): boolean {
        // Offer the physical tile before mutating the meld or charging a supplement.
        if (!getSupplementGangChoices(player).some(c=>c.meldIndex===meldIndex&&c.tile.id===tile.id))
            return false;
        this.waitingHumanTurn = null;
        this.pendingSelfWin = null;
        this.pendingRobbingGang = { gangPlayer: player, gangTile: tile, supplementMeldIndex: meldIndex };
        this.claimStage = 'rob';
        this.pendingClaimQueue = this.buildClockwiseQueue(player).filter(p=>shouldWin(p,tile,this.allowQi));
        this.phase = SessionPhase.AwaitingClaims;
        this.events.onGangClaim?.(player, tile, true);
        this.processClaimQueue();
        return true;
    }
    private commitSupplementGang(player: Player, meldIndex: number, tile: Tile): void {
        this.pendingRobbingGang = null;
        const result = supplementGang(player, meldIndex, tile);
        if (!result.ok || !result.meld) {
            this.phase = SessionPhase.PlayerTurn;
            this.beginPlayerTurn(player, this.lastDrawn);
            return;
        }
        this.waitingHumanTurn = null;
        this.events.onSupplementGang?.(player, result.meld, tile);
        this.recordPendingGang(player, result.meld, tile, GangSettlementMode.Supplement);
        this.hadGangThisRound = true;
        this.isAfterGangSpecial = true;
        this.phase = SessionPhase.GangSupplement;
        this.supplementAfterGang(player);
    }
    playerSelectedConcealedGang(player: Player, tiles: Tile[]): boolean {
        if (this.phase !== SessionPhase.PlayerTurn || this.waitingHumanTurn !== player)
            return false;
        return this.doSelectedConcealedGang(player, tiles);
    }
    private doSelectedConcealedGang(player: Player, tiles: Tile[]): boolean {
        const result = concealedGang(player, tiles);
        if (!result.ok || !result.meld)
            return false;
        this.pendingSelfWin = null;
        this.waitingHumanTurn = null;
        this.events.onAnGang?.(player, result.meld);
        this.recordPendingGang(player, result.meld, result.meld.tiles[0], GangSettlementMode.AnGang);
        this.hadGangThisRound = true;
        this.isAfterGangSpecial = true;
        this.phase = SessionPhase.GangSupplement;
        this.supplementAfterGang(player);
        return true;
    }
    /**
     * 人类加杠
     */
    playerJiaGang(player: Player, tile: Tile): boolean {
        if (this.waitingHumanTurn !== player)
            return false;
        if (!player.hand.some(t => t.id === tile.id)
            || !player.melds.some(m => m.type === MeldType.Peng && isSameType(m.tiles[0], tile)))
            return false;
        const index = player.melds.findIndex(m=>m.type===MeldType.Peng&&isSameType(m.tiles[0],tile));
        if (!canRiichiGang(player,[tile],{...player.melds[index],type:MeldType.JiaGang,tiles:player.melds[index].tiles.concat(tile)},'jia',index)) return false;
        this.waitingHumanTurn = null;
        this.doJiaGang(player, tile);
        return true;
    }
    /**
     * 人类自摸胡
     */
    playerSelfWin(player: Player, winTile: Tile): boolean {
        if (this.phase !== SessionPhase.PlayerTurn || this.waitingHumanTurn !== player
            || this.lastDrawn?.id !== winTile.id || !player.hand.some(t => t.id === winTile.id))
            return false;
        if (!shouldWin(player, winTile, this.allowQi))
            return false;
        this.waitingHumanTurn = null;
        this.handleWin(player, winTile, WinMode.SelfDraw);
        return true;
    }
    /**
     * 人类对别家出牌的"碰"响应
     */
    playerClaimPeng(player: Player): boolean {
        if (this.waitingHumanClaim !== player)
            return false;
        const supplement = this.claimStage === 'robMeld' ? this.pendingRobbingGang : null;
        if (this.claimStage !== 'meld' && !supplement)
            return false;
        const tile = supplement?.gangTile ?? this.lastDiscard;
        const from = supplement?.gangPlayer ?? this.lastDiscarder;
        if (!tile || !from) return false;
        if (!this.canPeng(player, tile))
            return false;
        // 清除待响应
        this.waitingHumanClaim = null;
        this.pendingClaimQueue = [];
        this.doPeng(player, tile, from);
        return true;
    }
    /**
     * 人类对别家出牌的"明杠"响应
     */
    playerClaimMingGang(player: Player): boolean {
        if (this.waitingHumanClaim !== player)
            return false;
        if (this.claimStage !== 'meld' || !this.lastDiscard || !this.lastDiscarder)
            return false;
        const tile = this.lastDiscard;
        const from = this.lastDiscarder;
        if (!this.canMingGang(player, tile))
            return false;
        this.waitingHumanClaim = null;
        this.pendingClaimQueue = [];
        this.doMingGang(player, tile, from);
        return true;
    }
    /**
     * 人类点炮胡（对别家出牌的胡响应）
     */
    playerClaimWin(player: Player): boolean {
        if (this.phase !== SessionPhase.AwaitingClaims || this.waitingHumanClaim !== player
            || (this.claimStage !== 'win' && this.claimStage !== 'rob'))
            return false;
        const rob = this.pendingRobbingGang;
        const tile = rob?.gangTile ?? this.lastDiscard;
        const from = rob?.gangPlayer ?? this.lastDiscarder;
        if (!tile || !from || !shouldWin(player, tile, this.allowQi))
            return false;
        this.waitingHumanClaim = null;
        this.pendingClaimQueue = [];
        if (rob)
            from.state.isRobbed = true;
        else
            from.state.isFired = true;
        this.handleWin(player, tile, rob ? WinMode.RobbingGang : WinMode.DianPao, from);
        return true;
    }
    /**
     * 人类放弃本次碰杠胡
     */
    playerPass(player: Player): boolean {
        if (this.waitingHumanClaim !== player)
            return false;
        this.waitingHumanClaim = null;
        // 继续处理队列中下一个
        this.processClaimQueue();
        return true;
    }
    getHumanChiOptions(player: Player): Tile[][] {
        return this.canChi(player) && this.lastDiscard ? getChiOptions(player, this.lastDiscard) : [];
    }
    private canChi(player: Player): boolean {
        return this.config.allowChi && this.claimStage === 'chi' && !!this.lastDiscarder
            && this.buildClockwiseQueue(this.lastDiscarder)[0] === player;
    }
    playerClaimChi(player: Player, selected: Tile[]): boolean {
        if (this.phase !== SessionPhase.AwaitingClaims || this.waitingHumanClaim !== player
            || !this.canChi(player) || !this.lastDiscard || !this.lastDiscarder)
            return false;
        return this.doChi(player, this.lastDiscard, this.lastDiscarder, selected);
    }
    private doChi(player: Player, tile: Tile, from: Player, selected: Tile[]): boolean {
        const result = chi(player, tile, selected);
        if (!result.ok || !result.meld)
            return false;
        this.waitingHumanClaim = null;
        this.pendingClaimQueue = [];
        this.consumeDiscard(from, tile);
        this.lastDrawn = null;
        this.isAfterGangSpecial = false;
        this.isGangShangKaiHua = false;
        this.currentSeat = player.seat;
        this.phase = SessionPhase.PlayerTurn;
        this.events.onChi?.(player, result.meld, from);
        this.events.onTurnChange?.(player.seat);
        this.beginPlayerTurn(player, null);
        return true;
    }
    // ========================================================
    // 8. 动作执行（内部）
    // ========================================================
    /** 执行出牌 */
    private doDiscard(player: Player, tile: Tile): boolean {
        const r = discard(player, tile);
        if (!r.ok) {
            console.error(`[GameSession] 出牌失败：${r.error}`);
            return false;
        }
        this.pendingSelfWin = null;
        this.waitingHumanTurn = null;
        this.lastDiscard = tile;
        this.lastDiscarder = player;
        this.lastDrawn = null;
        this.events.onDiscard?.(player, tile);
        // 进入他家响应流程
        this.startClaimPhase();
        return true;
    }
    /** 执行碰 */
    private doPeng(player: Player, tile: Tile, from: Player): void {
        const r = peng(player, tile);
        if (!r.ok || !r.meld) {
            console.error(`[GameSession] 碰失败：${r.error}`);
            this.advanceToNextTurn();
            return;
        }
        if (this.claimStage === 'robMeld' && this.pendingRobbingGang?.gangPlayer === from
            && this.pendingRobbingGang.gangTile.id === tile.id) {
            from.hand = from.hand.filter(t=>t.id!==tile.id);
            this.pendingRobbingGang = null;
        } else this.consumeDiscard(from, tile);
        this.lastDrawn = null;
        this.isAfterGangSpecial = false;
        this.isGangShangKaiHua = false;
        this.events.onPeng?.(player, r.meld, from);
        // 碰后该玩家需打出 1 张
        this.currentSeat = player.seat;
        this.phase = SessionPhase.PlayerTurn;
        // 碰后无新摸牌，玩家需从手牌中打出
        this.beginPlayerTurn(player, null);
    }
    /** 执行明杠（点炮杠） */
    private doMingGang(player: Player, tile: Tile, from: Player): void {
        const r = mingGang(player, tile);
        if (!r.ok || !r.meld) {
            console.error(`[GameSession] 明杠失败：${r.error}`);
            this.advanceToNextTurn();
            return;
        }
        this.consumeDiscard(from, tile);
        this.events.onMingGang?.(player, r.meld, from);
        // 暂存杠分，局末统一入账
        this.recordPendingGang(player, r.meld, tile, GangSettlementMode.MingGang, from);
        // 杠后补牌
        this.hadGangThisRound = true;
        this.isAfterGangSpecial = true;
        this.currentSeat = player.seat;
        this.phase = SessionPhase.GangSupplement;
        this.supplementAfterGang(player);
    }
    /** 执行暗杠 */
    private doAnGang(player: Player, tile: Tile): void {
        const r = anGang(player, tile);
        if (!r.ok || !r.meld) {
            console.error(`[GameSession] 暗杠失败：${r.error}`);
            return;
        }
        this.pendingSelfWin = null;
        this.events.onAnGang?.(player, r.meld);
        // 暗杠不算开门 → 站立状态不变（已由 refreshOpenState 处理）
        // 暂存杠分，局末统一入账
        this.recordPendingGang(player, r.meld, tile, GangSettlementMode.AnGang);
        this.hadGangThisRound = true;
        this.isAfterGangSpecial = true;
        this.phase = SessionPhase.GangSupplement;
        this.supplementAfterGang(player);
    }
    /** 执行加杠 */
    private doJiaGang(player: Player, tile: Tile): void {
        this.pendingSelfWin = null;
        this.pendingRobbingGang = { gangPlayer: player, gangTile: tile };
        this.claimStage = 'rob';
        this.pendingClaimQueue = this.buildClockwiseQueue(player).filter(p => shouldWin(p, tile, this.allowQi));
        this.phase = SessionPhase.AwaitingClaims;
        this.events.onGangClaim?.(player, tile, false);
        this.processClaimQueue();
    }
    private commitJiaGang(player: Player, tile: Tile): void {
        this.pendingRobbingGang = null;
        const r = jiaGang(player, tile);
        if (!r.ok || !r.meld) {
            this.phase = SessionPhase.PlayerTurn;
            this.beginPlayerTurn(player, this.lastDrawn);
            return;
        }
        this.events.onJiaGang?.(player, r.meld);
        this.recordPendingGang(player, r.meld, tile, GangSettlementMode.JiaGang);
        this.hadGangThisRound = true;
        this.isAfterGangSpecial = true;
        this.phase = SessionPhase.GangSupplement;
        this.supplementAfterGang(player);
    }
    /** 杠后补牌（长毛区摸牌） */
    private supplementAfterGang(player: Player): void {
        this.lastDrawn = null;
        if (player.state.riichi === RiichiType.None) {
            const choices = getRiichiChoices(player, this.allowQi);
            if (choices.length && this.isAI(player)) {
                const choice = chooseRiichi(player, this.allowQi, this.aiContext());
                if (choice) {
                    const result = declareRiichi(player, this.allowQi, choice.key);
                    if (result.ok) this.events.onRiichi?.(player, result.riichiType!);
                }
            } else if (choices.length && this.events.onBeforeGangDraw) {
                this.pendingGangDraw = player;
                this.waitingHumanTurn = null;
                this.currentSeat = player.seat;
                this.phase = SessionPhase.GangSupplement;
                this.events.onBeforeGangDraw(player);
                return;
            }
        }
        this.finishGangDraw(player);
    }
    playerBeforeGangDraw(player: Player, choiceKey?: string): boolean {
        if (this.pendingGangDraw !== player || this.phase !== SessionPhase.GangSupplement) return false;
        if (choiceKey !== undefined) {
            const result = declareRiichi(player, this.allowQi, choiceKey);
            if (!result.ok) return false;
            this.events.onRiichi?.(player, result.riichiType!);
        }
        this.pendingGangDraw = null;
        this.finishGangDraw(player);
        return true;
    }
    private finishGangDraw(player: Player): void {
        this.events.onBeforeDraw?.(this.wall, player, true);
        const supplement = drawKongTile(this.wall);
        if (!supplement) {
            // 长毛区空了（极少见）→ 荒庄
            this.handleDrawn();
            return;
        }
        draw(player, supplement);
        this.lastDrawn = supplement;
        this.isGangShangKaiHua = true; // 杠后摸牌，若立即胡=杠上开花
        this.events.onDraw?.(player, supplement, true);
        this.phase = SessionPhase.PlayerTurn;
        this.currentSeat = player.seat;
        // 杠后补牌的玩家继续行动
        this.beginPlayerTurn(player, supplement);
    }
    // ========================================================
    // 9. 他家响应流程（碰/明杠/胡）
    // ========================================================
    /**
     * 启动"他家对出牌的响应"流程
     *  - 按顺时针顺序（打出者下家开始）检查每个玩家
     *  - AI 自动决策；人类等 UI 响应
     */
    private startClaimPhase(): void {
        if (!this.lastDiscarder || !this.lastDiscard) {
            this.advanceToNextTurn();
            return;
        }
        const discardTile = this.lastDiscard;
        const fromPlayer = this.lastDiscarder;
        // 构建顺时针队列：从打出者下家开始
        this.claimStage = 'win';
        this.pendingClaimQueue = this.buildClockwiseQueue(fromPlayer).filter(p => shouldWin(p, discardTile, this.allowQi));
        // 标记杠后状态结束（点炮不算杠后自摸/点炮，除非杠后立即点炮）
        // isAfterGangSpecial 在打出第一张后清除（仅杠后立即胡才生效）
        // 这里保留 isAfterGangSpecial，让结算判定
        this.phase = SessionPhase.AwaitingClaims;
        this.processClaimQueue();
    }
    /** 顺时针队列（从 fromPlayer 下家开始） */
    private buildClockwiseQueue(fromPlayer: Player): Player[] {
        const order: SeatWind[] = [SeatWind.East, SeatWind.South, SeatWind.West, SeatWind.North];
        const idx = order.indexOf(fromPlayer.seat);
        const queue: Player[] = [];
        for (let i = 1; i <= 3; i++) {
            const seat = order[(idx + i) % order.length];
            queue.push(this.getPlayer(seat));
        }
        return queue;
    }
    /** 处理响应队列中的下一个玩家 */
    private processClaimQueue(): void {
        if (this.pendingClaimQueue.length === 0) {
            if (this.claimStage === 'rob' && this.pendingRobbingGang) {
                if (this.pendingRobbingGang.supplementMeldIndex !== undefined) {
                    // All winning claims are resolved before anyone may take the tile for a peng.
                    this.claimStage = 'robMeld';
                    this.pendingClaimQueue = this.buildClockwiseQueue(this.pendingRobbingGang.gangPlayer);
                    this.processClaimQueue();
                    return;
                }
                const { gangPlayer, gangTile } = this.pendingRobbingGang;
                this.commitJiaGang(gangPlayer, gangTile);
                return;
            }
            if (this.claimStage === 'robMeld' && this.pendingRobbingGang) {
                const { gangPlayer, gangTile, supplementMeldIndex } = this.pendingRobbingGang;
                this.commitSupplementGang(gangPlayer, supplementMeldIndex!, gangTile);
                return;
            }
            if (this.claimStage === 'win' && this.lastDiscarder) {
                this.claimStage = 'meld';
                this.pendingClaimQueue = this.buildClockwiseQueue(this.lastDiscarder);
                this.processClaimQueue();
                return;
            }
            if (this.claimStage === 'meld' && this.lastDiscarder && this.config.allowChi) {
                this.claimStage = 'chi';
                this.pendingClaimQueue = [this.buildClockwiseQueue(this.lastDiscarder)[0]];
                this.processClaimQueue();
                return;
            }
            this.advanceToNextTurn();
            return;
        }
        const player = this.pendingClaimQueue.shift()!;
        const tile = this.pendingRobbingGang?.gangTile ?? this.lastDiscard;
        const from = this.pendingRobbingGang?.gangPlayer ?? this.lastDiscarder;
        if (!tile || !from) {
            this.advanceToNextTurn();
            return;
        }
        const winStage = this.claimStage === 'win' || this.claimStage === 'rob';
        const canWin = winStage && shouldWin(player, tile, this.allowQi);
        const canPeng = (this.claimStage === 'meld' || this.claimStage === 'robMeld') && this.canPeng(player, tile);
        const canMingGang = this.claimStage === 'meld' && this.canMingGang(player, tile);
        const chiOptions = this.canChi(player) ? getChiOptions(player, tile) : [];
        if (this.isAI(player)) {
            const generation = this.generation;
            const action = () => {
            if (this.waitingAIClaim !== player || generation !== this.generation
                || this.phase !== SessionPhase.AwaitingClaims || !this.isAI(player)) return;
            this.waitingAIClaim = null;
            if (canWin) {
                const mode = this.claimStage === 'rob' ? WinMode.RobbingGang : WinMode.DianPao;
                if (mode === WinMode.RobbingGang)
                    from.state.isRobbed = true;
                else
                    from.state.isFired = true;
                this.handleWin(player, tile, mode, from);
                return;
            }
            if (this.claimStage === 'meld' || this.claimStage === 'robMeld') {
                const dec = decideClaimPengGang(player, tile, this.allowQi, this.aiContext());
                if (dec.action === 'mingGang' && canMingGang) {
                    this.pendingClaimQueue = [];
                    this.doMingGang(player, tile, from);
                    return;
                }
                if (dec.action === 'peng' && canPeng) {
                    this.pendingClaimQueue = [];
                    this.doPeng(player, tile, from);
                    return;
                }
            }
            if (chiOptions.length) {
                const selected = chooseChi(player, tile, chiOptions, this.allowQi, this.aiContext());
                if (selected) {
                    this.doChi(player, tile, from, selected);
                    return;
                }
            }
            this.processClaimQueue();
            };
            this.waitingAIClaim = player;
            // Only actionable claims need a presentation pause; empty checks continue immediately.
            if ((canWin || canPeng || canMingGang || chiOptions.length) && this.events.scheduleClaim)
                this.events.scheduleClaim(action, player);
            else action();
            return;
        }
        if (!canWin && !canPeng && !canMingGang && !chiOptions.length) {
            this.processClaimQueue();
            return;
        }
        this.waitingHumanClaim = player;
        this.events.onHumanClaim?.(player, tile, from, canWin, canPeng, canMingGang, chiOptions.length > 0);
        if (player.state.riichi !== RiichiType.None && !canWin) {
            const generation = this.generation;
            this.events.scheduleAutoDiscard?.(() => {
                if (generation !== this.generation || this.phase !== SessionPhase.AwaitingClaims
                    || this.waitingHumanClaim !== player || this.lastDiscard?.id !== tile.id) return false;
                return this.playerPass(player);
            }, 2800);
        }
    }
    private consumeDiscard(from: Player, tile: Tile): void {
        const index = from.discards.findIndex(t => t.id === tile.id);
        if (index >= 0)
            from.discards.splice(index, 1);
    }
    stop(): void {
        this.pendingSelfWin = null;
        this.generation++;
        this.phase = SessionPhase.Finished;
        this.waitingHumanTurn = null;
        this.waitingHumanClaim = null;
        this.pendingClaimQueue = [];
    }
    /** 该玩家能否碰此牌 */
    private canPeng(player: Player, tile: Tile): boolean {
        if (player.state.riichi !== RiichiType.None)
            return false;
        return player.hand.filter(t => isSameType(t, tile)).length >= 2;
    }
    /** 该玩家能否明杠此牌 */
    private canMingGang(player: Player, tile: Tile): boolean {
        const own = player.hand.filter(t=>isSameType(t,tile)).slice(0,3);
        return own.length === 3 && canRiichiGang(player, own, {type:MeldType.MingGang,tiles:own.concat(tile),openedTileIndex:3}, 'ming');
    }
    // ========================================================
    // 10. 推进到下一家摸牌
    // ========================================================
    /**
     * 上一家出牌后无人响应 → 推进到下家摸牌
     */
    private advanceToNextTurn(): void {
        // 清理出牌记录
        this.lastDiscard = null;
        this.lastDiscarder = null;
        // 杠后特殊倍数在出牌后失效（仅杠后立即胡才生效）
        this.isAfterGangSpecial = false;
        this.isGangShangKaiHua = false;
        // 推进到下家
        const order: SeatWind[] = [SeatWind.East, SeatWind.South, SeatWind.West, SeatWind.North];
        const idx = order.indexOf(this.currentSeat);
        const nextSeat = order[(idx + 1) % order.length];
        this.currentSeat = nextSeat;
        // 摸牌
        this.events.onBeforeDraw?.(this.wall, this.getPlayer(nextSeat), false);
        const tile = drawTile(this.wall);
        if (!tile) {
            // 牌墙摸空 → 荒庄
            this.handleDrawn();
            return;
        }
        const player = this.getPlayer(nextSeat);
        draw(player, tile);
        this.lastDrawn = tile;
        this.events.onDraw?.(player, tile, false);
        this.phase = SessionPhase.PlayerTurn;
        this.events.onTurnChange?.(nextSeat);
        this.beginPlayerTurn(player, tile);
    }
    // ========================================================
    // 11. 胡牌结算
    // ========================================================
    /**
     * 处理胡牌
     *  - 计算倍数 → 封顶 → 分摊积分 → 应用 → emit
     *  - 推进庄家 → emit onRoundEnd
     */
    private handleWin(winner: Player, winTile: Tile, winMode: WinMode, firer?: Player): void {
        const evaluation = evaluatePlayerWin(winner, winTile, this.allowQi);
        if (!evaluation.ok)
            throw new Error('拒绝结算不合法胡牌');
        this.pendingSelfWin = null;
        const tiles14 = evaluation.allTiles;
        const win = evaluation;
        const isQi = !!win.qiInfo;
        const patternResult = isQi ? undefined : recognizePattern(evaluation.concealed, winTile, winner.melds);
        // 杠上开花：杠后摸牌即胡
        const isGangShangKaiHua = this.isGangShangKaiHua && winMode === WinMode.SelfDraw;
        // 杠后倍数：本局有过杠
        const isAfterGang = this.hadGangThisRound;
        // 杠后自摸/点炮（×4）：杠后立即胡
        const isAfterGangSpecial = this.isAfterGangSpecial;
        const ctx: WinContext = {
            winner,
            winTiles: tiles14,
            winTile,
            winMode,
            firer,
            allPlayers: this.players,
            currentDealer: this.room.currentDealer,
            isAfterGang,
            isAfterGangSpecial,
            isGangShangKaiHua,
            patternResult,
            qiInfo: isQi && win.qiInfo ? win.qiInfo : undefined,
            roomConfig: this.config,
        };
        const result = settleWin(ctx);
        applySettlement(this.players, result);
        this.settlePendingGangs();
        winner.state.isWon = true;
        this.waitingHumanTurn = null;
        this.waitingHumanClaim = null;
        this.pendingClaimQueue = [];
        this.phase = SessionPhase.Settled;
        if (winMode !== WinMode.SelfDraw) {
            if (winMode === WinMode.RobbingGang && firer)
                firer.hand = firer.hand.filter(t => t.id !== winTile.id);
            else if (firer)
                this.consumeDiscard(firer, winTile);
            winner.hand.push(winTile);
        }
        this.pendingRobbingGang = null;
        this.events.onWin?.(winner, winTile, result, winMode);
        // 推进庄家
        const roomFinished = advanceAfterWin(this.room, winner);
        this.phase = SessionPhase.Settled;
        if (roomFinished)
            this.phase = SessionPhase.Finished;
        this.events.onRoundEnd?.(roomFinished);
    }
    /**
     * 处理荒庄
     *  - 标记所有玩家 isDrawn
     *  - 庄家连庄
     */
    private handleDrawn(): void {
        this.pendingSelfWin = null;
        this.settlePendingGangs();
        for (const p of this.players) {
            p.state.isDrawn = true;
        }
        this.events.onDrawn?.();
        const roomFinished = advanceAfterDraw(this.room);
        this.phase = roomFinished ? SessionPhase.Finished : SessionPhase.Settled;
        this.events.onRoundEnd?.(roomFinished);
    }
    // ========================================================
    // 12. 杠分局末统一入账
    // ========================================================
    /**
     * 按开杠时的底分和庄家暂存分值，局内不改变积分或发布明细。
     */
    private recordPendingGang(gangPlayer: Player, meld: Meld, gangTile: Tile, mode: GangSettlementMode, firer?: Player): void {
        const ctx: GangContext = {
            gangPlayer,
            meld,
            gangTile,
            allPlayers: this.players,
            currentDealer: this.room.currentDealer,
            roomConfig: this.config,
            mode,
            firer,
        };
        const result = settleGang(ctx);
        this.pendingGangSettlements.push(result);
    }
    private settlePendingGangs(): void {
        const pending = this.pendingGangSettlements.splice(0);
        for (const result of pending) applyGangSettlement(this.players, result);
        for (const result of pending)
            this.events.onGangSettlement?.(this.getPlayerById(result.gangPlayerId)!, result);
    }
    // ========================================================
    // 13. 工具
    // ========================================================
    /** 按花色排序某玩家手牌（原地） */
    sortHand(player: Player): void {
        sortTiles(player.hand);
    }
    /** 房间是否已结束 */
    isFinished(): boolean {
        return this.phase === SessionPhase.Finished
            || checkRoomFinished(this.room);
    }
}
