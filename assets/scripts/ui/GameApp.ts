import { THROW_EMOJI_IDS } from '../data/QuickChat';
import { canRiichiGang } from '../game/RiichiGang';
import { _decorator, Component, Node, Layers, view, ResolutionPolicy, profiler, sys, macro, screen } from 'cc';
import { RoomConfig, createRoom } from '../core/Room';
import { Player, createPlayer } from '../core/Player';
import { Tile, isSameType } from '../core/Tile';
import { SeatWind, MeldType, RiichiType } from '../core/Types';
import { GameSession, SessionEvents, HumanActionOptions, SessionPhase } from '../game/GameSession';
import { GangSettlementResult } from '../game/GangSettlement';
import { TableView } from './TableView';
import { ActionBar } from './ActionBar';
import { SettlementPanel } from './SettlementPanel';
import { RoomSetupPanel } from './RoomSetupPanel';
import { AudioManager } from './AudioManager';
import { VoiceChat } from './VoiceChat';
import { UIHelper } from './UIHelper';
import { TileResources } from './TileResources';
import { describeRiichi, getRiichiChoices } from '../game/RiichiManager';
import { FriendClient } from '../net/FriendClient';
import { FriendSession } from '../net/FriendSession';
import { FriendRoomPanel } from './FriendRoomPanel';
const { ccclass } = _decorator;
@ccclass('GameApp')
export class GameApp extends Component {
    private mobileStage: Node | null = null;
    private friendPanel!: FriendRoomPanel;
    private friend: FriendClient | null = null;
    private friendConfig: RoomConfig | null = null;
    private lastSoundSequence: number | null = null;
    private onlineStatus = '';
    private session: GameSession | null = null;
    private table!: TableView;
    private actions!: ActionBar;
    private settlement!: SettlementPanel;
    private lobby!: RoomSetupPanel;
    private audio!: AudioManager;
    private voiceChat: VoiceChat | null = null;
    private gangs: GangSettlementResult[] = [];
    private human: Player | null = null;
    private drawn: Tile | null = null;
    private options: HumanActionOptions | null = null;
    private claim = false;
    private mode: 'discard' | 'riichi' | 'riichiWait' | 'gang' = 'discard';
    private selected: Tile | null = null;
    private claimOptions: [
        boolean,
        boolean,
        boolean,
        boolean
    ] = [false, false, false, false];
    private child<T extends Component>(name: string, type: new () => T): T {
        const n = new Node(name);
        n.layer = Layers.Enum.UI_2D;
        n.parent = this.mobileStage ?? this.node;
        return n.addComponent(type);
    }
    onLoad(): void {
        view.setDesignResolutionSize(1280,720,ResolutionPolicy.SHOW_ALL);
        const splash=UIHelper.backdrop(this.node,'ArtworkLoading');
        UIHelper.label(splash,'Brand','集 安 麻 将',600,80,0,55,42);
        const progress=UIHelper.label(splash,'Progress','正在准备牌桌…',600,40,0,-30,19);
        void TileResources.preload((loaded,total)=>{progress.string='正在准备牌桌 · '+Math.round(loaded/total*100)+'%';}).then(()=>{
            if(!this.isValid)return;splash.destroy();this.initializeUI();
        });
    }
    private initializeUI(): void {
        profiler.hideStats();
        if (sys.isMobile) {
            view.setOrientation(macro.ORIENTATION_LANDSCAPE);
            view.setDesignResolutionSize(1280, 720, ResolutionPolicy.EXACT_FIT);
            const enter = document.getElementById('EnterFullscreen');
            if (enter) enter.onclick = async () => {
                try {
                    await screen.requestFullScreen();
                    const orientation = window.screen.orientation as any;
                    if (orientation?.lock) await orientation.lock('landscape').catch(() => {});
                } catch {
                    const hint = document.getElementById('FullscreenHint');
                    if (hint) { hint.textContent = '请横持手机；iPhone 可添加到主屏幕后打开'; hint.hidden = false; setTimeout(() => { hint.hidden = true; }, 6000); }
                }
            };
        } else {
            view.setOrientation(macro.ORIENTATION_AUTO);
            view.setDesignResolutionSize(1280, 720, ResolutionPolicy.SHOW_ALL);
        }
        view.resizeWithBrowserSize(true);
        if (sys.isMobile) {
            this.mobileStage = new Node('MobileStage');
            this.mobileStage.layer = Layers.Enum.UI_2D;
            this.mobileStage.parent = this.node;
            this.fitMobileStage();
        }
        this.table = this.child('Table', TableView);
        this.actions = this.child('Actions', ActionBar);
        this.actions.node.setPosition(425, -174);
        this.settlement = this.child('Settlement', SettlementPanel);
        this.audio = this.child('Audio', AudioManager);
        this.lobby = this.child('Lobby', RoomSetupPanel);
        UIHelper.button(this.table.node, 'Lobby', '大厅', sys.isMobile ? 96 : 80, sys.isMobile ? 88 : 68, 580, 312, () => UIHelper.confirmExit(this.mobileStage ?? this.node, () => this.openLobby()));
        this.table.onHumanTileClick = t => this.clickTile(t);
        this.table.onProfileClick = id => this.voiceChat?.openEmojiFor(id);
        this.actions.onDiscard = () => {
            if (this.selected)
                this.confirmDiscard(this.selected);
            else
                this.table.showMessage('点选一张手牌，再点“出牌”确认', 99);
        };
        this.actions.onRiichi = () => {
            if (!this.session || !this.human)
                return;
            this.mode = 'riichi';
            this.selected = null;
            this.actions.hide();
            this.table.setPlayable(this.session.getRiichiDiscards(this.human).map(t => t.id));
            this.table.showMessage('报听：点击亮起的弃牌，再次点击确认；本次出牌后锁定手牌', 99);
            this.actions.showForClaim(false, false, false); // “过” cancels selection.
        };
        this.actions.onGang = () => {
            if (this.claim) {
                this.perform(() => this.session!.playerClaimMingGang(this.human!));
                return;
            }
            if (!this.human || !this.session)
                return;
            this.mode = 'gang';
            this.selected = null;
            const choices = this.session.getConcealedGangChoices(this.human).map(choice => ({ label: choice.label,
                run: () => this.perform(() => this.session!.playerSelectedConcealedGang(this.human!, choice.tiles)) }));
            for (const choice of this.session.getSupplementGangChoices(this.human))
                choices.push({ label: choice.label,
                    run: () => this.perform(() => this.session!.playerSupplementGang(this.human!, choice.meldIndex, choice.tile)) });
            for (const meld of this.human.melds) {
                if (meld.type !== MeldType.Peng)
                    continue;
                const tile = this.human.hand.find(t => isSameType(t, meld.tiles[0]));
                if (tile && canRiichiGang(this.human,[tile],{...meld,type:MeldType.JiaGang,tiles:meld.tiles.concat(tile)},'jia',this.human.melds.indexOf(meld)))
                    choices.push({ label: tile.name + ' 加杠', run: () => this.perform(() => this.session!.playerJiaGang(this.human!, tile)) });
            }
            this.table.setPlayable([]);
            this.actions.showGangChoices(choices);
            this.table.showMessage('选择杠牌或补毛组合；“过”返回出牌', 99);
        };
        this.actions.onPeng = () => this.perform(() => this.session!.playerClaimPeng(this.human!));
        this.actions.onChi = () => {
            if (!this.session?.lastDiscard || !this.human)
                return;
            this.actions.showChiChoices(this.session.getHumanChiOptions(this.human), this.session.lastDiscard, tiles => this.perform(() => this.session!.playerClaimChi(this.human!, tiles)));
            this.table.showMessage('选择吃牌组合；吃后需要打出一张手牌', 99);
        };
        this.actions.onWin = () => this.perform(() => this.claim ? this.session!.playerClaimWin(this.human!) : !!this.drawn && this.session!.playerSelfWin(this.human!, this.drawn));
        this.actions.onPass = () => {
            if (this.session?.phase === SessionPhase.GangSupplement && this.human) { this.perform(() => this.session!.playerBeforeGangDraw(this.human!)); return; }
            if (!this.claim && this.mode === 'discard' && this.options?.autoDiscard && this.options.canWin && this.drawn) {
                this.perform(() => this.session!.playerSelfWin(this.human!, this.drawn!)); return;
            }
            if (!this.claim) {
                this.humanTurn(this.human!, this.drawn);
                return;
            }
            this.perform(() => this.session!.playerPass(this.human!));
        };
        this.friendPanel = this.child('FriendRoomPanel', FriendRoomPanel);
        this.voiceChat = new VoiceChat(active=>this.audio.setChatActive(active),message=>{
            if(message.type==='emoji'&&message.targetId&&THROW_EMOJI_IDS.includes(message.id)){
                const from=this.session?.getPlayerById(message.playerId),to=this.session?.getPlayerById(message.targetId);
                if(from&&to)this.table.showThrow(from.seat,to.seat,message.id,message.name);
                return;
            }
            const p=this.session?.getPlayerById(message.targetId??message.playerId);if(p)this.table.showChat(p.seat,message.text,message.type==='emoji',message.targetId?message.name:undefined);
        });
        this.lobby.onCreateFriend = config => { this.friendConfig = config; this.friendPanel.showEntry(false); };
        this.lobby.onJoinFriend = () => this.friendPanel.showEntry(true);
        this.friendPanel.onEnter = (name, code) => { void this.enterFriend(name, code); };
        this.friendPanel.onReady = () => { const self = this.friend?.state.members.find(m => m.id === this.friend!.state.localId); void this.friend?.action('ready', { ready: !self?.ready }); };
        this.friendPanel.onStart = () => { void this.friend?.action('start'); };
        this.friendPanel.onAddBot = () => { void this.friend?.action('addBot'); };
        this.friendPanel.onRemoveBot = memberId => { void this.friend?.action('removeBot', {memberId}); };
        this.friendPanel.onLeave = () => { void this.leaveFriend(); };
        this.openLobby();
        const code = new URL(window.location.href).searchParams.get('room') || localStorage.getItem('mahjong-last-room');
        if (code && /^\d{6}$/.test(code)) { this.friendPanel.showEntry(true, code); void this.resumeFriend(code); }
    }
    onDestroy(): void { this.voiceChat?.destroy();this.friend?.stop(); this.session?.stop(); this.unscheduleAllCallbacks(); }
    private openLobby(): void {
        if (this.friend) { void this.leaveFriend(); return; }
        this.session?.stop();
        this.unscheduleAllCallbacks();
        this.actions.hide();
        this.settlement.hide();
        this.table.node.active = false;
        this.lobby.show(c => this.startGame(c));
    }
    private startGame(config: RoomConfig): void {
        this.table.localSeat = SeatWind.East; this.table.showOnlineStatus('');
        const players = [createPlayer('human', '你', SeatWind.East), createPlayer('ai1', '机器人 1', SeatWind.South),
            createPlayer('ai2', '机器人 2', SeatWind.West), createPlayer('ai3', '机器人 3', SeatWind.North)];
        const room = createRoom('local', 'human', { ...config }, players);
        const refresh = () => this.table.refreshAll(this.session!);
        const events: SessionEvents = {
            scheduleSelfWin:(fn,delay)=>this.scheduleOnce(()=>{fn();},delay/1000),
            onSelfWinPreview:()=>{this.actions.hide();refresh();},
            scheduleAI: fn => this.scheduleOnce(fn, 1.8),
            scheduleClaim: fn => this.scheduleOnce(fn, 1.8),
            scheduleAutoDiscard: (fn, delay) => this.scheduleOnce(() => { fn(); }, Math.max(delay,1800) / 1000),
            onDeal: () => { this.audio.playStart(); this.gangs = []; this.clearInput(); refresh(); },
            onDraw: (p, _t, kong) => { this.audio.playDraw(); refresh(); this.table.showMessage(p.name + (kong ? ' 杠后补牌' : ' 摸牌'), .5); },
            onDiscard: (p, t) => { if (p.id === 'human') this.clearInput(); refresh(); this.table.showMessage(p.name + ' 打出 ' + t.name, .7); this.audio.playDiscard(t); },
            onPeng: (p) => { this.audio.playPeng(); refresh(); this.table.highlightTurn(p.seat); this.table.showMessage(p.name + ' 碰', .8); },
            onChi: p => { this.audio.playChi(); refresh(); this.table.highlightTurn(p.seat); this.table.showMessage(p.name + ' 吃', .8); },
            onMingGang: p => { this.audio.playGang('mingGang'); refresh(); this.table.highlightTurn(p.seat); this.table.showMessage(p.name + ' 明杠', .8); },
            onAnGang: (p, meld) => { this.audio.playGang('anGang'); refresh(); this.table.showMessage(p.name + (meld.specialGang ? ' 公开特殊杠' : ' 暗杠'), .8); },
            onSupplementGang: (p, _meld, tile) => { this.audio.playGang('supplement'); refresh(); this.table.showMessage(p.name + ' 补毛 ' + tile.name, 1); },
            onGangClaim: (p,t,supplement) => { refresh();this.table.showMessage(p.name+' '+(supplement?'补毛':'加杠')+' '+t.name+' · 等待其他玩家响应',99); },
            onJiaGang: p => { this.audio.playGang('jiaGang'); refresh(); this.table.showMessage(p.name + ' 加杠', .8); },
            onRiichi: p => { this.audio.playRiichi(p.state.riichiShapes[0]); refresh(); this.table.showMessage(p.name + ' ' + describeRiichi(p), 1.5); },
            onGangSettlement: (_p, r) => { this.gangs.push(r); refresh(); },
            onWin: (winner, tile, result, mode) => { this.audio.playWin(mode,winner.id==='human'); this.clearInput(); refresh(); this.settlement.show(result, this.gangs, players, mode, winner, tile); },
            onDrawn: () => { this.audio.playDrawn(); this.clearInput(); refresh(); this.settlement.showDrawn(players, this.gangs); },
            onRoundEnd: finished => {
                this.settlement.setFinished(finished);
                this.settlement.onNext = () => {
                    this.settlement.hide();
                    if (finished) {
                        this.settlement.showFinal(players);
                        return;
                    }
                    this.clearInput();
                    this.session!.startRound();
                };
                this.settlement.onEnd = () => this.openLobby();
            },
            onBeforeGangDraw: p => this.beforeGangDraw(p),
            onHumanTurn: (p, t) => this.humanTurn(p, t),
            onHumanClaim: (p, _t, _from, win, peng, gang, chi = false) => {
                this.human = p;
                this.claim = true;
                this.mode = 'discard';
                this.selected = null;
                this.table.setPlayable([]);
                this.claimOptions = [win, peng, gang, chi];
                this.actions.showForClaim(win, peng, gang, chi);
                refresh();
                const addition=this.session?.pendingRobbingGang;
                this.table.showMessage(addition?.supplementMeldIndex!==undefined
                    ? addition.gangPlayer.name+' 补毛 '+addition.gangTile.name+'：'+(win?'胡 / 过（胡优先）':'碰 / 过（不可吃）')
                    : win ? '可以胡牌：胡或过（胡牌优先于碰杠）' : chi ? '可以吃上家的牌，或点“过”' : '可以碰 / 杠，或点“过”', 99);
            },
            onTurnChange: seat => { this.clearInput(); this.table.highlightTurn(seat); }
        };
        this.session = new GameSession(room, players, [SeatWind.South, SeatWind.West, SeatWind.North], events);
        this.table.node.active = true;
        this.session.startRound();
    }
    private fitMobileStage(): void {
        if (!this.mobileStage) return;
        const size = screen.windowSize;
        if (size.height > 0) this.mobileStage.setScale(size.width / size.height / (1280 / 720), 1, 1);
    }
    update(): void { this.fitMobileStage(); this.updateOnlineClock(); }
    private updateOnlineClock(): void {
        const state = this.friend?.state;
        const preview=this.session?.pendingSelfWin;
        if(preview&&this.session){
            const player=this.session.getPlayerById(preview.playerId),seconds=Math.max(0,Math.ceil((preview.deadline-(Date.now()+(state?.serverNowOffset??0)))/1000));
            this.table.showMessage((player?.id===this.human?.id?'你已自摸':(player?.name??'玩家')+' 已自摸')+' · '+seconds+' 秒后自动胡牌，仍可操作',99);
        }
        if (!state || state.phase !== 'playing') return;
        const self = state.members.find(m => m.id === state.localId);
        const actor = state.members.find(m => m.id === state.actingId);
        const seconds = Math.max(0, Math.ceil(((state.autoSelfWin?.deadline??state.deadline) - (Date.now() + (state.serverNowOffset ?? 0))) / 1000));
        const offline = state.members.filter(m => m.autoPlay).map(m => m.name).join('、');
        this.table.showOnlineStatus('好友房 ' + state.code + ' · 你坐' + ({east:'东',south:'南',west:'西',north:'北'})[self.seat] +
            ' · ' + (state.autoSelfWin?'自摸展示 · '+seconds+' 秒后自动胡':actor?.isBot || actor?.autoPlay ? actor.name + (actor.autoPlay ? ' 托管中' : ' 思考中') : (actor?.name ?? '等待') + ' ' + seconds + ' 秒') + (offline ? ' · 离线托管：' + offline : ''));
    }
    private makeFriend(): FriendClient {
        const client = new FriendClient();
        client.onState = state => {if(this.friend===client)this.renderFriend(state);};
        client.onStatus = (connected, text) => {
            if (this.friend !== client) return;
            this.onlineStatus = connected ? '' : text;
            if (this.friendPanel.node.active) this.friendPanel.setMessage(connected ? '真人全部准备后房主开局；空位自动补齐机器人' : text);
            else if (!connected) { this.actions.hide(); this.table.showMessage(text, 99); }
        };
        this.lastSoundSequence = null; this.friend = client; return client;
    }
    private async enterFriend(name: string, code?: string): Promise<void> {
        if (this.friend) return;
        const client = this.makeFriend();
        try { await client.enter(name, this.friendConfig, code); }
        catch (error: any) { client.stop(); this.friend = null; this.friendPanel.setMessage(error.message || '无法连接联机服务'); }
    }
    private async resumeFriend(code: string): Promise<void> {
        if (this.friend) return;
        const client = this.makeFriend();
        try { if (!await client.resume(code)) this.friend = null; }
        catch (error: any) { client.stop(); this.friend = null; this.friendPanel.setMessage(error.message || '重连失败，请再次加入'); }
    }
    private async leaveFriend(): Promise<void> {
        this.table.clearChat();
        this.voiceChat?.setSession(null);
        const client = this.friend; this.friend = null; client?.stop();
        this.friendPanel.hide(); this.session?.stop(); this.session = null; this.human = null;
        this.table.localSeat = SeatWind.East; this.openLobby();
        const url = new URL(window.location.href); url.searchParams.delete('room'); history.replaceState(null, '', url);
        if (client) await client.leave();
    }
    private renderFriend(state: any): void {
        this.voiceChat?.setSession(this.friend,state);
        const sequence = state.soundSequence ?? 0;
        if(this.lastSoundSequence !== null)this.audio.playEvents((state.soundEvents??[]).filter(event=>event.seq>this.lastSoundSequence!),state.localId,state.serverNow??Date.now());
        else this.audio.resetVoice();
        this.lastSoundSequence = sequence;
        this.lobby.hide();
        const url = new URL(window.location.href); url.searchParams.set('room', state.code); history.replaceState(null, '', url);
        if (state.phase === 'waiting') { this.table.node.active = false; this.actions.hide(); this.settlement.hide(); this.friendPanel.showRoom(state); return; }
        this.friendPanel.hide();
        this.session = this.session instanceof FriendSession ? this.session : new FriendSession(this.friend!);
        (this.session as FriendSession).update(state);
        const self = this.session.getPlayerById(state.localId)!;
        this.table.localSeat = self.seat; this.table.node.active = true; this.gangs = state.gangs;
        this.clearInput(); this.human = self; this.drawn = state.prompt?.drawn ?? null; this.claim = false;
        this.table.refreshAll(this.session); this.table.highlightTurn(state.currentSeat); this.updateOnlineClock();
        if (state.phase === 'settled' || state.phase === 'finished') {
            if (state.result?.kind === 'win') this.settlement.show(state.result.result, this.gangs, this.session.players, state.result.mode, this.session.getPlayerById(state.result.winnerId)!, state.result.tile);
            else this.settlement.showDrawn(this.session.players, this.gangs);
            this.settlement.setFinished(state.phase === 'finished');
            this.settlement.onNext = () => {
                if (state.phase === 'finished') { this.settlement.showFinal(this.session!.players); return; }
                void this.friend?.action('ready', { ready: true });
                this.table.showMessage('已准备，等待其他玩家确认下一局', 99);
            };
            this.settlement.onEnd = () => { void this.leaveFriend(); };
            return;
        }
        this.settlement.hide();
        if (state.prompt?.kind === 'beforeGang') this.beforeGangDraw(self);
        else if (state.prompt?.kind === 'turn') this.humanTurn(self, state.prompt.drawn);
        else if (state.prompt?.kind === 'claim') {
            this.claim = true; this.claimOptions = state.prompt.claimOptions;
            this.actions.showForClaim(...this.claimOptions);
            const addition=this.session.pendingRobbingGang;
            this.table.showMessage(addition?.supplementMeldIndex!==undefined
                ? addition.gangPlayer.name+' 补毛 '+addition.gangTile.name+'：'+(this.claimOptions[0]?'胡 / 过（胡优先）':'碰 / 过（不可吃）')
                : this.claimOptions[0] ? '可以胡牌：胡或过（胡优先）' : '请选择吃 / 碰 / 杠，或点“过”', 99);
        } else {
            const actor = state.members.find(m => m.id === state.actingId);
            this.table.showMessage('房间 ' + state.code + ' · 等待 ' + (actor?.name ?? '其他玩家') + ' 行动', 99);
        }
        if (this.onlineStatus) this.table.showMessage(this.onlineStatus, 99);
    }
    private beforeGangDraw(player: Player): void {
        this.clearInput(); this.human = player; this.drawn = null; this.claim = false;
        this.table.refreshAll(this.session!);
        const choices = getRiichiChoices(player, this.session!.allowQi);
        this.actions.showGangChoices([
            ...choices.map(choice => ({label: '报听：' + choice.label, run: () => this.perform(() => this.session!.playerBeforeGangDraw(player, choice.key))})),
            {label: '不报听，直接补牌', run: () => this.perform(() => this.session!.playerBeforeGangDraw(player))}
        ]);

        this.table.showMessage('杠后尚未补牌：可以先报听锁定听口，或直接从尾部补牌', 99);
    }
    private humanTurn(p: Player, drawn: Tile | null): void {
        this.table.refreshAll(this.session!);
        this.human = p;
        this.drawn = drawn;
        this.claim = false;
        this.mode = 'discard';
        this.selected = null;
        this.options = this.session!.computeHumanOptions(p, drawn);
        this.actions.showForTurn(this.options);
        const playable = p.state.riichi === RiichiType.None ? p.hand.map(t => t.id) : drawn ? [drawn.id] : [];
        this.table.setPlayable(playable);
        const preview=this.session!.pendingSelfWin,seconds=preview?Math.max(0,Math.ceil((preview.deadline-Date.now()-(this.friend?.state?.serverNowOffset??0))/1000)):0;
        this.table.showMessage(preview?.playerId===p.id?'你已自摸 · '+seconds+' 秒后自动胡牌，仍可操作':this.options.canWin ? (this.options.autoDiscard ? '已报听 · 自摸自动胡牌' : '可以自摸：选择“胡”结算，或继续出牌') :
            p.state.riichi === RiichiType.None ? '轮到你：点牌选中，再点一次或“出牌”确认' : '已报听 · 自动打出新摸牌；可点击手牌查看余量，有杠时可及时选择', 99);
    }
    private clickTile(tile: Tile): void {
        if (!this.session)
            return;
        const local = this.session.getPlayer(this.table.localSeat);
        if (!local.hand.some(t => t.id === tile.id))
            return;
        this.table.inspectTile(this.session, tile);
        if (!this.human || this.human !== local || this.claim || this.session.phase !== SessionPhase.PlayerTurn
            || this.session.currentSeat !== local.seat)
            return;
        if (this.options?.autoDiscard && this.mode === 'discard') return;
        if (this.mode === 'riichi' && !this.session.getRiichiDiscards(local).some(t => t.id === tile.id))
            return;
        if (this.mode === 'discard' && local.state.riichi !== RiichiType.None && tile.id !== this.drawn?.id) {
            this.table.showMessage(this.options?.canWin ? '已经自摸！此牌仅查看余量，仍可点击金色“胡”结算' : '此牌仅查看余量；报听已锁定，只能打出新摸牌', 99);
            return;
        }
        if (this.mode === 'gang' || this.mode === 'riichiWait') {
            return;
        }
        if (this.selected?.id === tile.id) {
            this.confirmDiscard(tile);
            return;
        }
        this.selected = tile;
        const ids = this.mode === 'riichi' ? this.session!.getRiichiDiscards(this.human).map(t => t.id) :
            this.human.state.riichi === RiichiType.None ? this.human.hand.map(t => t.id) : this.drawn ? [this.drawn.id] : [];
        this.table.setPlayable(ids, tile.id);
        this.table.showMessage('已选 ' + tile.name + '；再次点击确认' + (this.mode === 'riichi' ? '报听' : '出牌'), 99);
    }
    private confirmDiscard(tile: Tile): void {
        const riichi = this.mode === 'riichi';
        if (riichi) {
            const simulated = { ...this.human!, hand: this.human!.hand.filter(t => t.id !== tile.id) };
            const choices = getRiichiChoices(simulated, this.session!.room.config.allowQiXiaoDui);
            if (choices.length > 1) {
                this.mode = 'riichiWait';
                this.actions.showGangChoices(choices.map(choice => ({ label: choice.label, run: () => this.perform(() => this.session!.playerDeclareRiichi(this.human!, tile, choice.key)) })));
                this.table.showMessage('选择报听听口；单吊只锁定所选一张，其他听牌不能胡；“过”可取消', 99);
                return;
            }
            this.perform(() => this.session!.playerDeclareRiichi(this.human!, tile, choices[0]?.key));
            return;
        }
        this.perform(() => this.session!.playerDiscard(this.human!, tile));
    }
    private clearInput(): void { this.actions.hide(); this.table.setPlayable([]); this.table.clearInspection(); this.selected = null; this.mode = 'discard'; }
    private perform(action: () => boolean): void {
        const wasClaim = this.claim;
        this.clearInput();
        if (action())
            return;
        if (wasClaim) {
            this.actions.showForClaim(...this.claimOptions);
            this.table.showMessage('操作未完成，请重新选择', 99);
        }
        else if (this.session?.phase === SessionPhase.PlayerTurn && this.human)
            this.humanTurn(this.human, this.drawn);
    }
}
