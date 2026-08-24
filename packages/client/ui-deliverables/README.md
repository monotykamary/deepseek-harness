# @monotykamary/dsh-client-ui-deliverables

English | [中文](README.zh.md)

Changed-files, clickable-reference, and loaded Changes feature owner. The Node half registers final-response guidance; the browser half registers the deliverables row a finished turn ends with into the chat view's `conversation.chat.turnTail` hole, links matching inline-code references in the closing prose, and contributes Changes plus its icon and launcher description to [`ui-workbench`](../ui-workbench/README.md). The shipped Web patch pairs this package with [`tool-session-mutations`](../../session-query/tool-session-mutations/README.md), whose Host-owned `changes_read` reader and pure ledger remain available without putting this Client package in the Host compiler face.

`deliverablesDefinition` folds each Turn's committed `FileMutation` receipts into engine-published `DeliverablesTurnData`; `producedForClosing` reads that data with the closing Assistant seq. Direct `tool/result` receipts and nested `tool/code-dispatch` receipts use the same versioned projection and are folded by commit order rather than parallel-call result order, while the nested event's root execution location supplies Turn ownership. Presentation metadata may provide a title but cannot create a mutation entry. Calls without valid receipts contribute nothing; deletes remain in Changes but create no openable-file entry, and produced paths appear once per Turn in first-seen order. The Conversation Location index preserves Turn membership when a Turn mutates and then ends without content text.

`ProducedFiles` renders a T3-style changed-files card between the closing message body and its IconActions footer. The client entry also exports `ProducedFilesCard`, the same receipt-backed hierarchy with owner-resolved labels and optional complete-diff navigation, for non-chat applications that already own mutation groups. Its low-contrast header reports distinct files and aggregate added/removed receipt lines, collapses or expands all inferred folders, and opens the Session's full Changes workbench. The always-visible tree groups tool-authored paths by directory, carries aggregate statistics on directory rows and per-file statistics on file rows, and opens the Changes workbench from every file row; deletes therefore remain reviewable even though they are not inline-mention targets. Absolute paths begin at their nearest common directory instead of exposing every ancestor from the filesystem root, while file actions retain the complete tool-authored path. Every recursive tree/group remains width-bounded, so deeper indentation compresses the path column instead of pushing line totals outside the card. The workbench groups loaded mutation hunks by distinct path and presents each file as an expanded-by-default accordion row with line totals and independent and all-row collapse controls. Each filename row stays at the top of its section while the diff scrolls beneath it; DOM order and a reversed flex track keep the sticky row front-painted without another z-index. Its locale-owned `DiffBlock` uses a seamless file appearance: the accordion header owns the path and totals, while the joined body omits duplicate card headers, rounded geometry, and footers and offers an icon-only copy action with hover and keyboard-focus fill. It reports distinct files and aggregate lines, updates incrementally as history pages load, and neither reads the repository nor claims Git working-tree state. Design rationale: the [workspace file links Agent Note](../../../.agents/notes/implemented/feature/2026-07-31-web-workspace-file-links.md) and [workbench decision](../../../.agents/notes/implemented/feature/2026-08-18-web-ui-workbench.md).

The closing prose carries the same vocabulary. This plugin provides the `chatFileMentions` service the chat view consults per closing message: `producedFileMentions` resolves an inline-code token by exact path, or by being exactly the basename of exactly one produced path — a basename two paths share stays inert rather than guessing, so a mention link can never open the wrong file or 404. A resolved mention keeps its code chip and takes the markdown sheet's link language — link-blue at rest, underlined on hover, exactly like URL-promoted inline code — with the full path as its `title`; mentions never render inside anchors or streaming text. Decision record: the [inline file mentions Agent Note](../../../.agents/notes/implemented/feature/2026-08-07-web-inline-file-mentions.md).

The Node half registers the static `ui:deliverable-file-references` system-prompt section. It asks the model to mention the primary files it successfully created or modified and to write those and any other changed-file references as Markdown inline code, using the exact file-tool path or a basename only when unique within the Turn. The guidance makes the renderer's accepted syntax explicit; it does not govern unrelated path discussions or widen the renderer's successful-mutation vocabulary.

## Model Experience

### Clickable file-reference guidance

#### What the model sees

One fixed paragraph instructs the model to name primary files from successful creation or modification calls in its final response and to format those and any other changed-file references as exact-path or unique-basename Markdown inline code, such as `out/report.html`.

#### Token effect

One fixed prompt paragraph whenever this package is loaded; no tool schema, tool result, or per-Turn context is added by this package.

#### KV Cache effect

The section is static at order 190 for the lifetime of the package mount, so it remains in the reusable request prefix and does not change across Turns.

## Known Limitations and Deferred Work

- **Changes covers the loaded Session window, not the repository** — history outside the current client window is absent until loaded. Terminal-created files have no structured diff, and external edits or uncommitted Git state are outside this target; `tool-session-mutations` owns the independent complete-live-Session reader.
- **Mention matching is exact path or unique basename only.** A suffix mention (`out/index.html` written as `index.html` resolves; `deep/out/index.html` written as `out/index.html` does not) stays inert; widening the matcher is deferred until a real closing-message shape needs it.
- **Files created indirectly by terminal commands remain outside the matching vocabulary.** Naming such a file in inline code does not make it clickable unless an instrumented tool records a successful `FileMutation` receipt for that path.
