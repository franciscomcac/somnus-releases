import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useState } from 'react'

import { SidebarPanelLabel } from '@/app/shell/sidebar-label'
import { cn } from '@/lib/utils'
import type { SubagentProgress, SubagentStreamEntry } from '@/store/subagents'

import { $activeSubagents, agentTitle, compactTokens } from './store'

const STATUS_LABEL: Record<SubagentProgress['status'], string> = {
  completed: 'done',
  failed: 'failed',
  interrupted: 'stopped',
  queued: 'queued',
  running: 'working'
}

function isLive(agent: SubagentProgress) {
  return agent.status === 'running' || agent.status === 'queued'
}

/** What the card says the agent is doing right now. */
function activityLine(agent: SubagentProgress): string {
  if (agent.status === 'completed') {
    return agent.summary?.split('\n')[0] || 'Finished'
  }

  if (agent.status === 'failed') {
    return agent.summary?.split('\n')[0] || 'Something went wrong'
  }

  if (agent.status === 'queued') {
    return 'Waiting for its turn'
  }

  const latest = agent.stream.at(-1)

  if (agent.currentTool) {
    return latest?.kind === 'tool' ? latest.text : `Using ${agent.currentTool}`
  }

  return latest?.text || 'Thinking'
}

function AgentCard({
  agent,
  index,
  onSelect,
  selected
}: {
  agent: SubagentProgress
  index: number
  onSelect: () => void
  selected: boolean
}) {
  const live = isLive(agent)
  const tokens = (agent.inputTokens ?? 0) + (agent.outputTokens ?? 0)

  return (
    <button
      aria-pressed={selected}
      className={cn(
        'flex min-w-0 flex-col gap-2.5 rounded-[0.625rem] border bg-(--ui-widget-surface-background) p-3 text-left transition-colors',
        selected
          ? 'border-(--ui-text-tertiary) shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
          : 'border-(--ui-stroke-tertiary) hover:border-(--ui-stroke-secondary)'
      )}
      data-agent-card={agent.id}
      onClick={onSelect}
      type="button"
    >
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 truncate text-[0.8125rem] font-medium text-(--ui-text-primary)">
          {agentTitle(agent.goal, index)}
        </span>
        <span className="shrink-0 font-mono text-[0.6875rem] text-(--ui-text-tertiary)">
          {STATUS_LABEL[agent.status]}
        </span>
        {live && (
          <span
            aria-hidden="true"
            className="ml-auto size-3 shrink-0 animate-spin rounded-full border border-(--ui-text-tertiary) border-t-transparent"
          />
        )}
      </span>

      <span className="truncate font-mono text-[0.75rem] text-(--ui-text-secondary)">{activityLine(agent)}</span>

      <span className="relative h-[3px] overflow-hidden rounded-full bg-(--ui-stroke-tertiary)">
        <span
          className={cn(
            'absolute inset-y-0 left-0 rounded-full bg-(--ui-text-primary)',
            live ? 'somnus-agent-progress w-2/5' : agent.status === 'completed' ? 'w-full' : 'w-full opacity-30'
          )}
        />
      </span>

      <span className="flex items-center justify-between font-mono text-[0.6875rem] text-(--ui-text-tertiary)">
        <span>
          {agent.taskCount > 1 ? `task ${agent.taskIndex + 1}/${agent.taskCount}` : 'task'}
          {agent.toolCount ? ` · ${agent.toolCount} steps` : ''}
        </span>
        <span>{compactTokens(tokens)} tokens</span>
      </span>
    </button>
  )
}

const STREAM_PREFIX: Record<SubagentStreamEntry['kind'], string> = {
  progress: '·',
  summary: '✓',
  thinking: '…',
  tool: '$'
}

