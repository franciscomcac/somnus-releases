import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/pane-shell/tree/store', async importOriginal => ({
  ...(await importOriginal<object>()),
  revealTreePane: vi.fn()
}))

const { $activeSessionId } = await import('@/store/session')
const { $subagentsBySession } = await import('@/store/subagents')
const { $activeSubagents, $agentsPaneOpen, agentTitle, compactTokens, dismissAgentsPane, showAgentsPane } =
  await import('./store')

const agent = (id: string, taskIndex = 0, status = 'running') =>
  ({
    id,
    parentId: null,
    goal: `Goal ${id}`,
    status,
    taskCount: 3,
    taskIndex,
    startedAt: 1,
    updatedAt: 1,
    filesRead: [],
    filesWritten: [],
    stream: []
  }) as never

describe('agents tab', () => {
  beforeEach(() => {
    $activeSessionId.set(null)
    $subagentsBySession.set({})
  })

  it('stays hidden for a chat without helpers', () => {
    $activeSessionId.set('chat-a')
    expect($agentsPaneOpen.get()).toBe(false)
  })

  it('shows helpers in task order and keeps them after they are pruned', () => {
    $activeSessionId.set('chat-b')
    $subagentsBySession.set({ 'chat-b': [agent('b2', 1), agent('b1', 0)] })
    expect($activeSubagents.get().map(a => a.id)).toEqual(['b1', 'b2'])
    expect($agentsPaneOpen.get()).toBe(true)

    $subagentsBySession.set({ 'chat-b': [] })
    expect($activeSubagents.get().map(a => a.id)).toEqual(['b1', 'b2'])
  })

  it('closing sticks until new helpers start', () => {
    $activeSessionId.set('chat-c')
    $subagentsBySession.set({ 'chat-c': [agent('c1')] })
    dismissAgentsPane()
    expect($agentsPaneOpen.get()).toBe(false)

    $subagentsBySession.set({ 'chat-c': [agent('c2')] })
    expect($agentsPaneOpen.get()).toBe(true)
  })

  it('can be opened by hand', () => {
    $activeSessionId.set('chat-d')
    showAgentsPane()
    expect($agentsPaneOpen.get()).toBe(true)
    dismissAgentsPane()
  })

  it('formats titles and token counts', () => {
    expect(agentTitle('Plan the fix for the failing build', 0)).toBe('Plan the fix for…')
    expect(agentTitle('', 2)).toBe('Agent 3')
    expect(compactTokens(9300)).toBe('9.3k')
    expect(compactTokens(42)).toBe('42')
  })
})
