/**
 * Somnus: panes follow the agent. When the focused chat's agent starts using
 * the terminal, the browser or your files, the matching pane opens by itself,
 * so a task reads as something happening rather than a wall of tool rows.
 *
 * Deliberately narrow (the desktop rule is "offer, don't hijack"):
 * - only for the chat you are looking at (callers pass `isActiveEvent`);
 * - never takes keyboard focus, never navigates away from the chat;
 * - each pane opens at most once per turn, so closing it sticks until the
 *   agent's next reply;
 * - one switch turns it off (Settings > Appearance > General).
 */

import { Codecs, persistentAtom } from '@/lib/persisted'

import { revealDesktopPane } from './pane-focus'
import { openPreview } from './preview'
import { revealReview } from './review'
import { toolMayMutateFiles } from './workspace-events'

export const AUTO_REVEAL_STORAGE_KEY = 'somnus.autoRevealPanes'

export const $autoRevealPanes = persistentAtom(AUTO_REVEAL_STORAGE_KEY, true, Codecs.bool)

export const setAutoRevealPanes = (on: boolean) => $autoRevealPanes.set(on)

export type AutoRevealPane = 'browser' | 'review' | 'terminal'

interface ToolPayloadLike {
  args?: unknown
  arguments?: unknown
  name?: unknown
}

// sessionId -> panes already opened this turn
const revealedThisTurn = new Map<string, Set<AutoRevealPane>>()

/** Forget this session's reveals: the next turn may open panes again. */
export function resetAutoReveal(sessionId: string | null | undefined) {
  if (sessionId) {
    revealedThisTurn.delete(sessionId)
  }
}

function toolArgs(payload: ToolPayloadLike): Record<string, unknown> {
  const raw = payload.args ?? payload.arguments

  if (raw && typeof raw === 'object') {
    return raw as Record<string, unknown>
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown

      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  return {}
}

/** Which pane a tool call belongs in, at which phase (`null` = none). */
export function autoRevealPaneFor(phase: 'complete' | 'start', payload: ToolPayloadLike): AutoRevealPane | null {
  const name = typeof payload.name === 'string' ? payload.name : ''

  if (phase === 'start') {
    if (name === 'terminal' || name === 'process') {
      return 'terminal'
    }

    if (name === 'browser_navigate') {
      return 'browser'
    }

    return null
  }

  // File edits: the diff exists once the write has landed.
  return toolMayMutateFiles(payload as Parameters<typeof toolMayMutateFiles>[0]) ? 'review' : null
}

/** A web address the Browser pane can show; anything else stays put. */
export function browsableUrl(payload: ToolPayloadLike): string | null {
  const url = toolArgs(payload).url

  if (typeof url !== 'string') {
    return null
  }

  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null
}

/**
 * Open the pane a tool call belongs in, if the switch is on and this turn
 * hasn't opened it yet. Returns the pane it opened, or null.
 */
export function autoRevealForTool(
  sessionId: string | null | undefined,
  phase: 'complete' | 'start',
  payload: ToolPayloadLike,
  isActiveEvent: boolean
): AutoRevealPane | null {
  if (!sessionId || !isActiveEvent || !$autoRevealPanes.get()) {
    return null
  }

  const pane = autoRevealPaneFor(phase, payload)

  if (!pane) {
    return null
  }

  const done = revealedThisTurn.get(sessionId) ?? new Set<AutoRevealPane>()

  if (done.has(pane)) {
    return null
  }

  if (pane === 'browser') {
    const url = browsableUrl(payload)

    if (!url) {
      return null
    }

    openPreview({ kind: 'url', label: url, source: url, url }, 'tool-result')
  } else if (pane === 'review') {
    revealReview()
  } else {
    revealDesktopPane('terminal')
  }

  done.add(pane)
  revealedThisTurn.set(sessionId, done)

  return pane
}
