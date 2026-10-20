import type * as React from 'react'

import { cn } from '@/lib/utils'

interface SidebarPanelLabelProps extends React.ComponentProps<'span'> {
  dotClassName?: string
  /** Somnus App v2: a short mono status after the title ("idle", "3 files"). */
  meta?: React.ReactNode
  /** `section` = quiet uppercase rail label (TODAY / PINNED);
   *  `pane` = a pane's title, normal case ("Changes", "Terminal"). */
  variant?: 'pane' | 'section'
}

export function SidebarPanelLabel({
  children,
  className,
  dotClassName,
  meta,
  variant = 'section',
  ...props
}: SidebarPanelLabelProps) {
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-2 pl-2',
        variant === 'pane'
          ? 'text-[0.8125rem] font-medium text-(--ui-text-primary)'
          : 'text-[0.6875rem] font-medium uppercase tracking-[0.06em] text-(--ui-text-tertiary)',
        className
      )}
      {...props}
    >
      {/* Somnus App v2 drops the dither square; kept as an opt-in for callers
          that pass dotClassName. */}
      {dotClassName && (
        <span aria-hidden="true" className={cn('dither inline-block size-2 shrink-0 rounded-[1px]', dotClassName)} />
      )}
      <span className="min-w-0 truncate leading-none">{children}</span>
      {meta !== undefined && meta !== null && meta !== '' && (
        <span className="shrink-0 font-mono text-[0.6875rem] font-normal normal-case tracking-normal text-(--ui-text-tertiary)">
          {meta}
        </span>
      )}
    </span>
  )
}
