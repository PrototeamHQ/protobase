import { Check, ListTree, Undo2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type ReactElement } from 'react'
import type { RecordPageModel, ResourceModel } from '@protobase/schema'
import { useAuth } from '../../auth'
import { usePauseFocusRefresh } from '../../data/focus-refresh'
import { keys } from '../../data/query-keys'
import type { LiveRecord } from '../../data/use-record'
import { FocusActions, FocusNotice, FocusPage, FocusSlot, useFocusPage, useFocusZoneFilled } from '../../focus-page'
import { humanize } from '../../live/naming'
import { Button } from '../../primitives/button'
import { useDeleteFlow } from '../delete/use-delete-flow'
import { useRestore } from '../delete/use-restore'
import { draftStorageKey } from '../draft-storage'
import { fieldMessage } from '../field-errors'
import { FieldEditor } from '../field-editor'
import { useAdminMeta, usePermissions } from '../meta-gate'
import { CustomBoundary } from '../pages/custom-boundary'
import { useProjectUi } from '../pages/project-ui'
import { RecordScope } from '../pages/record-scope'
import { useRecordActions } from '../pages/record-actions'
import { can, fieldAccess } from '../permissions'
import { useNavigationGuard } from '../router'
import { useRecordTitle } from '../titles/record-titles'
import { AppLink, useAppAddress } from '../use-app-address'
import { useRecordEditor } from '../use-record-editor'
import { FocusRecordContext, type FocusRecord } from './focus-record'
import { text } from './messages'

type RecordFocusPageProps = {
  model: ResourceModel
  recordKey: string
  stored: LiveRecord
  page: RecordPageModel
  /** The record's standard page, which shows when the surface throws or its component is missing. */
  standard: ReactElement
}

// The zone Save stands in: secondary beside a primary of the surface's own, else it is the page's primary
const SaveButton = ({ record, label }: { record: FocusRecord; label: string }) => {
  const { dirty, saving, save } = record
  const taken = useFocusZoneFilled('primary')
  const compact = useFocusPage()?.size === 'compact'
  // Stays pressable to the keyboard while there is nothing to save, so focus survives a press of it
  const button = (
    <Button variant={!taken || dirty ? 'primary' : 'secondary'} loading={saving} aria-disabled={!dirty} className="max-md:min-h-11" onClick={() => void (dirty && !saving && save())}>
      {label}
    </Button>
  )
  // A bar with no room drops Save while there is nothing to save
  if (compact && !dirty) return null
  return taken ? <FocusSlot zone="secondary">{button}</FocusSlot> : <FocusSlot zone="primary" fallback>{button}</FocusSlot>
}

// How the work stands, in the bar, unless the surface says so in words of its own
const SaveState = ({ record, saved, readOnly }: { record: FocusRecord; saved: boolean; readOnly: boolean }) => {
  const size = useFocusPage()?.size
  const words = () => {
    if (readOnly) return text('readOnly')
    if (record.saving) return text('saving')
    if (record.dirty) return size === 'wide' ? text('unsaved') : text('unsavedShort')
    return saved ? text('saved') : undefined
  }
  const shown = words()
  if (!shown) return null
  return (
    <FocusSlot zone="state" fallback>
      <span role="status" title={readOnly ? text('readOnlyWhy') : undefined} className="flex items-center gap-1 truncate">
        {!readOnly && !record.dirty && !record.saving && <Check className="size-3.5 text-success-text" aria-hidden />}
        {shown}
      </span>
    </FocusSlot>
  )
}

