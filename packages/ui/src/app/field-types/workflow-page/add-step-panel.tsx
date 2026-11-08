import { useMemo } from 'react'
import type { WorkflowTypeList } from '@protobase/client'
import { FocusPanel } from '../../../focus-page'
import { SearchPicker } from '../../../search-picker'
import { pickedState, stepGroups } from './step-catalog'
import type { NewState } from '../workflow/definition-edits'
import { text } from './messages'

export type AddStepPanelProps = {
  types: WorkflowTypeList
  /** Where the step will land, in words. */
  placement: string
  onAdd: (kind: NewState) => void
  onClose: () => void
}

/** The step picker in the end panel: search every step the app can run and the states that steer it, and add one where it says. */
export const AddStepPanel = ({ types, placement, onAdd, onClose }: AddStepPanelProps) => {
  const groups = useMemo(() => stepGroups(types), [types])
  return (
    <FocusPanel title={text('addStepTitle')} onClose={onClose} takesFocus>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">{placement}</p>
        <SearchPicker autoFocus groups={groups} onPick={(item) => onAdd(pickedState(item.id))} />
      </div>
    </FocusPanel>
  )
}
