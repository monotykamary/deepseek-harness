/**
 * Lucide icon adapters for the dsh web UI.
 *
 * Existing component names remain stable for consumers while every non-brand
 * glyph is sourced from Lucide.
 */
import { createElement } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Archive, ArrowUp, ArrowUpRight, Bot, Braces, Brain, Check, ChevronDown, ChevronLeft,
  ChevronRight, ChevronUp, CircleCheck, CircleDashed, CircleHelp, Clock3, Code2, Copy,
  CornerDownRight, Database, Download, Ellipsis, Eye, FileSearch, Folder, FolderOpen,
  FolderPlus, GitBranch, Globe, Info, Link, ListChecks, ListPlus, ListTodo, LoaderCircle,
  Maximize2, Minimize2, Monitor, Moon, PanelLeft, PanelsLeftRight, PanelsTopBottom,
  Paperclip, Pause, Pencil, Play, Plug, Plus, RefreshCw, ScanSearch, Search, Send,
  Settings, Share2, Shield, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles,
  Square, SquareMinus, SquarePlus, Sun, Target, ThumbsDown, ThumbsUp, Trash2,
  TriangleAlert, User, UsersRound, WandSparkles, WrapText, Wrench, X,
} from 'lucide-react'
import type { IconProps } from './props.ts'

export type { IconProps } from './props.ts'

type AdapterOptions = Readonly<{ fill?: boolean }>

function adapt(Icon: LucideIcon, defaultSize: number, options: AdapterOptions = {}) {
  return function LucideAdapter({ size = defaultSize, className }: IconProps) {
    return createElement(Icon, {
      size,
      className,
      'aria-hidden': true,
      ...(options.fill === true ? { fill: 'currentColor' } : {}),
    })
  }
}

