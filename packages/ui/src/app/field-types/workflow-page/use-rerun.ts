import { useState } from 'react'
import { isApiError } from '@protobase/client'
import { useClient } from '../../../data/api-provider'
import { useFocusRecord } from '../../focus/focus-record'
import { useAppAddress } from '../../use-app-address'
import { runAddress, workflowsResource, type WorkflowView } from './workflow-view'

/**
 * Starts a re-run or a replay of the run shown, in place: unsaved changes are saved first, as the new run takes the
 * version saved last, and the new run then shows on the graph. `failure` is what stopped it.
 */
export const useRerun = (view: WorkflowView, onStarted: () => void) => {
  const focus = useFocusRecord()!
  const client = useClient()
  const { go } = useAppAddress()
  const [failure, setFailure] = useState<unknown>()
  const [refused, setRefused] = useState(false)
  const [busy, setBusy] = useState(false)
  const start = async (body: { rerun_from?: string; replay?: boolean }) => {
    setBusy(true)
    setFailure(undefined)
    setRefused(false)
    if (focus.dirty && !(await focus.save())) {
      setRefused(true)
      setBusy(false)
      return
    }
    try {
      const { record: run } = await client.create('workflow_runs', { workflow_id: view.workflow, rerun_of: view.run, ...body })
      const { record: workflow } = await client.get(workflowsResource, view.workflow)
      onStarted()
      go(runAddress(view.workflow, String(run.id), Number(run.version), Number(workflow.version)))
    } catch (error) {
      if (!isApiError(error)) throw error
      setFailure(error)
    }
    setBusy(false)
  }
  return { start, failure, refused, busy }
}
