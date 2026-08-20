/** Platform-neutral assembly of generated Host Remote contributions. */

import type { Context } from '@monotykamary/cordis'
import commandsRemote from '@monotykamary/dsh-commands/remote'
import goalsRemote from '@monotykamary/dsh-goal/remote'
import dynamicRemote from '@monotykamary/dsh-cordis-host-runner/remote'
import pluginInventoryRemote from '@monotykamary/dsh-host-plugin-inventory/remote'
import workspaceFilesRemote from '@monotykamary/dsh-host-workspace-files/remote'
import messageFeedbackRemote from '@monotykamary/dsh-message-feedback/remote'
import type { TypertClientRemote } from '@monotykamary/dsh-typert-protocol'
import fileReferencesRemote from '@monotykamary/dsh-file-reference/remote'
import sessionReferencesRemote from '@monotykamary/dsh-session-reference/remote'

export type { TypertClientRemote as ClientRemote } from '@monotykamary/dsh-typert-protocol'
export type { PluginInventorySnapshot } from '@monotykamary/dsh-host-plugin-inventory/types'
export type {
  WorkspaceDirectoryListing, WorkspaceFileEntry, WorkspaceFileKind, WorkspaceFileLocator, WorkspaceFilePreview,
  WorkspaceFileVersion, WorkspaceFileWriteRefusal, WorkspaceFileWriteResult, WorkspaceSavedFile,
  WorkspaceTextFilePreview, WorkspaceUnavailableFilePreview,
} from '@monotykamary/dsh-host-workspace-files/types'
export type {} from '@monotykamary/dsh-commands/remote'
export type {} from '@monotykamary/dsh-goal/remote'
export type {} from '@monotykamary/dsh-host-plugin-inventory/remote'
export type {} from '@monotykamary/dsh-host-workspace-files/remote'
export type {} from '@monotykamary/dsh-message-feedback/remote'
export type {} from '@monotykamary/dsh-file-reference/remote'
export type {} from '@monotykamary/dsh-session-reference/remote'
// The forwarded-event allowlist's selection seat: without it in the consumer's
// compilation face `TypertRemoteEvent` is `never` and every `$on` call fails.
export type { ApiRemoteForwardedEvent } from '../types.ts'
// The owner packages' client-safe `./types` exports supply the `Events`
// signatures `$on` hands to a listener, so a consumer reads the very
// declaration the Host emits rather than a flattened restatement of it.
export type {} from '@monotykamary/dsh-commands/types'
export type {} from '@monotykamary/dsh-cordis-host-runner/types'
export type {} from '@monotykamary/dsh-credentials/types'
export type {} from '@monotykamary/dsh-llm/types'
export type {} from '@monotykamary/dsh-agent-presets/types'
export type {} from '@monotykamary/dsh-settings/types'

/**
 * The carrier's Client-facing types, re-exported so a business package names one
 * assembly package instead of both this facade and the Connection plugin. Type-only:
 * the carrier's runtime values stay behind their own module edge.
 */
export type {
  ClientResponse, ConfigurableProviderView, ConnectionHandle, ConnectionSinks, ContentBlock,
  CredentialView, DirectoryListing, DiscoveredModelView, HistoryEntry, HostFrame, IApiClient,
  MessageId, ModelCatalogFailure, ModelProviderGroup, ModelReasoningEffort, ModelSelection,
  MuxFrame, PromptContentPart, QuestionResponsePayload, QueueAction, RpcError, RpcId, RpcReceipt,
  RpcRequest, RpcResponse, RpcResult, SessionId, SessionModels, SessionSearchItem,
  SessionSummary, SettingsNamespaceView, SettingsPathOpView, SkillEntry, StreamChunk,
  SubagentAddress, SubagentCatalog, JobView, ToolCallView, ToolEventView, ToolResultView,
  WorkspaceId, WorkspaceView,
} from '@monotykamary/dsh-client-connection/client'
export type {} from '@monotykamary/dsh-api-gateway/client'
export type {} from '@monotykamary/dsh-cordis-host-runner/remote'

// The payload vocabulary of the selected namespaces, re-exported so a Client
// contribution can name what it sends and receives without importing a Host
// package: this assembly is the one place both planes legitimately meet.
export type {
  ApprovalRequestId,
  CordisHalfState,
  CordisDynamicPackageId,
  CordisDynamicPluginId,
  CordisDynamicPluginRunId,
  CordisDynamicRunMode,
  CordisInspectMethodManifest,
  CordisInspectPlatform,
  CordisInspectProviderManifest,
  CordisInspectProviderView,
  CordisInspectQueryRequest,
  CordisInspectQueryResolution,
  CordisInspectQueryResolved,
  CordisInspectRequestId,
  CordisInspectResolveAck,
  CordisRunDiagnostic,
  CordisRunStatus,
  DynamicCordisClientSource,
  DynamicCordisHostHalfResult,
  DynamicCordisInventoryRow,
  DynamicCordisInvokeResult,
  DynamicCordisPackage,
  DynamicCordisRequestResolved,
  DynamicCordisResolveAck,
  DynamicCordisRetracted,
  DynamicCordisRunRequest,
  DynamicCordisRunResolution,
  DynamicCordisRunAttempt,
  DynamicCordisRunResponse,
  DynamicCordisStopResponse,
  DynamicCordisUndefineReceipt,
  RequestRunOutcome,
} from '@monotykamary/dsh-cordis-host-runner/types'
// The JSON vocabulary those payloads are built from, re-exported for the same
// reason: a Client contribution names what it sends without importing a Host
// package, and this assembly is where both planes legitimately meet.
export type { JsonValue } from '@monotykamary/dsh-session/types'
// Reference-discovery result vocabulary for the fileReferences and
// sessionReferenceResolver namespaces.
export type { FileReferenceCandidate } from '@monotykamary/dsh-file-reference/types'
export type { SessionReferenceMentionCandidate } from '@monotykamary/dsh-session-reference/types'

declare module '@monotykamary/cordis' {
  interface Context {
    /** Generated Remote namespaces selected by this Client assembly. */
    remote: TypertClientRemote
  }
}

/** Required service: the typed Client Remote contribution mount. */
export const inject = ['remote']

/**
 * Mount the Host capabilities explicitly selected for this Client assembly.
 * @param ctx - Client Cordis root carrying the typed API service.
 * @returns disposer after every selected Remote namespace is ready.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposers: Array<() => Promise<void>> = []
  try {
    for (const contribution of [
      commandsRemote, goalsRemote, dynamicRemote, pluginInventoryRemote, workspaceFilesRemote, messageFeedbackRemote,
      commandsRemote, goalsRemote, dynamicRemote, fileReferencesRemote,
      pluginInventoryRemote, messageFeedbackRemote, sessionReferencesRemote,
    ]) {
      disposers.push(await ctx.remote.$mount(contribution))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) await dispose()
    throw error
  }
  // Unwound in reverse mount order, so a namespace never outlives one mounted
  // after it.
  return async () => {
    for (const dispose of disposers.reverse()) await dispose()
  }
}
