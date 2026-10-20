import { useStore } from '@nanostores/react'
import { type FC, useMemo } from 'react'

import { useComposerScope } from '@/app/chat/composer/scope'
import { useSessionView } from '@/app/chat/session-view'
import { deriveChangedFiles } from '@/components/assistant-ui/thread/changed-files'
import { formatElapsed } from '@/components/chat/activity-timer'
import { WIDGET_SHELL_CLASS } from '@/components/chat/widget-shell'
import { Button } from '@/components/ui/button'
import { DiffCount } from '@/components/ui/diff-count'
import { FadeScroll } from '@/components/ui/fade-scroll'
import { FileTypeIcon } from '@/components/ui/file-type-icon'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { displayPath } from '@/lib/display-path'
import { Check } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { openReviewForPath, revealReview } from '@/store/review'

// ~5 rows. A turn that rewrites twenty files should still read as one card in
// the transcript, not a wall the user has to scroll past to reach the composer.
const MAX_ROWS_HEIGHT = '9.375rem'

/**
 * Cursor-style "N files changed" summary closing out the newest assistant turn:
 * one row per file it edited with that file's +/-, and a Review action opening
 * the diff pane (⌘G). A row click opens that file's diff directly.
 *
 * Wears the shared `WIDGET_SHELL_CLASS` so it reads as the same panel as the
 * transcript's other inline widgets rather than inventing its own chrome.
 */
export const ChangedFilesCard: FC<{ parts: readonly unknown[] }> = ({ parts }) => {
  const { t } = useI18n()
  const copy = t.assistant.thread
  const files = useMemo(() => deriveChangedFiles(parts), [parts])
  // Review THIS surface's repo: a tile transcript pins the pane to the tile's
  // worktree; the primary passes null (follow the active session, as before).
  const view = useSessionView()
  const viewCwd = useStore(view.$cwd)
  const scopeCwd = view.kind === 'primary' ? null : viewCwd || null
  const composerScope = useComposerScope()

  if (files.length === 0) {
    return null
  }

  return (
    <div
      className={cn(WIDGET_SHELL_CLASS, 'mt-1.5 text-[length:var(--conversation-tool-font-size)]')}
      data-slot="aui_changed-files"
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-(--ui-text-primary)">{copy.filesChanged(files.length)}</span>
        <button
          className="shrink-0 cursor-pointer text-(--ui-text-tertiary) transition-colors hover:text-(--ui-text-primary)"
          onClick={() => revealReview(scopeCwd, composerScope.target)}
          type="button"
        >
          {copy.reviewChanges}
        </button>
      </div>
      <FadeScroll className="-mx-1.5 mt-1.5 flex flex-col overscroll-y-auto px-1.5" maxHeight={MAX_ROWS_HEIGHT}>
        {files.map(file => (
          <Tip key={file.path} label={displayPath(file.path)}>
            <button
              className="row-hover flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 text-left"
              onClick={() => void openReviewForPath(file.path, scopeCwd, composerScope.target)}
              type="button"
            >
              <FileTypeIcon className="shrink-0 text-(--ui-text-tertiary)" path={file.path} size="0.875rem" />
              <span className="min-w-0 flex-1 truncate text-(--ui-text-secondary)">{file.name}</span>
              <DiffCount added={file.added} removed={file.removed} />
            </button>
          </Tip>
        ))}
      </FadeScroll>
    </div>
  )
}

const isToolCallPart = (part: unknown): boolean =>
  Boolean(part) && typeof part === 'object' && (part as { type?: unknown }).type === 'tool-call'

/**
 * Somnus App v2: the card that closes a turn in which the agent DID something
 * (at least one tool call). Green check, "Done", how many steps and how long,
 * then the files it changed and a Review button. A plain answer (no tools)
 * gets no card. One per thread: only the settled last message renders it.
 */
export const TurnDoneCard: FC<{ durationS?: number; parts: readonly unknown[] }> = ({ durationS, parts }) => {
  const { t } = useI18n()
  const copy = t.assistant.thread
  const files = useMemo(() => deriveChangedFiles(parts), [parts])
  const steps = useMemo(() => parts.filter(isToolCallPart).length, [parts])
  const view = useSessionView()
  const viewCwd = useStore(view.$cwd)
  const scopeCwd = view.kind === 'primary' ? null : viewCwd || null
  const composerScope = useComposerScope()

  if (steps === 0) {
    return null
  }

  const stepLabel = copy.turnSteps?.(steps) ?? (steps === 1 ? '1 step' : `${steps} steps`)

  const meta = [stepLabel, durationS !== undefined ? formatElapsed(durationS) : '', files.length ? copy.filesChanged(files.length) : '']
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className="mt-2 rounded-[0.75rem] border border-(--ui-stroke-tertiary) bg-card px-3.5 py-3 text-[length:var(--conversation-tool-font-size)] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]"
      data-slot="aui_turn-done"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-4 shrink-0 place-items-center rounded-full bg-(--ui-green) text-white">
          <Check aria-hidden="true" className="size-3" strokeWidth={3} />
        </span>
        <span className="text-[0.8125rem] font-semibold text-(--ui-text-primary)">{copy.turnDone ?? t.common.done}</span>
        <span className="min-w-0 truncate font-mono text-[0.6875rem] text-(--ui-text-tertiary)">{meta}</span>
      </div>
      {files.length > 0 && (
        <>
          <FadeScroll className="-mx-1.5 mt-2 flex flex-col overscroll-y-auto px-1.5" maxHeight={MAX_ROWS_HEIGHT}>
            {files.map(file => (
              <Tip key={file.path} label={displayPath(file.path)}>
                <button
                  className="row-hover flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 text-left"
                  onClick={() => void openReviewForPath(file.path, scopeCwd, composerScope.target)}
                  type="button"
                >
                  <span aria-hidden="true" className="text-(--ui-text-quaternary)">
                    –
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-(--ui-text-secondary)">{file.name}</span>
                  <DiffCount added={file.added} removed={file.removed} />
                </button>
              </Tip>
            ))}
          </FadeScroll>
          <div className="mt-2.5 flex items-center gap-2">
            <Button onClick={() => revealReview(scopeCwd, composerScope.target)} size="sm" type="button">
              {copy.reviewChangesLong ?? 'Review changes'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
