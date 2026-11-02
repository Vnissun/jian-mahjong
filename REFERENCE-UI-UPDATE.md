# mahjong-master 界面迁移说明

本次修改的运行工程：
D:\Desktop\dl.mpjian.com\ji-an-mahjong\NewProject

参考工程：
D:\Desktop\dl.mpjian.com\ji-an-mahjong\mahjong-master

## 本次迁移

只迁入参考工程的图片、显示风格及布局参数，没有引入它的 GameEngine、GameLogic、AIEngine 或其他对局实现。

- 使用参考工程的绿色牌桌、中央龙纹、方向盘、出牌标记、头像框、庄家图标。
- 使用参考工程的全部 34 种手牌和桌面牌，以及左、右、对家的立式暗牌。牌值映射已核对：参考图片编号 1 为筒，2 为万，3 为条，41–44 为四风，45–47 为中发白。
- 四家手牌按参考工程分别横排和竖排，牌河为上下横排、左右竖排；吃碰杠与手牌衔接排布。
- 普通四同杠采用三张一排、第四张叠放的显示方式；公开风杠、元杠及补毛继续逐张显示。是否公开仍由原项目的 isMeldPublic 决定。
- 操作按钮使用参考工程的按钮底图及胡、碰、杠、过图片。原项目额外需要的吃、听和出牌按钮采用配套字体与配色。
- 大厅和好友房使用参考工程的背景、木框、浅色面板、绿色按钮；保留原来的全部房间选项。
- 结算窗口保留居中、胡家手牌/副露/胡牌张及原计分明细。查看牌桌时，操作栏移到顶部，四家手牌和牌河完整保留。
- 保留原有手机横屏适配、声音控件和好友访问密码。

参考图片独立存放在：
NewProject/assets/resources/reference_ui/

原先的自制图片目录保留，没有覆盖。参考工程 mahjong-master 也没有修改。

## 规则保护

修改前已备份 UI，并记录 77 个文件的 SHA-256。
以下内容与修改前逐字节一致：
assets/scripts/core、config、data、game、net，以及 server 的原有配置与代码（发布版本标识和编译产物不属于逻辑源码）。

GameApp.ts 只修改了一处 UI 入口：退出按钮的尺寸、坐标与确认弹窗。确认后仍调用原来的 openLobby；会话切换、联机请求和对局操作处理保持原样。

校验记录：output/reference-ui/verification.json。
本地备份：output/reference-ui/20261016-152944/ui-before/。

## 宝塔更新

1. 等现有对局结束，在宝塔停止原 Node 项目。
2. 备份服务器项目目录，尤其是 server/production.json。
3. 上传 release/ji-an-mahjong-online.tar.gz，解压覆盖至原项目根目录。根目录应有 package.json、server 和 build，不要解到 build/web-repaired 内。
4. 保留服务器原来的 production.json；Node.js 继续使用 16.20.2，入口继续使用 server/start-production.cjs。
5. 重启项目。
6. 打开 https://mahjong.mpjian.com/api/health，确认版本已更新且 webMatchesRelease 为 true。
7. 重新打开网页。新牌桌应是绿色龙纹背景，中央是方形方向盘，麻将牌是参考工程的简洁白面绿背样式。

发布包已经包含构建后的网页及对应资源。只上传原 PNG 或 TypeScript 源文件不会更新网站。

## 本地查看

构建网页：build/web-repaired。
运行：node tools/serve.cjs，然后打开 http://127.0.0.1:7457。
界面截图：screenshots/reference-*.png。
原规则校验：Node.js 16.20.2 运行 tools/check-reference-boundary.cjs。

公网服务器需要上传并重启后才会显示新界面。本次仅在本地完成修改、构建和验证。
## 验证结果

- Node.js 16.20.2：TypeScript 检查通过，255 项规则测试全部通过。
- 77 个受保护文件的校验值与修改前一致；GameApp.ts 的唯一区别是退出按钮布局及确认弹窗入口。
- 引入的 223 张图片与 mahjong-master 原文件字节一致，参考工程未修改。
- 桌面、手机横持、手机竖持进入：素材加载、触摸选牌/出牌、结算回看正常。
- 全部 34 种牌的手牌与四向牌面路径均可加载。
- 普通暗杠与公开特殊杠、含多张补毛的副露显示通过检查。
- 四个独立浏览器：开房、加入、各自视角、刷新重连、整局同步、共同准备下一局通过。
- 两位好友加机器人：房主增删机器人、权限区分、补位开局、完整对局及下一局通过。
