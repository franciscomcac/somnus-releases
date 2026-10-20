import { requestComposerFocus, requestComposerInsert } from '@/app/chat/composer/focus'
import { hudTargetSessionId } from '@/app/hud/handoff'
import { AGENTS_ROUTE, CRON_ROUTE, STARMAP_ROUTE, syncWorkspaceRoute } from '@/app/routes'
import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'
import { canUseHud, toggleHud } from '@/store/hud'
import { openBrowserTab } from '@/store/preview'

import { composerFloatingPill } from './composer-dock'

/**
 * Somnus: one-click entry points on the empty chat screen.
 *
 * Two rows. "Try" tiles drop a ready-made demo prompt into the composer (the
 * user still presses Enter, so nothing spends credit by surprise); each one is
 * picked to light up a visual feature: web research into a file, the live
 * browser pane, the task board, scheduled jobs. "Open" tiles jump straight to
 * the showcase views that are otherwise one click deeper.
 */

interface DemoPrompt {
  id: string
  icon: string
  /** Small mono tag above the card text ("task", "demo · browser"). */
  kind: string
  label: string
  prompt: string
  /** Something to open before the prompt lands (the browser pane for the browsing demo). */
  prepare?: () => void
}

export const SHOWCASE_DEMOS: readonly DemoPrompt[] = [
  {
    id: 'research',
    icon: 'search',
    kind: 'task · web',
    label: 'Research into a spreadsheet',
    prompt:
      'Research the 5 best-reviewed budget mechanical keyboards available right now and save a spreadsheet with name, price, switch type and a source link for each.'
  },
  {
    id: 'browse',
    icon: 'globe',
    kind: 'demo · browser',
    label: 'Watch it browse',
    prompt:
      'Open https://news.ycombinator.com in the preview pane, read the front page, and give me the 5 most interesting stories with one line each.',
    prepare: openBrowserTab
  },
  {
    id: 'board',
    icon: 'project',
    kind: 'task · board',
    label: 'Plan it on a board',
    prompt:
      'Plan a one-week launch for a small side project as tasks on the Kanban board, with an owner and a day for each task, then start on the first one.'
  },
  {
    id: 'schedule',
    icon: 'watch',
    kind: 'routine',
    label: 'Every morning, for me',
    prompt: 'Every weekday at 9am, send me a short summary of the most important AI news from the last 24 hours.'
  }
]

interface ShowcaseLink {
  id: string
  icon: string
  label: string
}

const SHOWCASE_LINKS: readonly ShowcaseLink[] = [
  { id: 'starmap', icon: 'sparkle', label: 'Star map' },
  { id: 'kanban', icon: 'project', label: 'Task board' },
  { id: 'agents', icon: 'organization', label: 'Agents' },
  { id: 'cron', icon: 'watch', label: 'Scheduled jobs' },
  { id: 'hud', icon: 'window', label: 'HUD mode' }
]

// Somnus App v2: suggestion cards in a 2×2 grid, a mono tag over the text.
const card = cn(
  'pointer-events-auto flex min-h-19 flex-col items-start gap-1.5 rounded-[0.625rem] border border-border px-3.5 py-3 text-left',
  'bg-muted transition-colors hover:border-input hover:bg-card'
)

const link = cn(
  composerFloatingPill,
  'pointer-events-auto border-transparent bg-transparent text-(--ui-text-tertiary) backdrop-blur-none'
)

// Router-independent (the intro also renders outside a <Router>, e.g. in tests and
// pop-out windows): same mechanics as the plugin SDK's `host.navigate`.
function navigate(path: string) {
  window.location.hash = `#${path}`
  syncWorkspaceRoute(path)
}

export function ShowcaseTiles() {
  const hudAvailable = canUseHud()

  const tryDemo = (demo: DemoPrompt) => {
    demo.prepare?.()
    requestComposerInsert(demo.prompt)
    requestComposerFocus()
  }

  const open = (id: string) => {
    switch (id) {
      case 'starmap':
        return navigate(STARMAP_ROUTE)

      case 'kanban':
        return navigate('/kanban')

      case 'agents':
        return navigate(AGENTS_ROUTE)

      case 'cron':
        return navigate(CRON_ROUTE)

      case 'hud':
        return toggleHud(hudTargetSessionId())
    }
  }

  return (
    <div className="mt-7 flex w-full min-w-0 flex-col items-center gap-4" data-slot="somnus_showcase">
      <div className="grid w-full max-w-xl grid-cols-2 gap-2">
        {SHOWCASE_DEMOS.map(demo => (
          <button className={card} key={demo.id} onClick={() => tryDemo(demo)} title={demo.prompt} type="button">
            <span className="font-mono text-[0.6875rem] tracking-wide text-(--ui-text-tertiary)">{demo.kind}</span>
            <span className="text-[0.8125rem] leading-snug text-foreground">{demo.label}</span>
          </button>
        ))}
      </div>
      <div className="flex max-w-xl flex-wrap justify-center gap-1">
        {SHOWCASE_LINKS.filter(item => item.id !== 'hud' || hudAvailable).map(item => (
          <button className={link} key={item.id} onClick={() => open(item.id)} type="button">
            <Codicon className="shrink-0 opacity-70" name={item.icon} size="0.75rem" />
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
