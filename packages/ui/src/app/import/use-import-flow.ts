import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { useResourceClients } from '../../data/api-provider'
import type { ConvertOptions } from './convert'
import { localeFormats } from './locale-formats'
import { createLookups } from './lookups'
import { autoMapping, importableFields, matchFields, type ColumnMapping, type ImportMode } from './mapping'
import type { ImportPlan } from './prepare-rows'
import { checkImport, readHead, runImport, type ImportCheck, type ImportProgress, type SheetHead } from './run-import'
import { workerSheetSource, type SheetSource } from './sheet-source'

/** Where the import dialog is: choosing a file, mapping its columns, checking its rows, writing them, or done. */
export type ImportStep =
  | { kind: 'file'; reading: boolean }
  | { kind: 'map' }
  | { kind: 'checking'; rows: number }
  | { kind: 'checked'; check: ImportCheck }
  | { kind: 'importing'; progress: ImportProgress; total: number; cancelling: boolean }
  | { kind: 'done'; result: ImportProgress & { cancelled: boolean }; stopped?: unknown }

export type ImportFlowOptions = {
  model: ResourceModel
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  /** Reads the chosen file; a Web Worker by default. */
  sourceFor?: (file: File) => SheetSource
}

const emptyProgress: ImportProgress = { created: 0, updated: 0, skipped: 0, failed: 0, notWritten: [] }

/** The state of an import, from choosing the file to its summary, and the moves between its steps. */
export const useImportFlow = ({ model, resources, views, sourceFor = workerSheetSource }: ImportFlowOptions) => {
  const clientFor = useResourceClients()
  const queryClient = useQueryClient()
  const view = views[model.name]
  const fields = useMemo(() => importableFields(model, resources), [model, resources])
  const [step, setStep] = useState<ImportStep>({ kind: 'file', reading: false })
  const [error, setError] = useState<unknown>()
  const [file, setFile] = useState<{ file: File; source: SheetSource; sheets: string[] }>()
  const [sheet, setSheet] = useState<string>()
  const [head, setHead] = useState<SheetHead>()
  const [mode, setMode] = useState<ImportMode>('create')
  const [columns, setColumns] = useState<ColumnMapping[]>([])
  const [match, setMatch] = useState<ImportPlan['match']>()
  const [options, setOptions] = useState<ConvertOptions>(() => localeFormats())
  const cancelled = useRef(false)
  const checking = useRef<AbortController | undefined>(undefined)

  const fail = (next: ImportStep) => (cause: unknown) => {
    setError(cause)
    setStep(next)
  }

  /** Reads the chosen file's sheet names; a CSV, or a workbook of one sheet, goes on to its columns. */
  const choose = (chosen: File) => {
    setError(undefined)
    setStep({ kind: 'file', reading: true })
    const source = sourceFor(chosen)
    void source
      .sheets()
      .then((sheets) => {
        setFile({ file: chosen, source, sheets })
        setSheet(sheets[0])
        if (sheets.length <= 1) return open(source, sheets[0])
        setStep({ kind: 'file', reading: false })
      })
      .catch(fail({ kind: 'file', reading: false }))
  }

  // The sheet's header and first rows, with each column mapped to the field its header names
  const open = async (source: SheetSource, name: string | undefined) => {
    setStep({ kind: 'file', reading: true })
    const read = await readHead(source, name)
    setHead(read)
    setColumns(autoMapping(read.headers, fields, view))
    const key = matchFields(model)[0]
    const keyColumn = key ? autoMapping(read.headers, [key], view)[0] : undefined
    setMatch(key && keyColumn ? { field: key.name, column: keyColumn.column } : undefined)
    setStep({ kind: 'map' })
  }

  const openSheet = () => {
    if (!file) return
    setError(undefined)
    open(file.source, sheet).catch(fail({ kind: 'file', reading: false }))
  }

  /** Maps the column to the field, or skips it without one; a field fills one column, so another that had it is skipped. */
  const mapColumn = (column: number, field: string | undefined) =>
    setColumns((current) => {
      const others = current.filter((entry) => entry.column !== column && entry.field !== field)
      return field ? [...others, { column, field }].sort((a, b) => a.column - b.column) : others
    })

  /** The field of the related record a relation column is found by. */
  const matchColumnBy = (column: number, matchBy: string) => setColumns((current) => current.map((entry) => (entry.column === column ? { ...entry, matchBy } : entry)))

  const plan = (): ImportPlan => ({ mode, columns, match: mode === 'create' ? undefined : match, options })
  const context = () => ({ model, resources, views, lookups: createLookups(clientFor) })

  /** Reads the whole file and prepares each row as the import would, writing nothing. */
  const check = () => {
    if (!file) return
    setError(undefined)
    const controller = new AbortController()
    checking.current = controller
    setStep({ kind: 'checking', rows: 0 })
    checkImport(file.source, sheet, plan(), context(), (rows) => setStep({ kind: 'checking', rows }), controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setStep({ kind: 'checked', check: result })
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) fail({ kind: 'map' })(cause)
      })
  }

  const back = () => {
    checking.current?.abort()
    setError(undefined)
    setStep({ kind: 'map' })
  }

  /** Writes the rows in batches; Cancel stops it between two. */
  const start = (total: number) => {
    if (!file) return
    setError(undefined)
    cancelled.current = false
    setStep({ kind: 'importing', progress: emptyProgress, total, cancelling: false })
    let latest = emptyProgress
    const refresh = () => {
      for (const prefix of ['page', 'list', 'first-page', 'map', 'facets', 'series']) void queryClient.invalidateQueries({ queryKey: [prefix, model.name] })
    }
    runImport(file.source, sheet, plan(), context(), {
      client: clientFor(model.name),
      onProgress: (progress) => {
        latest = progress
        setStep({ kind: 'importing', progress, total, cancelling: cancelled.current })
      },
      cancelled: () => cancelled.current,
    })
      .then((result) => setStep({ kind: 'done', result }))
      .catch((cause: unknown) => setStep({ kind: 'done', result: { ...latest, cancelled: false }, stopped: cause }))
      .finally(refresh)
  }

  const cancel = () => {
    cancelled.current = true
    setStep((current) => (current.kind === 'importing' ? { ...current, cancelling: true } : current))
  }

  /** Stops a check that is still reading, when the dialog closes. */
  const stop = () => checking.current?.abort()

  return {
    step,
    error,
    file: file?.file,
    sheets: file?.sheets ?? [],
    sheet,
    setSheet,
    head,
    fields,
    mode,
    setMode,
    columns,
    mapColumn,
    matchColumnBy,
    match,
    setMatch,
    options,
    setOptions,
    choose,
    openSheet,
    check,
    back,
    start,
    cancel,
    stop,
  }
}

export type ImportFlow = ReturnType<typeof useImportFlow>
