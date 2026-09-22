/** Shared budget for any renderer await that rides out a primary backend
 * cold boot (initial getConnection(), the registry restore's descriptor
 * wait). Matches the main-process spawn budget
 * (DEFAULT_BACKEND_READY_TIMEOUT_MS in electron/backend-health.ts): a
 * healthy cold boot publishes well within this; anything longer means the
 * backend is not coming and the caller should fail instead of hanging.
 * Reconnect-class awaits against an already-spawned backend use the shorter
 * RECONNECT_ATTEMPT_TIMEOUT_MS below instead. */
export const BACKEND_BOOT_WAIT_TIMEOUT_MS = 45_000

// desktop.getConnection() / getConnectionFor() / revalidateConnection() /
// resolveGatewayWsUrl() are IPC round-trips into the main process with no
// timeout of their own (#93454). A wedged main-process round-trip (e.g. a
// stuck revalidation after a liveness-probe trip) otherwise hangs an awaiting
// caller forever. Every caller of these bounds them with this shared budget.
export const RECONNECT_ATTEMPT_TIMEOUT_MS = 20_000

/** Rejection raised by withTimeout. The bounded work is NOT cancelled — the
 * caller decides what a straggler that settles later means. */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError
}

/** Settle with `promise`, or reject with a TimeoutError after `ms`.
 * `onTimeout` runs synchronously before the rejection is published so callers
 * can revoke ownership of work that would otherwise keep running unowned. If
 * that callback throws, its error becomes this promise's rejection. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
  onTimeout?: (error: TimeoutError) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new TimeoutError(message)

      try {
        onTimeout?.(error)
      } catch (onTimeoutError) {
        reject(onTimeoutError)

        return
      }

      reject(error)
    }, ms)

    Promise.resolve(promise).then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      err => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

/** Hard ceiling for a primary-backend boot wait that main keeps reporting
 * progress on. A first launch runs the full install (clone, Python, venv,
 * dependencies) before the backend even spawns; on a slow network that can
 * take many minutes, all of it visible as live progress. */
export const BACKEND_BOOT_MAX_WAIT_MS = 20 * 60_000

/** Signals a withStallTimeout watcher feeds back: `touch` restarts the stall
 * clock (main just reported progress); `hold(true)` pauses it entirely (a
 * phase with its own progress UI and failure path, such as the first-run
 * install, is running) and `hold(false)` resumes it with a fresh budget. */
export interface StallTimeoutActivity {
  hold: (held: boolean) => void
  touch: () => void
}

/** Like withTimeout, but the budget bounds SILENCE rather than total time:
 * the clock restarts on every `touch` and is suspended while held, so a slow
 * but visibly progressing wait never trips it, while a wedged one still
 * fails after `stallMs`. `maxMs` caps the total regardless of activity.
 * `watch` subscribes to activity and returns its unsubscribe, which runs once
 * the wait settles either way. */
export function withStallTimeout<T>(
  promise: Promise<T>,
  options: {
    maxMs?: number
    message: string
    stallMs: number
    watch: (activity: StallTimeoutActivity) => () => void
  }
): Promise<T> {
  const { maxMs, message, stallMs, watch } = options

  return new Promise<T>((resolve, reject) => {
    let settled = false
    let held = false
    let stallTimer: ReturnType<typeof setTimeout> | null = null
    let maxTimer: ReturnType<typeof setTimeout> | null = null
    let unwatch: (() => void) | null = null

    const clearStall = () => {
      if (stallTimer !== null) {
        clearTimeout(stallTimer)
        stallTimer = null
      }
    }

    const finish = (settle: () => void) => {
      if (settled) {
        return
      }

      settled = true
      clearStall()

      if (maxTimer !== null) {
        clearTimeout(maxTimer)
        maxTimer = null
      }

      try {
        unwatch?.()
      } catch {
        // a failing unsubscribe must not mask the outcome
      }

      settle()
    }

    const timeOut = () => finish(() => reject(new TimeoutError(message)))

    const armStall = () => {
      clearStall()

      if (!settled && !held) {
        stallTimer = setTimeout(timeOut, stallMs)
      }
    }

    armStall()

    if (maxMs !== undefined) {
      maxTimer = setTimeout(timeOut, maxMs)
    }

    try {
      const off = watch({
        hold: next => {
          held = next
          armStall()
        },
        touch: () => {
          if (!held) {
            armStall()
          }
        }
      })

      if (settled) {
        off()
      } else {
        unwatch = off
      }
    } catch {
      // No activity feed: degrade to a plain stall budget.
    }

    Promise.resolve(promise).then(
      value => finish(() => resolve(value)),
      err => finish(() => reject(err))
    )
  })
}
