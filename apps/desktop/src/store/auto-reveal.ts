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
 *
 * The terminal is stricter still, because the agent runs quick commands all
 * the time: it opens only for a command that is still running after a few
 * seconds (a build, a test run, an install), and if it was opened that way and
 * you never typed into it, it folds away again when the reply finishes.
 */

import { $terminalTakeover, setTerminalTakeover } from '@/app/right-sidebar/store'
import { Codecs, persistentAtom } from '@/lib/persisted'

import { revealDesktopPane } from './pane-focus'
import { openPreview } from './preview'
import { revealReview } from './review'

export const AUTO_REVEAL_STORAGE_KEY = 'somnus.autoRevealPanes'

export const $autoRevealPanes = persistentAtom(AUTO_REVEAL_STORAGE_KEY, true, Codecs.bool)

export const setAutoRevealPanes = (on: boolean) => $autoRevealPanes.set(on)

const FILE_EDIT_TOOL_RE = /write|edit|patch|replace|apply/i
const SHELL_TOOL_RE = /terminal|shell|exec|bash|command|process/i

export type AutoRevealPane = 'browser' | 'review' | 'terminal'

interface ToolPayloadLike {
  args?: unknown
  arguments?: unknown
  name?: unknown
}

// sessionId -> panes already opened this turn
const revealedThisTurn = new Map<string, Set<AutoRevealPane>>()

/** How long a terminal command must keep running before the pane opens. */
export const TERMINAL_REVEAL_DELAY_MS = 3000

// sessionId -> the timer that will open the terminal for a long command
const pendingTerminal = new Map<string, ReturnType<typeof setTimeout>>()
// sessions whose terminal we opened this turn (so we may fold it away again)
const autoOpenedTerminal = new Set<string>()
// the user typed into a terminal since it was auto-opened: leave it alone
let userTypedInTerminal = false

/** The terminal reports keystrokes here: someone is using it, keep it open. */
export function noteTerminalUserInput() {
  userTypedInTerminal = true
}

function cancelPendingTerminal(sessionId: string) {
  const timer = pendingTerminal.get(sessionId)

  if (timer !== undefined) {
    clearTimeout(timer)
    pendingTerminal.delete(sessionId)
  }
}

/** A terminal command finished: if it was quick, its pane never opens. */
export function settleTerminalTool(sessionId: string | null | undefined, payload: ToolPayloadLike) {
  if (sessionId && autoRevealPaneFor('start', payload) === 'terminal') {
    cancelPendingTerminal(sessionId)
  }
}

/** Forget this session's reveals: the next turn may open panes again. A
 *  terminal this turn opened on its own, and nobody typed into, folds away. */
export function resetAutoReveal(sessionId: string | null | undefined) {
  if (!sessionId) {
    return
  }

  revealedThisTurn.delete(sessionId)
  cancelPendingTerminal(sessionId)

  if (autoOpenedTerminal.delete(sessionId) && !userTypedInTerminal) {
    setTerminalTakeover(false)
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

  // File edits: the diff exists once the write has landed. Shell commands may
  // touch files too, but most don't — opening an empty "No changes yet" panel
  // after every command was noise, so only real edits (or a reported diff) count.
  const diff = (payload as { inline_diff?: unknown }).inline_diff

  if (typeof diff === 'string' && diff.trim()) {
    return 'review'
  }

  return FILE_EDIT_TOOL_RE.test(name) && !SHELL_TOOL_RE.test(name) ? 'review' : null
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

  if (pane === 'terminal') {
    // Wait: quick commands never open it, long ones do. One timer per chat.
    if (!pendingTerminal.has(sessionId)) {
      pendingTerminal.set(
        sessionId,
        setTimeout(() => {
          pendingTerminal.delete(sessionId)

          if (!$autoRevealPanes.get() || revealedThisTurn.get(sessionId)?.has('terminal')) {
            return
          }

          const wasOpen = $terminalTakeover.get()

          revealDesktopPane('terminal')

          // Only a terminal we opened may be folded away; one you had open stays.
          if (!wasOpen) {
            autoOpenedTerminal.add(sessionId)
            userTypedInTerminal = false
          }

          revealedThisTurn.set(sessionId, new Set([...(revealedThisTurn.get(sessionId) ?? []), 'terminal']))
        }, TERMINAL_REVEAL_DELAY_MS)
      )
    }

    return null
  }

  if (pane === 'browser') {
    const url = browsableUrl(payload)

    if (!url) {
      return null
    }

    openPreview({ kind: 'url', label: url, source: url, url }, 'tool-result')
  } else {
    revealReview()
  }

  done.add(pane)
  revealedThisTurn.set(sessionId, done)

  return pane
}
