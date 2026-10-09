import type {
  ActionModel,
  ChartGranularity,
  ChartRange,
  FilterWidgetModel,
  LayoutItemModel,
  SaveFeedback,
  SortSpec,
  NavModel,
  NavRecentModel,
  ResourceModel,
  ViewModel,
} from './model'
import { navRecentErrors } from './nav-recent'
import { createRefs, type FieldRefs, type Ref } from './refs'
import { actions } from './view-actions'
import { FieldView } from './view-field'
import { widgets } from './view-widgets'

type FieldsOf<R extends { readonly $fields: unknown }> = R['$fields']

/** `nav(...)` with `recent.status` limited to the resource's fields. */
type NavInput<R extends { readonly $fields: unknown }> = Omit<NavModel, 'recent'> & {
  recent?: Omit<NavRecentModel, 'status'> & { status: keyof FieldsOf<R> & string }
}

type FieldViews<R extends { readonly $fields: unknown }> = {
  readonly [K in keyof FieldRefs<FieldsOf<R>> & string]: FieldView<K, NonNullable<FieldRefs<FieldsOf<R>>[K]['$value']>>
}

export class ViewBuilder<R extends { readonly $fields: unknown }> {
  constructor(readonly state: ViewModel) {}

  names(names: { singular: string; plural: string }) {
    return this.next({ names })
  }

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

  /** Where the resource sits in the sidebar; `recent` lists a few of its records under the entry (see https://docs.protobase.net/reference/sidebar/). */
  nav(nav: NavInput<R>) {
    return this.next({ nav })
  }

  help(help: string) {
    return this.next({ help })
  }

  fields(build: (r: FieldViews<R>) => Record<string, FieldView>) {
    const built = build(createRefs((name) => new FieldView(name)))
    const fields = Object.fromEntries(Object.values(built).map((v) => [v.name, v.props]))
    return this.next({ fields: { ...this.state.fields, ...fields } })
  }

  list(
    build: (r: FieldRefs<FieldsOf<R>>) => {
      columns: Ref[]
      sort?: Array<[Ref, 'asc' | 'desc']>
      search?: Ref[]
    },
  ) {
    const { columns, sort, search } = build(this.refs())
    return this.next({
      list: {
        columns: columns.map((ref) => ref.name),
        ...(sort && { sort: sort.map(([ref, dir]) => [ref.name, dir]) as SortSpec }),
        ...(search && { search: search.map((ref) => ref.name) }),
      },
    })
  }

  filters(build: (r: FieldRefs<FieldsOf<R>>, w: typeof widgets) => FilterWidgetModel[]) {
    return this.next({ filters: build(this.refs(), widgets) })
  }

  layout(build: (r: FieldRefs<FieldsOf<R>>) => LayoutItemModel[]) {
    return this.next({ layout: build(this.refs()) })
  }

  chart(build: (r: FieldRefs<FieldsOf<R>>) => { field: Ref; range: ChartRange; granularity: ChartGranularity }) {
    const { field, range, granularity } = build(this.refs())
    return this.next({ chart: { field: field.name, range, granularity } })
  }

  saveFeedback(saveFeedback: SaveFeedback) {
    return this.next({ saveFeedback })
  }

  actions(build: (a: typeof actions) => ActionModel[]) {
    return this.next({ actions: build(actions) })
  }

  /** With the resource's model, also verifies the title and search result fields and the sidebar's `recent` group. */
  toModel(resource?: ResourceModel): ViewModel {
    const { title, nav, searchResult } = this.state
    if (resource && title !== undefined && !Object.hasOwn(resource.fields, title)) {
      throw new Error(`View "${this.state.resource}": title field "${title}" does not exist on the resource`)
    }
    const missing = resource ? [...(searchResult?.title ?? []), ...(searchResult?.subtitle ? [searchResult.subtitle] : [])].filter((name) => !Object.hasOwn(resource.fields, name)) : []
    if (missing.length > 0) throw new Error(`View "${this.state.resource}": search result field "${missing[0]}" does not exist on the resource`)
    const recentErrors = resource && nav?.recent ? navRecentErrors(nav.recent, resource) : []
    if (recentErrors.length > 0) throw new Error(`View "${this.state.resource}": nav.recent ${recentErrors.join('; ')}`)
    return structuredClone(this.state)
  }

  private refs() {
    return createRefs<FieldRefs<FieldsOf<R>>>((name) => ({ name }))
  }

  private next(patch: Partial<ViewModel>) {
    return new ViewBuilder<R>({ ...this.state, ...patch })
  }
}

export const view = <R extends { readonly $fields: unknown }>(resource: string) =>
  new ViewBuilder<R>({ resource, fields: {}, filters: [], layout: [], actions: [] })
