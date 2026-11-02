/**
 * AnimHelper.ts - 通用动画工具（静态方法集合）
 * ------------------------------------------------------------
 * 封装一些常用的小动画，供 GameApp / TableView 在事件回调里调用：
 *   - moveTile：从 A 点移动到 B 点
 *   - popTile ：放大再缩回（出牌/摸牌"啵"一下）
 *   - flipTile：翻转（扣牌翻面）
 *   - shake   ：左右抖动（非法操作提示）
 *   - fadeIn / fadeOut：基于 UIOpacity 的淡入淡出
 *
 * 全部使用 Cocos 3.x 的 tween 实现，链式 + .call(cb) 收尾回调。
 */
import { Node, Vec3, tween, UIOpacity } from 'cc';

export class AnimHelper {
    /**
     * 把节点从 from 移动到 to
     * @param node  目标节点
     * @param from  起点世界/本地坐标
     * @param to    终点坐标
     * @param dur   时长（秒）
     * @param cb    完成回调
     */
    static moveTile(node: Node, from: Vec3, to: Vec3, dur: number, cb?: () => void): void {
        node.setPosition(from);
        tween(node).to(dur, { position: to }).call(() => cb?.()).start();
    }

    /** 放大再缩回（默认 1 -> 1.2 -> 1） */
    static popTile(node: Node, cb?: () => void): void {
        node.setScale(1, 1, 1);
        tween(node)
            .to(0.1, { scale: new Vec3(1.2, 1.2, 1) })
            .to(0.1, { scale: new Vec3(1, 1, 1) })
            .call(() => cb?.())
            .start();
    }

    /** 翻转动画（X 方向缩到 0 再回 1，模拟翻面） */
    static flipTile(node: Node, cb?: () => void): void {
        tween(node)
            .to(0.1, { scale: new Vec3(0, 1, 1) })
            .call(() => cb?.())
            .to(0.1, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    /** 左右抖动（非法/无效操作提示） */
    static shake(node: Node, cb?: () => void): void {
        const origin = node.getPosition();
        const offset = 8;
        tween(node)
            .to(0.04, { position: new Vec3(origin.x + offset, origin.y, 0) })
            .to(0.04, { position: new Vec3(origin.x - offset, origin.y, 0) })
            .to(0.04, { position: new Vec3(origin.x + offset, origin.y, 0) })
            .to(0.04, { position: new Vec3(origin.x, origin.y, 0) })
            .call(() => cb?.())
            .start();
    }

    /** 淡入（依赖 UIOpacity，没有则自动添加） */
    static fadeIn(node: Node, cb?: () => void): void {
        node.active = true;
        const op = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        op.opacity = 0;
        tween(op).to(0.2, { opacity: 255 }).call(() => cb?.()).start();
    }

    /** 淡出（淡出后自动隐藏节点） */
    static fadeOut(node: Node, cb?: () => void): void {
        const op = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        op.opacity = 255;
        tween(op)
            .to(0.2, { opacity: 0 })
            .call(() => {
                node.active = false;
                cb?.();
            })
            .start();
    }
}
