import { Check } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { isApiError } from '@protobase/client'
import { enumLabel, type LayoutItemModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { keys } from '../data/query-keys'
import { useRecord } from '../data/use-record'
import { displayValue } from '../live/display-value'
import { toDraft } from '../live/field-values'
import { humanize } from '../live/naming'
import { recordTitle } from '../live/model-helpers'
import { toneFor } from '../live/columns-from-model'
import { formatRelativeTime } from '../format'
import { Badge } from '../primitives/badge'
import { Button } from '../primitives/button'
import { Field, MetadataCard, RecordHeader, RelatedRecords, Section, SidebarCard } from '../record-view'
import { ErrorBanner } from './error-banner'
import { RecordActions } from './pages/record-actions'
import { FieldEditor } from './field-editor'
import { Notice, useAdminMeta, usePermissions } from './meta-gate'
import { can, fieldAccess } from './permissions'
import { useRestore } from './delete/use-restore'
import { RecordLines, findLinesResource } from './record-lines'
import { useAuth } from '../auth'
import { draftStorageKey } from './draft-storage'
import { useLines } from './use-lines'
import { useLinesDraft } from './use-lines-draft'
import { useDeleteFlow } from './delete/use-delete-flow'
import { useNavigationGuard, useRouter } from './router'
import { useRecordEditor } from './use-record-editor'
import { useRelatedRecords } from './use-related-records'
import { RelatedSection } from './related-section'
import { useClient } from '../data/api-provider'

const hidden = (model: ResourceModel, name: string) => name === model.tenant || model.primaryKey.includes(name)

/**
 * The view's layout, or one section with the editable fields when the view has none. A user who may only read the
 * resource has every field read-only, so they get every field, locked, rather than an empty section.
 */
const layoutFor = (model: ResourceModel, view: ViewModel | undefined): LayoutItemModel[] => {
  if (view && view.layout.length > 0) return view.layout
  const shown = Object.values(model.fields).filter((field) => !hidden(model, field.name))
  const editable = shown.filter((field) => !field.readOnly)
  const fields = (editable.length > 0 ? editable : shown).map((field) => field.name)
  return [{ kind: 'section', title: 'Details', fields }]
}

export const RecordPage = ({ resource, recordKey }: { resource: string; recordKey: string }) => {
  const { resources } = useAdminMeta()
  const model = resources[resource]
  const record = useRecord(resource, recordKey)
  if (!model) return <Notice title="Not found">There is no resource called {resource}.</Notice>
  if (record.isPending) return <Notice title="Loading">Fetching the record.</Notice>
  if (record.error) return <div className="p-8">{isApiError(record.error) && record.error.status === 404 ? <Notice title="Not found">This record does not exist, or you cannot see it.</Notice> : <ErrorBanner title="Could not load the record" error={record.error} />}</div>
  return (
    <LoadedRecord model={model} recordKey={recordKey} stored={record.data} />
  )
}

const LoadedRecord = ({ model, recordKey, stored }: { model: ResourceModel; recordKey: string; stored: NonNullable<ReturnType<typeof useRecord>['data']> }) => {
  const meta = useAdminMeta()
  const { basePath, navigate } = useRouter()
  const view = meta.views[model.name]
  const singular = view?.names?.singular ?? humanize(model.name)
  const title = recordTitle(model, view, stored.record, recordKey)
  const { state: auth } = useAuth()
  const linesModel = useMemo(() => findLinesResource(meta.resources, model), [meta.resources, model])
  const linesData = useLines(linesModel, model, recordKey)
  const linesDraft = useLinesDraft(linesModel, linesData.items)
  const editor = useRecordEditor({
    model,
    stored,
    recordKey,
    mode: view?.saveFeedback ?? 'toast',
    subject: title,
    draftKey: auth.kind === 'signed-in' ? draftStorageKey(auth.user.id, model.name, recordKey) : undefined,
    lines: linesDraft,
  })
  useNavigationGuard(editor.dirty)
  const queryClient = useQueryClient()
  const client = useClient()
  const permissions = usePermissions(model.name)
  const restore = useRestore(model)
  const canUpdate = can(permissions, 'update') && stored.permissions?.update !== false
  const remove = useDeleteFlow({
    model,
    view,
    restore,
    onDeleted: () => navigate(`/${model.name}`, { replace: true }),
    onReview: () => void queryClient.invalidateQueries({ queryKey: keys.record(model.name, recordKey) }),
  })
  const related = useRelatedRecords(model, view, meta.resources, meta.views, stored.record, basePath)
  const layout = layoutFor(model, view)
  const sidebarFields = layout.flatMap((item) => (item.kind === 'sidebar' ? item.fields : []))
  const status = model.fields.status?.type === 'enum' ? String(stored.record.status) : undefined
  const updated = stored.record.updatedAt ? Math.max(0, Math.round((Date.now() - Date.parse(String(stored.record.updatedAt))) / 1000)) : undefined
  const hint = (name: string) => view?.fields[name]
  const visible = (name: string) => fieldAccess(stored.permissions, name) !== 'hidden'

  const fieldView = (name: string) => {
    const field = model.fields[name]
    const access = fieldAccess(stored.permissions, name)
    if (!field || access === 'hidden') return null
    const conflict = editor.conflicts[name]
    return (
      <Field
        // A revealed sensitive value is forgotten when the record changes
        key={field.sensitive ? `${name}:${stored.etag}` : name}
        label={hint(name)?.label ?? humanize(name)}
        help={hint(name)?.help}
        error={editor.errors[name]}
        conflict={
          conflict === undefined
            ? undefined
            : { user: { name: 'Someone else', initials: '?', hue: 40 }, ago: 'just now', theirValue: conflict || '—', onKeepMine: () => editor.keepMine(name), onUseTheirs: () => editor.useTheirs(name) }
        }
      >
        <FieldEditor
          field={field}
          hints={hint(name)}
          value={editor.value(name)}
          stored={stored.record[name]}
          relationLabel={related.labels[name]}
          relationHref={related.hrefs[name]}
          locked={!canUpdate || access === 'read'}
          invalid={Boolean(editor.errors[name])}
          reveal={field.sensitive ? () => client.reveal(model.name, recordKey, name) : undefined}
          onChange={(next) => editor.change(name, next)}
        />
      </Field>
    )
  }

  const saveControls = (
    <>
      {editor.dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      {editor.dirty && canUpdate && (
        <Button className="max-md:min-h-11" disabled={editor.saving} onClick={editor.discard}>
          Discard
        </Button>
      )}
      {can(permissions, 'delete') && stored.permissions?.delete !== false && (
        <Button variant="danger" className="max-md:min-h-11" onClick={() => void remove.start({ key: recordKey, title, etag: stored.etag, snapshot: stored.record })}>
          Delete
        </Button>
      )}
      {canUpdate && (
        <Button variant="primary" className="max-md:min-h-11 max-md:flex-1" loading={editor.saving} disabled={!editor.dirty && editor.phase !== 'saved'} onClick={() => void editor.save()}>
          {editor.phase === 'saved' && <Check className="size-4" />}
          {editor.phase === 'saved' ? 'Saved' : 'Save'}
        </Button>
      )}
    </>
  )

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {remove.dialogs}
      <div className="mx-auto max-w-[1100px] px-4 pb-28 pt-6 md:px-10 md:py-8">
        <RecordHeader
          collection={view?.names?.plural ?? humanize(model.name)}
          title={title}
          status={{ label: status ? enumLabel(status, hint('status')?.valueLabels) : singular, tone: status ? toneFor(status) : 'neutral' }}
          lastEditedBy={{ ago: updated === undefined ? 'recently' : formatRelativeTime(updated) }}
          actions={
            <div className="hidden items-center gap-4 md:flex">
              {saveControls}
            </div>
          }
        />
        {editor.message && <div className="mt-4"><ErrorBanner title="Not saved" error={new Error(editor.message)} /></div>}
        {editor.linesConflict && (
          <div className="mt-4">
            <ErrorBanner title="The lines were changed by someone else" error={new Error('The lines were reloaded. Your new order is kept: Save again to apply it, or Discard to drop it.')} />
          </div>
        )}
        {editor.restored && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border bg-surface px-3 py-2 text-[13px]" role="status">
            <span>Your unsaved changes were restored.</span>
            <span className="flex gap-2">
              <Button size="sm" onClick={editor.dismissRestored}>Keep</Button>
              <Button size="sm" onClick={editor.discard}>Discard</Button>
            </span>
          </div>
        )}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_300px] md:gap-12">
          <main className="divide-y divide-border">
            {layout.flatMap((item) => {
              if (item.kind === 'related') return [<RelatedSection key={`related:${item.title}`} item={item} recordKey={recordKey} />]
              if (item.kind !== 'section') return []
              // A section whose fields are all hidden from this user would be a lone heading
              const fields = item.fields.filter((name) => model.fields[name] && visible(name))
              if (fields.length === 0) return []
              return [
                <Section key={item.title} title={item.title} help={item.help}>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">{fields.map(fieldView)}</div>
                </Section>,
              ]
            })}
            {linesModel && <RecordLines lines={linesModel} draft={linesDraft} vatRate={Number(stored.record.vatRate ?? 21) / 100} saving={editor.saving} />}
          </main>
          <aside className="space-y-4 md:pt-8">
            <RecordActions model={model} stored={stored} recordKey={recordKey} />
            <MetadataCard
              title="Summary"
              rows={sidebarFields.flatMap((name) => {
                const field = model.fields[name]
                if (!field || !visible(name)) return []
                const text = displayValue(field, stored.record[name], hint(name))
                return [{ label: hint(name)?.label ?? humanize(name), value: field.type === 'enum' ? <Badge tone={toneFor(String(stored.record[name]))}>{text}</Badge> : <strong>{text}</strong> }]
              })}
            />
            <MetadataCard
              title="Details"
              rows={(['createdAt', 'updatedAt'] as const).flatMap((name) => {
                const field = model.fields[name]
                return field && visible(name) ? [{ label: hint(name)?.label ?? humanize(name), value: displayValue(field, stored.record[name], hint(name)) }] : []
              })}
            />
            {related.records.length > 0 && (
              <SidebarCard title="Related records">
                <RelatedRecords records={related.records} onNavigate={(href) => navigate(href)} />
              </SidebarCard>
            )}
          </aside>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t bg-background p-3 md:hidden">{saveControls}</div>
    </div>
  )
}