/** New conversation. */
export const IconNewChatOutline16 = adapt(Bot, 16)
/** Search. */
export const IconSearchOutline16 = adapt(Search, 16)
/** Web. */
export const IconGlobeOutline14 = adapt(Globe, 14)
/** Settings at 14px. */
export const IconSettingsOutline14 = adapt(Settings, 14)
/** Settings at 16px. */
export const IconSettingsOutline16 = adapt(Settings, 16)
/** Left panel. */
export const IconPanelLeftOutline16 = adapt(PanelLeft, 16)
/** More actions. */
export const IconEllipsisOutline16 = adapt(Ellipsis, 16)
/** Add. */
export const IconPlusOutline16 = adapt(Plus, 16)
/** Confirm at 16px. */
export const IconCheckOutline16 = adapt(Check, 16)
/** Confirm at 14px. */
export const IconCheckOutline14 = adapt(Check, 14)
/** Branch. */
export const IconBranchOutline16 = adapt(GitBranch, 16)
/** Expand downward. */
export const IconChevronDownOutline14 = adapt(ChevronDown, 14)
/** Navigate left. */
export const IconChevronLeftOutline14 = adapt(ChevronLeft, 14)
/** Navigate right. */
export const IconChevronRightOutline14 = adapt(ChevronRight, 14)
/** Expand a tree row. */
export const IconTriangleRightFill14 = adapt(Play, 14, { fill: true })
/** Expand upward. */
export const IconChevronUpOutline14 = adapt(ChevronUp, 14)
/** Close. */
export const IconCloseOutline16 = adapt(X, 16)
/** Close at 14px. */
export const IconCloseFill14 = adapt(X, 14)
/** Copy. */
export const IconCopyOutline16 = adapt(Copy, 16)
/** Refresh at 16px. */
export const IconRefreshOutline16 = adapt(RefreshCw, 16)
/** Refresh at 14px. */
export const IconRefreshOutline14 = adapt(RefreshCw, 14)
/** Positive feedback. */
export const IconLikeOutline16 = adapt(ThumbsUp, 16)
/** Selected positive feedback. */
export const IconLikeFill16 = adapt(ThumbsUp, 16, { fill: true })
/** Negative feedback. */
export const IconDislikeOutline16 = adapt(ThumbsDown, 16)
/** Selected negative feedback. */
export const IconDislikeFill16 = adapt(ThumbsDown, 16, { fill: true })
/** Share. */
export const IconShareOutline16 = adapt(Share2, 16)
/** Edit. */
export const IconEditOutline16 = adapt(Pencil, 16)
/** Reasoning at 14px. */
export const IconThinkOutline14 = adapt(Brain, 14)
/** Reasoning at 16px. */
export const IconThinkOutline16 = adapt(Brain, 16)
/** Agent preset. */
export const IconAgentPresetOutline16 = adapt(Bot, 16)
/** Browse files. */
export const IconBrowseOutline16 = adapt(FileSearch, 16)
/** Link at 14px. */
export const IconLinkOutline14 = adapt(Link, 14)
/** Link at 16px. */
export const IconLinkOutline16 = adapt(Link, 16)
/** External destination at 8px. */
export const IconRightUpOutline14 = adapt(ArrowUpRight, 8)
/** External destination at 16px. */
export const IconRightUpOutline16 = adapt(ArrowUpRight, 16)
/** Enhance. */
export const IconEnhanceOutline16 = adapt(WandSparkles, 16)
/** Delete. */
export const IconTrashOutline16 = adapt(Trash2, 16)
/** Warning. */
export const IconWarningOutline16 = adapt(TriangleAlert, 14)
/** User. */
export const IconUserOutline16 = adapt(User, 16)
/** Send at 16px. */
export const IconSendOutline16 = adapt(Send, 16)
/** Stop. */
export const IconStopFill16 = adapt(Square, 16, { fill: true })
/** Attach. */
export const IconPaperclipOutline16 = adapt(Paperclip, 16)
/** Loading. */
export const IconLoadingOutline16 = adapt(LoaderCircle, 16)
/** Download. */
export const IconDownloadOutline16 = adapt(Download, 16)
/** Play. */
export const IconPlayOutline16 = adapt(Play, 16)
/** Pause. */
export const IconPauseOutline16 = adapt(Pause, 16)
/** Fullscreen. */
export const IconFullscreenOutline16 = adapt(Maximize2, 16)
/** Code. */
export const IconCodeOutline16 = adapt(Code2, 16)
/** Cordis plugin. */
export const IconCordisPluginOutline14 = adapt(Plug, 14)
/** API. */
export const IconApiOutline14 = adapt(Braces, 14)
/** Personalization. */
export const IconPersonalizationOutline16 = adapt(SlidersHorizontal, 16)
/** Add project. */
export const IconProjectAddOutline16 = adapt(FolderPlus, 16)
/** Open folder outline. */
export const IconFolderOpenOutline16 = adapt(FolderOpen, 16)
/** Open folder. */
export const IconFolderOpen16 = adapt(FolderOpen, 16)
/** Closed folder. */
export const IconFolderClose16 = adapt(Folder, 16)
/** Tree branch corner. */
export const IconTreeCorner8x10 = adapt(CornerDownRight, 10)
/** Light theme. */
export const IconLightOutline16 = adapt(Sun, 16)
/** Dark theme. */
export const IconDarkOutline16 = adapt(Moon, 16)
/** System theme. */
export const IconFollowsystemOutline16 = adapt(Monitor, 16)
/** Data. */
export const IconDataOutline16 = adapt(Database, 16)
/** Send at 14px. */
export const IconSendOutline14 = adapt(Send, 14)
/** Queue. */
export const IconQueueOutline14 = adapt(ListPlus, 14)
/** Checklist. */
export const IconChecklistOutline14 = adapt(ListChecks, 14)
/** Editable list. */
export const IconListPenOutline16 = adapt(ListTodo, 16)
/** Goal. */
export const IconGoalOutline16 = adapt(Target, 16)
/** Assistant. */
export const IconSparkle16 = adapt(Sparkles, 16)
/** Inspect. */
export const IconInspectOutline12 = adapt(ScanSearch, 12)
/** Skill. */
export const IconSkillOutline16 = adapt(Sparkles, 16)
/** Question. */
export const IconQuestionOutline14 = adapt(CircleHelp, 14)
/** Archive. */
export const IconArchiveOutline20 = adapt(Archive, 20)
/** Session reference. */
export const IconSessionOutline16 = adapt(Bot, 16)
/** Read-only permission. */
export const IconShieldCheckOutline16 = adapt(ShieldCheck, 16)
/** Workspace-write permission. */
export const IconShieldOutline16 = adapt(Shield, 16)
/** Full-access warning. */
export const IconShieldAlertOutline16 = adapt(ShieldAlert, 16)
/** Completed status. */
export const IconCircleCheckOutline14 = adapt(CircleCheck, 14)
/** Pending status. */
export const IconCircleDashedOutline14 = adapt(CircleDashed, 14)
/** Soft-wrap text. */
export const IconWrapTextOutline14 = adapt(WrapText, 14)
/** Horizontal terminal split. */
export const IconSplitHorizontalOutline14 = adapt(PanelsLeftRight, 14)
/** Vertical terminal split. */
export const IconSplitVerticalOutline14 = adapt(PanelsTopBottom, 14)
/** Expand a terminal pane. */
export const IconMaximizeOutline15 = adapt(Maximize2, 15)
/** Restore a terminal pane. */
export const IconMinimizeOutline15 = adapt(Minimize2, 15)
/** Tool. */
export const IconWrenchOutline14 = adapt(Wrench, 14)
/** Information. */
export const IconInformationOutline14 = adapt(Info, 14)
/** Compacted content. */
export const IconCompactedOutline13 = adapt(Minimize2, 13)
/** Subagent switcher. */
export const IconSubagentSwitcherOutline16 = adapt(UsersRound, 16)
/** Duration. */
export const IconClockOutline16 = adapt(Clock3, 16)
/** Expand a grouped set. */
export const IconSquarePlusOutline16 = adapt(SquarePlus, 16)
/** Collapse a grouped set. */
export const IconSquareMinusOutline16 = adapt(SquareMinus, 16)
/** Inspect a value. */
export const IconInspectOutline16 = adapt(Eye, 16)
/** Send upward. */
export const IconArrowUpOutline16 = adapt(ArrowUp, 16)
