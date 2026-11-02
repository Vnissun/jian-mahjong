# 新素材界面更新（2026-10-16）

本次工程：D:\Desktop\dl.mpjian.com\ji-an-mahjong\NewProject。

## 已更新

- 使用你提供的 210 张 PNG：五方向明牌、立式暗牌、扣牌、双层牌墙、操作图标与头像。原图片没有被重绘、覆盖或拉伸。
- 图片按可见区域紧凑显示，并在手机宽屏上补偿图片比例。
- 大厅采用深翡翠绿、暖金、象牙白风格，集中展示本桌玩法以及开房、加入、练习入口。
- 好友房、登录页、声音控件、玩家信息卡、结算窗口统一风格。
- 吃碰杠胡等操作采用圆形图片按钮；四家牌墙按实际余牌减少。
- 结算保持居中，显示胡家手牌、副露和独立胡牌张；“查看牌桌”可以查看四家的剩余牌，随后返回结算。
- 规则与计分继续沿用现有版本；生产服务仍支持 Node.js 16.20.2。

## 宝塔更新

1. 下载本目录 release/ji-an-mahjong-online.tar.gz（这是最新的完整发布包）。
2. 等当前好友对局结束后，在宝塔停止本网站的 Node 项目。更新会重启内存中的房间。
3. 备份服务器项目目录，尤其是 server/production.json（域名、端口和访问密码配置）。
4. 把压缩包上传至原项目根目录并解压覆盖。根目录应同时有 package.json、server、build 等目录。不要把整个压缩包解到 build/web-repaired 里面。
5. 保留服务器原有的 server/production.json；如果解压覆盖了它，恢复备份。默认域名仍为 mahjong.mpjian.com。
6. 在宝塔重新启动 Node 项目。入口继续使用 server/start-production.cjs，Node 版本继续选择 16.20.2。
7. 打开 https://mahjong.mpjian.com/api/health，确认 webMatchesRelease 为 true，并确认 version 已变为新发布包的版本。
8. 重新打开网页。新大厅应显示“一桌好牌 / 一局相聚”，对局中的“胡”是红金色圆形图标。如果有 CDN 或自行配置的 Nginx 缓存，清除该站点缓存；微信中完全退出旧页面后再进入。

这次不能只上传 assets/resources 的图片：网站运行的是 Cocos 构建后的 build/web-repaired，整包中已经包含对应图片及新界面代码。无需改域名、重装 Node 或重建宝塔网站。

## 以后替换素材

原图继续放在 assets/resources/tiles、actions、profiles 中，保持现有文件名。
ArtworkBounds.ts 仅保存图片可见区域，原图保留不动。更换尺寸或透明留边后，在工程目录用安装了 Pillow 的 Python 运行 tools/update-artwork-bounds.py，然后使用 Cocos Creator 3.8.8 重新构建。

本地预览截图放在 screenshots/jade-*.png。本次发布包是本地构建产物，需要上传到服务器后才会更新公网网站。
