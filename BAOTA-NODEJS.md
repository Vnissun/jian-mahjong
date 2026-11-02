# 宝塔 + Node.js：集安麻将好友对战完整部署教程

最新版本已增加访问密码。更新网页和服务端后，本文的静态首页＋/api代理方式也会先显示密码；也可按 ACCESS-UPDATE.md 使用整站代理保护页面资源。

好友房支持房主添加/移除机器人，真人全部准备后可直接开局并自动补齐空位；详见 BOTS-UPDATE.md。

适用：Linux 服务器已经安装宝塔，有自己的域名。本教程使用 Node.js 运行对战服务，Nginx 提供游戏页面并把 `/api/` 转发给 Node。无需 Docker、数据库或在服务器安装 Cocos。

本文已按你的正式域名 `mahjong.mpjian.com` 配置，无需替换域名；示例项目目录固定为 `/www/wwwroot/ji-an-mahjong`。首次部署建议单独使用一个子域名，不占用已有网站。

## 1. 本地用哪个文件夹，上传什么

现在正在修改的完整工程位于：

```text
D:\Desktop\dl.mpjian.com\ji-an-mahjong\NewProject
```

上传最新生成的这一个压缩包即可：

```text
D:\Desktop\dl.mpjian.com\ji-an-mahjong\NewProject\release\ji-an-mahjong-online.tar.gz
```

包内已经包含网页和编译好的服务端。不要只上传 `build/web-repaired`，它只有页面；好友房还需要 `server`。运行必需内容及用途：

| 包内路径 | 用途 |
| --- | --- |
| `build/web-repaired/` 整个目录 | 游戏网页、Cocos 引擎和所有资源 |
| `server/server.cjs` | HTTP、房间接口及静态资源服务 |
| `server/rooms.cjs` | 房间、身份、服务端行动校验与同步 |
| `server/dist/` 整个目录 | 编译好的集安麻将规则，包括本次报听杠牌修复 |
| `server/start-production.cjs` | 宝塔生产启动入口 |
| `server/production.json` | 修改域名、监听地址和端口 |
| `package.json` | 宝塔识别启动命令；选择 `start:production` |
| `ecosystem.config.cjs` | 使用 PM2 配置文件方式时的单进程配置 |

包内其他源码和 Docker 文件供以后维护使用；初次部署不需要执行编译。Cocos 的 `library`、`temp`、本机 `node_modules`、外层历史 `assets` 都不用上传。压缩包整包上传最方便，也能保持正确的相对目录。

## 2. 域名和端口

在域名管理服务商添加 A 记录，例如：主机记录 `mahjong`，记录值填写你的服务器公网 IPv4，得到 `mahjong.你的域名`。

云服务器安全组和宝塔系统防火墙需要允许网站访问 80、443。Node 的 7458 只监听 `127.0.0.1`，不用向公网开放。好友最终访问域名，不访问面板端口或 7458 端口。

## 3. 在宝塔安装运行环境

1. 进入 **软件商店**，安装 **Nginx**；已经安装则保持现有版本。
2. 搜索 **Node.js 版本管理器**（某些版本名称为 Node 版本管理器），安装并打开。
3. 安装并选择 **Node.js 16.20.2**。
4. 如果要在宝塔终端执行 `node` 命令，设置该版本为命令行版本；在终端执行 `node -v`，应显示 `v16.20.2`。

本项目服务端运行没有第三方依赖，使用交付包时无需执行 `npm install`、`npm run build:server` 或安装 MySQL。宝塔如果提示安装依赖，可以跳过；`server/dist` 已是可运行的 JavaScript。

## 4. 上传并解压，确认没有套错目录

1. 宝塔左侧 **文件** → 进入 `/www/wwwroot`。
2. 新建目录 `ji-an-mahjong`，进入此目录。
3. 点击 **上传**，上传本地最新 `ji-an-mahjong-online.tar.gz`。
4. 上传完成后右键该压缩包 → **解压**，目标选当前目录 `/www/wwwroot/ji-an-mahjong`。
5. 解压完成后检查下列路径直接存在：

```text
/www/wwwroot/ji-an-mahjong/
├── package.json
├── ecosystem.config.cjs
├── BAOTA-NODEJS.md
├── server/
│   ├── server.cjs
│   ├── rooms.cjs
│   ├── start-production.cjs
│   ├── production.json
│   └── dist/
│       ├── core/
│       ├── config/
│       ├── data/
│       └── game/
└── build/
    └── web-repaired/
        ├── index.html
        ├── assets/
        └── ...其他资源全部保留
```

如果实际多了一层目录，例如 `ji-an-mahjong/某个压缩包名称/server`，将里面的文件移动到上述项目根目录后再继续。网页 `index.html` 保持在 `build/web-repaired` 内，不要单独移到项目根目录。运行用户选 `www` 时，确保 `www` 用户能读取整个项目，目录通常为 755、文件为 644；在宝塔文件面板的权限功能中设置即可，不必使用 777。

## 5. 修改生产配置

宝塔文件面板打开：

```text
/www/wwwroot/ji-an-mahjong/server/production.json
```

