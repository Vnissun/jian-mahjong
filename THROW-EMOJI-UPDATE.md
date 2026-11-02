# 动态投掷表情更新

点击对手头像，在表情面板选择「扔粑粑、扔臭番茄、扔鸡蛋、扔拖鞋、扔炸弹」。所有在线玩家都会看到从发送者头像飞向目标头像的弧线动画；命中后显示不同的溅射、臭气或爆炸效果，约 2.6 秒自动消失。可向机器人投掷。

每 3 秒可发送一次，与原来的快捷聊天共用限制；普通表情、快捷语音和录音功能保留。未选目标时会提示先点击对手头像。离开对局会清除动画，不会影响出牌、计时、积分、房间规则或机器人策略。

图案使用 GitHub 的 Twemoji v14.0.2，原始 PNG 保存于 assets/resources/social/，游戏内动画实现位于 assets/scripts/ui/ThrowEffects.ts。来源和许可证随包发布在 build/web-repaired/social/，表情面板底部可以打开署名说明。动画不需要连接 GitHub。

宝塔更新：停止 Node 项目，将新版压缩包完整解压覆盖原项目，保留自己的 server/production.json 和 server/test-admin-secret.json，再启动 Node 16.20.2。前端和 server/dist 必须一起更新，浏览器刷新页面后进入房间。
