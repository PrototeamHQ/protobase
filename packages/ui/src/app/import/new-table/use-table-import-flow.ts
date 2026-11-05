import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { maxNameBytes, maxOrganizationNameBytes } from '@protobase/schema/internal'
import { useResourceClients } from '../../../data/api-provider'
import type { MetaData } from '../../../data/meta-data'
import { keys } from '../../../data/query-keys'
import { useAppAddress } from '../../use-app-address'
import { createLookups } from '../lookups'
import type { ImportPlan } from '../prepare-rows'
import { runImport, type ImportProgress } from '../run-import'
import { workerSheetSource, type SheetSource } from '../sheet-source'
import { createTableOps } from './create-table-ops'
import { readColumns, type ReadColumns } from './read-columns'
import { changeField, includedFields, proposeTable, type ProposedField, type TableProposal } from './table-proposal'

/** Where making a table from a file is: choosing the file, reading it, reviewing its fields, making the table, writing its rows, or done. */
export type TableImportStep =
  | { kind: 'file'; reading: boolean }
  | { kind: 'reading'; rows: number }
  | { kind: 'fields' }
  | { kind: 'creating' }
  | { kind: 'importing'; progress: ImportProgress; total: number; cancelling: boolean }
  | { kind: 'done'; result: ImportProgress & { cancelled: boolean }; stopped?: unknown }

export type TableImportFlowOptions = {
  /** The resource of the tables users add, whose list offers this. */
  tables: ResourceModel
  resources: Record<string, ResourceModel>
  /** Reads the chosen file; a Web Worker by default. */
  sourceFor?: (file: File) => SheetSource
}

const emptyProgress: ImportProgress = { created: 0, updated: 0, skipped: 0, failed: 0, notWritten: [] }

// The rows are read as the cells say, which `readColumns` typed: numbers with a point, ISO dates, and true or false
// kept as text where the column is text
const asTyped: ImportPlan['options'] = { decimal: '.', dateOrder: 'dmy', booleanText: true }

/**
 * The state of making a table from a file: the file is read once to propose its fields, the table and its fields are
 * made in one batch write, and the rows are then written as Import writes them. With organizations a table's name is
 * shorter, and may be one a resource in code has.
 */
