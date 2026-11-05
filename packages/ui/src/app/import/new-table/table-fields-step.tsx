import { TriangleAlert } from 'lucide-react'
import { cellText, columnName } from '../sheet-cell'
import { text } from '../messages'
import { FieldRow } from './field-row'
import type { FieldTexts } from './field-texts'
import type { ProposalProblems } from './proposal-problems'
import { TableSection } from './table-section'
import type { TableImportFlow } from './use-table-import-flow'

/**
 * The table a file becomes, to review before it is made: its labels and name, then a field per column, typed only from
 * what the column's cells say, which the user may rename, relabel, make less specific or leave out.
 */
export const TableFieldsStep = ({ flow, problems, texts }: { flow: TableImportFlow; problems: ProposalProblems; texts: FieldTexts }) => {
  const { proposal, read } = flow
  if (!proposal || !read) return null
  return (
    <div className="flex flex-col gap-5">
      <TableSection proposal={proposal} problems={problems} texts={texts} onChange={flow.changeTable} />
      <p className="-mb-3 text-xs text-muted-foreground">{text('typesFromCells', { rows: read.rows })}</p>
      <section aria-label={text('columns')} className="flex flex-col divide-y divide-border border-y">
        {proposal.fields.map((field) => (
          <FieldRow
            key={field.column}
            field={field}
            column={columnName(read.headers, field.column)}
            examples={read.sample.map((row) => cellText(row.cells[field.column] ?? null)).filter((example) => example !== '').slice(0, 3)}
            problems={problems.fields[field.column]}
            texts={texts}
            onChange={(edit) => flow.change(field.column, edit)}
          />
        ))}
      </section>
      {problems.noFields && (
        <p role="alert" className="flex gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-warning-text">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{problems.noFields}</span>
        </p>
      )}
    </div>
  )
}
