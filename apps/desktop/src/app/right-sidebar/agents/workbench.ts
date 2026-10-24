import { restoreTreePane } from '@/components/pane-shell/tree/store'

export type WorkbenchTab = 'agents' | 'files' | 'review' | 'terminal'

/** Ctrl+Shift+1…4: open a workbench tab (through its own store, so its toggles stay
 *  truthful) and bring it to the front. */
export function showWorkbenchTab(tab: WorkbenchTab) {
  restoreTreePane(tab)
}
