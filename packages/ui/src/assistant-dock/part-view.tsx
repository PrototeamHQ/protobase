import type { AssistantPart } from '@protobase/schema'
import { ActionCard, FieldList } from '../action-card'
import { CompactTable } from '../compact-table'
import { DiffView } from '../diff-view'
import { StepList } from '../step-list'
import { WidgetView } from './widget-view'

/** One part of a message, drawn with the primitive it names, or a widget with the app's component it names. */
export const PartView = ({ part, onAction }: { part: AssistantPart; onAction?: (partId: string, actionId: string) => void }) => {
  switch (part.type) {
    case 'text':
      return <p>{part.text}</p>
    case 'table':
      return <CompactTable columns={part.columns} rows={part.rows} caption={part.caption} truncated={part.truncated} />
    case 'card':
      return (
        <ActionCard title={part.title} tone={part.tone} badge={part.badge} note={part.note} actions={part.actions} onAction={(actionId) => onAction?.(part.id, actionId)}>
          {part.body && <p className="text-[13px]">{part.body}</p>}
          {part.code && <pre className="overflow-x-auto rounded-md bg-surface px-2.5 py-2 font-mono text-[11px] whitespace-pre-wrap break-words">{part.code}</pre>}
          {part.fields && part.fields.length > 0 && <FieldList fields={part.fields} />}
          {part.steps && part.steps.length > 0 && <StepList steps={part.steps} />}
          {part.diffs?.map((diff, index) => <DiffView key={`${index}-${diff.path}`} source={diff.source} start={diff.start} path={diff.path} className="rounded-md border border-border" />)}
        </ActionCard>
      )
    case 'widget':
      return <WidgetView part={part} />
  }
}
