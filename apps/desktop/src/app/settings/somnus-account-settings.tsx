import { useCallback, useEffect, useState } from 'react'

import { getSomnusAccount, signOutOfSomnus, type SomnusAccount } from '@/api/somnus'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useI18n } from '@/i18n'
import { openExternalLink } from '@/lib/external-link'
import { ExternalLink, KeyRound, Loader2, LogOut, Wallet } from '@/lib/icons'
import { SOMNUS_ACCOUNTS_URL } from '@/lib/somnus'
import { notify } from '@/store/notifications'
import { showSomnusSignedOut, startManualOnboarding } from '@/store/onboarding'
import { $settingsRequestProfile } from '@/store/settings-scope'

import { SettingsContent } from './primitives'

const usd = (n: number | undefined) =>
  `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Somnus replaces the upstream Providers page (accounts, API keys, custom
// endpoints): customers never bring their own keys. Models come only from the
// Somnus account they sign in with, and billing happens on the website.
export function SomnusAccountSettings({ onSignedOut }: { onSignedOut?: () => void }) {
  const { t } = useI18n()
  const [account, setAccount] = useState<null | SomnusAccount>(null)
  const [loading, setLoading] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const profile = $settingsRequestProfile.get() ?? undefined

  const load = useCallback(async () => {
    setLoading(true)

    try {
      setAccount(await getSomnusAccount(profile))
    } catch {
      setAccount({ signed_in: true, error: t.onboarding.somnusAccountUnavailable })
    } finally {
      setLoading(false)
    }
  }, [profile, t])

  useEffect(() => {
    void load()
    // Refresh when the customer comes back from topping up in the browser.
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)

    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const signIn = () => startManualOnboarding(null, profile)

  const signOut = async () => {
    await signOutOfSomnus(profile)
    notify({ kind: 'success', title: t.onboarding.somnusAccountSignedOut, message: t.onboarding.somnusAccountNotSignedIn })
    onSignedOut?.()
    showSomnusSignedOut()
  }

  const dashboardUrl = account?.dashboard_url || `${SOMNUS_ACCOUNTS_URL}/dashboard`
  const topUpUrl = account?.top_up_url || `${SOMNUS_ACCOUNTS_URL}/dashboard#buy`
  const signedIn = account?.signed_in !== false
  const hasBalance = typeof account?.balance_usd === 'number'

  return (
    <SettingsContent>
      <div className="grid max-w-xl gap-5 pt-2">
        <div className="grid gap-1">
          <span className="text-[length:var(--conversation-text-font-size)] font-semibold">
            {t.onboarding.somnusAccountTitle}
          </span>
          <p className="text-xs leading-5 text-muted-foreground">
            {loading && !account
              ? ' '
              : signedIn && account?.email
                ? t.onboarding.somnusAccountSignedInAs(account.email)
                : signedIn
                  ? t.onboarding.somnusAccountDesc
                  : t.onboarding.somnusAccountNotSignedIn}
          </p>
        </div>

        {signedIn ? (
          <div className="grid gap-2 rounded-lg border border-border/70 p-4">
            <span className="text-xs text-muted-foreground">{t.onboarding.somnusAccountBalance}</span>
            {loading && !account ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : hasBalance ? (
              <>
                <span className="text-3xl font-semibold tabular-nums">{usd(account?.balance_usd)}</span>
                <span className="text-xs text-muted-foreground">
                  {t.onboarding.somnusAccountUsage30d(
                    usd(account?.spend_30d_usd),
                    (account?.requests_30d ?? 0).toLocaleString()
                  )}
                </span>
                {account?.blocked ? (
                  <span className="text-xs text-destructive">{t.onboarding.somnusAccountLowCredit}</span>
                ) : null}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                {account?.expired ? t.onboarding.somnusAccountExpired : t.onboarding.somnusAccountUnavailable}
              </span>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {signedIn && !account?.expired ? (
            <>
              <Button onClick={() => openExternalLink(topUpUrl)} type="button">
                <Wallet />
                {t.onboarding.somnusAccountTopUp}
              </Button>
              <Button onClick={() => openExternalLink(dashboardUrl)} type="button" variant="outline">
                <ExternalLink />
                {t.onboarding.somnusAccountOpen}
              </Button>
            </>
          ) : (
            <Button onClick={signIn} type="button">
              <KeyRound />
              {t.onboarding.somnusSignIn}
            </Button>
          )}
        </div>

        {signedIn ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
            <Button onClick={signIn} type="button" variant="ghost">
              <KeyRound />
              {t.onboarding.somnusAccountSwitch}
            </Button>
            <Button className="text-destructive" onClick={() => setConfirmOpen(true)} type="button" variant="ghost">
              <LogOut />
              {t.onboarding.somnusAccountSignOut}
            </Button>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        confirmLabel={t.onboarding.somnusAccountSignOut}
        description={t.onboarding.somnusAccountSignOutDesc}
        destructive
        dismissOnConfirm
        onClose={() => setConfirmOpen(false)}
        onConfirm={signOut}
        open={confirmOpen}
        title={t.onboarding.somnusAccountSignOutTitle}
      />
    </SettingsContent>
  )
}
