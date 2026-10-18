import type {
  ActionModel,
  CreateModel,
  ExportModel,
  FilterWidgetModel,
  HelpWhen,
  LayoutItemModel,
  RecordMode,
  SaveFeedback,
  SortSpec,
  NavModel,
  NavRecentModel,
  ListDisplayModel,
  ResourceModel,
  SaveSearchModel,
  SearchesOfModel,
  SignInPromptModel,
  ViewModel,
} from './model'
import { isMenuHref } from './menu-href'
import { navRecentErrors } from './nav-recent'
import { createRefs, ref, type FieldRefs, type Ref } from './refs'
import { actions } from './view-actions'
import { chartModel, type ChartInput } from './view-chart'
import { formModel, type FormInput } from './view-form'
import { columns as listColumns, isListColumn, type ListColumn } from './view-columns'
import { boardErrors, displayErrors, displayFields, displays } from './view-displays'
import { FieldView } from './view-field'
import { widgets } from './view-widgets'

type FieldsOf<R extends { readonly $fields: unknown }> = R['$fields']

// The saved search's own fields: text for the filter and name, a timestamp for when its results were last opened.
const searchesOfErrors = (searches: SearchesOfModel, resource: ResourceModel) => {
  const typed = (role: string, name: string | undefined, type: string) =>
    name === undefined || resource.fields[name]?.type === type ? [] : [`${role} "${name}" is not a ${type} field of the resource`]
  return [
    ...typed('filter', searches.filter, 'text'),
    ...typed('name', searches.name, 'text'),
    ...typed('unseen.seenAt', searches.unseen?.seenAt, 'timestamp'),
    ...(searches.controls ?? []).flatMap((name) => (['enum', 'boolean'].includes(resource.fields[name]?.type ?? '') ? [] : [`control "${name}" is not an enum or boolean field of the resource`])),
    ...(searches.limit === undefined || (Number.isInteger(searches.limit) && searches.limit > 0) ? [] : ['limit must be a positive whole number']),
  ]
}

/**
 * `nav(...)` with `recent.status` limited to the resource's fields.
 *
 * @inline
 */
type NavInput<R extends { readonly $fields: unknown }> = Omit<NavModel, 'recent'> & {
  recent?: Omit<NavRecentModel, 'status'> & { status: keyof FieldsOf<R> & string }
}

/** The `r` of `.fields((r) => ...)`: a field view per field of the resource, to give hints such as `.label()`. */
export type FieldViews<R extends {
  /** The resource's fields, as `resource(...)` declares them. */
  readonly $fields: unknown
}> = {
  readonly [K in keyof FieldRefs<FieldsOf<R>> & string]: FieldView<K, NonNullable<FieldRefs<FieldsOf<R>>[K]['$value']>>
}

/**
 * A view of a resource, as `view(...)` starts it: how the admin shows it. Each method returns a new view, so one view
 * can build on another. See [UI config](website/src/content/docs/reference/ui-config.mdx).
 */