改成：

```json
{
  "host": "127.0.0.1",
  "port": 7458,
  "publicUrl": "https://mahjong.mpjian.com",
  "accessPassword": "CHANGE_ME_ACCESS_PASSWORD"
}
```

更新包已填写上述域名与密码，可直接使用。`publicUrl` 不加房间号、不加末尾路径。这个启动方式读取 `production.json`；不需要另配 `.env`。如果宝塔启动配置里已有 `HOST`、`PORT`、`PUBLIC_URL` 环境变量，它们会覆盖此文件，应清除旧值或与本文件保持一致。更新未生效时参阅 UPDATE-CHECK.md。

## 6. 用宝塔启动 Node 对战进程

常见入口为 **网站 → Node 项目 → 添加 Node 项目**；部分版本使用软件商店中的 **PM2 管理器 → 添加项目**。面板名称略有不同，但以下值相同。

| 设置项 | 填写值 |
| --- | --- |
| 项目名称 | `ji-an-mahjong` |
| 项目目录 / 运行目录 | `/www/wwwroot/ji-an-mahjong` |
| Node 版本 | Node.js 16.20.2 |
| 启动选项（从 package.json 选择） | `start:production` |
| 若面板要求启动文件 | `/www/wwwroot/ji-an-mahjong/server/start-production.cjs` |
| 若面板要求自定义启动命令 | `node server/start-production.cjs` |
| 项目端口 | `7458` |
| 运行用户 | `www` |
| 进程数 / 实例数 | **1** |
| 模式 | **fork / 单进程** |
| 域名绑定 | 此处暂不绑定，下一步在网站中配置 |

启动选项、启动文件、自定义命令属于不同面板的替代入口，只选其中一种，不要启动三份。开启面板提供的进程守护、异常自动重启和开机启动。不要启用文件监控自动重启，也不要使用 `cluster` 或多实例：当前房间在单个进程内存中。

若使用 PM2 配置文件方式，交付包已有 `ecosystem.config.cjs`，已指定默认解释器 `/www/server/nodejs/v16.20.2/bin/node`，安装路径不同时修改其中的 `interpreter`（或配置 `NODE_BINARY`）。可在 PM2 管理器中选择它；已安装且命令行可用 PM2 的环境也可以在项目根目录执行：

```sh
cd /www/wwwroot/ji-an-mahjong
pm2 start ecosystem.config.cjs
pm2 save
```

使用面板 Node 项目后就不必再执行这两条命令，避免重复占用 7458。

启动成功应在运行日志看到：

```text
集安麻将已启动：http://127.0.0.1:7458
```

在宝塔 **终端** 执行：

```sh
curl http://127.0.0.1:7458/api/health
```

应得到：

```json
{"ok":true}
```

这一步不通过，先检查 Node 项目日志和启动配置，不要继续用域名排查。

使用你指定的版本时，可用以下绝对路径检查，避免面板选择了 16 而终端仍执行其他版本：

```sh
/www/server/nodejs/v16.20.2/bin/node -v
/www/server/nodejs/v16.20.2/bin/node /www/wwwroot/ji-an-mahjong/server/healthcheck.cjs
```

第一条输出 `v16.20.2`；第二条用于服务启动后的健康检查，成功时退出码为 0。若宝塔实际安装目录不同，以版本管理器显示的可执行文件路径为准。正式启动入口仍是 `server/start-production.cjs`；不要把 `healthcheck.cjs` 当作启动文件。

## 7. 创建域名网站，网站目录指向已构建的网页

在宝塔 **网站 → PHP 项目 → 添加站点**（这里只用它创建普通 Nginx 网站，不运行 PHP）：

- 域名：`mahjong.mpjian.com`。
- 网站根目录：`/www/wwwroot/ji-an-mahjong/build/web-repaired`。
- PHP 版本：**纯静态**。
- 数据库、FTP：不创建。

一个域名只建立一个站点。Node 项目上不要再额外绑定同一个域名。保存后检查 **站点设置 → 网站目录**，确认根目录是上面的 `build/web-repaired`，运行目录为 `/`。

此时访问 `http://mahjong.mpjian.com` 应能看到大厅。好友开房接口还需要下一步代理配置。

## 8. 将 `/api/` 请求转给 Node.js

本教程采用“网页由 Nginx 提供、只有 `/api/` 转发给 Node”的方式。不要同时再加一条全站 `/` 反向代理。

打开 **网站 → 对应域名 → 设置 → 配置文件**。在该域名的 `server { ... }` 内、最后一个关闭大括号之前，增加：

```nginx
location ^~ /api/ {
    proxy_pass http://127.0.0.1:7458;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 35s;
    proxy_send_timeout 35s;
    proxy_buffering off;
    proxy_cache off;
    client_max_body_size 1m;
}
```

`proxy_pass` 的 7458 后面**不加斜杠**，这样后端才能收到完整 `/api/rooms/...` 路径。`Host` 保持 `$host`。本程序使用 HTTP 长轮询同步，35 秒读取超时要保留；不需要配置 WebSocket。

