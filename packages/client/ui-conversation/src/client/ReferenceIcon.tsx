import type { ReactNode } from 'react'
import {
  File, Folder, MessageSquareText,
} from '@monotykamary/dsh-client-ui-primitives'

/** Reference domains with distinct composer and transcript glyphs. */
export type ReferenceIconKind = 'session' | 'file' | 'folder'

/** Props shared by inline reference glyphs. */
export interface ReferenceIconProps {
  kind: ReferenceIconKind
  size?: number
  className?: string | undefined
}

/**
 * Render the icon that identifies one inline reference domain.
 * @param props - Reference kind, optional size, and optional CSS class.
 * @returns The corresponding current-color SVG glyph.
 */
export function ReferenceIcon({ kind, size = 16, className }: ReferenceIconProps): ReactNode {
  switch (kind) {
    case 'session':
      return <MessageSquareText size={size} className={className} />
    case 'file': return <File size={size} className={className} />
    case 'folder': return <Folder size={size} className={className} />
  }
}
