import { Check } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useMemo, type ReactElement } from 'react'
import { isApiError } from '@protobase/client'
import { enumLabel, type LayoutItemModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { usePauseFocusRefresh } from '../data/focus-refresh'
import { keys } from '../data/query-keys'
import { useOpenedRecord, type LiveRecord } from '../data/use-record'
import { displayValue, valueTitle } from '../live/display-value'
import { fromDraft, isRequiredOnEdit, toDraft } from '../live/field-values'
import { auditField } from '../live/audit-fields'
import { humanize } from '../live/naming'
import { recordTitle } from '../live/model-helpers'
import { toneFor } from '../live/columns-from-model'
import { Button, buttonClass } from '../primitives/button'
import { Skeleton } from '../primitives/skeleton'
import { cn } from '../lib/cn'
import { Field, GroupSection, KeyFacts, MetadataCard, RecordHeader, RecordTabs, Section, SpecTable } from '../record-view'
import { ErrorBanner } from './error-banner'
import { CustomSection } from './custom-section'
import { MapSection } from './map/map-section'
import { RecordActions } from './pages/record-actions'
import type { LayoutRecord } from './pages/record-scope'
import { FieldEditor } from './field-editor'
import { groupOpen, toggledOpen } from './group-open'
import { attentionTab, shownTab, splitTabs } from './record-tabs'
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
import { useNavigationGuard } from './router'
import { AppLink, useAppAddress } from './use-app-address'
import { FieldValue } from './pages/field-value'
import { GallerySection } from './gallery/gallery-section'
import { HistorySection } from './history/history-section'
import { CommentsSection } from './comments/comments-section'
import { filledFields } from './filled-fields'
import { namedIcon } from './named-icon'
import { fieldHelp, helpShown, recordShown, whenShown } from './record-mode/record-mode'
import { useShownLayout } from './record-mode/use-shown-layout'
import { useRecordEditor } from './use-record-editor'
import { fieldMessage } from './field-errors'
import { useFocusFirstInvalid } from './use-focus-first-invalid'
import { useRelatedRecords } from './use-related-records'
import { IncomingCard } from './incoming-card'
import { isChosen, keyValue } from './create/create-values'
import { RelatedSection } from './related-section'
import { relatedValue } from './related-value'
import { ValueBadge } from './value-badge'
import { useClient } from '../data/api-provider'
import { markdownExcerpt } from '../markdown/markdown-excerpt'
import { isMarkdown } from '../markdown/markdown-hint'
import { ContactLink } from '../live/contact-link'
import { contactFormat } from '../live/contact-links'
import { text as appText } from './messages'
import { text } from './record-messages'

const hidden = (model: ResourceModel, name: string) => name === model.tenant || model.primaryKey.includes(name)

/**
 * The view's layout, or one section with the editable fields when the view has none, then History when the resource
 * keeps it and Comments when it takes them. The read view, which is all a user who may only read the resource gets,
 * shows every field: the record rather than what can be changed.
 */
const layoutFor = (model: ResourceModel, view: ViewModel | undefined, read: boolean): LayoutItemModel[] => {
  if (view && view.layout.length > 0) return view.layout
  const shown = Object.values(model.fields).filter((field) => !hidden(model, field.name))
  const editable = shown.filter((field) => !field.readOnly)
  const fields = (editable.length > 0 && !read ? editable : shown).map((field) => field.name)
  return [{ kind: 'section', title: text('details'), fields }, ...(model.history ? [{ kind: 'history' as const, title: text('history') }] : []), ...(model.comments ? [{ kind: 'comments' as const, title: text('comments') }] : [])]
}

export const RecordPage = ({ resource, recordKey }: { resource: string; recordKey: string }) => {
  const { resources } = useAdminMeta()
  const model = resources[resource]
  const record = useOpenedRecord(resource, recordKey)
  if (!model) return <Notice title={appText('notFound')}>{appText('noResource', resource)}</Notice>
  if (record.isPending) return <Notice title={text('loading')}>{text('fetching')}</Notice>
  if (record.error) return <div className="p-8">{isApiError(record.error) && record.error.status === 404 ? <Notice title={appText('notFound')}>{text('noRecord')}</Notice> : <ErrorBanner title={text('couldNotLoad')} error={record.error} />}</div>
  // A record opened from a list shows that row's fields until it has loaded; the loaded record draws the page anew, so
  // its form starts from the whole record
  return <LoadedRecord key={record.isPlaceholderData ? 'preview' : 'loaded'} model={model} recordKey={recordKey} stored={record.data} preview={record.isPlaceholderData} />
}

type LoadedRecordProps = {
  model: ResourceModel
  recordKey: string
  stored: LiveRecord
  /** `stored` is what a list row knows of the record: its fields show as they will, the others as placeholders, and none takes input. */
  preview: boolean
}

const LoadedRecord = ({ model, recordKey, stored, preview }: LoadedRecordProps) => {
  const meta = useAdminMeta()
  const { address, go } = useAppAddress()
  const view = meta.views[model.name]
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
    // A draft kept from before waits for the whole record, which it was made to
    draftKey: !preview && auth.kind === 'signed-in' ? draftStorageKey(auth.user.id, model.name, recordKey) : undefined,
    lines: linesDraft,
  })
  const queryClient = useQueryClient()
  const client = useClient()
  const fieldsRef = useFocusFirstInvalid<HTMLDivElement>(editor.rejections)
  const permissions = usePermissions(model.name)
  const restore = useRestore(model)
  const canUpdate = can(permissions, 'update') && stored.permissions?.update !== false
  const { shown, offersEdit, editing } = recordShown(view?.recordMode, canUpdate, address?.kind === 'record' && address.edit === true)
  // Only the form leaves changes behind; on the read view a draft kept from before waits for Edit
  useNavigationGuard(editor.dirty && shown === 'form')
  // Unsaved changes keep the version of the record they were made to, wherever the draft shows
  usePauseFocusRefresh(editor.dirty)
  const openGroups = address?.kind === 'record' ? address.open : undefined
  const atEdit = address?.kind === 'record' && address.edit === true
  const addressedTab = address?.kind === 'record' ? address.tab : undefined
  const recordAt = (open: readonly string[] = [], edit = false, tab?: string) =>
    ({ kind: 'record' as const, resource: model.name, key: recordKey, ...(edit && { edit }), ...(open.length > 0 && { open }), ...(tab && { tab }) })
  // Edit, Cancel and the save keep the groups the person opened and the tab they are on
  const readAddress = recordAt(openGroups, false, addressedTab)
  const editAddress = recordAt(openGroups, true, addressedTab)
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
  const related = useRelatedRecords(model, meta.resources, meta.views, stored.record)
  // A relation to a record of one key column is chosen on the form; the record's own key and its tenant are not
  const pickTarget = (name: string) => {
    const field = model.fields[name]
    const target = field?.relation ? meta.resources[field.relation.resource] : undefined
    if (!target || target.primaryKey.length !== 1 || name === model.tenant || model.primaryKey.includes(name)) return undefined
    return target
  }
  const picked = Object.values(model.fields).filter((field) => pickTarget(field.name))
  // The form names and links the record each relation points at now, chosen or stored
  const drafted = { ...stored.record, ...Object.fromEntries(picked.map((field) => [field.name, fromDraft(field, editor.value(field.name))])) }
  const chosen = useRelatedRecords(model, meta.resources, meta.views, drafted)
  const pick = (name: string, next: unknown) => {
    const target = pickTarget(name)
    if (!target || !isChosen(next)) return editor.change(name, next)
    // The picker knows the chosen record's name, so the form shows it without asking the server
    queryClient.setQueryData(keys.relatedLabel(target.name, next.key), next.label)
    editor.change(name, keyValue(target, next.key))
  }
  const { fields: fieldTypes } = useProjectUi()
  // The items and fields meant only for the form, or only for reading the record, show only there
  const scope: LayoutRecord = { model, record: stored.record, key: recordKey, etag: stored.etag, permissions: stored.permissions }
  const layout = useShownLayout(layoutFor(model, view, shown === 'read'), scope, editing, preview)
  const { before, tabs, after } = splitTabs(layout)
  const tab = shownTab(tabs, addressedTab)
  const needsAttention = (name: string) => editing && (editor.errors[name] !== undefined || editor.conflicts[name] !== undefined)
  // A turned-down save moves to the first tab that holds a field to put right, where the form then focuses it
  useEffect(() => {
    if (editor.rejections === 0) return
    const target = attentionTab(tabs, tab, needsAttention)
    if (target) go(recordAt(openGroups, atEdit, target === tabs[0] ? undefined : target.title), { replace: true })
  }, [editor.rejections])
  const sidebarFields = layout.flatMap((item) => (item.kind === 'sidebar' ? item.fields : []))
  // An enum status shows as the badge, unless it is missing or the sidebar shows it already
  const hasStatus = model.fields.status?.type === 'enum'
  const statusValue = stored.record.status
  const status = hasStatus && !sidebarFields.includes('status') && statusValue !== null && statusValue !== undefined && statusValue !== '' ? String(statusValue) : undefined
  const updatedAt = auditField(model, 'updated')
  const hint = (name: string) => view?.fields[name]
  const visible = (name: string) => fieldAccess(stored.permissions, name) !== 'hidden' && whenShown(hint(name)?.when, editing)
  const known = (name: string) => !preview || Object.hasOwn(stored.record, name)

  const fieldView = (name: string) => {
    const field = model.fields[name]
    const access = fieldAccess(stored.permissions, name)
    if (!field || access === 'hidden') return null
    const conflict = editor.conflicts[name]
    const target = pickTarget(name)
    const label = hint(name)?.label ?? humanize(name)
    const problem = editor.errors[name]
    return (
      <Field
        // A revealed sensitive value is forgotten when the record changes
        key={field.sensitive ? `${name}:${stored.etag}` : name}
        name={name}
        label={label}
        required={shown === 'form' && access !== 'read' && isRequiredOnEdit(field)}
        help={fieldHelp(hint(name), view, editing)}
        error={problem && fieldMessage(field, label, problem)}
        wide={Boolean(hint(name)?.multiline || hint(name)?.markdown)}
        conflict={
          conflict === undefined
            ? undefined
            : { user: { name: text('someoneElse'), initials: '?', hue: 40 }, ago: text('justNow'), theirValue: conflict || '—', onKeepMine: () => editor.keepMine(name), onUseTheirs: () => editor.useTheirs(name) }
        }
      >
        {known(name) ? (
          <FieldEditor
            field={field}
            hints={hint(name)}
            value={editor.value(name)}
            stored={stored.record[name]}
            relationLabel={chosen.labels[name]}
            relationTo={chosen.addresses[name]}
            relationPicker={target && { target, view: meta.views[target.name] }}
            locked={shown !== 'form' || access === 'read'}
            invalid={Boolean(editor.errors[name])}
            reveal={field.sensitive ? () => client.reveal(model.name, recordKey, name) : undefined}
            resource={model.name}
            onChange={(next) => pick(name, next)}
          />
        ) : (
          <Skeleton className="h-9" />
        )}
      </Field>
    )
  }

  // The read view's row of a field: its value as the record page shows values, a sensitive one masked with its eye
  const readRow = (name: string) => {
    const field = model.fields[name]!
    const value = !known(name) ? (
      <Skeleton className="h-4 w-32" />
    ) : field.sensitive ? (
      <FieldEditor field={field} hints={hint(name)} value="" stored={stored.record[name]} locked reveal={() => client.reveal(model.name, recordKey, name)} resource={model.name} onChange={(next) => editor.change(name, next)} />
    ) : (
      <FieldValue model={model} field={field} value={stored.record[name]} relationLabel={related.labels[name]} />
    )
    return { label: hint(name)?.label ?? humanize(name), help: fieldHelp(hint(name), view, editing), wide: Boolean(hint(name)?.multiline || hint(name)?.markdown), value }
  }

  // The sidebar's fields are one Summary card, where the first sidebar stands among the sidebar's custom components and maps
  const firstSidebar = layout.findIndex((item) => item.kind === 'sidebar')
  const summary = (
    <MetadataCard
      title={text('summary')}
      rows={sidebarFields.flatMap((name) => {
        const field = model.fields[name]
        if (!field || !visible(name)) return []
        if (!known(name)) return [{ label: hint(name)?.label ?? humanize(name), value: <Skeleton className="h-4 w-24" /> }]
        const value = stored.record[name]
        const markdown = isMarkdown(field, hint(name)) && typeof value === 'string' && value !== ''
        // A sidebar value stays on one line, so markdown shows as its plain-text excerpt, like a list cell
        const text = markdown ? markdownExcerpt(value) : displayValue(field, value, hint(name))
        const contact = field.type === 'text' && typeof value === 'string' && value !== '' ? contactFormat(hint(name)) : undefined
        const builtIn = field.type === 'enum' ? <ValueBadge value={value} hints={hint(name)}>{text}</ValueBadge> : contact ? <ContactLink format={contact} value={text} /> : <strong title={valueTitle(field, value, undefined, hint(name))}>{text}</strong>
        const shown = shownWidget(fieldTypes, field, hint(name))
        return [{ label: hint(name)?.label ?? humanize(name), title: text, value: shown ? <WidgetPart shown={shown} part="display" field={field} value={stored.record[name]} fallback={builtIn} /> : builtIn }]
      })}
    />
  )

  const save = async () => {
    if ((await editor.save()) && leavesForm) go(readAddress, { replace: true })
  }

  // Edit and Delete are actions like the view's own, in the rail; Save leads the sidebar, above them
  const startDelete = canDelete ? () => void remove.start({ key: recordKey, title, etag: stored.etag, snapshot: stored.record }) : undefined
  const formControls = shown === 'form' && (
    <>
      <Button variant="primary" className="max-md:min-h-11 max-md:flex-1 md:w-full" loading={editor.saving} disabled={!editor.dirty && editor.phase !== 'saved'} onClick={() => void save()}>
        {editor.phase === 'saved' && <Check className="size-4" />}
        {editor.phase === 'saved' ? text('saved') : text('save')}
      </Button>
      {leavesForm && (
        // Cancel drops the changes when it leaves the form here, not when it opens the record in another tab
        <AppLink to={readAddress} className={cn(buttonClass(), 'max-md:min-h-11 md:w-full')} onClick={(event) => inApp(event) && editor.discard()}>
          {text('cancel')}
        </AppLink>
      )}
      {editor.dirty && <span className="text-xs text-muted-foreground max-md:order-first">{text('unsavedChanges')}</span>}
    </>
  )

  // The main column's items; a group renders its sections and related tables through the same code
  const mainItem = (item: LayoutItemModel, index: number): ReactElement[] => {
    if (item.kind === 'group') {
      const children = item.items.flatMap(mainItem)
      if (children.length === 0) return []
      const open = groupOpen(item, openGroups, needsAttention)
      const toggle = item.collapsed ? recordAt(toggledOpen(openGroups, item.title), atEdit, addressedTab) : undefined
      return [<GroupSection key={`group:${item.title}`} title={item.title} open={open} toggle={toggle}>{children}</GroupSection>]
    }
    if (item.kind === 'related') {
      if (item.from !== undefined && !known(item.from)) return []
      return [<RelatedSection key={`related:${item.title}`} item={item} value={relatedValue(item, stored.record, recordKey)} owner={model.name} />]
    }
    // Project components, maps and photos read fields a list row may not have, so they wait for the record
    if (preview && (item.kind === 'custom' || item.kind === 'map' || item.kind === 'gallery')) return []
    if (item.kind === 'custom') return item.sidebar ? [] : [<CustomSection key={`custom:${index}`} item={item} scope={scope} />]
    if (item.kind === 'map') return item.sidebar ? [] : [<MapSection key={`map:${index}`} item={item} record={stored.record} />]
    if (item.kind === 'gallery') return [<GallerySection key={`gallery:${index}`} item={item} record={stored.record} recordKey={recordKey} />]
    if (item.kind === 'history') return [<HistorySection key={`history:${index}`} item={item} model={model} view={view} recordKey={recordKey} etag={stored.etag} />]
    if (item.kind === 'comments') return [<CommentsSection key={`comments:${index}`} item={item} resource={model.name} recordKey={recordKey} canWrite={auth.kind !== 'visitor'} />]
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
  }

  return (
    // The preview looks as the loaded form will, but takes no input: typing there would be lost when the record loads
    <div ref={fieldsRef} className="flex flex-1 flex-col" inert={preview}>
      {remove.dialogs}
      <div className="flex-1">
        <div className="mx-auto max-w-[1100px] px-4 pb-8 pt-6 md:px-10 md:py-8">
          <RecordHeader
            title={title}
            status={status ? { label: enumLabel(status, hint('status')?.valueLabels), tone: toneFor(status) } : undefined}
          />
          {editor.message && <div className="mt-4"><ErrorBanner title={text('notSaved')} error={new Error(editor.message)} /></div>}
          {editor.linesConflict && (
            <div className="mt-4">
              <ErrorBanner title={text('linesChanged')} error={new Error(text('linesReloaded'))} />
            </div>
          )}
          {shown !== 'form' && offersEdit && editor.dirty && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border bg-surface px-3 py-2" role="status">
              <span>{text('unsavedKept')}</span>
              <span className="flex gap-2">
                <AppLink to={editAddress} className={buttonClass({ size: 'sm' })}>{text('continueEditing')}</AppLink>
                <Button size="sm" onClick={editor.discard}>{text('discard')}</Button>
              </span>
            </div>
          )}
          {shown === 'form' && editor.restored && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border bg-surface px-3 py-2" role="status">
              <span>{text('unsavedRestored')}</span>
              <span className="flex gap-2">
                <Button size="sm" onClick={editor.dismissRestored}>{text('keep')}</Button>
                <Button size="sm" onClick={editor.discard}>{text('discard')}</Button>
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_300px] md:gap-12">
            <main className="divide-y divide-border">
              {before.flatMap(mainItem)}
              {tab && (
                <RecordTabs tabs={tabs.map((each, index) => ({ title: each.title, to: recordAt(openGroups, atEdit, index === 0 ? undefined : each.title), current: each === tab }))} />
              )}
              {tab && (
                <div key={`tab:${tab.title}`} className="divide-y divide-border">
                  {tab.items.flatMap(mainItem)}
                </div>
              )}
              {after.flatMap(mainItem)}
              {linesModel && !preview && <RecordLines lines={linesModel} draft={linesDraft} vatRate={Number(stored.record.vatRate ?? 21) / 100} saving={editor.saving} locked={shown !== 'form'} />}
            </main>
            <aside className="space-y-4 md:pt-8">
              {formControls && <div className="hidden flex-col items-center gap-2 md:flex">{formControls}</div>}
              {!preview && <RecordActions model={model} stored={stored} recordKey={recordKey} edit={offersEdit ? editAddress : undefined} onDelete={startDelete} />}
              {firstSidebar === -1 && summary}
              {layout.map((item, index) => {
                if (item.kind === 'custom' && item.sidebar && !preview) return <CustomSection key={`custom:${index}`} item={item} scope={scope} />
                if (item.kind === 'map' && item.sidebar && !preview) return <MapSection key={`map:${index}`} item={item} record={stored.record} />
                return index === firstSidebar ? <Fragment key="summary">{summary}</Fragment> : null
              })}
              <MetadataCard
                title={text('details')}
                rows={[auditField(model, 'created'), updatedAt].flatMap((name) => {
                  const field = name ? model.fields[name] : undefined
                  if (!name || !field || !visible(name)) return []
                  return [{ label: hint(name)?.label ?? humanize(name), value: known(name) ? <span title={valueTitle(field, stored.record[name], undefined, hint(name))}>{displayValue(field, stored.record[name], hint(name))}</span> : <Skeleton className="h-4 w-24" /> }]
                })}
              />
              {!preview && <IncomingCard model={model} recordKey={recordKey} layout={layout} lines={linesModel} />}
            </aside>
          </div>
        </div>
      </div>
      {/* On a mobile screen the form's controls stay in view below the record, above the shell's bottom bar */}
      {formControls && <div className="sticky bottom-[var(--pb-sticky-bottom,0px)] z-20 flex shrink-0 items-center gap-2 border-t bg-background p-3 md:hidden">{formControls}</div>}
    </div>
  )
}
