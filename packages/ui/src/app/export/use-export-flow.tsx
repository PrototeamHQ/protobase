import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { isApiError } from '@protobase/client'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import type { GridRow } from '../../data-grid'
import { formatInt } from '../../format'
import { listLabels } from '../../live/relation-labels'
import { useToast } from '../../toasts'
import type { ExportFormat } from './builder'
import { createWorkerPort, type BuilderPort } from './builder-port'
import { countedRows, ExportDialog, ExportProgressDialog, type RowCount } from './export-dialog'
import { defaultExportColumns, exportableFields, exportColumns, exportHeaders, exportLimit, exportsSelection, selectionFilters, type ExportSettings } from './export-options'
import { runExport } from './run-export'
import { canSaveAsBuilt, createDownloadSink, exportFileName, pickFileSink, type ExportSink } from './sink'
import { text } from './messages'

export type ExportFlowOptions = {
  model: ResourceModel
  view: ViewModel | undefined
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  /** The records' name, such as "Orders", which names the file and the sheet. */
  plural: string
  /** The list's filter and search, and its sort, as the list loads its rows. */
  filter: string
  orderBy: string
  /** Builds the file; a Web Worker by default. */
  createPort?: () => BuilderPort
  /** Where the file goes: a file the user picks where the browser can write one as it is built, else a download. */
  createSink?: (name: string, format: ExportFormat) => Promise<ExportSink | undefined>
}

const defaultSink = (name: string, format: ExportFormat) => (canSaveAsBuilt() ? pickFileSink(name, format) : Promise.resolve(createDownloadSink(name, format)))

type Stage = { kind: 'closed' } | { kind: 'settings'; selected: Array<string | number> } | { kind: 'running'; done: number; total?: number }

// The key of a selected row as the list holds it: its own value, or the key of a relation the list names.
const selectedKey = (model: ResourceModel, row: GridRow) => {
  const value = row[model.primaryKey[0]!]
  return typeof value === 'object' && value !== null && 'id' in value ? (value.id as string | number) : (value as string | number)
}

/**
 * The list's Export: `open` shows its settings, with the selected rows when there are some, and `dialogs` draws them and
 * the progress while the file is built. Rows come through the list API as the user may read them; the file is built in
 * a worker and written as it goes.
 */
export const useExportFlow = ({ model, view, resources, views, plural, filter, orderBy, createPort = createWorkerPort, createSink = defaultSink }: ExportFlowOptions) => {
  const client = useClient()
  const toast = useToast()
  const [stage, setStage] = useState<Stage>({ kind: 'closed' })
  const abort = useRef<AbortController | undefined>(undefined)

  const counted = useQuery({
    queryKey: keys.exportCount(model.name, filter),
    enabled: stage.kind === 'settings',
    queryFn: async (): Promise<RowCount> => {
      const page = await client.list(model.name, { filter: filter || undefined, pageSize: 1, count: 'exact', fields: model.primaryKey })
      return page.totalSize === undefined ? { kind: 'estimate', rows: page.totalSizeEstimate } : { kind: 'exact', rows: page.totalSize }
    },
  })
  const count: RowCount = counted.data ?? { kind: 'counting' }

  const open = (rows: GridRow[] = []) => setStage({ kind: 'settings', selected: exportsSelection(model) ? rows.map((row) => selectedKey(model, row)) : [] })

  const start = async (settings: ExportSettings, selected: Array<string | number>) => {
    const name = exportFileName(plural, settings.format)
    // The save picker opens from the click on Export, as the browser asks
    const sink = await createSink(name, settings.format)
    if (!sink) return
    const limit = exportLimit(view, settings.format)
    const rows = settings.scope === 'selected' ? selected.length : countedRows(count)
    const total = rows === undefined ? undefined : Math.min(rows, limit)
    const controller = new AbortController()
    abort.current = controller
    setStage({ kind: 'running', done: 0, total })
    try {
      const result = await runExport({
        client,
        resource: model.name,
        filters: settings.scope === 'selected' ? selectionFilters(model, selected) : [filter],
        orderBy,
        plan: { format: settings.format, mode: settings.mode, name: plural, columns: exportColumns(model, view, settings.columns) },
        labels: settings.mode === 'shown' ? listLabels(resources, views, model, settings.columns) : {},
        limit,
        port: createPort(),
        sink,
        signal: controller.signal,
        // A page that lands after Cancel does not bring the progress back
        onProgress: (done) => controller.signal.aborted || setStage({ kind: 'running', done, total }),
      })
      toast.show({
        state: 'success',
        title: text('exported', { count: formatInt(result.rows), plural }),
        description: result.truncated ? text('truncated', { name, count: formatInt(result.rows) }) : name,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (!isApiError(error)) throw error
      toast.show({ state: 'error', title: text('couldNotExport', { plural }), description: error.message })
    } finally {
      abort.current = undefined
      setStage((current) => (current.kind === 'running' ? { kind: 'closed' } : current))
    }
  }

  // The dialog closes at once; the export stops after the page it is reading and discards the file
  const cancel = () => {
    abort.current?.abort()
    setStage({ kind: 'closed' })
  }

  const fields = exportableFields(model)
  const labels = exportHeaders(model, view, fields)
  const dialogs =
    stage.kind === 'settings' ? (
      <ExportDialog
        plural={plural}
        view={view}
        fields={fields.map((name) => ({ name, label: labels[name]! }))}
        initialColumns={defaultExportColumns(model, view)}
        count={count}
        selected={stage.selected.length > 0 ? stage.selected.length : undefined}
        open
        onExport={(settings) => void start(settings, stage.selected)}
        onClose={() => setStage({ kind: 'closed' })}
      />
    ) : stage.kind === 'running' ? (
      <ExportProgressDialog plural={plural} done={stage.done} total={stage.total} onCancel={cancel} />
    ) : null

  return { open, dialogs }
}
