# Agent Note: Coverage-exempt slow correctness suites

Status: implemented

[English](2026-07-31-coverage-exempt-heavy-suites.md) | 中文

## Problem

编译器分析、子进程产品、类浏览器渲染、差分持久化与 worker 集成在 v8 插桩下明显更慢。这些行为仍然是必需证据，但要求每个此类套件都贡献覆盖率，会拉长就绪路径，而对聚合指标的改善不足以抵偿成本。

## Decision

CI 覆盖率聚合并行运行两个阻塞检查：

- 插桩检查设置 `DSH_COVERAGE_EXEMPT_HEAVY=1`，排除 [`scripts/coverage-exempt.ts`](../../../../scripts/coverage-exempt.ts) 中的名单，并执行仓库聚合 80% 阈值。
- 无插桩检查把名单中的每个条目作为普通必需测试运行。即使不度量覆盖率，任何失败仍会否决聚合。

名单包含生成器、worker 与真实产品集成、快照 harness、差分持久化、昂贵的客户端渲染套件、subagent 生命周期套件，以及会启动或编译大型 fixture 的仓库脚本。当插桩显著增加成本，且套件的通过／失败行为比其对聚合执行百分比的贡献更重要时，该套件属于此名单。主机时序观察使用[确定性 revision 就绪](2026-08-24-deterministic-readiness-and-proportional-coverage.zh.md)定义的独立非阻塞 lane，绝不进入此阻塞名单。

每个名单条目同时拥有 Vitest 位置过滤器与 exclude glob。`scripts/coverage-exempt.spec.ts` 将两者解析到仓库测试清单，要求它们选择同一个非空集合，并拒绝重叠。`DSH_COVERAGE_MAX_WORKERS` 在插桩与无插桩检查之间平均分配 worker；分区 CI 只替换插桩侧份额。

## Alternatives considered

**为每个必需测试插桩。** 拒绝，因为 v8 会放大全工作区编译器、子进程、worker 与渲染 fixture 的成本，而覆盖率只是就绪证据之一。

**跳过缓慢套件。** 拒绝，因为真实实现与进程证据仍然必需；移除的只有插桩。

**把不稳定的主机观察放入此名单。** 拒绝，因为此检查仍会阻塞。不可控观察属于 `test:observational`。

**跨工作流 job 分片。** 拒绝，因为重复 checkout、安装、产物传输与合并 job 会增加拓扑，却不改善证据。

## Consequences

覆盖率通过更快的插桩清单达到 80% 聚合下限，同时每个缓慢的确定性套件仍须通过。名单显式且机械同步，但移动套件会改变哪些执行贡献百分比，因此必须评审。随着名单增长，无插桩检查可能成为关键路径，所以 CI 时序数据决定 worker 分配与后续条目。
