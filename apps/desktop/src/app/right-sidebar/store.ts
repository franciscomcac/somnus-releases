import { atom } from 'nanostores'

import { persistBoolean, storedBoolean } from '@/lib/storage'
import { modeBound } from '@/store/interface-mode'

const TAKEOVER_KEY = 'hermes.desktop.terminalTakeover'

// Simple mode rests the terminal closed without touching this preference; ⌃`
// still brings it up for the session.
// Somnus: the terminal is session-only. Every launch starts with it closed; it
// opens when the agent needs it (see store/auto-reveal) or when you open it
// yourself, and that choice is not carried into the next launch.
const $terminalTakeoverPref = atom(false)

// Forget the open state older builds saved, so they also start closed.
if (storedBoolean(TAKEOVER_KEY, false)) {
  persistBoolean(TAKEOVER_KEY, false)
}

export const $terminalTakeover = modeBound('terminalOpen', $terminalTakeoverPref, active =>
  $terminalTakeoverPref.set(active)
)

export const setTerminalTakeover = (active: boolean) => $terminalTakeover.set(active)

/** A command queued to run in the embedded terminal. The terminal pane flushes
 *  (and clears) it once its session is live, so a value set before the pane
 *  mounts still runs. Cleared after flush so a later remount can't replay it. */
export const $terminalInjection = atom<null | string>(null)

/** Open the terminal pane and run a command in it. Used to disconnect external
 *  (CLI-managed) providers, which Somnus can't clear via the API — the user
 *  sees exactly what runs instead of Somnus silently deleting their creds. */
export const runInTerminal = (command: string) => {
  const trimmed = command.trim()

  if (!trimmed) {
    return
  }

  setTerminalTakeover(true)
  $terminalInjection.set(trimmed)
}
