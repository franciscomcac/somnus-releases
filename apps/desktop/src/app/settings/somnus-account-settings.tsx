import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { openExternalLink } from '@/lib/external-link'
import { ExternalLink, KeyRound } from '@/lib/icons'
import { SOMNUS_ACCOUNTS_URL } from '@/lib/somnus'
import { startManualOnboarding } from '@/store/onboarding'
import { $settingsRequestProfile } from '@/store/settings-scope'

import { SettingsContent } from './primitives'

// Somnus replaces the upstream Providers page (accounts, API keys, custom
// endpoints): customers never bring their own keys. Models come only from the
// Somnus account they sign in with, and billing happens on the website.
export function SomnusAccountSettings() {
  const { t } = useI18n()

  return (
    <SettingsContent>
      <div className="grid max-w-xl gap-4 pt-2">
        <div className="grid gap-1">
          <span className="text-[length:var(--conversation-text-font-size)] font-semibold">
            {t.onboarding.somnusAccountTitle}
          </span>
          <p className="text-xs leading-5 text-muted-foreground">{t.onboarding.somnusAccountDesc}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => openExternalLink(`${SOMNUS_ACCOUNTS_URL}/dashboard`)} type="button">
            <ExternalLink />
            {t.onboarding.somnusAccountOpen}
          </Button>
          <Button
            onClick={() => startManualOnboarding(undefined, $settingsRequestProfile.get() ?? undefined)}
            type="button"
            variant="ghost"
          >
            <KeyRound />
            {t.onboarding.somnusAccountSwitch}
          </Button>
        </div>
      </div>
    </SettingsContent>
  )
}
