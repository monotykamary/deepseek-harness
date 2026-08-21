// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { UpdateBadge, UpdateSettings, type UpdateBadgeProps, type UpdateInjected, type UpdateSettingsProps } from '../src/client/UpdateSettings.tsx'
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
  updateCommand: 'npm install --global @monotykamary/dsh@latest',
}

describe('Update Settings components', () => {
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
