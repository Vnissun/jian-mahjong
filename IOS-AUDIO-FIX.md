# iOS Safari / 微信音频加载失败修复

线上检查发现：带 `Range: bytes=0-1` 的音频请求仍收到HTTP 200和完整文件，没有Content-Range。iOS媒体加载会使用分段请求。本次为Node静态文件服务补齐分段响应：206、Content-Range、Accept-Ranges、Content-Length，以及超范围416和HEAD响应。原语音与游戏规则不变。

## 已部署站点的最小更新

1. 等当前牌局结束，宝塔停止本游戏Node项目。重启会结束内存中的房间。
2. 备份正在运行的项目中的 `server/server.cjs`。
3. 将 `mahjong-ios-audio-fix.tar.gz` 解压覆盖到该Node项目根目录，确认覆盖的是 `server/server.cjs`，不要多套一层文件夹。
4. 启动原Node项目，继续使用 `server/start-production.cjs`、Node.js16.20.2、单实例。
5. iPhone重新打开 https://mahjong.mpjian.com ，登录后点击“试听”。本次修复在服务端，无需清理手机缓存。

也可使用最新完整 `ji-an-mahjong-online.tar.gz` 覆盖更新，保留实际域名、端口等配置并重启Node；完整包包含之前局末统一结算杠分等改动。

## 如何验证服务器已生效

手机无需使用以下命令。运维检查需先登录获取Cookie，再请求音频：

```sh
curl -c /tmp/mahjong-audio-cookie -H 'Content-Type: application/json' --data '{"password":"CHANGE_ME_ACCESS_PASSWORD"}' https://mahjong.mpjian.com/api/access/login
curl -b /tmp/mahjong-audio-cookie -H 'Range: bytes=0-1' -D - https://mahjong.mpjian.com/sounds/peng.wav -o /dev/null
rm -f /tmp/mahjong-audio-cookie
```

正确应出现HTTP 206、`Content-Range: bytes 0-1/47066`、`Content-Length: 2`，以及 `Accept-Ranges: bytes`。如果仍为200且返回整个音频，需要核对7458对应的进程是否已重启，以及Nginx反向代理是否指向该项目。登录后再测，否则收到的是登录页。

已在Node16.20.2验证分段请求、音频字节、HEAD、越界、登录保护，并进行桌面浏览器播放回归；尚无真实iPhone设备可用于实机确认。
