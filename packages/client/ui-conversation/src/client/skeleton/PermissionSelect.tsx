import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { PermissionSelect as PermissionSelectValue } from '@monotykamary/dsh-permission-presets/client'
import {
  IconChevronDownOutline14, IconShieldAlertOutline16, IconShieldCheckOutline16,
  IconShieldOutline16, Menu, RiskConfirmation,
} from '@monotykamary/dsh-client-ui-primitives'
import type { MenuEntry } from '@monotykamary/dsh-client-ui-primitives'
import type { ComposerBarProps } from '../contract/slots.ts'
import css from './PermissionSelect.module.css'

const FULL_ACCESS = 'danger-full-access'

const permissionGlyphs = {
  'read-only': <IconShieldCheckOutline16 />,
  'workspace-write': <IconShieldOutline16 />,
  [FULL_ACCESS]: <IconShieldAlertOutline16 />,
} as Record<string, ReactNode>

/** Glyph for a permission option value; host-configured names outside the design set get none. */
function permissionGlyph(value: string): ReactNode | undefined {
  return permissionGlyphs[value]
}

/**
 * Display transform: kebab-case machine names render as title-case labels
 * (`workspace-write` → `Workspace Write`); non-kebab host-configured names
 * pass through. Full access intentionally overrides the machine-name
 * transform so both permission surfaces use the product label `Full access`;
 * the warning body remains locale-aware.
 */
function displayName(name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

function optionLabel(option: PermissionSelectValue['options'][number]): string {
  return option.value === FULL_ACCESS ? 'Full access' : displayName(option.name)
}

export interface PermissionSelectProps {
  value: PermissionSelectValue | undefined
  locked: boolean
  command: (line: string) => Promise<boolean>
  /** The owning bar's locale seat, passed down as a plain prop. */
  t: ComposerBarProps['t']
}

export function PermissionSelect({ value, locked, command, t }: PermissionSelectProps) {
  const [pick, setPick] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)

  useEffect(() => {
    if (!locked && value !== undefined) return
    setOpen(false)
    setAcknowledged(false)
    setConfirmation(null)
  }, [locked, value])

  if (value === undefined) return null

  const currentValue = pick ?? value.currentValue
  const current = value.options.find(option => option.value === currentValue)
  const busy = pick !== null || confirmation !== null

  const items: MenuEntry[] = value.options
    .filter(o => o.value !== 'custom')
    .map((option) => {
      const icon = permissionGlyph(option.value)
      return { id: option.value, label: optionLabel(option), ...icon === undefined ? {} : { icon } }
    })

  const submit = (id: string): void => {
    setPick(id)
    void command(`/permission ${id}`)
      .catch(() => false)
      .then(() => { setPick(null) })
  }

  const choose = (id: string): void => {
    setOpen(false)
    if (id === value.currentValue) return
    if (id === FULL_ACCESS) {
      setAcknowledged(false)
      setConfirmation(id)
      return
    }
    submit(id)
  }

  const closeConfirmation = (): void => {
    setAcknowledged(false)
    setConfirmation(null)
  }

  const confirmFullAccess = (): void => {
    if (locked || !acknowledged || confirmation === null) return
    const id = confirmation
    closeConfirmation()
    submit(id)
  }

  return (
    <>
      <Menu
        open={open}
        items={items}
        selectedId={currentValue}
        onSelect={choose}
        onClose={() => { setOpen(false) }}
        side="top"
        anchor={
          <button
            type="button"
            className={css.trigger}
            aria-label={t('input.accessMode', { name: current === undefined ? displayName(currentValue) : optionLabel(current) })}
            title={current?.description}
            disabled={locked || busy}
            onClick={() => { setOpen(!open) }}
          >
            {permissionGlyph(currentValue) !== undefined && (
              <span className={css.triggerIcon} aria-hidden>{permissionGlyph(currentValue)}</span>
            )}
            <span className={css.triggerLabel}>{current === undefined ? displayName(currentValue) : optionLabel(current)}</span>
            {/* Same glyph + open rotation as the sibling ModelSelect trigger. */}
            <span className={clsx(css.chevron, open && css.chevronOpen)} aria-hidden>
              <IconChevronDownOutline14 />
            </span>
          </button>
        }
      />
      <RiskConfirmation
        open={confirmation !== null}
        title={t('access.confirm.title')}
        description={t('access.confirm.description')}
        acknowledgeLabel={t('access.confirm.acknowledge')}
        cancelLabel={t('access.confirm.cancel')}
        confirmLabel={t('access.confirm.enable')}
        acknowledged={acknowledged}
        disabled={locked}
        onAcknowledgedChange={setAcknowledged}
        onCancel={closeConfirmation}
        onConfirm={confirmFullAccess}
      />
    </>
  )
}
