import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { $notifications } from '@/store/notifications'

import { SomnusUpdateNotifier } from './somnus-update-notifier'

describe('SomnusUpdateNotifier', () => {
  const original = window.hermesDesktop

  afterEach(() => {
    window.hermesDesktop = original
  })

  it('offers a restart once the new version has downloaded', async () => {
    let push: ((s: unknown) => void) | undefined
    const install = vi.fn().mockResolvedValue(true)

    window.hermesDesktop = {
      ...(original ?? {}),
      somnusUpdateState: vi.fn().mockResolvedValue({ status: 'idle', currentVersion: '1.0.0', version: null, percent: null, message: null }),
      somnusInstallUpdate: install,
      onSomnusUpdateState: (cb: (s: unknown) => void) => {
        push = cb

        return () => {}
      }
    } as typeof window.hermesDesktop

    render(<SomnusUpdateNotifier />)
    push?.({ status: 'ready', currentVersion: '1.0.0', version: '1.0.1', percent: 100, message: null })

    const toast = $notifications.get().find(n => n.id === 'somnus-update-ready')
    expect(toast?.message).toContain('1.0.1')
    toast?.action?.onClick?.()
    expect(install).toHaveBeenCalled()
  })
})
