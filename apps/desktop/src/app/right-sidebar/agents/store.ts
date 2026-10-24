/**
 * Somnus workbench: the Agents tab. It shows one card per helper agent the
 * focused chat has put to work (planner, coder, tester…), and stays out of the
 * way otherwise:
 *
 * - visible while the chat you are looking at has helpers (or you opened it);
 * - comes to the front when a task fans out to new helpers, unless you turned
 *   "panes follow the agent" off;
 * - closing it sticks until the chat starts more helpers.
 */

import { atom, computed } from 'nanostores'

import { revealTreePane } from '@/components/pane-shell/tree/store'
import { $autoRevealPanes } from '@/store/auto-reveal'
import { $activeSessionId } from '@/store/session'
import { $subagentsBySession, type SubagentProgress } from '@/store/subagents'

const NONE: SubagentProgress[] = []

// The last helpers each chat had. A chat's finished helpers are pruned from the
// live list when its next turn starts (often the wrap-up turn the helpers
// themselves trigger), but the cards should stay until new helpers replace them.
const lastSeen = new Map<string, SubagentProgress[]>()

/** The focused chat's helper agents, oldest first. */
export const $activeSubagents = computed([$activeSessionId, $subagentsBySession], (sessionId, bySession) => {
  if (!sessionId) {
    return NONE
  }

  const live = bySession[sessionId]

  if (live?.length) {
    const previous = lastSeen.get(sessionId) ?? NONE
    const fresh = live.some(agent => !previous.some(old => old.id === agent.id))

    // A new fan-out replaces the old cards; progress on the same helpers (or
    // a partial prune) keeps every card, updated where the live list has news.
    const merged =
      fresh && previous.every(old => !live.some(agent => agent.id === old.id))
        ? live
        : [...previous.filter(old => !live.some(agent => agent.id === old.id)), ...live]

    const ordered = [...merged].sort((a, b) => a.taskIndex - b.taskIndex || a.startedAt - b.startedAt)

    lastSeen.set(sessionId, ordered)

    return ordered
  }

  return lastSeen.get(sessionId) ?? NONE
})

// sessionId -> the helpers that were on screen when you closed the tab
const $dismissed = atom<Record<string, readonly string[]>>({})
// you opened the tab yourself (⌘K / tab menu), even with no helpers yet
const $pinnedOpen = atom(false)

export const $agentsPaneOpen = computed(
  [$activeSessionId, $activeSubagents, $dismissed, $pinnedOpen],
  (sessionId, agents, dismissed, pinned) => {
    if (pinned) {
      return true
    }

    const closed = dismissed[sessionId ?? ''] ?? []

    return agents.some(agent => !closed.includes(agent.id))
  }
)

export function showAgentsPane() {
  $pinnedOpen.set(true)
}

export function dismissAgentsPane() {
  $pinnedOpen.set(false)
  const sessionId = $activeSessionId.get()

  if (sessionId) {
    $dismissed.set({ ...$dismissed.get(), [sessionId]: $activeSubagents.get().map(agent => agent.id) })
  }
}

let following = false

/** Front the Agents tab when the focused chat starts new helpers. Call once. */
export function followAgentsPane() {
  if (following) {
    return
  }

  following = true
  let lastSession = $activeSessionId.get()
  let lastIds = new Set($activeSubagents.get().map(agent => agent.id))

  $activeSubagents.listen(agents => {
    const sessionId = $activeSessionId.get()
    const fresh = sessionId === lastSession && agents.some(agent => !lastIds.has(agent.id))

    lastSession = sessionId
    lastIds = new Set(agents.map(agent => agent.id))

    if (fresh && $autoRevealPanes.get() && $agentsPaneOpen.get()) {
      revealTreePane('agents')
    }
  })
}

/** "9.3k" style token counts for the cards. */
export function compactTokens(value: number | undefined): string {
  const n = value ?? 0

  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`
  }

  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`
  }

  return String(Math.round(n))
}

/** A short card title from the helper's goal: its first few words. */
export function agentTitle(goal: string, index: number): string {
  const clean = goal.replace(/\s+/g, ' ').trim()

  if (!clean) {
    return `Agent ${index + 1}`
  }

  const words = clean.split(' ')

  return words.length <= 4 ? clean : `${words.slice(0, 4).join(' ')}…`
}
