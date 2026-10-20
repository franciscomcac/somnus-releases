import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { type ThemeMode, useTheme } from '@/themes/context'

/**
 * Somnus: pick Light or Dark right on the sign-up screen. It applies
 * immediately (the screen behind it repaints), so people see what they get.
 * System stays one tap away for anyone who wants Windows to decide.
 */
export function AppearanceChoice() {
  const { t } = useI18n()
  const { mode, setMode } = useTheme()
  const copy = t.settings.modeOptions

  const options: { id: ThemeMode; label: string; swatch: string }[] = [
    { id: 'light', label: copy.light.label, swatch: 'bg-[#fafaf9] border-[#e4e4e1]' },
    { id: 'dark', label: copy.dark.label, swatch: 'bg-[#141417] border-[#2e2e32]' }
  ]

  return (
    <div aria-label={t.onboarding.appearanceChoice ?? 'Appearance'} className="mt-3 flex items-center gap-2" role="radiogroup">
      {options.map(option => (
        <button
          aria-checked={mode === option.id}
          className={cn(
            'flex h-9 items-center gap-2 rounded-lg border px-3 text-[0.8125rem] transition-colors',
            mode === option.id
              ? 'border-foreground text-foreground'
              : 'border-(--ui-stroke-tertiary) text-(--ui-text-secondary) hover:text-foreground'
          )}
          key={option.id}
          onClick={() => setMode(option.id)}
          role="radio"
          type="button"
        >
          <span aria-hidden="true" className={cn('size-3.5 rounded-full border', option.swatch)} />
          {option.label}
        </button>
      ))}
      <button
        aria-checked={mode === 'system'}
        className={cn(
          'h-9 px-2 text-[0.75rem] transition-colors',
          mode === 'system' ? 'text-foreground underline underline-offset-4' : 'text-(--ui-text-tertiary) hover:text-foreground'
        )}
        onClick={() => setMode('system')}
        role="radio"
        type="button"
      >
        {copy.system.label}
      </button>
    </div>
  )
}
