# Agent Note: Deterministic revision readiness and proportional coverage

Status: implemented

[English](2026-08-24-deterministic-readiness-and-proportional-coverage.md) | 中文

## Problem

完整验证把确定性的产品证据与主机调度器观察混在一起，因此一次文件系统或 PTY 时序偏差就可能否决原本稳定的 revision。逐文件 100% 覆盖率促生了抑制指令、分支尾部测试、大范围排除与反复插桩运行，其成本超过所增加的信心。发行 pack 反馈在工作流拓扑上保持独立，却缺少与 revision 就绪状态之间的机械化定义。

## Decision

revision `r` 仅在证据集合完整且每项必需确定性检查都在该 revision 上成功时就绪：`Ready(r, E) ⇔ ids(E) = R ∧ ∀e ∈ E: e.revision = r ∧ e.result = success`。[`scripts/readiness.ts`](../../../../scripts/readiness.ts)拥有 `R` 与纯求值器；CI 工作流测试把 GitHub 的必需 `needs` 集合固定到该定义。证据缺失、重复、意外、失败、跳过、取消或来自其他 revision 都会否决就绪状态。

必需测试通过因果状态同步。主机时序无法受控的测试移入 `test:observational`；它仍会运行并报告失败，但 `run-gates` 与稳定 CI 聚合都不把其结果当作就绪证据。重试与增大 sleep 不能把观察转换为必需测试。原生 HMR watcher 投递和 macOS PowerShell PTY 时序使用此 lane。

覆盖率对被度量包源码的语句、分支、函数与行采用 80% 聚合下限。仓库不含覆盖率抑制指令；只有类型、自执行入口、仅构建生成的入口、有意不插桩的生成器源码，以及当前主机无法执行的源码不纳入度量。缓慢但确定性的正确性套件在覆盖率旁无插桩运行，并且仍会阻塞。

发行工作流无需依赖完整 CI job 即可开始版本校验、官方构建、pack、打包安装验证与产物上传。对 family `f`，仅当 `Version_f(r) ∧ Build_f(r) ∧ Pack_f(r) ∧ Install_f(r)` 成功时发行反馈成功；registry 发布还要求受保护环境与 pack job。完整演练可以独立继续，而不会延迟此反馈路径。

## Alternatives considered

**保留逐文件 100% 覆盖率。** 拒绝，因为完整执行并不等于完整行为证据，最后几个百分点带来了不成比例的测试、抑制、排除与插桩成本。

**重试不稳定的必需测试或增加等待。** 拒绝，因为两者都会让就绪状态变成概率结果，并可能在未改变被测行为时制造绿色结果。

**删除不可控观察。** 拒绝，因为这些信号对主机集成仍有价值；observational lane 在不让调度器不稳定结果成为权威的前提下保留信号。

**让完整 CI 成为发行工作流依赖。** 拒绝，因为 pack/install 反馈回答的是另一个精确 revision 问题，必须在更广泛演练完成前保持可用。

## Consequences

就绪组合对有限声明集合是穷尽且针对单一 revision 确定的，但不能证明证据之外不存在缺陷。覆盖率报告真实执行，而非经抑制调整的执行。主机特定失败保持可见；维护者必须建立因果同步，否则让该测试保持 observational。发行打包会快速反馈，同时对其负责的版本、构建、tarball、安装、审批或发布错误保持失败关闭。
