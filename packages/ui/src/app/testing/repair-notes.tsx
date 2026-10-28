import { AppLink } from '../use-app-address'
import { useLayoutRecord } from '../pages/record-scope'

/**
 * The bike shop's notes on a repair for stories, as a project would write it in protobase.ui.tsx: a whole record page
 * whose notes scroll inside it while the note box stays at its foot, and a link to the repair's standard page.
 */
export const RepairNotes = () => {
  const repair = useLayoutRecord()
  if (!repair) return null
  const notes = Array.from({ length: 60 }, (_, index) => `Note ${index + 1} on the ${String(repair.record.bike)}`)
  return (
    <section aria-label="Repair notes" className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <span className="font-medium">{String(repair.record.number)}</span>
        <AppLink to={{ kind: 'record', resource: repair.model.name, key: repair.key, standard: true }} className="text-sm underline">
          Repair details
        </AppLink>
      </div>
      {/* The notes scroll inside the page, which does not scroll, so the note box stays in view */}
      <ol aria-label="Notes" className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {notes.map((note) => (
          <li key={note} className="py-1">{note}</li>
        ))}
      </ol>
      <input aria-label="New note" className="border-t border-border bg-background px-4 py-3" placeholder="Add a note" />
    </section>
  )
}
