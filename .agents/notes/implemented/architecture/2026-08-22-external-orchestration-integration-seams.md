# Agent Note: External orchestration integration seams

Status: implemented

English | [中文](2026-08-22-external-orchestration-integration-seams.zh.md)

## Problem

An external bundle can compose Agents, Sessions, tools, and browser plugins, but repository automation had no provider-neutral checkout lifecycle and the Web Client had no additive route for a second root application. A task orchestrator therefore had to call Git directly and replace Conversation or Sidebar owners, or move its product-specific task database and scheduler into the harness repository.

Checkout cleanup also needs facts that a raw Git command cannot own alone. A managed linked checkout must not be confused with a user's primary or unrelated checkout, and live Session cwd ownership must block removal without relying on an orchestrator's process-local bookkeeping.

## Decision

DeepSeek Harness owns two product-neutral integration mechanisms, while durable task/flow/run state remains in an external bundle.

`@monotykamary/dsh-worktree` provides `ctx.worktrees`, a configured provider registry for locating a repository, listing checkout facts, creating a managed linked checkout, removing one, and sweeping a bounded stale set. `@monotykamary/dsh-worktree-git-local` is the shipped local provider. It keeps managed checkouts under a configured root, derives bounded collision-resistant branch names, copies only configured ignored files, and refuses primary, unmanaged, dirty, or live-Session-owned removal. Provider registrations are effects and unload exactly with their plugin fibers. The API does not own queues, dependency graphs, publishing, merging, or branch policy.

`@monotykamary/dsh-client-ui-layout` owns one selected `ApplicationSurfaceId` in its root store. `application.surface` is a selector-routed chain whose fallback is the existing Conversation owner. `@monotykamary/dsh-client-ui-sidebar` declares the additive `sidebar.navigation` list and passes the selected id plus the layout-owned open action. An external browser plugin contributes a navigation row and a matching application entry without replacing the frame, Sidebar, Conversation, details, bottom panel, or overlays.

`@monotykamary/dsh-client-ui-conversation` owns `ctx.conversation.submissions`, an ordered effect-owned middleware registry around ordinary composer admission. InputHub resolves structured references and live browser image files before dispatch, while retaining the unchanged Host send as the terminal `next()`. Middleware failures stay inside the input machine's draft/image retention path; successful Consumers may navigate only after Host acceptance. External products pair this operation with `conversation.input.left` for compact intent controls without replacing New Session or maintaining a second composer.

The Factory Consumer stages Session, Task, new-flow, or existing-flow placement on a blank Session. Session calls `next()` unchanged. Task and Flow consume submission after Factory commits an idempotent draft linked to that blank Session; they start no task Agent run and send no prompt through the blank Session, return success through the input machine to clear shared draft images, and open the exact task card. Factory remains the projection/control application; its durable graph stays external and the shared Session workflow owns human intake.

The companion `dsh-factory` bundle consumes these mechanisms and the existing Agent, Session, ToolRuntime, Skill, Shell, Attachment, Typert Remote, and preset services. Its SQLite graph and scheduler remain outside this repository because they are one product policy, not a harness primitive. Factory assignments and completion tool calls use the ordinary Session log; the external scheduler does not add a second Agent loop.

## Verification

Worktree package tests cover provider selection, lifecycle disposal, real Git create/list/remove/sweep behavior, dirty refusal, primary/unmanaged refusal, active Session protection, ignored-file copying, and Loader composition. Layout and Sidebar component/store tests cover application selection, chain fallback/takeover, wide and rail navigation, New Session returning to Conversation, and HMR disposal. Conversation registry and InputHub orchestration tests cover ordering, continuation, consumption, double-next rejection, disposal, and the real Session prompt sink. The external bundle adds real SQLite graph/lease tests, blank-versus-active Session intake tests, client consume/redirect tests, and an assembled scripted AgentLoop run from queued task through logged `factory_finish` settlement.

## Alternatives considered

**Put the complete task factory in the harness monorepo.** Rejected because task fields, graph policy, retries, finalizers, issue presentation, and publishing workflow are product decisions. Keeping them external exercises the same package and bundle interfaces available to other products.

**Let each orchestrator invoke Git directly.** Rejected because provider selection, managed-root ownership, active Session protection, and safe cleanup would be duplicated and could not move to a remote checkout provider.

**Replace the Sidebar or Conversation root.** Rejected because a second application would take ownership of unrelated Session navigation and presentation. An additive navigation list plus selector chain preserves those owners and lets HMR remove only the external application.

**Keep task and flow creation inside the Factory application.** Rejected because product-owned modals duplicate Workspace, model, permission, attachment, draft, and prompt admission behavior that New Session already owns. A compact intent contribution plus submission middleware preserves the normal Session path and leaves Factory focused on observation and control.

**Represent Factory tasks as Sessions alone.** Rejected because dependencies, retries, lane allocation, finalizers, and emerging observations have lifecycles distinct from one conversation log. Model-visible execution still belongs in Sessions; orchestration state does not.

## Consequences

External products can add root applications and repository automation without modifying the Agent loop or replacing shipped UI owners. Worktree safety has one provider-owned implementation and can acquire non-Git or remote providers later. Conversation remains the default application and retains its state only while selected according to the frame's chain rendering behavior.

The main bundle gains a small provider registry, a local Git provider, one selected application id, two root-application UI slots, and an ordinary-send middleware registry. Middleware can delay or consume admission, so each Consumer owns visible failure behavior, calls `next()` exactly once when preserving the send, and logs any model-visible input through the Host. Consumers must still design durable coordination, queue fairness, retry policy, publication, and cleanup timing. The local provider intentionally preserves work when safety is uncertain, so retained managed checkouts require an explicit later removal or bounded sweep.
