import {describe,it,assertTrue,assertEqual} from './runner';
import {createPlayer} from '../assets/scripts/core/Player';
import {createRoom} from '../assets/scripts/core/Room';
import {SeatWind,Suit} from '../assets/scripts/core/Types';
import {createTile} from '../assets/scripts/core/Tile';
import {DEFAULT_ROOM_CONFIG} from '../assets/scripts/config/GameConfig';
import {FriendClient} from '../assets/scripts/net/FriendClient';
import {FriendSession} from '../assets/scripts/net/FriendSession';
function fixture(){const players=[SeatWind.East,SeatWind.South,SeatWind.West,SeatWind.North].map((seat,i)=>createPlayer(String(i),'玩家'+i,seat));const client=new FriendClient();client.state={code:'123456',ownerId:'0',localId:'1',config:{...DEFAULT_ROOM_CONFIG},players,room:createRoom('123456','0',{...DEFAULT_ROOM_CONFIG},players),gamePhase:'playerTurn',currentSeat:SeatWind.East,remaining:69,kongRemaining:14,prompt:null};return client;}
describe('联机客户端镜像',()=>{
 it('公开补毛响应仅映射公开牌和来源，响应结束后清除',()=>{const client=fixture(),tile=createTile(1000,Suit.Feng,2);client.state.gangClaim={playerId:'0',tile,supplementMeldIndex:0};const session=new FriendSession(client);assertEqual(session.pendingRobbingGang!.gangPlayer.id,'0');assertEqual(session.pendingRobbingGang!.gangTile.id,1000);assertEqual(session.pendingRobbingGang!.supplementMeldIndex,0);client.state.gangClaim=null;session.update(client.state);assertEqual(session.pendingRobbingGang,null);});
 it('四人开局快照可初始化，不使用零人房间工厂',()=>{const client=fixture(),session=new FriendSession(client);assertEqual(session.players.length,4);assertEqual(session.room.roomId,'123456');assertEqual(session.wall.drawStack.length,69);assertEqual(session.lastDrawn,null);});
 it('后续快照不会清空原始网络玩家数组，也不泄漏他家摸牌',()=>{const client=fixture(),session=new FriendSession(client);session.update(client.state);assertEqual(client.state.players.length,4);assertEqual(session.players.length,4);assertEqual(session.lastDrawn,null);assertTrue(session.isAI(session.players[0]));assertTrue(!session.isAI(session.players[1]));});
 it('无本地行动请求时不显示操作，只有服务器指定时可出牌',()=>{const client=fixture(),session=new FriendSession(client);assertTrue(!session.computeHumanOptions(session.players[1],null).canDiscard);client.state.prompt={kind:'turn',drawn:null,options:{canDiscard:true}};session.update(client.state);assertTrue(session.computeHumanOptions(session.players[1],null).canDiscard);});
});