export class ViewBuilder<R extends {
  /** The resource's fields, as `resource(...)` declares them. */
  readonly $fields: unknown
}> {
  /** @internal */
  constructor(
    /** @internal */
    readonly state: ViewModel,
  ) {}

  /** What a record and the records are called, such as "New repair" and "Repairs"; the resource name in words by default. */
  names(names: { singular: string; plural: string }) {
    return this.next({ names })
  }

  /** An icon name carried in `/meta`, for apps that draw their own shell; the admin picks sidebar icons by resource name. */
  icon(icon: string) {
    return this.next({ icon })
  }

  /** Shows this view only to users with one of these roles; a view without roles is the default. */
  forRoles(roles: string[]) {
    return this.next({ roles })
  }

  /** The field shown as this record's title. Throws when the field does not exist. */
  title(pick: (r: FieldRefs<FieldsOf<R>>) => Ref) {
    return this.next({ title: pick(this.refs()).name })
  }

  /**
   * How a record shows in the global search: a bold `title` of one or more fields joined by spaces (default: `title`)
   * and a `subtitle` field under it, replaced by the search field the text matched when that is neither.
   */
  searchResult(pick: (r: FieldRefs<FieldsOf<R>>) => { title?: Ref | Ref[]; subtitle?: Ref }) {
    const { title, subtitle } = pick(this.refs())
    const titles = title === undefined ? [] : Array.isArray(title) ? title : [title]
    return this.next({ searchResult: { ...(titles.length > 0 && { title: titles.map((ref) => ref.name) }), ...(subtitle && { subtitle: subtitle.name }) } })
  }

  /** Where the resource sits in the sidebar; `recent` lists a few of its records under the entry (see [Sidebar](website/src/content/docs/reference/sidebar.md#recent-records)). */
  nav(nav: NavInput<R>) {
    return this.next({ nav })
  }

  /** A line under the list's title. */
  help(help: string) {
    return this.next({ help })
  }

  /** Hints per field, such as `{ total: r.total.prefix('€').decimals(2) }`; calls add up. */
  fields(build: (r: FieldViews<R>) => Record<string, FieldView>) {
    const built = build(createRefs((name) => new FieldView(name)))
    const fields = Object.fromEntries(Object.values(built).map((v) => [v.name, v.props]))
    return this.next({ fields: { ...this.state.fields, ...fields } })
  }

  /**
   * The list: its table's `columns`, fields or columns of related records (`c.related`), `sort` and `search`, the
   * columns that are `editable` in their cell, and other `displays` to switch to (`d.cards`, `d.map`, `d.board`, `d.custom`), one of which
   * may be the `default` the list opens in. Throws when display or column names collide, `default` names none or an
   * editable field is not among the columns. See
   * [Editing in the list](website/src/content/docs/reference/ui-config.mdx#editing-in-the-list).
   */
  list(
    build: (
      r: FieldRefs<FieldsOf<R>>,
      d: typeof displays,
      c: typeof listColumns,
    ) => {
      columns: Array<Ref | ListColumn>
      sort?: Array<[Ref, 'asc' | 'desc']>
      search?: Ref[]
      editable?: Ref[]
      displays?: ListDisplayModel[]
      default?: string
    },
  ) {
    const { columns, sort, search, editable, displays: shown = [], default: opens } = build(this.refs(), displays, listColumns)
    const related = columns.filter(isListColumn).map(({ kind: _, ...column }) => column)
    const names = columns.map((column) => column.name)
    const repeated = names.find((name, index) => names.indexOf(name) !== index)
    if (repeated !== undefined) throw new Error(`View "${this.state.resource}": the list has two columns named "${repeated}"`)
    const stray = editable?.find((ref) => !names.includes(ref.name))
    if (stray) throw new Error(`View "${this.state.resource}": editable field "${stray.name}" is not among the list's columns`)
    const list = {
      columns: names,
      ...(related.length > 0 && { relatedColumns: related }),
      ...(sort && { sort: sort.map(([ref, dir]) => [ref.name, dir]) as SortSpec }),
      ...(search && { search: search.map((ref) => ref.name) }),
      ...(editable && editable.length > 0 && { editable: editable.map((ref) => ref.name) }),
      ...(shown.length > 0 && { displays: shown }),
      ...(opens !== undefined && { default: opens }),
    }
    const errors = displayErrors(list)
    if (errors.length > 0) throw new Error(`View "${this.state.resource}": ${errors.join('; ')}`)
    return this.next({ list })
  }

  /**
   * The filter widgets above the list, in order, each on a `.filterable()` field: `w.facets`, `w.dateRange`, `w.range`,
   * `w.toggle` and `w.flags`. Together they write the list's `?filter=`.
   */
  filters(build: (r: FieldRefs<FieldsOf<R>>, w: typeof widgets) => FilterWidgetModel[]) {
    return this.next({ filters: build(this.refs(), widgets) })
  }

  /**
   * The record page, as items of `l` in order: sections, sidebar cards, related records, maps and custom components.
   * Without it the page shows one section with every field.
   */
  layout(build: (r: FieldRefs<FieldsOf<R>>) => LayoutItemModel[]) {
    return this.next({ layout: build(this.refs()) })
  }

  /**
   * A chart above the list, following its filters: records per `granularity` over a date or timestamp `field`, or
   * records per value of `groupBy`, such as a status or a relation, as bars or a donut of the `limit` largest (default
   * 10), counted or with `sum` or `average` that of a numeric field.
   */
  chart(build: (r: FieldRefs<FieldsOf<R>>) => ChartInput) {
    return this.next({ chart: chartModel(build(this.refs())) })
  }

  /**
   * A public form that creates a record of this resource for anyone, signed in or not, at `/-/forms/<name>`: the
   * `fields` a visitor fills in, the `thanks` shown once it is sent, a `title` (the view's singular name by default) and
   * how many submissions one client may send `perMinute` (default 5). The `anonymous` role must grant `create` of those
   * fields; the form is the only way it creates. Each call adds a form. Throws on a name that does not fit an address, no
   * or repeated fields, or an empty `thanks`. See [Public forms](website/src/content/docs/reference/forms.mdx).
   */
  form(build: (r: FieldRefs<FieldsOf<R>>) => FormInput) {
    return this.next({ forms: [...(this.state.forms ?? []), formModel(build(this.refs()))] })
  }

  /**
   * How the record page opens to a user who may change the record: `edit`, the default, as its form; `read` as a read
   * view, its sections as tables of labels and values, with an Edit button to the form; `locked` as the form, locked
   * until Edit is pressed. A user who may not change it gets the read view in every mode. The form has its own address
   * (`edit: true`), so it opens in a new tab and Back leaves it. See [The record page](website/src/content/docs/reference/ui-config.mdx#read-view-and-edit).
   */
  recordMode(recordMode: RecordMode) {
    return this.next({ recordMode })
  }

  /**
   * When the help lines of the view's fields and sections show: `always`, the default, or only while the record is
   * `editing`, on its form; a field's `.help(text, { when })` or a section's `helpWhen` says otherwise for its own.
   */
  helpWhen(helpWhen: HelpWhen) {
    return this.next({ helpWhen })
  }

  /** Where the record page shows that it saved: a toast (the default) or the Save button. */
  saveFeedback(saveFeedback: SaveFeedback) {
    return this.next({ saveFeedback })
  }

  /**
   * Whether the list page offers Import, which creates or updates records from an .xlsx or CSV file the user picks
   * (`true`, the default, to users who may create records); `.import(false)` turns it off. See
   * [Importing records](website/src/content/docs/reference/ui-config.mdx#importing-records).
   */
  import(enabled: boolean) {
    return this.next({ import: enabled })
  }

  /**
   * The named actions of the record page's action rail, which composed pages can put on buttons too: `a.update`,
   * `a.remove` and `a.link` need no code, `a.action` runs a handler the app registers.
   */
  actions(build: (a: typeof actions) => ActionModel[]) {
    return this.next({ actions: build(actions) })
  }

  /**
   * The list page shows the records this relation field points at instead of this resource's rows, in their own view's
   * list with its displays, filters and search: the listings among a member's favorites, say. The record pages stay this
   * resource's. Throws in `toModel` when the field is not a relation.
   */
  listOf(pick: (r: FieldRefs<FieldsOf<R>>) => Ref) {
    return this.next({ listOf: pick(this.refs()).name })
  }

  /**
   * What a visitor who is not signed in is told about this resource, which they could use once signed in: on its list
   * page, in place of the list, and in the dialog of a card's favorite button or a list's "Save search" button that
   * saves here. The page offers "Sign in", and a way to make an account: the page `signUp` names, or the app's own sign-up
   * when the server has [open sign-up](website/src/content/docs/reference/auth.md#open-sign-up). With it, the resource keeps its place in the bottom
   * bar and the sidebar of visitors. Throws when `signUp.href` is not `https:`, `http:` or `mailto:`. See
   * [Sign-in prompts](website/src/content/docs/reference/ui-config.mdx#sign-in-prompts).
   */
  signIn(prompt: SignInPromptModel) {
    if (prompt.signUp && !isMenuHref(prompt.signUp.href)) throw new Error(`View "${this.state.resource}": signIn signUp.href must start with https://, http:// or mailto:`)
    return this.next({ signIn: structuredClone(prompt) })
  }

  /**
   * A "Save search" button on the list page while its filter narrows it: it saves the filter as a record of `resource`,
   * the signed-in user's own, whose view lists them with `.searchesOf(...)`, and takes it off again while pressed. A
   * visitor is told what signing in gives, when that view has `.signIn(...)`. See
   * [Saved searches](website/src/content/docs/reference/ui-config.mdx#saved-searches).
   */
  saveSearch(search: SaveSearchModel) {
    return this.next({ saveSearch: { ...search } })
  }

  /**
   * Whether the list page offers Export, which saves its rows as an Excel or CSV file built in the browser: `false`
   * takes it away, `{ maxRows }` limits how many rows a file holds. A list offers it by default. It only shapes the
   * page: the rows and fields a file holds are those the list API gives the user. Throws when `maxRows` is not a
   * positive whole number. See [Exports](website/src/content/docs/reference/ui-config.mdx#exports).
   */
  export(options: false | ExportModel) {
    if (options && options.maxRows !== undefined && !(Number.isInteger(options.maxRows) && options.maxRows > 0)) {
      throw new Error(`View "${this.state.resource}": export maxRows must be a positive whole number`)
    }
    return this.next({ export: options && { ...options } })
  }

  /**
   * Records are created on `page`, a composed page of the app's own, in place of the create form: `/<resource>/new`
   * shows it with the address's `values`, and the list's New button opens it for whoever may open the page, whatever the
   * resource's `create` access. So the resource's API can refuse creates (`create: never`) while the page creates
   * through an API function. The server refuses a page that does not exist when it starts. See
   * [Create pages](website/src/content/docs/reference/ui-config.mdx#create-pages).
   */
  create(options: CreateModel) {
    return this.next({ create: { ...options } })
  }

  /**
   * This resource holds saved searches of `resource`, which a list page saves with `.saveSearch(...)`: its list page
   * shows each of the user's searches with its filters, its `controls` to change in place, the records it finds (with
   * `unseen`, newest first, those new since the user last opened its results marked) and a link to all of them. Throws in
   * `toModel` when `filter` or `name` is not a text field, `unseen.seenAt` not a timestamp or a control not an enum or
   * boolean field.
   * See [Saved searches](website/src/content/docs/reference/ui-config.mdx#saved-searches).
   */
  searchesOf(
    pick: (r: FieldRefs<FieldsOf<R>>) => {
      resource: string
      filter: Ref
      name?: Ref
      controls?: Ref[]
      unseen?: { seenAt: Ref; field: string }
      limit?: number
    },
  ) {
    const { resource, filter, name, controls, unseen, limit } = pick(this.refs())
    const searches: SearchesOfModel = {
      resource,
      filter: filter.name,
      ...(name && { name: name.name }),
      ...(controls && { controls: controls.map((control) => control.name) }),
      ...(unseen && { unseen: { seenAt: unseen.seenAt.name, field: unseen.field } }),
      ...(limit !== undefined && { limit }),
    }
    return this.next({ searchesOf: searches })
  }

  /** With the resource's model, also verifies the title, search result and list display fields, related column names, a gallery's image, `listOf`, `searchesOf`, the sidebar's `recent` group and the forms' fields. */
  toModel(resource?: ResourceModel): ViewModel {
    const { title, nav, searchResult, list, listOf } = this.state
    if (resource && title !== undefined && !Object.hasOwn(resource.fields, title)) {
      throw new Error(`View "${this.state.resource}": title field "${title}" does not exist on the resource`)
    }
    const missing = resource ? [...(searchResult?.title ?? []), ...(searchResult?.subtitle ? [searchResult.subtitle] : [])].filter((name) => !Object.hasOwn(resource.fields, name)) : []
    if (missing.length > 0) throw new Error(`View "${this.state.resource}": search result field "${missing[0]}" does not exist on the resource`)
    for (const display of resource ? (list?.displays ?? []) : []) {
      const unknown = displayFields(display).find((name) => !Object.hasOwn(resource!.fields, name))
      if (unknown !== undefined) throw new Error(`View "${this.state.resource}": display "${display.name}" names field "${unknown}", which the resource does not have`)
      if (display.kind === 'cards' && display.image !== undefined && resource!.fields[display.image]!.type !== 'file') {
        throw new Error(`View "${this.state.resource}": display "${display.name}" shows "${display.image}" as its image, which is not a file field`)
      }
      const flag = display.kind === 'cards' ? display.flags?.find((name) => resource!.fields[name]!.type !== 'boolean') : undefined
      if (flag !== undefined) throw new Error(`View "${this.state.resource}": display "${display.name}" shows "${flag}" as a flag, which is not a boolean field`)
      const board = display.kind === 'board' ? boardErrors(display, resource!) : []
      if (board.length > 0) throw new Error(`View "${this.state.resource}": display "${display.name}": ${board.join('; ')}`)
    }
    const clash = resource ? list?.relatedColumns?.find((column) => Object.hasOwn(resource.fields, column.name)) : undefined
    if (clash) throw new Error(`View "${this.state.resource}": related column "${clash.name}" has the name of a field of the resource`)
    for (const item of resource ? this.state.layout : []) {
      if (item.kind !== 'gallery' || item.image === undefined) continue
      if (!Object.hasOwn(resource!.fields, item.image)) throw new Error(`View "${this.state.resource}": gallery "${item.title}" names field "${item.image}", which the resource does not have`)
      if (resource!.fields[item.image]!.type !== 'file') throw new Error(`View "${this.state.resource}": gallery "${item.title}" shows "${item.image}" as its image, which is not a file field`)
    }
    if (resource && listOf !== undefined && (!Object.hasOwn(resource.fields, listOf) || resource.fields[listOf]!.type !== 'relation')) {
      throw new Error(`View "${this.state.resource}": listOf names "${listOf}", which is not a relation field of the resource`)
    }
    const searchErrors = resource && this.state.searchesOf ? searchesOfErrors(this.state.searchesOf, resource) : []
    if (searchErrors.length > 0) throw new Error(`View "${this.state.resource}": searchesOf ${searchErrors.join('; ')}`)
    for (const form of resource ? (this.state.forms ?? []) : []) {
      const unknown = form.fields.find((name) => !Object.hasOwn(resource!.fields, name))
      if (unknown !== undefined) throw new Error(`View "${this.state.resource}": form "${form.name}" names field "${unknown}", which the resource does not have`)
    }
    const recentErrors = resource && nav?.recent ? navRecentErrors(nav.recent, resource) : []
    if (recentErrors.length > 0) throw new Error(`View "${this.state.resource}": nav.recent ${recentErrors.join('; ')}`)
    return structuredClone(this.state)
  }

  private refs() {
    return createRefs<FieldRefs<FieldsOf<R>>>(ref)
  }

  private next(patch: Partial<ViewModel>) {
    return new ViewBuilder<R>({ ...this.state, ...patch })
  }
}

/**
 * Starts the view of a resource: how the admin shows it. Pass the resource's type, so every field reference (`r.status`)
 * is checked against it. See [UI config](website/src/content/docs/reference/ui-config.mdx).
 *
 * @example
 * ```ts
 * import { view } from '@protobase/schema'
 * import type { repairs } from './data'
 *
 * export const repairsView = view<typeof repairs>('repairs')
 *   .names({ singular: 'Repair', plural: 'Repairs' })
 *   .list((r) => ({ columns: [r.number, r.status, r.booked_on], sort: [[r.booked_on, 'desc']] }))
 * ```
 */
export const view = <R extends {
  /** The resource's fields, as `resource(...)` declares them. */
  readonly $fields: unknown
}>(resource: string) =>
  new ViewBuilder<R>({ resource, fields: {}, filters: [], layout: [], actions: [] })
