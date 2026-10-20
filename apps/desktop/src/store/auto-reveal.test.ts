import { beforeEach, describe, expect, it, vi } from 'vitest'

const revealDesktopPane = vi.fn(() => true)
const openPreview = vi.fn()
const revealReview = vi.fn()

vi.mock('./pane-focus', () => ({ revealDesktopPane }))
vi.mock('./preview', () => ({ openPreview }))
vi.mock('./review', () => ({ revealReview }))

const { $autoRevealPanes, autoRevealForTool, autoRevealPaneFor, browsableUrl, resetAutoReveal } = await import(
  './auto-reveal'
)

describe('auto-reveal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    $autoRevealPanes.set(true)
    resetAutoReveal('s1')
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

  it('opens the terminal once per turn, and again after the turn ends', () => {
    expect(autoRevealForTool('s1', 'start', { name: 'terminal' }, true)).toBe('terminal')
    expect(autoRevealForTool('s1', 'start', { name: 'terminal' }, true)).toBeNull()
    expect(revealDesktopPane).toHaveBeenCalledTimes(1)

    resetAutoReveal('s1')
    expect(autoRevealForTool('s1', 'start', { name: 'terminal' }, true)).toBe('terminal')
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
    expect(revealDesktopPane).not.toHaveBeenCalled()
  })
})
