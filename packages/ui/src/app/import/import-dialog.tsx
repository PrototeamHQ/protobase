import type { ResourceModel, ViewModel } from '@protobase/schema'
import { humanize } from '../../live/naming'
import { Button } from '../../primitives/button'
import { ResponsiveDialog } from '../../primitives/responsive-dialog'
import { ErrorBanner } from '../error-banner'
import { ImportChecking, ImportCheckStep } from './import-check-step'
import { ImportFileStep } from './import-file-step'
import { ImportMappingStep } from './import-mapping-step'
import { ImportProgressStep, ImportSummary } from './import-result-step'
import { unmappedRequired } from './mapping'
import type { SheetSource } from './sheet-source'
import { useImportFlow, type ImportFlow } from './use-import-flow'
import { formatTag } from '../../locale/active-locale'

export type ImportDialogProps = {
  model: ResourceModel
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  /** Whether the user may update records, which the update modes need. */
  canUpdate: boolean
  onClose: () => void
  /** Reads the chosen file; a Web Worker by default. */
  sourceFor?: (file: File) => SheetSource
}

const errorTitle = (flow: ImportFlow) => (flow.step.kind === 'file' ? 'Could not read the file' : 'Could not check the rows')

// Whether the mapping is complete enough to check: a column to import, the fields new records need, and the column
// that finds the records to update
const readyToCheck = (flow: ImportFlow) => {
  if (flow.columns.length === 0) return false
  if (flow.mode === 'create') return unmappedRequired('create', flow.fields, flow.columns).length === 0
  return flow.match !== undefined
}

/**
 * Imports records from an .xlsx or CSV file into a resource: choose the file (and its sheet), map its columns to
 * fields, check every row, then write them in batches with progress, Cancel between batches, and a summary with the rows
 * not imported to download.
 */
export const ImportDialog = ({ model, resources, views, canUpdate, onClose, sourceFor }: ImportDialogProps) => {
  const flow = useImportFlow({ model, resources, views, sourceFor })
  const view = views[model.name]
  const plural = view?.names?.plural ?? humanize(model.name)
  const { step } = flow
  const headers = flow.head?.headers ?? []

  const close = () => {
    if (step.kind === 'importing') return
    flow.stop()
    onClose()
  }
  const cancelButton = <Button onClick={close}>Cancel</Button>

  const actions = () => {
    switch (step.kind) {
      case 'file':
        return (
          <>
            {cancelButton}
            {flow.sheets.length > 1 && (
              <Button variant="primary" loading={step.reading} onClick={flow.openSheet}>
                Next
              </Button>
            )}
          </>
        )
      case 'map':
        return (
          <>
            {cancelButton}
            <Button variant="primary" disabled={!readyToCheck(flow)} onClick={flow.check}>
              Check rows
            </Button>
          </>
        )
      case 'checking':
        return (
          <>
            <Button onClick={flow.back}>Back</Button>
            <Button variant="primary" loading>
              Checking
            </Button>
          </>
        )
      case 'checked': {
        const rows = step.check.creates + step.check.updates
        return (
          <>
            <Button onClick={flow.back}>Back</Button>
            <Button variant="primary" disabled={rows === 0} onClick={() => flow.start(rows)}>
              Import {rows.toLocaleString(formatTag())} {rows === 1 ? 'row' : 'rows'}
            </Button>
          </>
        )
      }
      case 'importing':
        return (
          <Button variant="danger" disabled={step.cancelling} onClick={flow.cancel}>
            Cancel import
          </Button>
        )
      case 'done':
        return (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        )
    }
  }

  const body = () => {
    switch (step.kind) {
      case 'file':
        return <ImportFileStep file={flow.file} sheets={flow.sheets} sheet={flow.sheet} reading={step.reading} onChoose={flow.choose} onSheet={flow.setSheet} />
      case 'map':
        return <ImportMappingStep flow={flow} model={model} resources={resources} views={views} canUpdate={canUpdate} />
      case 'checking':
        return <ImportChecking rows={step.rows} />
      case 'checked':
        return <ImportCheckStep check={step.check} model={model} resources={resources} views={views} columns={flow.columns} headers={headers} fileName={flow.file?.name} />
      case 'importing':
        return <ImportProgressStep progress={step.progress} total={step.total} cancelling={step.cancelling} />
      case 'done':
        return <ImportSummary result={step.result} stopped={step.stopped} headers={headers} fileName={flow.file?.name} />
    }
  }

  return (
    <ResponsiveDialog open wide title={`Import ${plural.toLowerCase()}`} description={flow.file && step.kind !== 'file' ? flow.file.name : undefined} onClose={close} actions={actions()}>
      <div className="flex flex-col gap-4">
        {flow.error !== undefined && <ErrorBanner title={errorTitle(flow)} error={flow.error} />}
        {body()}
      </div>
    </ResponsiveDialog>
  )
}
