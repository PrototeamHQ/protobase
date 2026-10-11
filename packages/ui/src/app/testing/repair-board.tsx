import { useListDisplay } from '../displays/display-context'
import { RecordLink } from '../displays/record-link'

/**
 * The bike shop's workshop board for stories, as a project would write it in protobase.ui.tsx: a column per value of
 * `by`, a card per repair linking to it. The list page loads the rows; the board only draws them.
 */
export const RepairBoard = ({ by }: { by: string }) => {
  const list = useListDisplay()
  if (list.loading) return <p className="text-[13px] text-muted-foreground">Loading</p>
  const columns = [...new Set(list.rows.map((row) => String(row.record[by])))]
  return (
    <div className="grid auto-cols-[minmax(12rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
      {columns.map((value) => (
        <section key={value} aria-label={value} className="flex flex-col gap-2 rounded-lg bg-surface p-2">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{value}</h2>
          {list.rows
            .filter((row) => String(row.record[by]) === value)
            .map((row) => (
              <RecordLink key={row.key} row={row} className="rounded-md border border-border bg-background p-2 text-[13px] hover:border-border-strong">
                <span className="block font-medium">{String(row.record.number)}</span>
                <span className="block text-muted-foreground">{String(row.record.bike)}</span>
              </RecordLink>
            ))}
        </section>
      ))}
    </div>
  )
}
