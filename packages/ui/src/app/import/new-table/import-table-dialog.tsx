import type { ResourceModel, ViewModel } from '@protobase/schema'
import { Button, buttonClass } from '../../../primitives/button'
import { ResponsiveDialog } from '../../../primitives/responsive-dialog'
import { ErrorBanner } from '../../error-banner'
import { AppLink } from '../../use-app-address'
import { ImportChecking } from '../import-check-step'
import { ImportFileStep } from '../import-file-step'
import { ImportProgressStep, ImportSummary } from '../import-result-step'
import { text } from '../messages'
import type { SheetSource } from '../sheet-source'
import { fieldTexts } from './field-texts'
import { hasProblems, proposalProblems } from './proposal-problems'
import { TableFieldsStep } from './table-fields-step'
import { useTableImportFlow, type TableImportFlow } from './use-table-import-flow'
import { formatTag } from '../../../locale/active-locale'

export type ImportTableDialogProps = {
  /** The resource of the tables users add. */
  tables: ResourceModel
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  onClose: () => void
  /** Reads the chosen file; a Web Worker by default. */
  sourceFor?: (file: File) => SheetSource
}

const errorTitle = (flow: TableImportFlow) => (flow.step.kind === 'fields' ? text('couldNotMakeTable') : text('couldNotReadFile'))

/**
 * Makes a new table from an .xlsx, CSV or JSON file: choose the file (and its sheet), review the field each column
 * becomes, then the table and its fields are made in one request and the rows written as Import writes them, landing
 * on the new table's list, or on a summary with the rows not imported to download.
 */
export const ImportTableDialog = ({ tables, resources, views, onClose, sourceFor }: ImportTableDialogProps) => {
  const flow = useTableImportFlow({ tables, resources, sourceFor })
  const texts = fieldTexts(views, tables.name)
  const { step, proposal } = flow
  const problems = proposal ? proposalProblems(proposal, flow.taken, flow.maxTableBytes) : undefined
  const headers = flow.read?.headers ?? []
  const busy = step.kind === 'creating' || step.kind === 'importing'

  const close = () => {
    if (busy) return
    flow.stop()
    onClose()
  }
  const cancelButton = <Button onClick={close}>{text('cancel')}</Button>

  const actions = () => {
    switch (step.kind) {
      case 'file':
        return (
          <>
            {cancelButton}
            {flow.sheets.length > 1 && (
              <Button variant="primary" loading={step.reading} onClick={flow.openSheet}>
                {text('next')}
              </Button>
            )}
          </>
        )
      case 'reading':
        return <Button onClick={flow.back}>{text('back')}</Button>
      case 'fields':
      case 'creating': {
        const rows = flow.read?.rows ?? 0
        return (
          <>
            {cancelButton}
            <Button variant="primary" loading={step.kind === 'creating'} disabled={!problems || hasProblems(problems)} onClick={flow.create}>
              {text('makeTable', { count: rows.toLocaleString(formatTag()), rows })}
            </Button>
          </>
        )
      }
      case 'importing':
        return (
          <Button variant="danger" disabled={step.cancelling} onClick={flow.cancel}>
            {text('cancelImport')}
          </Button>
        )
      case 'done':
        return (
          <>
            <Button onClick={onClose}>{text('done')}</Button>
            {flow.table && (
              <AppLink to={{ kind: 'list', resource: flow.table }} className={buttonClass({ variant: 'primary' })}>
                {text('openTable')}
              </AppLink>
            )}
          </>
        )
    }
  }

  const body = () => {
    switch (step.kind) {
      case 'file':
        return <ImportFileStep file={flow.file} sheets={flow.sheets} sheet={flow.sheet} reading={step.reading} onChoose={flow.choose} onSheet={flow.setSheet} />
      case 'reading':
        return <ImportChecking rows={step.rows} />
      case 'fields':
      case 'creating':
        return problems && <TableFieldsStep flow={flow} problems={problems} texts={texts} />
      case 'importing':
        return <ImportProgressStep progress={step.progress} total={step.total} cancelling={step.cancelling} />
      case 'done':
        return <ImportSummary result={step.result} stopped={step.stopped} headers={headers} fileName={flow.file?.name} />
    }
  }

  return (
    <ResponsiveDialog open wide title={text('tableFromFile')} description={flow.file && step.kind !== 'file' ? flow.file.name : undefined} onClose={close} actions={actions()}>
      <div className="flex flex-col gap-4">
        {flow.error !== undefined && <ErrorBanner title={errorTitle(flow)} error={flow.error} />}
        {body()}
      </div>
    </ResponsiveDialog>
  )
}
