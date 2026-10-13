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
  ListDisplayModel,
  ResourceModel,
  SignInPromptModel,
  ViewModel,
} from './model'
import { isMenuHref } from './menu-href'
import { navRecentErrors } from './nav-recent'
import { createRefs, ref, type FieldRefs, type Ref } from './refs'
import { actions } from './view-actions'
import { displayErrors, displayFields, displays } from './view-displays'
import { FieldView } from './view-field'
import { widgets } from './view-widgets'

type FieldsOf<R extends { readonly $fields: unknown }> = R['$fields']

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
   * The list: its table's `columns`, `sort` and `search`, and other `displays` to switch to (`d.cards`, `d.custom`), one
   * of which may be the `default` the list opens in. Throws when display names collide or `default` names none.
   */
  list(
    build: (
      r: FieldRefs<FieldsOf<R>>,
      d: typeof displays,
    ) => {
      columns: Ref[]
      sort?: Array<[Ref, 'asc' | 'desc']>
      search?: Ref[]
      displays?: ListDisplayModel[]
      default?: string
    },
  ) {
    const { columns, sort, search, displays: shown = [], default: opens } = build(this.refs(), displays)
    const list = {
      columns: columns.map((ref) => ref.name),
      ...(sort && { sort: sort.map(([ref, dir]) => [ref.name, dir]) as SortSpec }),
      ...(search && { search: search.map((ref) => ref.name) }),
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

  /** A chart of records per `granularity` over a date or timestamp `field` above the list, following its filters. */
  chart(build: (r: FieldRefs<FieldsOf<R>>) => { field: Ref; range: ChartRange; granularity: ChartGranularity }) {
    const { field, range, granularity } = build(this.refs())
    return this.next({ chart: { field: field.name, range, granularity } })
  }

  /** Where the record page shows that it saved: a toast (the default) or the Save button. */
  saveFeedback(saveFeedback: SaveFeedback) {
    return this.next({ saveFeedback })
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
   * page, in place of the list, and in the dialog of a card's favorite button that saves here. The page offers "Sign
   * in", and a page to make an account when `signUp` names one. With it, the resource keeps its place in the bottom
   * bar and the sidebar of visitors. Throws when `signUp.href` is not `https:`, `http:` or `mailto:`. See
   * [Sign-in prompts](website/src/content/docs/reference/ui-config.mdx#sign-in-prompts).
   */
  signIn(prompt: SignInPromptModel) {
    if (prompt.signUp && !isMenuHref(prompt.signUp.href)) throw new Error(`View "${this.state.resource}": signIn signUp.href must start with https://, http:// or mailto:`)
    return this.next({ signIn: structuredClone(prompt) })
  }

  /** With the resource's model, also verifies the title, search result and list display fields, `listOf` and the sidebar's `recent` group. */
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
    }
    if (resource && listOf !== undefined && (!Object.hasOwn(resource.fields, listOf) || resource.fields[listOf]!.type !== 'relation')) {
      throw new Error(`View "${this.state.resource}": listOf names "${listOf}", which is not a relation field of the resource`)
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
