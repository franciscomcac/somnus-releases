import { atom } from 'nanostores'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const $terminalOpen = atom(false)

const revealDesktopPane = vi.fn(() => {
  $terminalOpen.set(true)

  return true
})
const openPreview = vi.fn()
const revealReview = vi.fn()
const setTerminalTakeover = vi.fn((open: boolean) => $terminalOpen.set(open))

vi.mock('./pane-focus', () => ({ revealDesktopPane }))
vi.mock('./preview', () => ({ openPreview }))
vi.mock('./review', () => ({ revealReview }))
vi.mock('@/app/right-sidebar/store', () => ({ $terminalTakeover: $terminalOpen, setTerminalTakeover }))

const {
  $autoRevealPanes,
  autoRevealForTool,
  autoRevealPaneFor,
  browsableUrl,
  noteTerminalUserInput,
  resetAutoReveal,
  settleTerminalTool,
  TERMINAL_REVEAL_DELAY_MS
} = await import('./auto-reveal')

describe('auto-reveal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    $autoRevealPanes.set(true)
    $terminalOpen.set(false)
    resetAutoReveal('s1')
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('maps tools to panes', () => {
    expect(autoRevealPaneFor('start', { name: 'terminal' })).toBe('terminal')
    expect(autoRevealPaneFor('start', { name: 'browser_navigate' })).toBe('browser')
    expect(autoRevealPaneFor('start', { name: 'web_search' })).toBeNull()
    expect(autoRevealPaneFor('complete', { name: 'write_file' })).toBe('review')
    expect(autoRevealPaneFor('complete', { name: 'read_file' })).toBeNull()
  })

  it('only shows real web addresses in the browser', () => {
    expect(browsableUrl({ args: { url: 'https://example.com' } })).toBe('https://example.com')
    expect(browsableUrl({ args: '{"url":"http://a.b"}' })).toBe('http://a.b')
    expect(browsableUrl({ args: { url: 'file:///etc/passwd' } })).toBeNull()
  })

  it('never opens the terminal for a quick command', () => {
    autoRevealForTool('s1', 'start', { name: 'terminal' }, true)
    settleTerminalTool('s1', { name: 'terminal' })
    vi.advanceTimersByTime(TERMINAL_REVEAL_DELAY_MS * 2)

    expect(revealDesktopPane).not.toHaveBeenCalled()
  })

  it('opens the terminal for a long command, once per turn', () => {
    autoRevealForTool('s1', 'start', { name: 'terminal' }, true)
    vi.advanceTimersByTime(TERMINAL_REVEAL_DELAY_MS)
    expect(revealDesktopPane).toHaveBeenCalledTimes(1)

    settleTerminalTool('s1', { name: 'terminal' })
    autoRevealForTool('s1', 'start', { name: 'terminal' }, true)
    vi.advanceTimersByTime(TERMINAL_REVEAL_DELAY_MS)
    expect(revealDesktopPane).toHaveBeenCalledTimes(1)
  })

  it('folds an auto-opened terminal away when the reply ends', () => {
    autoRevealForTool('s1', 'start', { name: 'terminal' }, true)
    vi.advanceTimersByTime(TERMINAL_REVEAL_DELAY_MS)
    resetAutoReveal('s1')

    expect(setTerminalTakeover).toHaveBeenCalledWith(false)
  })

  it('keeps the terminal open once you type into it', () => {
    autoRevealForTool('s1', 'start', { name: 'terminal' }, true)
    vi.advanceTimersByTime(TERMINAL_REVEAL_DELAY_MS)
    noteTerminalUserInput()
    resetAutoReveal('s1')

    expect(setTerminalTakeover).not.toHaveBeenCalled()
  })

  it('never folds a terminal you had open yourself', () => {
    $terminalOpen.set(true)
    autoRevealForTool('s1', 'start', { name: 'terminal' }, true)
    vi.advanceTimersByTime(TERMINAL_REVEAL_DELAY_MS)
    resetAutoReveal('s1')

    expect(setTerminalTakeover).not.toHaveBeenCalled()
  })

  it('opens the browser at the page the agent visits', () => {
    autoRevealForTool('s1', 'start', { name: 'browser_navigate', args: { url: 'https://news.ycombinator.com' } }, true)
    expect(openPreview).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'url', url: 'https://news.ycombinator.com' }),
      'tool-result'
    )
  })

  it('opens Changes after a file edit lands', () => {
    expect(autoRevealForTool('s1', 'complete', { name: 'patch' }, true)).toBe('review')
    expect(revealReview).toHaveBeenCalledTimes(1)
  })

  it('never acts for a background chat or when switched off', () => {
    expect(autoRevealForTool('s1', 'start', { name: 'terminal' }, false)).toBeNull()
    $autoRevealPanes.set(false)
    expect(autoRevealForTool('s1', 'start', { name: 'terminal' }, true)).toBeNull()
    vi.advanceTimersByTime(TERMINAL_REVEAL_DELAY_MS * 2)
    expect(revealDesktopPane).not.toHaveBeenCalled()
  })
})
