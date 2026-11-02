# 集安麻将好友房部署

使用宝塔和 Node.js 请优先按 [BAOTA-NODEJS.md](BAOTA-NODEJS.md) 操作，含具体上传路径、面板字段和逐步排错；下文保留 Docker 和通用部署方式。

本版本新增六位房间号、邀请链接、四人准备开局、服务端规则及计分、按座位显示手牌、刷新重连、自动重连、超时摸打/过牌、四人确认下一局。保留单机练习。

## 在现有 Linux 服务器部署（推荐独立子域名）

使用已有网站的一个独立子域名，例如 `mahjong.mpjian.com`。将该域名 DNS 指向服务器，并使用现有 Nginx/宝塔/1Panel 的证书功能配置 HTTPS。

1. 将交付的 `ji-an-mahjong-online-*.tar.gz` 上传到服务器，解压到单独目录，例如 `/opt/ji-an-mahjong`。
2. 在该目录新建 `.env`，写入真实域名：

```dotenv
PUBLIC_URL=https://mahjong.mpjian.com
```

3. 服务器已有 Docker 与 Compose 时执行：

```sh
docker compose up -d --build
docker compose logs --tail=100 mahjong
curl http://127.0.0.1:7458/api/health
```

健康检查应返回 `{"ok":true}`。容器端口只绑定服务器本机，通过 HTTPS 站点反向代理对外提供服务。保持单个服务实例；不能直接水平扩容到多个进程。

4. 在该域名现有 HTTPS `server {}` 中加入 `server/nginx.conf.example` 的 `location /` 配置。保留原有证书、443 监听和 `server_name`。若已有 `location /`，替换该域名对应的一项，不能重复添加。测试并重载：

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Nginx 将网站和 `/api/` 同时代理到 7458，长轮询读取超时至少 35 秒。不要将 `/api/` 代理到其他后端。域名站点请部署在 `/`，不要放到子路径。

5. 浏览器打开 `https://mahjong.mpjian.com`：选规则 → 好友开房 → 输入昵称 → 复制邀请。好友点链接输入自己的昵称加入；四人均准备后由房主开局。也可在同一网站输入六位房间号加入。

邀请链接只有房间号，不含身份令牌。玩家身份保存在该浏览器标签页会话中，刷新原标签页可恢复座位；换设备或清除会话后不能直接冒用原身份。

## 不使用 Docker

交付包已带编译后的服务端规则和网页，无需安装 Cocos、TypeScript 或运行 npm install。服务器使用 Node.js 16.20.2，然后在解压目录运行：

```sh
HOST=127.0.0.1 PORT=7458 PUBLIC_URL=https://mahjong.mpjian.com node server/server.cjs
```

用服务器已有的进程守护或 systemd 管理该命令，并按以上配置 HTTPS 反向代理。服务进程工作目录为解压目录。后台服务不能只依赖 SSH 终端常驻。

## 本机与局域网验证

源码目录先执行 `npm run build:server`，再执行 `npm start`，打开 `http://127.0.0.1:7458`。同一 Wi-Fi 的其他设备访问这台电脑的局域网 IP 和 7458 端口；如系统防火墙拦截，按本机管理方式开放该端口。分享本机 `127.0.0.1` 链接给另一台设备无效，应从对方可访问的地址开房。

浏览器正式联机验证：启动服务后执行 `npm run test:online`。逻辑测试执行 `npm test`，服务端测试执行 `npm run test:server`。

## 对局与运维约定

- 房间最多四人，开局后不允许新玩家顶替座位；房主等待中退出则转交房主。
- 玩家离线保留座位。出牌 60 秒未操作自动摸打（碰后自动打一张）；响应 45 秒未操作自动过。报听自动打新摸牌。
- 杠分、补毛分在局内暂存且不公开，胡牌或荒庄时统一结算，不参与满贯；飘胡仅胡牌额外 ×2。联机与单机使用同一份规则源码。
- 服务只发送自己的暗手及公开牌，不发送他家暗手、普通暗杠牌种或牌墙顺序。客户端提交动作和牌 ID，服务端验证身份、轮次、规则及状态版本。
- 当前为单实例内存房间，服务重启会清空未完成牌局；浏览器刷新及短时网络中断可恢复，服务重启不属于断线恢复。更新或重启服务前应先结束现有牌局。全部玩家离线 30 分钟后回收房间，最多同时 200 个房间。
- 本次不含账号注册、跨设备找回、战绩数据库、语音聊天或自动公网部署。公网访问需要完成本文件的服务器/域名配置。

服务端使用 Node.js 内置 HTTP，无运行时第三方依赖。HTTP 服务参考 [Node.js 官方文档](https://nodejs.org/download/release/v16.20.2/docs/api/http.html)。
