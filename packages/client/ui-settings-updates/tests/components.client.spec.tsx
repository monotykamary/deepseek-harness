// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { InstallationReadiness, UpdateBadge, UpdateSettings, type UpdateBadgeProps, type UpdateInjected, type UpdateSettingsProps } from '../src/client/UpdateSettings.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
const t: UpdateSettingsProps['t'] = key => (en as Record<string, string>)[key] ?? key
const unusedHook = (() => { throw new Error('unused by update components') }) as never
const kit: Pick<UpdateBadgeProps, 'useSessions' | 'useWorkspaces'> = {
  useSessions: unusedHook, useWorkspaces: unusedHook,
}
const current = {
  channel: 'npm-global' as const, checkedAt: 1, checking: false, error: null, updateAvailable: true,
  packages: [{ name: '@monotykamary/dsh', installed: '1.0.0', latest: '1.1.0', updateAvailable: true }],
  updateCommand: 'npm install --global @monotykamary/dsh@latest', diagnostics: [{
    id: 'desktop' as const, severity: 'warning' as const, summary: 'No desktop.', remediation: 'Open manually.',
  }, {
    id: 'shell' as const, severity: 'ok' as const, summary: 'Bash is available.', remediation: null,
  }],
}

describe('Update Settings components', () => {
  it('blocks on host prerequisites and allows an explicit override', async () => {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.append(root)
    const complete = vi.fn()
    render(<InstallationReadiness {...kit} openSection={() => {}} complete={complete} stepId="installation-readiness"
      snapshot={async () => ({ ...current, diagnostics: [{ id: 'shell', severity: 'blocking', summary: 'Bash is unavailable.', remediation: 'Install Bash.' }] })}
      t={t} />)
    expect(await screen.findByRole('dialog', { name: 'Host setup needs attention' })).toBeTruthy()
    await waitFor(() => { expect(root.inert).toBe(true) })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(complete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Continue anyway'))
    expect(complete).toHaveBeenCalledOnce()
    cleanup()
    expect(root.inert).not.toBe(true)
    root.remove()

    const ready = vi.fn()
    render(<InstallationReadiness {...kit} openSection={() => {}} complete={ready} stepId="installation-readiness"
      snapshot={async () => ({ ...current, diagnostics: [] })} t={t} />)
    await waitFor(() => { expect(ready).toHaveBeenCalledOnce() })

    const rejected = vi.fn()
    render(<InstallationReadiness {...kit} openSection={() => {}} complete={rejected} stepId="installation-readiness"
      snapshot={async () => { throw new Error('offline') }} t={t} />)
    await waitFor(() => { expect(rejected).toHaveBeenCalledOnce() })

    let release: ((value: typeof current) => void) | undefined
    const pending = new Promise<typeof current>((resolve) => { release = resolve })
    const pendingView = render(<InstallationReadiness {...kit} openSection={() => {}} complete={() => {}} stepId="installation-readiness"
      snapshot={() => pending} t={t} />)
    pendingView.unmount()
    release?.(current)
    await pending
    let rejectLate: ((reason: unknown) => void) | undefined
    const lateFailure = new Promise<typeof current>((_resolve, reject) => { rejectLate = reject })
    const failedView = render(<InstallationReadiness {...kit} openSection={() => {}} complete={() => {}} stepId="installation-readiness"
      snapshot={() => lateFailure} t={t} />)
    failedView.unmount()
    rejectLate?.(new Error('late'))
    await expect(lateFailure).rejects.toThrow('late')

    render(<InstallationReadiness {...kit} openSection={() => {}} complete={() => {}} stepId="installation-readiness"
      snapshot={async () => ({ ...current, diagnostics: [{ id: 'shell', severity: 'blocking', summary: 'No shell.', remediation: null }] })} t={t} />)
    expect(await screen.findByText('No shell.')).toBeTruthy()
  })

  it('shows the badge only for an available update', async () => {
    const check = vi.fn(async () => current)
    const { container } = render(<UpdateBadge {...kit} check={check} />)
    await waitFor(() => { expect(container.querySelector('[data-update-available]')).not.toBeNull() })
    cleanup()
    render(<UpdateBadge {...kit} check={async () => ({ ...current, updateAvailable: false })} />)
    await waitFor(() => { expect(document.querySelector('[data-update-available]')).toBeNull() })
    cleanup()
    render(<UpdateBadge {...kit} check={async () => { throw new Error('offline') }} />)
    await waitFor(() => { expect(document.querySelector('[data-update-available]')).toBeNull() })
    cleanup()
    let settle: ((value: typeof current) => void) | undefined
    const pending = new Promise<typeof current>((resolve) => { settle = resolve })
    const view = render(<UpdateBadge {...kit} check={() => pending} />)
    view.unmount()
    settle?.(current)
    await pending
  })

  it('renders versions and starts the detached action', async () => {
    const injected: UpdateInjected = {
      snapshot: async () => current,
      check: vi.fn(async () => current),
      start: vi.fn(async () => ({ started: true, message: 'Restart DSH.', statusPath: '/status' })),
    }
    render(<UpdateSettings {...kit} {...injected} t={t} close={() => {}} />)
    expect(await screen.findByText('@monotykamary/dsh')).toBeTruthy()
    expect(screen.getByText('1.0.0 → 1.1.0')).toBeTruthy()
    fireEvent.click(screen.getByText('Update DSH'))
    expect(await screen.findByText('Restart DSH.')).toBeTruthy()
    fireEvent.click(screen.getByText('Check again'))
    await waitFor(() => { expect(injected.check).toHaveBeenCalledTimes(2) })
  })

  it('renders an up-to-date app with no target command', async () => {
    render(<UpdateSettings {...kit} snapshot={async () => current} check={async () => ({
      ...current, updateAvailable: false, updateCommand: null, packages: [{
        ...current.packages[0]!, latest: null, updateAvailable: false,
      }],
    })} start={async () => ({ started: false, message: '', statusPath: null })} t={t} close={() => {}} />)
    expect(await screen.findByText('Up to date')).toBeTruthy()
    expect(screen.getByText('1.0.0')).toBeTruthy()
    expect(screen.queryByText('Update DSH')).toBeNull()
  })

  it('reports a failed check and retries', async () => {
    const check = vi.fn<UpdateInjected['check']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ...current, updateAvailable: false, error: 'cached warning' })
    render(<UpdateSettings {...kit} snapshot={async () => current} check={check} start={async () => ({ started: false, message: '', statusPath: null })} t={t} close={() => {}} />)
    expect((await screen.findByRole('alert')).textContent).toContain('offline')
    fireEvent.click(screen.getByText('Retry'))
    expect(await screen.findByText('cached warning')).toBeTruthy()
    expect(screen.getByText('Up to date')).toBeTruthy()
    cleanup()
    render(<UpdateSettings {...kit} snapshot={async () => current} check={async () => { throw 'offline string' }} start={async () => ({ started: false, message: '', statusPath: null })} t={t} close={() => {}} />)
    expect((await screen.findByRole('alert')).textContent).toContain('offline string')
  })

  it('ignores a request that settles after unmount', async () => {
    let resolve: ((value: typeof current) => void) | undefined
    const pending = new Promise<typeof current>((done) => { resolve = done })
    const view = render(<UpdateSettings {...kit} snapshot={async () => current} check={() => pending} start={async () => ({ started: false, message: '', statusPath: null })} t={t} close={() => {}} />)
    view.unmount()
    resolve?.(current)
    await pending
    let reject: ((reason: unknown) => void) | undefined
    const failed = new Promise<typeof current>((_resolve, fail) => { reject = fail })
    const failedView = render(<UpdateSettings {...kit} snapshot={async () => current} check={() => failed} start={async () => ({ started: false, message: '', statusPath: null })} t={t} close={() => {}} />)
    failedView.unmount()
    reject?.(new Error('late'))
    await expect(failed).rejects.toThrow('late')
  })
})
