# @monotykamary/dsh-client-ui-workbench

English | [中文](README.zh.md)

Tabbed right-panel host for independently registered Session surfaces. The plugin occupies layout's `details` slot, declares the additive `workbench.surface` list, and provides `ctx.workbench.show()`, `open(id)`, `openNew(id)`, `ensureCount(id, count)`, `close()`, and effect-disposable presentation registration. A surface registration supplies its stable `id`, order, locale-following label, component, and any child slots or store it owns; opening an unregistered branded `WorkbenchSurfaceId` fails loud. Removing a surface registration removes its tab through the same declaration lifetime.

Open panel instances and the active panel id live in a transient per-session entry store. Singleton surfaces reuse their existing panel; a repeatable surface can create several panels with stable, gap-reusing ordinals, while every instance renders through the one static plugin registration. `show()` reveals an empty panel whose centered cards list every registered surface; selecting a card appends and activates that surface. Closing the active tab selects its adjacent survivor, and closing the final tab returns to the launcher without hiding the panel; closing the panel retains its tab set. Each tab shows its registered icon, replacing that icon with the close glyph in the same seat on hover or keyboard focus. A surface may declare immersive chrome: while it is the sole open surface, its component owns the top row; opening another surface restores the generic Workbench tabs so cross-surface navigation remains available. Pointer selection and Left/Right/Home/End keyboard navigation use the same activation action. Open panels remain mounted in full-size layered bodies; inactive bodies are invisible and inert, activation switches visibility without an intermediate launcher or canvas, and only closing the tab unmounts its surface.

Layout supplies the Details hosting mode. When the three-column concession solver can preserve the center floor, Workbench fills the resizable inline column. When an explicitly open Details preference resolves to zero inline width, the same mounted workbench portals through the shared right `Sheet`; closing either host writes the one layout close action. Switching Sessions still closes Details before paint, while each resident Session store retains its own tabs.

The shipped Web composition registers **Inspect** from [`ui-conversation`](../ui-conversation/README.md), **Changes** from [`ui-deliverables`](../ui-deliverables/README.md), and **Files** from [`ui-files`](../ui-files/README.md); the [workbench Agent Note](../../../.agents/notes/implemented/feature/2026-08-18-web-ui-workbench.md) owns the package split. Inspect shares the conversation store, Changes reads its own incremental Conversation target, and Files reads through its Session-authorized Host Remote. The 40px tab bar, icon-to-close interaction, empty launcher, and responsive Sheet behavior adapt [T3 Code](https://github.com/pingdotgg/t3code) revision `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2`; [`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md) retains the complete MIT text.

The `/client` entrypoint exports the plugin body, `IWorkbench`, and the branded surface and presentation types. Components, store factory, directory projection, and controller implementation remain package-internal.

## Model Experience

None, as the workbench manages browser viewing state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Tabs are transient and fixed in opening order** — reload discards every tab, Session switching hides the panel, and tabs cannot be reordered.
- **The shell supplies no terminal, browser, or Git data** — those capabilities require independently registered surfaces and their own Host contracts; Files owns its filesystem Remote, while Changes remains loaded Session mutation history rather than a repository diff.
