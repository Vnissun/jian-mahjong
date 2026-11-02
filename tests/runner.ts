/**
 * runner.ts - 轻量级测试运行器（不依赖 jest/mocha）
 * ------------------------------------------------------------
 * 由于 Cocos Creator 项目通常没有内置测试框架，
 * 这里实现一个极简的"describe / it / assert"组合：
 *   - 通过 console.log 输出测试结果
 *   - 可在 Cocos Creator 场景里挂一个组件，start() 调用 runAllTests()
 *   - 也可在 Node.js 环境直接跑（用 ts-node）
 *
 * 使用方式：
 *   import { describe, it, assertEqual, assertTrue, runAllTests }
 *     from './runner';
 *   describe('xxx', () => {
 *       it('yyy', () => {
 *           assertEqual(actual, expected);
 *       });
 *   });
 *   // 调用 runAllTests() 触发执行
 */

// ============================================================
// 1. 全局计数器
// ============================================================

let passCount = 0;
let failCount = 0;
const failedCases: string[] = [];

// ============================================================
// 2. 测试用例队列（describe/it 不立即执行，统一收集后跑）
// ============================================================

type TestFn = () => void;
interface TestCase {
    group: string;
    name: string;
    fn: TestFn;
}
const testQueue: TestCase[] = [];

// ============================================================
// 3. describe / it API
// ============================================================

/**
 * 描述一组测试（仅注册，不立即执行）
 */
export function describe(group: string, fn: () => void): void {
    // 暂存当前 group
    currentGroup = group;
    try {
        fn();
    } catch (e) {
        testQueue.push({ group, name: '测试注册失败', fn: () => { throw e; } });
    } finally {
        currentGroup = '';
    }
}

let currentGroup = '';

/**
 * 注册单个测试用例
 */
export function it(name: string, fn: TestFn): void {
    testQueue.push({ group: currentGroup, name, fn });
}

// ============================================================
// 4. 断言函数
// ============================================================

/** 严格相等 */
export function assertEqual<T>(actual: T, expected: T, msg?: string): void {
    if (actual !== expected) {
        throw new Error(`${msg ? msg + ' | ' : ''}期望 ${expected}，实际 ${actual}`);
    }
}

/** 真值断言 */
export function assertTrue(actual: any, msg?: string): void {
    if (!actual) {
        throw new Error(`${msg ? msg + ' | ' : ''}期望真值，实际 ${actual}`);
    }
}

/** 假值断言 */
export function assertFalse(actual: any, msg?: string): void {
    if (actual) {
        throw new Error(`${msg ? msg + ' | ' : ''}期望假值，实际 ${actual}`);
    }
}

/**
 * 数组无序相等（用于 Tile 引用比较）
 *  - 用 .id 集合比较
 */
export function assertTileSetEqual(actual: any[], expected: any[], msg?: string): void {
    const a = new Set(actual.map(x => x.id ?? x));
    const e = new Set(expected.map(x => x.id ?? x));
    if (a.size !== e.size) {
        throw new Error(`${msg ? msg + ' | ' : ''}长度不同 actual=${actual.length} expected=${expected.length}`);
    }
    for (const x of e) {
        if (!a.has(x)) {
            throw new Error(`${msg ? msg + ' | ' : ''}期望包含 ${x}，实际不含`);
        }
    }
}

// ============================================================
// 5. 执行入口
// ============================================================

/**
 * 执行所有注册的测试用例
 *  - 返回总结字符串
 */
export function runAllTests(): string {
    passCount = 0;
    failCount = 0;
    failedCases.length = 0;

    console.log(`\n========== 开始测试（共 ${testQueue.length} 项）==========`);

    let lastGroup = '';
    for (const tc of testQueue) {
        if (tc.group !== lastGroup) {
            console.log(`\n--- ${tc.group} ---`);
            lastGroup = tc.group;
        }
        try {
            tc.fn();
            passCount++;
            console.log(`  ✓ ${tc.name}`);
        } catch (e: any) {
            failCount++;
            const label = `${tc.group} > ${tc.name}`;
            failedCases.push(label);
            console.error(`  ✗ ${tc.name}\n    ${e.message}`);
        }
    }

    const summary = `\n========== 测试完成 ==========\n`
        + `通过：${passCount} / ${testQueue.length}\n`
        + `失败：${failCount}\n`
        + (failedCases.length > 0 ? `失败用例：\n  - ${failedCases.join('\n  - ')}\n` : '');
    console.log(summary);
    return summary;
}

/**
 * 清空注册的测试用例（用于重新加载）
 */
export function clearTests(): void {
    testQueue.length = 0;
}
