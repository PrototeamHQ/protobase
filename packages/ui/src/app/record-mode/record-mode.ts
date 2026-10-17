import type { FieldViewModel, HelpWhen, RecordMode, ShowWhen, ViewModel } from '@protobase/schema'

/** What the record page draws: its form, ready to change; the same form, locked; or the read view. */
export type RecordShown = 'form' | 'locked' | 'read'

/**
 * What the record page shows a user, by the view's `mode`, whether they may change the record and whether its address
 * asks for the form (`edit`). A user who may not change the record gets the read view in every mode, at any address.
 * To one who may, always editable (`edit`, the default) shows the form and ignores `edit`; `read` and `locked` show the
 * read view or the locked form until the address asks for the form. `offersEdit` is whether the page links to the
 * form; `editing` whether the record is being edited, which decides the help shown only while editing.
 */
export const recordShown = (mode: RecordMode | undefined, canUpdate: boolean, edit: boolean): { shown: RecordShown; offersEdit: boolean; editing: boolean } => {
  if (!canUpdate) return { shown: 'read', offersEdit: false, editing: false }
  if (mode === undefined || mode === 'edit') return { shown: 'form', offersEdit: false, editing: true }
  if (edit) return { shown: 'form', offersEdit: false, editing: true }
  return { shown: mode, offersEdit: canUpdate, editing: false }
}

/** Whether a help line shows: always, unless it, or else the view, says only while editing and the record is not. */
export const helpShown = (own: HelpWhen | undefined, view: ViewModel | undefined, editing: boolean) => (own ?? view?.helpWhen ?? 'always') === 'always' || editing

/** A field's help line on the record page, when it shows. */
export const fieldHelp = (hints: FieldViewModel | undefined, view: ViewModel | undefined, editing: boolean) =>
  hints?.help !== undefined && helpShown(hints.helpWhen, view, editing) ? hints.help : undefined

/** Whether a field or layout item shows: always, unless it says only while editing or only while reading and the page is not. */
export const whenShown = (when: ShowWhen | undefined, editing: boolean) => {
  if (when === 'editing') return editing
  if (when === 'reading') return !editing
  return true
}
