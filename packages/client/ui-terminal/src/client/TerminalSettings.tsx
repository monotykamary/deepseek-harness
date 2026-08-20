import { useState } from 'react'
import {
  IconChevronDownOutline14, Menu,
} from '@monotykamary/dsh-client-ui-primitives'
import type { MenuItem } from '@monotykamary/dsh-client-ui-primitives'
import {
  TERMINAL_FONTS,
  type TerminalPreferences, type TerminalFontId,
} from './preferences.ts'
import type { WorkbenchTerminalProps } from './contract.ts'
import css from './TerminalSettings.module.css'

interface TerminalSettingsProps {
  readonly preferences: TerminalPreferences
  readonly update: (patch: Partial<TerminalPreferences>) => void
  readonly reset: () => void
  readonly t: WorkbenchTerminalProps['t']
}

interface SettingsOption<Id extends string> {
  readonly id: Id
  readonly label: string
}

function SettingsSelect<Id extends string>({
  label, value, options, onChange,
}: {
  readonly label: string
  readonly value: Id
  readonly options: readonly SettingsOption<Id>[]
  readonly onChange: (value: Id) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find(option => option.id === value)
  const items: readonly MenuItem[] = options.map(option => ({ id: option.id, label: option.label }))
  return (
    <div className={css.field}>
      <span>{label}</span>
      <Menu
        open={open}
        items={items}
        selectedId={value}
        compact
        portal
        className={css.selectMenu ?? ''}
        anchor={(
          <button
            type="button"
            className={css.selectTrigger}
            aria-label={`${label}: ${selected?.label ?? value}`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => { setOpen(current => !current) }}
          >
            <span>{selected?.label}</span>
            <IconChevronDownOutline14 size={12} />
          </button>
        )}
        onSelect={(id) => {
          onChange(id as Id)
          setOpen(false)
        }}
        onClose={() => { setOpen(false) }}
      />
    </div>
  )
}

/** Compact terminal appearance controls shared by both terminal placements. */
export function TerminalSettings({ preferences, update, reset, t }: TerminalSettingsProps) {
  return (
    <div className={css.root} data-terminal-settings="">
      <SettingsSelect
        label={t('settings.font')}
        value={preferences.font}
        options={TERMINAL_FONTS}
        onChange={(font: TerminalFontId) => { update({ font }) }}
      />
      {preferences.font === 'custom' && (
        <label className={css.fieldWide}>
          <span>{t('settings.customFont')}</span>
          <input
            type="text"
            value={preferences.customFontFamily}
            maxLength={120}
            onChange={(event) => { update({ customFontFamily: event.currentTarget.value }) }}
          />
        </label>
      )}
      <label className={css.field}>
        <span>{t('settings.fontSize')}</span>
        <input
          type="number"
          min={10}
          max={24}
          step={1}
          value={preferences.fontSize}
          onChange={(event) => { update({ fontSize: event.currentTarget.valueAsNumber }) }}
        />
      </label>
      <label className={css.field}>
        <span>{t('settings.lineHeight')}</span>
        <input
          type="number"
          min={1}
          max={1.6}
          step={0.05}
          value={preferences.lineHeight}
          onChange={(event) => { update({ lineHeight: event.currentTarget.valueAsNumber }) }}
        />
      </label>
      <div className={css.toggles}>
        <label className={css.check}>
          <input
            type="checkbox"
            checked={preferences.ligatures}
            onChange={(event) => { update({ ligatures: event.currentTarget.checked }) }}
          />
          <span>{t('settings.ligatures')}</span>
        </label>
        <label className={css.check}>
          <input
            type="checkbox"
            checked={!preferences.muteEmojiColors}
            onChange={(event) => { update({ muteEmojiColors: !event.currentTarget.checked }) }}
          />
          <span>{t('settings.emojiColors')}</span>
        </label>
        <label className={css.check}>
          <input
            type="checkbox"
            checked={preferences.cursorBlink}
            onChange={(event) => { update({ cursorBlink: event.currentTarget.checked }) }}
          />
          <span>{t('settings.cursorBlink')}</span>
        </label>
      </div>
      <div className={css.footer}>
        <button type="button" className={css.reset} onClick={reset}>{t('settings.reset')}</button>
      </div>
    </div>
  )
}