function AgentActivity({ agent }: { agent: SubagentProgress }) {
  const entries = agent.stream.slice(-16)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[0.625rem] border border-(--ui-stroke-tertiary) bg-(--ui-widget-surface-background)">
      <div className="flex shrink-0 items-center gap-2 border-b border-(--ui-stroke-tertiary) px-3 py-2 font-mono text-[0.6875rem] text-(--ui-text-tertiary)">
        <span className="text-(--ui-text-primary)">activity</span>
        <span className="truncate">{agent.model || agentTitle(agent.goal, 0)}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[0.75rem] leading-[1.7]">
        <p className="text-(--ui-text-secondary)">
          <span className="text-(--ui-text-tertiary)">goal </span>
          {agent.goal}
        </p>
        {entries.length === 0 && <p className="text-(--ui-text-tertiary)">Waiting for the first step…</p>}
        {entries.map((entry, i) => (
          <p
            className={cn(
              'truncate',
              entry.isError
                ? 'text-(--ui-red)'
                : entry.kind === 'tool'
                  ? 'text-(--ui-text-primary)'
                  : 'text-(--ui-text-secondary)'
            )}
            key={`${entry.at}-${i}`}
            title={entry.text}
          >
            <span className="mr-2 text-(--ui-text-tertiary)">{STREAM_PREFIX[entry.kind]}</span>
            {entry.text}
          </p>
        ))}
      </div>
    </div>
  )
}

function AgentFiles({ agent }: { agent: SubagentProgress }) {
  const written = agent.filesWritten
  const read = agent.filesRead.filter(file => !written.includes(file))

  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[0.625rem] border border-(--ui-stroke-tertiary) bg-(--ui-widget-surface-background) @[34rem]/agents:w-[42%]">
      <div className="flex shrink-0 items-center gap-2 border-b border-(--ui-stroke-tertiary) px-3 py-2 font-mono text-[0.6875rem] text-(--ui-text-tertiary)">
        <span className="text-(--ui-text-primary)">files</span>
        <span>{written.length ? `${written.length} changed` : 'none changed'}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[0.75rem] leading-[1.7]">
        {written.length === 0 && read.length === 0 && <p className="text-(--ui-text-tertiary)">No files touched yet</p>}
        {written.map(file => (
          <p className="truncate text-(--ui-text-primary)" key={`w-${file}`} title={file}>
            <span className="mr-2 text-(--ui-text-tertiary)">edit</span>
            {file}
          </p>
        ))}
        {read.slice(0, 12).map(file => (
          <p className="truncate text-(--ui-text-secondary)" key={`r-${file}`} title={file}>
            <span className="mr-2 text-(--ui-text-tertiary)">read</span>
            {file}
          </p>
        ))}
      </div>
    </div>
  )
}

/** Somnus workbench: every helper agent on the chat's task, at a glance. */
export function AgentsPane() {
  const agents = useStore($activeSubagents)
  const [selectedId, setSelectedId] = useState<null | string>(null)

  // Follow the newest working agent until you pick one yourself.
  const selected = useMemo(
    () => agents.find(agent => agent.id === selectedId) ?? [...agents].reverse().find(isLive) ?? agents.at(-1) ?? null,
    [agents, selectedId]
  )

  useEffect(() => {
    if (selectedId && !agents.some(agent => agent.id === selectedId)) {
      setSelectedId(null)
    }
  }, [agents, selectedId])

  const running = agents.filter(isLive).length

  return (
    <div className="@container/agents flex h-full min-h-0 flex-col gap-3 p-3" data-somnus-agents-pane="">
      <div className="flex shrink-0 items-center justify-between">
        <SidebarPanelLabel
          className="pl-0.5"
          data-pane-self-label=""
          meta={running ? `${running} running` : agents.length ? 'idle' : ''}
          variant="pane"
        >
          Agents
        </SidebarPanelLabel>
      </div>

      {agents.length === 0 ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <p className="max-w-64 text-[0.8125rem] leading-relaxed text-(--ui-text-tertiary)">
            When a task is split across several agents, each one shows up here with what it is doing.
          </p>
        </div>
      ) : (
        <>
          <div className="grid shrink-0 grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-2.5">
            {agents.map((agent, index) => (
              <AgentCard
                agent={agent}
                index={index}
                key={agent.id}
                onSelect={() => setSelectedId(agent.id)}
                selected={selected?.id === agent.id}
              />
            ))}
          </div>

          {selected && (
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 @[34rem]/agents:flex-row">
              <AgentActivity agent={selected} />
              <AgentFiles agent={selected} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
