/**
 * index.ts - 游戏逻辑层统一导出
 * ------------------------------------------------------------
 * 外部模块（UI / 网络 / 测试）只需从此处 import，
 * 不必关心内部文件结构。
 */

// 核心逻辑
export * from './WallGenerator';
export * from './HandUtils';
export * from './WinChecker';
export * from './HandValidator';
export * from './PatternRecognizer';
// 阶段3 新增
export * from './Opener';
export * from './ActionHandler';
export * from './RiichiManager';
export * from './RobbingGangChecker';
// 阶段4 新增：结算 + 杠分 + 局/圈/庄管理
export * from './SettlementEngine';
export * from './GangSettlement';
export * from './RoundManager';
// 阶段5 新增：AI 决策 + 对局流程控制
export * from './AIBot';
export * from './GameSession';
