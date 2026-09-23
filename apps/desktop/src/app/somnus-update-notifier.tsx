import { useEffect } from 'react'

import type { SomnusUpdateState } from '@/global'
import { translateNow } from '@/i18n'
import { notify } from '@/store/notifications'

const TOAST_ID = 'somnus-update-ready'

// Somnus: tells the customer when a new version has finished downloading in the
// background (electron/somnus-updater.ts). If they ignore it, the update still
// installs the next time Somnus quits.
export function SomnusUpdateNotifier() {
  useEffect(() => {
    const bridge = window.hermesDesktop
    let shownFor: null | string = null

    const onState = (state: null | SomnusUpdateState | undefined) => {
      if (!state || state.status !== 'ready' || !state.version || shownFor === state.version) {
        return
      }

      shownFor = state.version
      const version = state.version

      notify({
        action: {
          label: translateNow('notifications.somnusUpdateRestart'),
          onClick: () => void bridge?.somnusInstallUpdate?.()
        },
        durationMs: 0,
        icon: 'gift',
        id: TOAST_ID,
        kind: 'info',
        message: translateNow('notifications.somnusUpdateReadyMessage', version),
        title: translateNow('notifications.somnusUpdateReadyTitle')
      })
    }

    const unsubscribe = bridge?.onSomnusUpdateState?.(onState)
    void bridge?.somnusUpdateState?.().then(onState, () => {})

    return () => unsubscribe?.()
  }, [])

  return null
}
