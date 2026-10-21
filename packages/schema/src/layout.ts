import { markFieldRefs } from './field-ref'
import type { CardPhotosModel, RecordChartRange, CommentsSectionModel, GroupItemModel, HelpWhen, HistorySectionModel, JsonValue, LayoutItemModel, RecordWhen, RelatedModel, SectionPresentation, ShowWhen, TabItemModel } from './model'
import type { Ref } from './refs'
import { customComponent, type ComponentRef, type ViewProps } from './view-displays'

/**
 * The items of a record page, for a view's `.layout((r) => [...])`, exported as `l`. See
 * [The record page](website/src/content/docs/reference/ui-config.mdx#the-record-page).
 *
 * @example
 * ```ts
 * view<typeof repairs>('repairs').layout((r) => [
 *   l.section('Repair', [r.bike, r.problem, r.status]),
 *   l.sidebar([r.booked_on, r.estimate]),
 *   l.related('Parts used', { resource: 'repair_parts', field: 'repair_id' }),
 * ])
 * ```
 *
 * Every item shows on both the form and the read view unless its `when` says `editing` (the form and the create form)
 * or `reading` (the read view and the locked form). See
 * [Form and read view](website/src/content/docs/reference/ui-config.mdx#form-and-read-view).
 */
export const layout = {
  /**
   * A titled group of fields in the main column, editable where the user may write; `help` is a line under the title,
   * shown only while the record is edited with `helpWhen: 'editing'` (the view's `.helpWhen(...)` when omitted).
   * `presentation: 'facts'` shows the read view's fields as a row of key facts, as a listing on a real estate site does:
   * each value under its field's `.icon(...)`, or under its label without one, leaving out the empty ones. See
   * [Key facts](website/src/content/docs/reference/ui-config.mdx#key-facts).
   */
  section: (title: string, fields: Ref[], o: { help?: string; helpWhen?: HelpWhen; presentation?: SectionPresentation; when?: RecordWhen } = {}): LayoutItemModel => ({
    kind: 'section',
    title,
    fields: fields.map((ref) => ref.name),
    ...(o.help !== undefined && { help: o.help }),
    ...(o.helpWhen !== undefined && { helpWhen: o.helpWhen }),
    ...(o.presentation !== undefined && { presentation: o.presentation }),
    ...(o.when !== undefined && { when: o.when }),
  }),
  /**
   * The record's photos as tiles in the main column, one large and the next four smaller, the last saying how many more
   * there are, each opening a lightbox that steps through them all: first `image`, a file field of the record, then the
   * `image` of the records of `photos.resource` whose relation `photos.field` points at the record, in `photos.sort`
   * order, as a cards display's `photos` names them. In the lightbox, a user who may read a photo's record opens its
   * details. Throws without `image` or `photos`. See
   * [Galleries](website/src/content/docs/reference/ui-config.mdx#galleries).
   */
  gallery: (title: string, o: { image?: Ref; photos?: CardPhotosModel; when?: ShowWhen }): LayoutItemModel => {
    if (!o.image && !o.photos) throw new Error(`l.gallery "${title}" needs an image field, photos or both`)
    return {
      kind: 'gallery',
      title,
      ...(o.image && { image: o.image.name }),
      ...(o.photos && { photos: { ...o.photos } }),
      ...(o.when !== undefined && { when: o.when }),
    }
  },
  /** A read-only summary card of fields beside the main column. */
  sidebar: (fields: Ref[], o: { when?: RecordWhen } = {}): LayoutItemModel => ({
    kind: 'sidebar',
    fields: fields.map((ref) => ref.name),
    ...(o.when !== undefined && { when: o.when }),
  }),
  /**
   * A heading over sections and related tables in the main column; `collapsed: true` keeps it closed until the person
   * opens it, or a link to the record does (the address names the open groups by title). Throws on any other item. See
   * [Groups](website/src/content/docs/reference/ui-config.mdx#groups).
   */
  group: (title: string, items: LayoutItemModel[], o: { collapsed?: boolean; when?: RecordWhen } = {}): LayoutItemModel => {
    const wrong = items.find((item) => item.kind !== 'section' && item.kind !== 'related')
    if (wrong) throw new Error(`l.group "${title}" holds sections and related tables, not ${wrong.kind}`)
    return {
      kind: 'group',
      title,
      items: items as GroupItemModel[],
      ...(o.collapsed && { collapsed: true }),
      ...(o.when !== undefined && { when: o.when }),
    }
  },
  /**
   * A tab of the record page holding main-column items: sections, groups, related tables, custom components, maps,
   * charts, galleries, history and comments. A view's tabs stand together and show as one strip, the first tab open unless the
   * address names another; items before and after them show on every tab. Throws on a sidebar item or another tab. See
   * [Tabs](website/src/content/docs/reference/ui-config.mdx#tabs).
   */
  tab: (title: string, items: LayoutItemModel[]): LayoutItemModel => {
    const wrong = items.find((item) => item.kind === 'sidebar' || item.kind === 'tab' || ((item.kind === 'custom' || item.kind === 'map') && item.sidebar))
    if (wrong) throw new Error(`l.tab "${title}" holds main-column items, not ${wrong.kind === 'sidebar' || wrong.kind === 'tab' ? wrong.kind : `a sidebar ${wrong.kind}`}`)
    return { kind: 'tab', title, items: items as TabItemModel[] }
  },
  /** A table of the records of another resource that point at this one, directly or through a join table. */
  related: (title: string, o: Omit<RelatedModel, 'kind' | 'title'>): LayoutItemModel => ({ kind: 'related', title, ...structuredClone(o) }),
  /**
   * A map with a marker at the record's position, read from two fields in decimal degrees (WGS84), at `zoom` (default
   * 15): in the main column, or in the sidebar with `sidebar: true`. The app draws it with the map style of the server's
   * `maps` option or `PROTOBASE_MAP_STYLE_URL`, and leaves it out without one, or for a record without a position.
   */
  map: (title: string, o: { latitude: Ref; longitude: Ref; zoom?: number; sidebar?: boolean; when?: ShowWhen }): LayoutItemModel => ({
    kind: 'map',
    title,
    latitude: o.latitude.name,
    longitude: o.longitude.name,
    ...(o.zoom !== undefined && { zoom: o.zoom }),
    ...(o.sidebar && { sidebar: true as const }),
    ...(o.when !== undefined && { when: o.when }),
  }),
  /**
   * Line graphs of numeric fields of the records of `resource` that point at this one through `field`, such as a
   * machine's metric samples, over their timestamp `at`: per minute over the last hour, per 5 minutes over the last day
   * and per hour over the last week, the average or the maximum of each bucket, opening on `range` (default `1h`). A
   * bucket without a sample is a gap. Throws without a series. See
   * [Charts of related records](website/src/content/docs/reference/ui-config.mdx#charts-of-related-records).
   */
  chart: (title: string, o: { resource: string; field: string; at: string; series: string[]; range?: RecordChartRange; help?: string; when?: ShowWhen }): LayoutItemModel => {
    if (o.series.length === 0) throw new Error(`l.chart "${title}" needs at least one series`)
    return {
      kind: 'chart',
      title,
      resource: o.resource,
      field: o.field,
      at: o.at,
      series: [...o.series],
      ...(o.range !== undefined && { range: o.range }),
      ...(o.help !== undefined && { help: o.help }),
      ...(o.when !== undefined && { when: o.when }),
    }
  },
  /**
   * The record's changes, newest first: who made each, when, and the fields before and after, only those the user may
   * read. `limit` changes show before Show more (default 10). Needs `.history()` on the resource; a view without a
   * layout shows it last by itself. See [Record history](website/src/content/docs/reference/history.mdx).
   */
  history: (title = 'History', o: { limit?: number; when?: ShowWhen } = {}): LayoutItemModel => {
    if (o.limit !== undefined && (!Number.isInteger(o.limit) || o.limit < 1)) throw new Error(`l.history "${title}": limit must be a positive whole number`)
    return {
      kind: 'history',
      title,
      ...(o.limit !== undefined && { limit: o.limit }),
      ...(o.when !== undefined && { when: o.when }),
    } satisfies HistorySectionModel
  },
  /**
   * The record's comments, oldest first, with who wrote each and when, and a box to write one; `@` mentions someone who
   * may read the record. Needs `.comments()` on the resource; a view without a layout shows it last by itself. See
   * [Record comments](website/src/content/docs/reference/comments.mdx).
   */
  comments: (title = 'Comments', o: { when?: ShowWhen } = {}): LayoutItemModel =>
    ({
      kind: 'comments',
      title,
      ...(o.when !== undefined && { when: o.when }),
    }) satisfies CommentsSectionModel,
  /**
   * A component of the project, registered in `protobase.ui.tsx` under its name, drawn where it is listed: in the main
   * column, or in the sidebar with `sidebar: true`. The record page stays around it, with its title, breadcrumbs,
   * actions and save; the component reads the record with `useLayoutRecord()`.
   */
  custom: <P extends object>(component: ComponentRef<P>, o: { title?: string; props?: ViewProps<P>; sidebar?: boolean; when?: ShowWhen } = {}): LayoutItemModel => ({
    kind: 'custom',
    component: customComponent(component as ComponentRef<never>, 'l.custom'),
    ...(o.title !== undefined && { title: o.title }),
    ...(o.props && { props: markFieldRefs(o.props) as Record<string, JsonValue> }),
    ...(o.sidebar && { sidebar: true as const }),
    ...(o.when !== undefined && { when: o.when }),
  }),
}