export const useTableImportFlow = ({ tables, resources, sourceFor = workerSheetSource }: TableImportFlowOptions) => {
  const clientFor = useResourceClients()
  const queryClient = useQueryClient()
  const { go } = useAppAddress()
  const organizations = tables.tenant !== undefined
  const maxTableBytes = organizations ? maxOrganizationNameBytes : maxNameBytes
  const taken = useMemo(() => new Set(organizations ? [] : Object.keys(resources)), [organizations, resources])
  const [step, setStep] = useState<TableImportStep>({ kind: 'file', reading: false })
  const [error, setError] = useState<unknown>()
  const [file, setFile] = useState<{ file: File; source: SheetSource; sheets: string[] }>()
  const [sheet, setSheet] = useState<string>()
  const [read, setRead] = useState<ReadColumns>()
  const [proposal, setProposal] = useState<TableProposal>()
  const [table, setTable] = useState<string>()
  const cancelled = useRef(false)
  const reading = useRef<AbortController | undefined>(undefined)

  const fail = (next: TableImportStep) => (cause: unknown) => {
    setError(cause)
    setStep(next)
  }

  // Reads the whole sheet and proposes a field for each of its columns
  const open = (chosen: File, source: SheetSource, name: string | undefined) => {
    const controller = new AbortController()
    reading.current = controller
    setStep({ kind: 'reading', rows: 0 })
    readColumns(source, name, (rows) => setStep({ kind: 'reading', rows }), controller.signal)
      .then((columns) => {
        if (controller.signal.aborted) return
        setRead(columns)
        setProposal(proposeTable(chosen.name, columns, taken, maxTableBytes))
        setStep({ kind: 'fields' })
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) fail({ kind: 'file', reading: false })(cause)
      })
  }

  /** Reads the chosen file's sheet names; a CSV, a JSON file, or a workbook of one sheet goes on to its columns. */
  const choose = (chosen: File) => {
    setError(undefined)
    setStep({ kind: 'file', reading: true })
    const source = sourceFor(chosen)
    void source
      .sheets()
      .then((sheets) => {
        setFile({ file: chosen, source, sheets })
        setSheet(sheets[0])
        if (sheets.length <= 1) return open(chosen, source, sheets[0])
        setStep({ kind: 'file', reading: false })
      })
      .catch(fail({ kind: 'file', reading: false }))
  }

  const openSheet = () => {
    if (!file) return
    setError(undefined)
    open(file.file, file.source, sheet)
  }

  const change = (column: number, edit: Partial<Pick<ProposedField, 'include' | 'name' | 'label' | 'type'>>) => setProposal((current) => current && changeField(current, column, edit))
  const changeTable = (edit: Partial<Pick<TableProposal, 'name' | 'pluralLabel' | 'singularLabel' | 'titleField'>>) => setProposal((current) => current && { ...current, ...edit })

  // The new table's model and view, from `/meta` read again: the server that made it serves it at once
  const servedTable = async (name: string) => {
    await queryClient.refetchQueries({ queryKey: keys.meta })
    const meta = queryClient.getQueryData<MetaData>(keys.meta)
    const model = meta?.resources[name]
    if (!meta || !model) throw new Error(`The server does not serve the new table ${name} yet`)
    return { model, resources: meta.resources, views: meta.views as Record<string, ViewModel> }
  }

  // Writes the rows into the new table as Import writes them, with progress and Cancel between batches
  const importRows = async (name: string, current: TableProposal) => {
    if (!file || !read) return
    const context = { ...(await servedTable(name)), lookups: createLookups(clientFor) }
    const plan: ImportPlan = { mode: 'create', columns: includedFields(current).map((field) => ({ column: field.column, field: field.name })), options: asTyped }
    cancelled.current = false
    let latest = emptyProgress
    setStep({ kind: 'importing', progress: emptyProgress, total: read.rows, cancelling: false })
    const result = await runImport(file.source, sheet, plan, context, {
      client: clientFor(name),
      onProgress: (progress) => {
        latest = progress
        setStep({ kind: 'importing', progress, total: read.rows, cancelling: cancelled.current })
      },
      cancelled: () => cancelled.current,
    }).catch((cause: unknown) => ({ ...latest, cancelled: false, stopped: cause }))
    const stopped = 'stopped' in result ? result.stopped : undefined
    // Every row written: the new table's list, as after making any record
    if (stopped === undefined && !result.cancelled && result.notWritten.length === 0) return go({ kind: 'list', resource: name })
    setStep({ kind: 'done', result, stopped })
  }

  /** Makes the table and its fields in one batch write, then writes the file's rows into it. */
  const create = () => {
    if (!proposal) return
    setError(undefined)
    setStep({ kind: 'creating' })
    clientFor(tables.name)
      .batchWrite(createTableOps(tables.name, proposal))
      .then(({ results }) => {
        const [made] = results
        const name = made?.op === 'create' ? String(made.record.table_name) : proposal.name
        setTable(name)
        // The table stays made when its rows cannot be written; the summary says why and links to it
        return importRows(name, proposal).catch((cause: unknown) => setStep({ kind: 'done', result: { ...emptyProgress, cancelled: false }, stopped: cause }))
      }, fail({ kind: 'fields' }))
  }

  const cancel = () => {
    cancelled.current = true
    setStep((current) => (current.kind === 'importing' ? { ...current, cancelling: true } : current))
  }

  /** Back from reading the file to choosing it. */
  const back = () => {
    reading.current?.abort()
    setError(undefined)
    setStep({ kind: 'file', reading: false })
  }

  /** Stops reading the file when the dialog closes. */
  const stop = () => reading.current?.abort()

  return { step, error, file: file?.file, sheets: file?.sheets ?? [], sheet, setSheet, read, proposal, table, taken, maxTableBytes, choose, openSheet, change, changeTable, create, cancel, back, stop }
}

export type TableImportFlow = ReturnType<typeof useTableImportFlow>
