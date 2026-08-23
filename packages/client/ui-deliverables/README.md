# @monotykamary/dsh-client-ui-deliverables

English | [中文](README.zh.md)

Changed-files, clickable-reference, loaded Changes, and model-readable mutation-ledger feature owner. The Node half registers final-response guidance and `changes_read`; the browser half registers the deliverables row a finished turn ends with into the chat view's `conversation.chat.turnTail` hole, links matching inline-code references in the closing prose, and contributes Changes plus its icon and launcher description to [`ui-workbench`](../ui-workbench/README.md). The shipped Web patch is the only composition that loads this package. Removing its one cordis.yml entry removes the guidance, ledger tool, row, prose links, mutation projection, and workbench tab together.

`deliverablesDefinition` folds each Turn's committed `FileMutation` receipts into engine-published `DeliverablesTurnData`; `producedForClosing` reads that data with the closing Assistant seq. Direct `tool/result` receipts and nested `tool/code-dispatch` receipts use the same versioned projection and are folded by commit order rather than parallel-call result order, while the nested event's root execution location supplies Turn ownership. Presentation metadata may provide a title but cannot create a mutation entry. Calls without valid receipts contribute nothing; deletes remain in Changes but create no openable-file entry, and produced paths appear once per Turn in first-seen order. The Conversation Location index preserves Turn membership when a Turn mutates and then ends without content text.

`ProducedFiles` renders a T3-style changed-files card between the closing message body and its IconActions footer. The client entry also exports `ProducedFilesCard`, the same receipt-backed hierarchy with owner-resolved labels and optional complete-diff navigation, for non-chat applications that already own mutation groups. Its low-contrast header reports distinct files and aggregate added/removed receipt lines, collapses or expands all inferred folders, and opens the Session's full Changes workbench. The always-visible tree groups tool-authored paths by directory, carries aggregate statistics on directory rows and per-file statistics on file rows, and opens the Changes workbench from every file row; deletes therefore remain reviewable even though they are not inline-mention targets. Every recursive tree/group remains width-bounded, so deeper indentation compresses the path column instead of pushing line totals outside the card. The workbench groups loaded mutation hunks by distinct path and presents each file as an expanded-by-default accordion row with line totals and independent and all-row collapse controls. Its locale-owned `DiffBlock` uses a seamless file appearance: the accordion header owns the path and totals, while the joined body omits duplicate card headers, rounded geometry, and footers. It reports distinct files and aggregate lines, updates incrementally as history pages load, and neither reads the repository nor claims Git working-tree state. Design rationale: the [workspace file links Agent Note](../../../.agents/notes/implemented/feature/2026-07-31-web-workspace-file-links.md) and [workbench decision](../../../.agents/notes/implemented/feature/2026-08-18-web-ui-workbench.md).

The closing prose carries the same vocabulary. This plugin provides the `chatFileMentions` service the chat view consults per closing message: `producedFileMentions` resolves an inline-code token by exact path, or by being exactly the basename of exactly one produced path — a basename two paths share stays inert rather than guessing, so a mention link can never open the wrong file or 404. A resolved mention keeps its code chip and takes the markdown sheet's link language — link-blue at rest, underlined on hover, exactly like URL-promoted inline code — with the full path as its `title`; mentions never render inside anchors or streaming text. Decision record: the [inline file mentions Agent Note](../../../.agents/notes/implemented/feature/2026-08-07-web-inline-file-mentions.md).

The Node half registers the static `ui:deliverable-file-references` system-prompt section. It asks the model to mention the primary files it successfully created or modified and to write those and any other changed-file references as Markdown inline code, using the exact file-tool path or a basename only when unique within the Turn. The guidance makes the renderer's accepted syntax explicit; it does not govern unrelated path discussions or widen the renderer's successful-mutation vocabulary.

The pure `./ledger` entry exports the same commit-ordered `mutationLedger`, `renderMutation`, and bounded text projection without evaluating the Node plugin. The same Node plugin registers `changes_read` over the calling agent's complete live Session. A list call returns commit-ordered mutation summaries after an optional cursor; an exact `commit_order` call returns the recorded replacement hunks in pages. Required `maxListItems` and `maxDiffChars` configuration bounds those results. The tool never reads the workspace and labels its receipt-only coverage, so the model compares the recorded intent with ordinary current-file reads and writes reconciliation forward rather than treating the output as a patch or repository snapshot.

## Configuration

`maxListItems` and `maxDiffChars` are required positive integers. The former caps one summary page; the latter caps the mutation text in one detail page in UTF-16 code units; fixed coverage and continuation lines remain outside that payload budget. Neither changes the durable ledger or the browser Changes projection.

## Model Experience

### Clickable file-reference guidance

#### What the model sees

One fixed paragraph instructs the model to name primary files from successful creation or modification calls in its final response and to format those and any other changed-file references as exact-path or unique-basename Markdown inline code, such as `out/report.html`.

#### Token effect

One fixed prompt paragraph and the fixed `changes_read` schema whenever this package is loaded. Ledger result tokens are added only when the model calls the tool and are bounded by configuration.

#### KV Cache effect

The section and tool schema remain stable for the lifetime of the package mount, so they stay in the reusable request prefix and do not change across Turns.

### Mutation-ledger reader

#### What the model sees

The generated [`changes_read` schema](../../../docs/tool-catalog.md#monotykamarydsh-client-ui-deliverables) lists direct and nested receipt-aware file mutations from the complete current Session, or returns one selected mutation's path, hashes, and recorded replacement hunks. Every result states that shell and external changes are absent.

#### Token effect

The fixed tool schema is present in Web requests. List pages are capped by `maxListItems`; detail pages are capped by `maxDiffChars` and continue from the returned offset.

#### KV Cache effect

The schema is prefix-stable. Each called result appends after the reusable prefix like an ordinary tool result.

## Known Limitations and Deferred Work

- **Changes covers the loaded Session window, not the repository** — history outside the current client window is absent until loaded, while `changes_read` independently sees the complete live Session. Terminal-created files have no structured diff, and external edits or uncommitted Git state are outside both targets.
- **Mention matching is exact path or unique basename only.** A suffix mention (`out/index.html` written as `index.html` resolves; `deep/out/index.html` written as `out/index.html` does not) stays inert; widening the matcher is deferred until a real closing-message shape needs it.
- **Files created indirectly by terminal commands remain outside the matching vocabulary.** Naming such a file in inline code does not make it clickable unless an instrumented tool records a successful `FileMutation` receipt for that path.
