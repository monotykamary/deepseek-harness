# Agent Note: 同步上游至 0.1.0-rc.7 并适配 rescope

Status: implemented

[English](2026-08-17-upstream-sync-rc7.md) | 中文

## Problem

本 fork 落后上游 deepseek-ai/deepseek-harness 111 个提交（截至 0.1.0-rc.7），同时领先 13 个。缺口包含 fix #2585：tool-bash-persistent 覆盖了后端的 PS1，导致 terminal-bash 的提示符就绪检测永远不匹配，生产默认值下每次 send 都退化到 3.5 秒静默层（idleSilenceMs + handoffGraceMs）——即提示符修复笔记记载的退化。直接合并会与 fork 的 @monotykamary rescope（3408 个文件改名）、遥测移除、Web SSO/tailnet 特性和 llm 重试修复冲突。

## Decision

将 upstream/master 合并进 master，按 fork 立场适配冲突：

- 冲突中 fork 一侧仅为 rescope 改名的，取上游内容并重新应用 `@monotykamary` → `@monotykamary`。该改名是机械替换（rescope 提交为 1:1 替换；GitHub URL 保持不变）。
- 整体采纳上游的替代性修复：受控 PROMPT_COMMAND 自愈、ReplayEnvelope 重放状态重构（涵盖 fork 早先的 max-tokens 重放丢弃修复）、无结束标记的 stdin_read 回退。删除编码了被替代设计（扁平重放状态）的 fork 测试。
- 双方都改动的文件手工合并 fork 特性：api-proxy.ts 保留 SSO identity.mayAccess 会话分区检查（在过宽的冲突解法后经 merge-file 重建）；docs-pages.yml 保留 DOCS_REPOSITORY_REF 但不再引入已移除的 DSH_TELEMETRY_DISABLED 开关。
- 用合并后的包清单重建锁文件（node-pty 1.2.0-beta.15），重新记录翻译配对哈希，并由门禁重新生成目录。

## Alternatives considered

**将 13 个 fork 提交 rebase 到上游之上而非合并。** 被拒绝：fork 提交已推送；重写需要 force-push，并丢失合并提交为后续同步保留的共享分支检查点。

**只 cherry-pick 提示符修复。** 被拒绝：用户要求同步全部上游变更；部分同步会让同样的 rescope 冲突在每次后续合并中重新解决。

**把 CONTROLLED_PROMPT 改成工具的私有提示符（发布版 node_modules 补丁）。** 被拒绝：把后端契约耦合到单一消费方的常量会破坏独立 PTY 会话，且改 node_modules 在下次安装即失效；上游的 PROMPT_COMMAND 自愈在不耦合的前提下解决了同样的退化。
## Consequences

持久 bash 工具调用从约 7180/3560/3566 ms 降至约 355/88/91 ms（spawn+init+echo、echo、pwd；darwin，生产默认值）。本地门禁全部通过：build（lib+web）、单元测试、无密钥快照回放、lint、doc-sync（28/28）、hygiene（已将 fork 新建的 web-identity 包版本对齐根版本）。

全套件三次抖动失败（oxlint-contract 探针、acp-snapshot 等待）单独运行均通过；它们是与负载相关的既有子进程/时序测试。typert type-model 快照对 pnpm store 布局敏感（符号链接依赖的 realpath）：已在本机全局 store 布局上重录；其提交的路径形式在本合并之前就已与上游 CI 的布局不同。
