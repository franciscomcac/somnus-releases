import { useEffect } from 'react'

import { getSomnusAccount, signOutOfSomnus } from '@/api/somnus'
import { translateNow } from '@/i18n'
import { somnusAccountOnly } from '@/lib/somnus'
import { $desktopOnboarding, showSomnusSignedOut } from '@/store/onboarding'

const FIRST_CHECK_MS = 8_000
const RECHECK_MS = 5 * 60_000
const FOCUS_MIN_GAP_MS = 60_000

// Somnus: the app only works signed in to a Somnus account. Whenever Somnus
// starts, regains focus, or every few minutes, check the saved sign-in; if
// there is none, or the website no longer accepts it (the key was regenerated
// on the website, or the account changed), bring up the sign-in screen instead
// of letting chats fail one by one.
export function SomnusAccountGate() {
  useEffect(() => {
    if (!somnusAccountOnly()) {
      return
    }

    let disposed = false
    let lastCheck = 0
    let busy = false

    const check = async () => {
      const state = $desktopOnboarding.get()

      // Already showing the sign-in screen (or first-run setup): nothing to do.
      if (busy || disposed || state.requested || state.configured === false) {
        return
      }

      busy = true
      lastCheck = Date.now()

      try {
        const account = await getSomnusAccount()

        if (disposed) {
          return
        }

        if (!account.signed_in) {
          showSomnusSignedOut()
        } else if (account.expired) {
          // The website no longer accepts the saved key: drop it (it can never
          // work again) so the sign-in screen stays up until a new one is saved.
          await signOutOfSomnus().catch(() => undefined)
          showSomnusSignedOut(translateNow('onboarding.somnusAccountExpired'))
        }
      } catch {
        // Backend not up yet or offline: try again on the next tick.
      } finally {
        busy = false
      }
    }

    const onFocus = () => {
      if (Date.now() - lastCheck > FOCUS_MIN_GAP_MS) {
        void check()
      }
    }

    const first = window.setTimeout(() => void check(), FIRST_CHECK_MS)
    const timer = window.setInterval(() => void check(), RECHECK_MS)
    window.addEventListener('focus', onFocus)

    return () => {
      disposed = true
      window.clearTimeout(first)
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return null
}
