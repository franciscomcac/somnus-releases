import { describe, expect, it, vi } from 'vitest'

import { type StallTimeoutActivity, withStallTimeout, withTimeout } from './with-timeout'

describe('withTimeout', () => {
  it('rejects with an onTimeout exception instead of letting it escape the timer callback', async () => {
    vi.useFakeTimers()

    try {
      const callbackFailure = new Error('abort callback failed')

      const result = withTimeout(new Promise<never>(() => undefined), 10, 'work timed out', () => {
        throw callbackFailure
      })

      const rejection = expect(result).rejects.toBe(callbackFailure)

      await vi.advanceTimersByTimeAsync(10)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('withStallTimeout', () => {
  const pending = () => new Promise<never>(() => undefined)

  it('bounds silence, not total time: each touch restarts the clock', async () => {
    vi.useFakeTimers()

    try {
      let activity: null | StallTimeoutActivity = null
      let settled = false

      const result = withStallTimeout(pending(), {
        message: 'stalled',
        stallMs: 100,
        watch: a => {
          activity = a

          return () => undefined
        }
      })

      void result.catch(() => {
        settled = true
      })

      for (let i = 0; i < 5; i += 1) {
        await vi.advanceTimersByTimeAsync(90)
        activity!.touch()
      }

      expect(settled).toBe(false)

      const rejection = expect(result).rejects.toThrow('stalled')
      await vi.advanceTimersByTimeAsync(100)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })

  it('pauses while held and resumes with a fresh budget, under the hard ceiling', async () => {
    vi.useFakeTimers()

    try {
      let activity: null | StallTimeoutActivity = null
      const unwatch = vi.fn()
      let settled = false

      const result = withStallTimeout(pending(), {
        maxMs: 10_000,
        message: 'stalled',
        stallMs: 100,
        watch: a => {
          activity = a

          return unwatch
        }
      })

      void result.catch(() => {
        settled = true
      })

      activity!.hold(true)
      await vi.advanceTimersByTimeAsync(5_000)
      activity!.touch()
      await vi.advanceTimersByTimeAsync(4_000)
      expect(settled).toBe(false)

      activity!.hold(false)
      await vi.advanceTimersByTimeAsync(99)
      expect(settled).toBe(false)

      const rejection = expect(result).rejects.toThrow('stalled')
      await vi.advanceTimersByTimeAsync(1)
      await rejection
      expect(unwatch).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('the hard ceiling fires even while held', async () => {
    vi.useFakeTimers()

    try {
      const result = withStallTimeout(pending(), {
        maxMs: 1_000,
        message: 'too long',
        stallMs: 100,
        watch: a => {
          a.hold(true)

          return () => undefined
        }
      })

      const rejection = expect(result).rejects.toThrow('too long')
      await vi.advanceTimersByTimeAsync(1_000)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })

  it('settles with the work and unsubscribes', async () => {
    const unwatch = vi.fn()

    await expect(
      withStallTimeout(Promise.resolve(7), { message: 'x', stallMs: 100, watch: () => unwatch })
    ).resolves.toBe(7)
    expect(unwatch).toHaveBeenCalledTimes(1)
  })
})
