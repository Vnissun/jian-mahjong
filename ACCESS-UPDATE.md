# 本次更新：补牌前报听、随机洗牌、好友密码

## 新规则

每次杠或补毛结算之后、实际尾部补摸之前，如果暗手已经满足报听条件，会出现“报听：听口方案”和“不报听，直接补牌”。此时尚未读取或发送尾牌，声明后才补摸，可杠后报听自摸。已报听者沿用原听口直接补摸，不能重新换听；无合法报听条件则直接补摸。选择超时按不报听补牌处理。

继续遵循已确认的风补风、元补元规则。中发白杠第四张仍只允许元牌，此次没有恢复数牌混入字杠。

洗牌由服务端 Node.js crypto.randomInt 驱动 Fisher–Yates；网页单机使用浏览器 crypto.getRandomValues（无此接口才回退普通随机）。整副136张牌先洗好，起手牌、正常区及尾部补牌均按牌墙顺序取牌，没有根据听牌或输赢提高/降低命中率。不保证短期每手牌的观感平均。

## 密码

访问密码按要求设为 `CHANGE_ME_ACCESS_PASSWORD`。服务端校验密码，网页不包含正确密码；登录后使用 HttpOnly 会话 Cookie，默认24小时，服务重启后需要重新登录。邀请链接不包含密码，好友需要自己输入。

宝塔生产配置 `server/production.json` 新增：

```json
{
  "host": "127.0.0.1",
  "port": 7458,
  "publicUrl": "https://mahjong.mpjian.com",
  "accessPassword": "CHANGE_ME_ACCESS_PASSWORD"
}
```

保留你现有的域名/监听配置，可只添加 accessPassword。环境变量 ACCESS_PASSWORD 优先于配置文件；不要保留旧的空值或其他密码。服务端默认亦启用本密码。

## 宝塔更新：这次必须更新服务端，不能只上传手机网页包

1. 等所有正在玩的牌局结束，再在宝塔停止本项目 Node 进程（重启会清空内存牌局）。
2. 备份整个 `/www/wwwroot/ji-an-mahjong` 和现有 `server/production.json`。
3. 上传最新 `ji-an-mahjong-online.tar.gz` 至项目根目录并解压覆盖，确保 `server/access.cjs`、`server/rooms.cjs`、`server/dist` 和 `build/web-repaired` 均来自同一新版包。
4. 恢复真实域名配置，并添加上述 accessPassword。启动入口仍为 `server/start-production.cjs`，Node.js仍选16.20.2，单进程fork。
5. 新版同时支持两种方式：已有“静态首页＋`/api/`代理”可保持原配置，新首页会先请求 `/api/access/status`，未登录先显示密码框，通过后才启动游戏。也可将全站交给 Node，由服务端连网页资源一并检查；选此方式时，在网站设置→配置文件中使用下面的整站代理，删除旧的重复 `location /`，保留证书、域名、日志等设置：

```nginx
location ^~ / {
    proxy_pass http://127.0.0.1:7458;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 35s;
    proxy_send_timeout 35s;
    proxy_buffering off;
    proxy_cache off;
    client_max_body_size 16k;
}
```

`^~ /` 会使网页资源也走服务端密码检查，优先于站点的静态扩展名缓存规则。保留已有更具体的 `/.well-known/` 证书验证路径。整站代理能同时保护网页资源。使用静态首页方式时，资源本身公开可下载，但游戏启动需要密码，对战API始终由服务端阻拦未登录请求。首次宝塔部署其他步骤仍参考 BAOTA-NODEJS.md。

6. 保存配置并按宝塔提示重载 Nginx，启动本项目 Node 进程。HTTPS健康检查 `/api/health` 继续公开，只返回 `{"ok":true}`。
7. 清理CDN/站点缓存；不能缓存登录页或/api。新开无痕窗口访问正式域名及好友邀请，应该先看到密码页。输入错误密码应失败；正确密码后回到原邀请地址，继续加入房间。

完整包包含手机横屏修复。这次不要使用之前“无需重启”的手机网页增量包，因为新增了服务端状态和密码校验。
