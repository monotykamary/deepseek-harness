import type { ReactNode } from 'react'
import {
  IconBrowseOutline16, IconFolderClose16, IconSessionOutline16,
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
      return <IconSessionOutline16 size={size} className={className} />
    case 'file': return <IconBrowseOutline16 size={size} className={className} />
    case 'folder': return <IconFolderClose16 size={size} className={className} />
  }
}