const RecordFocus = ({ model, recordKey, stored, page }: Omit<RecordFocusPageProps, 'standard'>) => {
  const meta = useAdminMeta()
  const view = meta.views[model.name]
  const { address, go } = useAppAddress()
  const title = useRecordTitle()(model, view, stored.record, recordKey)
  const { state: auth } = useAuth()
  const editor = useRecordEditor({
    model,
    stored,
    recordKey,
    mode: 'button',
    subject: title,
    // A draft of its own: the form keeps its fields and line order in another, which this page never touches
    draftKey: auth.kind === 'signed-in' ? `${draftStorageKey(auth.user.id, model.name, recordKey)}:focus` : undefined,
  })
  useNavigationGuard(editor.dirty || editor.saving)
  usePauseFocusRefresh(editor.dirty)
  const queryClient = useQueryClient()
  const [askDiscard, setAskDiscard] = useState(false)
  const noun = view?.names?.singular ?? humanize(model.name)
  const permissions = usePermissions(model.name)
  const restore = useRestore(model)
  // An earlier version of the record, as a field type that keeps versions draws it, is only read
  const pastVersion = address?.kind === 'record' && address.version !== undefined && address.version !== Number(stored.record.version)
  // The surface's own field counts: one this reader may only read is not theirs to change here
  const surfaceReadable = 'surface' in page && (fieldAccess(stored.permissions, page.surface) === 'read' || model.fields[page.surface]?.readOnly === true)
  const mayUpdate = can(permissions, 'update') && stored.permissions?.update !== false && !surfaceReadable
  const readOnly = !mayUpdate || pastVersion
  const canDelete = can(permissions, 'delete') && stored.permissions?.delete !== false
  const remove = useDeleteFlow({
    model,
    view,
    restore,
    onDeleted: () => go({ kind: 'list', resource: model.name }, { replace: true }),
    onReview: () => void queryClient.invalidateQueries({ queryKey: keys.record(model.name, recordKey) }),
  })
  const startDelete = canDelete ? () => void remove.start({ key: recordKey, title, etag: stored.etag, snapshot: stored.record }) : undefined
  const { actions, prompt } = useRecordActions({ model, stored, recordKey, onDelete: startDelete })
  const details = useMemo(() => ({ kind: 'record' as const, resource: model.name, key: recordKey, standard: true }), [model.name, recordKey])
  // Open details stands before Delete, which stays last
  const danger = actions.filter((action) => action.tone === 'danger')
  const barActions = [
    ...actions.filter((action) => action.tone !== 'danger'),
    ...(editor.dirty ? [{ name: text('discardChanges'), icon: Undo2, onRun: () => setAskDiscard(true) }] : []),
    { name: text('detailsOf', { noun }), icon: ListTree, render: ({ className, children, role }: { className: string; children: React.ReactNode; role?: 'menuitem' }) => <AppLink to={details} role={role} className={className}>{children}</AppLink> },
    ...danger,
  ]
  const record: FocusRecord = {
    model,
    record: stored.record,
    key: recordKey,
    ...(stored.etag !== undefined && { etag: stored.etag }),
    ...(stored.permissions && { permissions: stored.permissions }),
    readOnly,
    mayUpdate,
    value: editor.value,
    // A read-only page changes and saves nothing, whatever its surface asks
    change: (name, next) => (readOnly ? undefined : editor.change(name, next)),
    dirty: editor.dirty,
    saving: editor.saving,
    refused: editor.message !== undefined,
    save: async () => !readOnly && Boolean(await editor.save()),
    discard: editor.discard,
    details,
  }
  const surfaceField = 'surface' in page ? page.surface : undefined
  const discardNotice = askDiscard && editor.dirty && (
    <FocusNotice
      level="draft"
      actions={
        <>
          <Button size="sm" variant="danger" onClick={() => { editor.discard(); setAskDiscard(false) }}>{text('discardChanges')}</Button>
          <Button size="sm" onClick={() => setAskDiscard(false)}>{text('keep')}</Button>
        </>
      }
    >
      {text('discardAsk')}
    </FocusNotice>
  )
  const conflict = Object.keys(editor.conflicts).length > 0
  // The surface's own field has no form around it to mark, so what is wrong with it is said here
  const refusedField = surfaceField ? editor.errors[surfaceField] : undefined
  const surfaceProblem = refusedField && surfaceField ? fieldMessage(model.fields[surfaceField]!, view?.fields[surfaceField]?.label ?? humanize(surfaceField), refusedField) : undefined
  return (
    <FocusRecordContext.Provider value={record}>
      {!readOnly && <SaveButton record={record} label={text('save')} />}
      <SaveState record={record} saved={editor.phase === 'saved'} readOnly={readOnly} />
      <FocusActions actions={barActions} />
      {editor.message && !askDiscard && (
        <FocusNotice level="refused" actions={<AppLink to={details} className="text-body font-medium text-primary-text hover:underline">{text('detailsOf', { noun })}</AppLink>}>
          <strong className="font-medium">{text('notSaved')}</strong> {surfaceProblem ?? editor.message}
        </FocusNotice>
      )}
      {conflict && (
        <FocusNotice
          level="conflict"
          actions={Object.keys(editor.conflicts).flatMap((name) => [
            <Button key={`mine:${name}`} size="sm" onClick={() => editor.keepMine(name)}>{text('keepMine')}</Button>,
            <Button key={`theirs:${name}`} size="sm" onClick={() => editor.useTheirs(name)}>{text('useTheirs')}</Button>,
          ])}
        >
          {text('conflict')}
        </FocusNotice>
      )}
      {discardNotice}
      {editor.restored && !askDiscard && (
        <FocusNotice
          level="draft"
          actions={
            <>
              <Button size="sm" onClick={editor.dismissRestored}>{text('keep')}</Button>
              <Button size="sm" onClick={editor.discard}>{text('discard')}</Button>
            </>
          }
        >
          {text('restored')}
        </FocusNotice>
      )}
      {surfaceField ? <FieldSurface model={model} name={surfaceField} stored={stored} editor={editor} readOnly={readOnly} /> : <ComponentSurface name={(page as { component: string }).component} model={model} stored={stored} recordKey={recordKey} />}
      {remove.dialogs}
      {prompt}
    </FocusRecordContext.Provider>
  )
}

