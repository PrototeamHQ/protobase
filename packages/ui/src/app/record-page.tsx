import { Check } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Fragment, useMemo } from 'react'
import { isApiError } from '@protobase/client'
import { enumLabel, type LayoutItemModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { keys } from '../data/query-keys'
import { useRecord } from '../data/use-record'
import { displayValue } from '../live/display-value'
import { toDraft } from '../live/field-values'
import { auditField } from '../live/audit-fields'
import { humanize } from '../live/naming'
import { recordTitle } from '../live/model-helpers'
import { toneFor } from '../live/columns-from-model'
import { Button, buttonClass } from '../primitives/button'
import { cn } from '../lib/cn'
import { Field, KeyFacts, MetadataCard, RecordHeader, RelatedRecords, Section, SidebarCard, SpecTable } from '../record-view'
import { ErrorBanner } from './error-banner'
import { CustomSection } from './custom-section'
import { MapSection } from './map/map-section'
import { RecordActions } from './pages/record-actions'
import type { LayoutRecord } from './pages/record-scope'
import { FieldEditor } from './field-editor'
import { shownWidget } from './field-types/shown-widget'
import { WidgetPart } from './field-types/widget-part'
import { useProjectUi } from './pages/project-ui'
import { Notice, useAdminMeta, usePermissions } from './meta-gate'
import { can, fieldAccess } from './permissions'
import { useRestore } from './delete/use-restore'
import { RecordLines, findLinesResource } from './record-lines'
import { useAuth } from '../auth'
import { inApp } from '../app-shell/breadcrumb'
import { draftStorageKey } from './draft-storage'
import { useLines } from './use-lines'
import { useLinesDraft } from './use-lines-draft'
import { useDeleteFlow } from './delete/use-delete-flow'
import { useNavigationGuard, useRouter } from './router'
import { AppLink, useAppAddress } from './use-app-address'
import { FieldValue } from './pages/field-value'
import { GallerySection } from './gallery/gallery-section'
import { filledFields } from './filled-fields'
import { namedIcon } from './named-icon'
import { fieldHelp, helpShown, recordShown } from './record-mode/record-mode'
import { useRecordEditor } from './use-record-editor'
import { useRelatedRecords } from './use-related-records'
import { RelatedSection } from './related-section'
import { ValueBadge } from './value-badge'
import { useClient } from '../data/api-provider'

const hidden = (model: ResourceModel, name: string) => name === model.tenant || model.primaryKey.includes(name)

/**
 * The view's layout, or one section with the editable fields when the view has none. The read view, which is all a
 * user who may only read the resource gets, shows every field: the record rather than what can be changed.
 */
const layoutFor = (model: ResourceModel, view: ViewModel | undefined, read: boolean): LayoutItemModel[] => {
  if (view && view.layout.length > 0) return view.layout
  const shown = Object.values(model.fields).filter((field) => !hidden(model, field.name))
  const editable = shown.filter((field) => !field.readOnly)
  const fields = (editable.length > 0 && !read ? editable : shown).map((field) => field.name)
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
  const { basePath } = useRouter()
  const { address, go, open } = useAppAddress()
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
  const queryClient = useQueryClient()
  const client = useClient()
  const permissions = usePermissions(model.name)
  const restore = useRestore(model)
  const canUpdate = can(permissions, 'update') && stored.permissions?.update !== false
  const { shown, offersEdit, editing } = recordShown(view?.recordMode, canUpdate, address?.kind === 'record' && address.edit === true)
  // Only the form leaves changes behind; on the read view a draft kept from before waits for Edit
  useNavigationGuard(editor.dirty && shown === 'form')
  const readAddress = { kind: 'record' as const, resource: model.name, key: recordKey }
  const editAddress = { ...readAddress, edit: true }
  // A form that Edit opened goes back to the record once saved, or when its changes are dropped
  const leavesForm = shown === 'form' && view?.recordMode !== undefined && view.recordMode !== 'edit'
  const canDelete = can(permissions, 'delete') && stored.permissions?.delete !== false
  const remove = useDeleteFlow({
    model,
    view,
    restore,
    onDeleted: () => go({ kind: 'list', resource: model.name }, { replace: true }),
    onReview: () => void queryClient.invalidateQueries({ queryKey: keys.record(model.name, recordKey) }),
  })
  const related = useRelatedRecords(model, view, meta.resources, meta.views, stored.record, basePath)
  const { fields: fieldTypes } = useProjectUi()
  const layout = layoutFor(model, view, shown === 'read')
  const sidebarFields = layout.flatMap((item) => (item.kind === 'sidebar' ? item.fields : []))
  // An enum status shows as the badge, a missing one as none; without a status field the badge names the resource
  const hasStatus = model.fields.status?.type === 'enum'
  const statusValue = stored.record.status
  const status = hasStatus && statusValue !== null && statusValue !== undefined && statusValue !== '' ? String(statusValue) : undefined
  const updatedAt = auditField(model, 'updated')
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
        help={fieldHelp(hint(name), view, editing)}
        error={editor.errors[name]}
        wide={Boolean(hint(name)?.multiline)}
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
          relationTo={related.addresses[name]}
          locked={shown !== 'form' || access === 'read'}
          invalid={Boolean(editor.errors[name])}
          reveal={field.sensitive ? () => client.reveal(model.name, recordKey, name) : undefined}
          resource={model.name}
          onChange={(next) => editor.change(name, next)}
        />
      </Field>
    )
  }

  // The read view's row of a field: its value as the record page shows values, a sensitive one masked with its eye
  const readRow = (name: string) => {
    const field = model.fields[name]!
    const value = field.sensitive ? (
      <FieldEditor field={field} hints={hint(name)} value="" stored={stored.record[name]} locked reveal={() => client.reveal(model.name, recordKey, name)} resource={model.name} onChange={(next) => editor.change(name, next)} />
    ) : (
      <FieldValue model={model} field={field} value={stored.record[name]} relationLabel={related.labels[name]} />
    )
    return { label: hint(name)?.label ?? humanize(name), help: fieldHelp(hint(name), view, editing), wide: Boolean(hint(name)?.multiline), value }
  }

  // The sidebar's fields are one Summary card, where the first sidebar stands among the sidebar's custom components and maps
  const firstSidebar = layout.findIndex((item) => item.kind === 'sidebar')
  const summary = (
    <MetadataCard
      title="Summary"
      rows={sidebarFields.flatMap((name) => {
        const field = model.fields[name]
        if (!field || !visible(name)) return []
        const text = displayValue(field, stored.record[name], hint(name))
        const builtIn = field.type === 'enum' ? <ValueBadge value={stored.record[name]} hints={hint(name)}>{text}</ValueBadge> : <strong className={hint(name)?.multiline ? 'whitespace-pre-line break-words' : undefined}>{text}</strong>
        const shown = shownWidget(fieldTypes, field, hint(name))
        return [{ label: hint(name)?.label ?? humanize(name), value: shown ? <WidgetPart shown={shown} part="display" field={field} value={stored.record[name]} fallback={builtIn} /> : builtIn }]
      })}
    />
  )
  const scope: LayoutRecord = { model, record: stored.record, key: recordKey, etag: stored.etag, permissions: stored.permissions }

  const save = async () => {
    if ((await editor.save()) && leavesForm) go(readAddress, { replace: true })
  }

  // Edit and Delete are actions like the view's own, in the rail; the form's controls stay with the form
  const startDelete = canDelete ? () => void remove.start({ key: recordKey, title, etag: stored.etag, snapshot: stored.record }) : undefined
  const formControls = shown === 'form' && (
    <>
      {editor.dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      {editor.dirty && !leavesForm && (
        <Button className="max-md:min-h-11" disabled={editor.saving} onClick={editor.discard}>
          Discard
        </Button>
      )}
      {leavesForm && (
        // Cancel drops the changes when it leaves the form here, not when it opens the record in another tab
        <AppLink to={readAddress} className={cn(buttonClass(), 'max-md:min-h-11')} onClick={(event) => inApp(event) && editor.discard()}>
          Cancel
        </AppLink>
      )}
      <Button variant="primary" className="max-md:min-h-11 max-md:flex-1" loading={editor.saving} disabled={!editor.dirty && editor.phase !== 'saved'} onClick={() => void save()}>
        {editor.phase === 'saved' && <Check className="size-4" />}
        {editor.phase === 'saved' ? 'Saved' : 'Save'}
      </Button>
    </>
  )

  return (
    <div className="flex flex-1 flex-col">
      {remove.dialogs}
      <div className="flex-1">
        <div className="mx-auto max-w-[1100px] px-4 pb-8 pt-6 md:px-10 md:py-8">
          <RecordHeader
            title={title}
            status={status ? { label: enumLabel(status, hint('status')?.valueLabels), tone: toneFor(status) } : hasStatus ? undefined : { label: singular, tone: 'neutral' }}
            actions={
              <div className="hidden items-center gap-4 md:flex">
                {formControls}
              </div>
            }
          />
          {editor.message && <div className="mt-4"><ErrorBanner title="Not saved" error={new Error(editor.message)} /></div>}
          {editor.linesConflict && (
            <div className="mt-4">
              <ErrorBanner title="The lines were changed by someone else" error={new Error('The lines were reloaded. Your new order is kept: Save again to apply it, or Discard to drop it.')} />
            </div>
          )}
          {shown !== 'form' && offersEdit && editor.dirty && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border bg-surface px-3 py-2 text-[13px]" role="status">
              <span>You have unsaved changes to this record.</span>
              <span className="flex gap-2">
                <AppLink to={editAddress} className={buttonClass({ size: 'sm' })}>Continue editing</AppLink>
                <Button size="sm" onClick={editor.discard}>Discard</Button>
              </span>
            </div>
          )}
          {shown === 'form' && editor.restored && (
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
              {layout.flatMap((item, index) => {
                if (item.kind === 'related') return [<RelatedSection key={`related:${item.title}`} item={item} recordKey={recordKey} owner={model.name} />]
                if (item.kind === 'custom') return item.sidebar ? [] : [<CustomSection key={`custom:${index}`} item={item} scope={scope} />]
                if (item.kind === 'map') return item.sidebar ? [] : [<MapSection key={`map:${index}`} item={item} record={stored.record} />]
                if (item.kind === 'gallery') return [<GallerySection key={`gallery:${index}`} item={item} record={stored.record} recordKey={recordKey} />]
                if (item.kind !== 'section') return []
                // A section whose fields are all hidden from this user would be a lone heading, as would key facts all empty
                const visibleFields = item.fields.filter((name) => model.fields[name] && visible(name))
                const facts = shown === 'read' && item.presentation === 'facts'
                const fields = facts ? filledFields(stored.record, visibleFields) : visibleFields
                if (fields.length === 0) return []
                return [
                  <Section key={item.title} title={item.title} help={helpShown(item.helpWhen, view, editing) ? item.help : undefined}>
                    {facts ? (
                      <KeyFacts facts={fields.map((name) => ({ label: readRow(name).label, value: readRow(name).value, icon: namedIcon(hint(name)?.icon) }))} />
                    ) : shown === 'read' ? (
                      <SpecTable rows={fields.map(readRow)} />
                    ) : (
                      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">{fields.map(fieldView)}</div>
                    )}
                  </Section>,
                ]
              })}
              {linesModel && <RecordLines lines={linesModel} draft={linesDraft} vatRate={Number(stored.record.vatRate ?? 21) / 100} saving={editor.saving} locked={shown !== 'form'} />}
            </main>
            <aside className="space-y-4 md:pt-8">
              <RecordActions model={model} stored={stored} recordKey={recordKey} edit={offersEdit ? editAddress : undefined} onDelete={startDelete} />
              {firstSidebar === -1 && summary}
              {layout.map((item, index) => {
                if (item.kind === 'custom' && item.sidebar) return <CustomSection key={`custom:${index}`} item={item} scope={scope} />
                if (item.kind === 'map' && item.sidebar) return <MapSection key={`map:${index}`} item={item} record={stored.record} />
                return index === firstSidebar ? <Fragment key="summary">{summary}</Fragment> : null
              })}
              <MetadataCard
                title="Details"
                rows={[auditField(model, 'created'), updatedAt].flatMap((name) => {
                  const field = name ? model.fields[name] : undefined
                  return name && field && visible(name) ? [{ label: hint(name)?.label ?? humanize(name), value: displayValue(field, stored.record[name], hint(name)) }] : []
                })}
              />
              {related.records.length > 0 && (
                <SidebarCard title="Related records">
                  <RelatedRecords records={related.records} onNavigate={open} />
                </SidebarCard>
              )}
            </aside>
          </div>
        </div>
      </div>
      {/* On a mobile screen the form's controls stay in view below the record, above the shell's bottom bar */}
      {formControls && <div className="sticky bottom-[var(--pb-sticky-bottom,0px)] z-20 flex shrink-0 items-center gap-2 border-t bg-background p-3 md:hidden">{formControls}</div>}
    </div>
  )
}
