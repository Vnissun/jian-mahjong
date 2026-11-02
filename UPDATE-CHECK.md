# 宝塔更新与版本确认

网站已配置为 https://mahjong.mpjian.com ，Node.js 16.20.2，端口7458，访问密码保持不变。域名无需再修改。

## 上传到哪里

默认项目根目录 `/www/wwwroot/ji-an-mahjong`。如果你之前在宝塔填写了别的运行目录，请使用宝塔里实际填写的目录，不要另建一份让旧项目继续运行。

1. 等现有牌局结束，宝塔“Node项目”停止本游戏进程。重启会结束内存中的房间。
2. 备份整个项目；上传最新 `ji-an-mahjong-online.tar.gz`。
3. 解压到 **Node项目的运行目录**，覆盖文件，不要多套一层目录。
4. 核对 `server/start-production.cjs`、`server/release.json`、`build/web-repaired/assets/main/index.js`、`build/web-repaired/sounds/peng.wav` 均在该根目录下。
5. Node启动文件设为 `server/start-production.cjs`，或启动命令 `node server/start-production.cjs`。只运行一个实例。
6. `server/production.json` 已填正式域名；如果你修改过监听端口/地址，保留实际值。如果宝塔配置了 `PUBLIC_URL` 环境变量，请设为 `https://mahjong.mpjian.com` 或删除旧值，因为环境变量优先。
7. 启动Node项目。覆盖文件后必须重启进程，否则服务端规则仍是旧版本。

## 怎样确认更新成功

浏览器打开 https://mahjong.mpjian.com/api/health ，新版本会返回：

- `version`：本次更新包版本，与项目 `server/release.json` 相同。
- `startedAt`：本次Node进程启动时间，应是刚重启的时间。
- `webMatchesRelease: true`：Node当前提供的网页主脚本与本次更新包匹配。

如果只有 `{"ok":true}`，说明响应来自旧服务代码，需要核对启动目录、启动文件、7458端口的进程和反向代理目标。继续清浏览器缓存不能替代这个步骤。

如果 `webMatchesRelease` 是 false，说明该进程读取的网页和版本清单不属于同一更新包，重新完整覆盖并重启。这个检测验证Node提供的页面，若Nginx另行提供静态页面，还必须核对下一项。

## Nginx检查

如果整个网站反向代理到 `http://127.0.0.1:7458`，通常无需修改。不要同时保留另一个旧目录的JS/CSS静态规则，让它绕过Node。

如果你使用原教程“静态首页 + /api代理”方式，宝塔该网站的根目录必须指向 **同一个Node项目根目录下的 `build/web-repaired`**。例如 `/www/wwwroot/ji-an-mahjong/build/web-repaired`。特别检查Nginx单独匹配JS/CSS的location、CDN和缓存插件，避免仍然提供旧资源。

## 浏览器刷新什么

- CMD的DNS缓存只影响域名解析，不会更新JS或游戏界面，无需继续清DNS缓存。
- 电脑关闭旧游戏标签页后重新打开域名；也可以 Ctrl+F5 强制刷新，或开无痕窗口验证。
- 手机关闭该网站所有旧标签页后重新打开；仍旧时在浏览器设置中清除此站点的网站数据/缓存，然后重新登录。如果是“添加到主屏幕”的入口，也需完全关闭并重新打开。
- 若接入CDN或Nginx缓存，清理该域名的HTML/JS缓存。项目自身已对资源返回 `Cache-Control: no-store`。
- 不要用 `127.0.0.1:7457` 的旧预览窗口验证公网更新。

新版本声音区有“试听”按钮；结算会出现“本次积分”“当前总分”“当前积分”和“本局杠分汇总”。已打开的旧页面不会自动替换正在运行的代码，需要重新加载。
