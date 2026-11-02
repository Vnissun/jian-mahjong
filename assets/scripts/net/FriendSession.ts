import { GameSession, HumanActionOptions } from '../game/GameSession';
import { Player } from '../core/Player';
import { Tile } from '../core/Tile';
import { SeatWind } from '../core/Types';
import { createRoom } from '../core/Room';
import { FriendClient } from './FriendClient';
export class FriendSession extends GameSession {
    snapshot: any;
    constructor(readonly client: FriendClient) { super(createRoom(client.state.code, client.state.ownerId, client.state.config, client.state.players.slice()), [], []); this.update(client.state); }
    update(state: any): void {
        this.snapshot = state;
        this.players.splice(0, this.players.length, ...state.players);
        Object.assign(this.room, state.room, { players: this.players });
        this.phase = state.gamePhase; this.currentSeat = state.currentSeat;
        this.lastDiscard = state.lastDiscard; this.lastDiscarder = this.players.find(p => p.id === state.lastDiscarderId) ?? null;
        this.lastDrawn = state.prompt?.kind === 'turn' ? state.prompt.drawn : null;
        this.pendingSelfWin=state.autoSelfWin?{...state.autoSelfWin,tileId:this.lastDrawn?.id??-1}:null;
        this.pendingRobbingGang = state.gangClaim ? {gangPlayer:this.getPlayerById(state.gangClaim.playerId)!,gangTile:state.gangClaim.tile,supplementMeldIndex:state.gangClaim.supplementMeldIndex} : null;
        this.wall = { drawStack: new Array(state.remaining), drawIndex: 0, kongStack: new Array(state.kongRemaining), kongIndex: 0 };
    }
    isAI(p: Player): boolean { return p.id !== this.client.state.localId; }
    computeHumanOptions(_p: Player, _tile: Tile | null): HumanActionOptions { return this.snapshot.prompt?.options ?? { canDiscard:false,canAnGang:false,canJiaGang:false,canRiichi:false,canWin:false,drawnTile:null }; }
    getRiichiDiscards(p: Player): Tile[] { return p.hand.filter(t => this.snapshot.prompt?.riichiDiscards?.some(x => x.tileId === t.id)); }
    getConcealedGangChoices(_p: Player): any[] { return this.snapshot.prompt?.concealed ?? []; }
    getSupplementGangChoices(_p: Player): any[] { return this.snapshot.prompt?.supplements ?? []; }
    getHumanChiOptions(_p: Player): Tile[][] { return this.snapshot.prompt?.chi ?? []; }
    private send(type: string, payload: any = {}): boolean { void this.client.action(type, payload); return true; }
    playerBeforeGangDraw(_p: Player, choiceKey?: string): boolean { return this.send('beforeGang', {choiceKey}); }
    playerDiscard(_p: Player, tile: Tile): boolean { return this.send('discard', { tileId: tile.id }); }
    playerDeclareRiichi(_p: Player, tile: Tile, choiceKey?: string): boolean { return this.send('riichi', { tileId: tile.id, choiceKey }); }
    playerSelectedConcealedGang(_p: Player, tiles: Tile[]): boolean { return this.send('anGang', { tileIds: tiles.map(t => t.id) }); }
    playerAnGang(_p: Player, tile: Tile): boolean { const choice = this.getConcealedGangChoices(_p).find(c => c.tiles.some(t => t.id === tile.id)); return !!choice && this.playerSelectedConcealedGang(_p, choice.tiles); }
    playerJiaGang(_p: Player, tile: Tile): boolean { return this.send('jiaGang', { tileId: tile.id }); }
    playerSupplementGang(_p: Player, meldIndex: number, tile: Tile): boolean { return this.send('supplement', { meldIndex, tileId: tile.id }); }
    playerClaimChi(_p: Player, tiles: Tile[]): boolean { return this.send('chi', { tileIds: tiles.map(t => t.id) }); }
    playerClaimPeng(_p: Player): boolean { return this.send('peng'); }
    playerClaimMingGang(_p: Player): boolean { return this.send('mingGang'); }
    playerClaimWin(_p: Player): boolean { return this.send('win'); }
    playerSelfWin(_p: Player, _tile: Tile): boolean { return this.send('win'); }
    playerPass(_p: Player): boolean { return this.send('pass'); }
    stop(): void { /* The transport is owned by GameApp, not this read-only view. */ }
}