type Editor = ReturnType<typeof useRecordEditor>

// One field fills the surface, drawn by its field type
const FieldSurface = ({ model, name, stored, editor, readOnly }: { model: ResourceModel; name: string; stored: LiveRecord; editor: Editor; readOnly: boolean }) => {
  const hints = useAdminMeta().views[model.name]?.fields[name]
  // Hidden from this reader, the field is not drawn: the page's boundary shows the form, which leaves it out too
  if (fieldAccess(stored.permissions, name) === 'hidden') throw new Error(`The surface's field ${name} is hidden from this reader`)
  return (
    <div className="absolute inset-0">
      <FieldEditor field={model.fields[name]!} hints={hints} value={editor.value(name)} stored={stored.record[name]} locked={readOnly} invalid={Boolean(editor.errors[name])} resource={model.name} onChange={(next) => editor.change(name, next)} />
    </div>
  )
}

const ComponentSurface = ({ name, model, stored, recordKey }: { name: string; model: ResourceModel; stored: LiveRecord; recordKey: string }) => {
  const Component = useProjectUi().components?.[name]
  if (!Component) throw new Error(`No component is registered as ${name}`)
  return (
    <div className="absolute inset-0">
      <RecordScope value={{ model, record: stored.record, key: recordKey, etag: stored.etag, permissions: stored.permissions }}>
        <Component />
      </RecordScope>
    </div>
  )
}

/**
 * A record's page as a focus page, as `.record(...)` asks: the bar's state, Save and actions, the notices of a save, and
 * the surface, one field or the app's component, with the record's standard form a link away. The form shows instead
 * when the surface throws.
 */
export const RecordFocusPage = ({ model, recordKey, stored, page, standard }: RecordFocusPageProps) => {
  const title = useRecordTitle()(model, useAdminMeta().views[model.name], stored.record, recordKey)
  return (
    <CustomBoundary name={'surface' in page ? page.surface : page.component} fallback={standard}>
      <FocusPage label={title}>
        <RecordFocus model={model} recordKey={recordKey} stored={stored} page={page} />
      </FocusPage>
    </CustomBoundary>
  )
}
