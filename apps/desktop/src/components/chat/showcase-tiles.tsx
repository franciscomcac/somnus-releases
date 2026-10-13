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
  label: string
  prompt: string
  /** Something to open before the prompt lands (the browser pane for the browsing demo). */
  prepare?: () => void
}

export const SHOWCASE_DEMOS: readonly DemoPrompt[] = [
  {
    id: 'research',
    icon: 'search',
    label: 'Research into a spreadsheet',
    prompt:
      'Research the 5 best-reviewed budget mechanical keyboards available right now and save a spreadsheet with name, price, switch type and a source link for each.'
  },
  {
    id: 'browse',
    icon: 'globe',
    label: 'Watch it browse',
    prompt:
      'Open https://news.ycombinator.com in the preview pane, read the front page, and give me the 5 most interesting stories with one line each.',
    prepare: openBrowserTab
  },
  {
    id: 'board',
    icon: 'project',
    label: 'Plan it on a board',
    prompt:
      'Plan a one-week launch for a small side project as tasks on the Kanban board, with an owner and a day for each task, then start on the first one.'
  },
  {
    id: 'schedule',
    icon: 'watch',
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

const tile = cn(composerFloatingPill, 'pointer-events-auto max-w-64')

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
    <div className="mt-5 flex w-full min-w-0 flex-col items-center gap-2" data-slot="somnus_showcase">
      <div className="flex max-w-xl flex-wrap justify-center gap-1.5">
        {SHOWCASE_DEMOS.map(demo => (
          <button className={tile} key={demo.id} onClick={() => tryDemo(demo)} title={demo.prompt} type="button">
            <Codicon className="shrink-0 opacity-70" name={demo.icon} size="0.75rem" />
            <span className="truncate">{demo.label}</span>
          </button>
        ))}
      </div>
      <div className="flex max-w-xl flex-wrap justify-center gap-1.5">
        {SHOWCASE_LINKS.filter(link => link.id !== 'hud' || hudAvailable).map(link => (
          <button
            className={cn(tile, 'border-transparent bg-transparent text-(--ui-text-tertiary)')}
            key={link.id}
            onClick={() => open(link.id)}
            type="button"
          >
            <Codicon className="shrink-0 opacity-70" name={link.icon} size="0.75rem" />
            <span className="truncate">{link.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