同一站点只保留一个 `/api/` location；已有其他项目使用 `/api/` 时，使用单独子域名部署本游戏。保留宝塔原有证书验证、静态资源、日志等配置，点击保存，按面板提示重载 Nginx。如果提示语法错误，检查是否放在 `server` 内、是否重复添加。

再在宝塔终端执行：

```sh
curl http://mahjong.mpjian.com/api/health
```

应同样返回 `{"ok":true}`。若大厅能打开而该地址 404，通常是 `/api/` 代理未生效或路径被截断；502 表示 Nginx 没有连上 Node 的 7458。

## 9. 配置 HTTPS

宝塔 **网站 → 对应域名 → 设置 → SSL**，使用你已有证书或申请 Let's Encrypt 证书，完成域名验证后部署到此站点。证书配置成功后开启 **强制 HTTPS**。

然后测试：

```text
https://mahjong.mpjian.com/
https://mahjong.mpjian.com/api/health
```

第一个显示游戏大厅，第二个返回 `{"ok":true}`。HTTPS 也能让浏览器的“复制邀请”更稳定。若域名暂未解析生效，先修好 DNS 再申请证书；已有证书可直接部署。

## 10. 实际邀请好友开一桌

1. 你使用正式 HTTPS 域名打开游戏。
2. 选好底分、满贯、封圈、七小对、吃牌，点 **好友开房**。
3. 输入昵称，进入六位房间号的等待界面。
4. 点 **复制邀请**，将链接自己发给三位好友。示例：`https://mahjong.mpjian.com/?room=123456`。
5. 好友点击链接输入自己的昵称；也能从同一域名的“加入房间”输入六位房间号。
6. 四人都点 **准备**，房主点 **房主开局**。
7. 各人只看到自己的暗手；报听、吃碰杠胡都由同一服务端判定。
8. 一局结束后四人点 **下一局**，准备齐才继续。

应从正式域名开房后再复制链接；本机 `127.0.0.1` 或局域网地址生成的链接不能跨网络邀请。刷新原标签页可以恢复当前座位，短时断网会自动重连。换浏览器、清空会话、换设备则没有原身份令牌。

## 11. 后续更新怎么做

1. 等桌上所有对局结束；当前服务重启会清空内存房间。
2. 在宝塔停止本项目 Node 进程。
3. 备份服务器当前整个项目目录和 `server/production.json`。
4. 上传新的部署包，解压覆盖项目内容。代码有新增或删除时，使用干净的新目录部署更稳妥。
5. 恢复你自己的 `server/production.json` 域名配置，确认网页和服务端来自同一包。
6. 启动 Node 项目；检查本机和 HTTPS 两个 `/api/health`。
7. 浏览器强制刷新后重新开房。不要只更新网页或只更新 `server/dist`。

## 12. 常见问题

| 现象 | 检查位置 |
| --- | --- |
| `Cannot find module ./dist/...` | `server/dist` 是否整目录上传，是否多套一层压缩包目录 |
| `EADDRINUSE: 7458` | 宝塔是否重复启动同一项目；先停止重复进程，不要同时用面板和终端启动两份 |
| `node: command not found` | Node 版本管理器设置命令行版本为 16.20.2，或使用 `/www/server/nodejs/v16.20.2/bin/node` |
| 本机健康检查失败 | Node 项目运行日志、启动入口、JSON 语法、文件读取权限 |
| 域名健康检查 404 | `/api/` location 是否在正确站点，proxy_pass 是否误加末尾斜杠 |
| 域名健康检查 502 | Node 是否运行，是否监听 127.0.0.1:7458，端口是否填错 |
| 页面白屏、JS 404 | 网站根目录是否是 `build/web-repaired`；资源文件是否完整，清理旧缓存 |
| `来源无效` | Nginx 是否传递 `Host $host`，production.json 是否为真实域名，是否混用域名/IP |
| 好友房间不存在 | 是否使用相同正式域名，Node 是否被重启，是否开了多个进程 |
| 等待室有时少人、状态不同步 | 先检查实例数固定为 1，再检查长轮询代理读取超时及防护策略是否阻断 `/api/` |
| 修改代码后未生效 | TypeScript 源码需本地重新构建服务端和网页，再上传整包；线上不能直接运行 assets 下的 .ts |

## 本次规则与验证

报听后暗杠、已开门点杠、已有碰牌加杠、风杠/元杠补毛均逐次校验原听口。用于原顺子或将牌的牌不能拿去暗杠。合法杠或补毛后仍可杠后自摸、打尾部补牌点炮；杠分、补毛和胡牌倍数按现有规则计算。

当前版本没有战绩数据库，所有人离线 30 分钟回收房间；服务重启不保留未完成的牌局。应保持单实例。无需为此项目创建数据库。

面板入口参考：[宝塔官方 Node.js / PM2 部署教程](https://docs.bt.cn/practical-tutorials/nodejs-pm2-deployment)、[宝塔官方反向代理说明](https://docs.bt.cn/user-guide/site/php/site-config/reverse-proxy)。本文中的程序路径、启动文件、端口和 `/api/` 配置均针对本项目。
