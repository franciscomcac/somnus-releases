import { useCallback, useEffect, useState } from 'react'

import { getSomnusAccount, type SomnusAccount } from '@/api/somnus'
import { SETTINGS_ROUTE, syncWorkspaceRoute } from '@/app/routes'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

const usd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Display name from an email: "francisco.costa@x" → "Francisco Costa". */
export function accountDisplayName(email?: string): string {
  const local = (email ?? '').split('@')[0] ?? ''
  const words = local.split(/[._-]+/).filter(Boolean)

  return words.length ? words.map(w => w[0].toUpperCase() + w.slice(1)).join(' ') : 'Somnus'
}

function openAccountSettings() {
  window.location.hash = `#${SETTINGS_ROUTE}?tab=providers`
  syncWorkspaceRoute(SETTINGS_ROUTE)
}

/**
 * Somnus App v2: who is signed in and what's left, pinned to the foot of the
 * rail. Clicking opens Settings → Somnus account (top up, sign out). Refreshes
 * on window focus, so a top-up done in the browser shows on return.
 */
export function SidebarAccountCard({ className }: { className?: string }) {
  const { t } = useI18n()
  const [account, setAccount] = useState<null | SomnusAccount>(null)

  const load = useCallback(async () => {
    try {
      setAccount(await getSomnusAccount())
    } catch {
      setAccount(null)
    }
  }, [])

  useEffect(() => {
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)

    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  if (!account?.signed_in) {
    return null
  }

  const name = accountDisplayName(account.email)
  const credit = typeof account.balance_usd === 'number' ? `${usd(account.balance_usd)} credit` : account.email

  return (
    <button
      aria-label={`${t.onboarding.somnusAccountNav}: ${name}${credit ? `, ${credit}` : ''}`}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg border-t border-border px-2 pt-3 pb-1 text-left [-webkit-app-region:no-drag]',
        'transition-colors hover:bg-(--ui-control-hover-background)',
        className
      )}
      data-slot="somnus_account_card"
      onClick={openAccountSettings}
      type="button"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-[0.6875rem] font-medium text-background">
        {name
          .split(' ')
          .slice(0, 2)
          .map(w => w[0])
          .join('')}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[0.8125rem] font-medium text-foreground">{name}</span>
        {credit && <span className="truncate text-xs text-(--ui-text-tertiary)">{credit}</span>}
      </span>
    </button>
  )
}
