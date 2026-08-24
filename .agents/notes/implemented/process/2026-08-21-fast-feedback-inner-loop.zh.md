# Agent Note: 实现期间的快速内环检查

Status: implemented

[English](2026-08-21-fast-feedback-inner-loop.md) | 中文

## 问题

黄金法则禁止在编辑之间运行任何测试、构建、lint 或类型检查，而被认可的终检（test:coverage、test:web、test:snapshot）要花数小时。一个多小时的特性因此直到最后都得不到验证，一个笔误就要耗费整整一轮门禁周期才能发现——这是一个无法单独测试任何东西的反馈环。[GUI 测试体系 note](2026-07-20-gui-testing-system.zh.md) 早已承诺秒级 `test:gui` 反馈，但根 AGENTS.md 的黄金法则连这条廉价内环都禁止，与之矛盾。

## 决策

根 AGENTS.md 现在把验证分为两层。内环在实现期间自由运行：`pnpm run test:gui`（全部客户端与 host 端 GUI 包，秒级）、`pnpm run test:changed`（把 vitest 限定到工作区改动的包，见 [scripts/test-changed.ts](../../../../scripts/test-changed.ts)）、`test:changed --coverage`（只对改动包源码执行聚合 80% 门槛），以及单包迭代用的 watch 变体 `test:gui:watch`／`test:changed:watch`。完整套件门禁——test:coverage、test:web、test:snapshot、doc-sync、hygiene、build——只在实现完成时运行一次，保留原规则的反反复折腾属性：门禁失败后先完成修复再重跑。CI 仍是穷尽性权威；限定范围的覆盖率运行只是本地代理，绝非替代品。

## 备选方案

**保留旧规则。** 不予采纳：它正是本 note 取代的那种盲目数小时实现循环；其反折腾意图由「完成时才跑门禁」条款保留。

**每次编辑之间都跑完整 typecheck 或 build。** 不予采纳：全仓库 tsc 与打包每次要花几分钟，对单包改动重新引入等待；限定范围的 vitest 通道在成本值得之处给出秒级信号。

**只改文档。** 不予采纳：没有机械命令与重写后的规则，agent 仍会要么默认跑全套、要么什么都不跑。

## 后果

实现会话现在以秒到分钟级的粒度逐步验证并向前修复，而不是在结尾才发现损坏；反馈环如今与实际特性面同步。改动包范围是 git-diff 启发式，跨包连锁效应仍会在门禁时浮现——CI 负责穷尽性覆盖与平台矩阵。`test:changed --coverage` 只度量改动包的 src，因此不能替代合并路径上的完整覆盖率门禁。
