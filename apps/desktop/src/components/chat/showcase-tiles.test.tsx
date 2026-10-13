import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const insert = vi.fn()
const focus = vi.fn()

vi.mock('@/app/chat/composer/focus', () => ({
  requestComposerFocus: (...args: unknown[]) => focus(...args),
  requestComposerInsert: (...args: unknown[]) => insert(...args)
}))

const openBrowserTab = vi.fn()

vi.mock('@/store/preview', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  openBrowserTab: () => openBrowserTab()
}))

import { SHOWCASE_DEMOS, ShowcaseTiles } from './showcase-tiles'

describe('ShowcaseTiles', () => {
  afterEach(cleanup)

  beforeEach(() => {
    insert.mockClear()
    focus.mockClear()
    openBrowserTab.mockClear()
    window.location.hash = ''
  })

  it('drops a demo prompt into the composer without sending it', () => {
    render(<ShowcaseTiles />)
    fireEvent.click(screen.getByText('Research into a spreadsheet'))
    expect(insert).toHaveBeenCalledWith(SHOWCASE_DEMOS[0].prompt)
    expect(focus).toHaveBeenCalled()
  })

  it('opens the browser pane before the browsing demo', () => {
    render(<ShowcaseTiles />)
    fireEvent.click(screen.getByText('Watch it browse'))
    expect(openBrowserTab).toHaveBeenCalled()
    expect(insert).toHaveBeenCalled()
  })

  it('navigates to the star map', () => {
    render(<ShowcaseTiles />)
    fireEvent.click(screen.getByText('Star map'))
    expect(window.location.hash).toBe('#/starmap')
  })
})
