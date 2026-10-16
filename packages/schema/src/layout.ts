import { markFieldRefs } from './field-ref'
import type { CardPhotosModel, HelpWhen, JsonValue, LayoutItemModel, RelatedModel, SectionPresentation } from './model'
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
 */
export const layout = {
  /**
   * A titled group of fields in the main column, editable where the user may write; `help` is a line under the title,
   * shown only while the record is edited with `helpWhen: 'editing'` (the view's `.helpWhen(...)` when omitted).
   * `presentation: 'facts'` shows the read view's fields as a row of key facts, as a listing on a real estate site does:
   * each value under its field's `.icon(...)`, or under its label without one, leaving out the empty ones. See
   * [Key facts](website/src/content/docs/reference/ui-config.mdx#key-facts).
   */
  section: (title: string, fields: Ref[], o: { help?: string; helpWhen?: HelpWhen; presentation?: SectionPresentation } = {}): LayoutItemModel => ({
    kind: 'section',
    title,
    fields: fields.map((ref) => ref.name),
    ...(o.help !== undefined && { help: o.help }),
    ...(o.helpWhen !== undefined && { helpWhen: o.helpWhen }),
    ...(o.presentation !== undefined && { presentation: o.presentation }),
  }),
  /**
   * The record's photos as tiles in the main column, one large and the next four smaller, the last saying how many more
   * there are, each opening a lightbox that steps through them all: first `image`, a file field of the record, then the
   * `image` of the records of `photos.resource` whose relation `photos.field` points at the record, in `photos.sort`
   * order, as a cards display's `photos` names them. In the lightbox, a user who may read a photo's record opens its
   * details. Throws without `image` or `photos`. See
   * [Galleries](website/src/content/docs/reference/ui-config.mdx#galleries).
   */
  gallery: (title: string, o: { image?: Ref; photos?: CardPhotosModel }): LayoutItemModel => {
    if (!o.image && !o.photos) throw new Error(`l.gallery "${title}" needs an image field, photos or both`)
    return {
      kind: 'gallery',
      title,
      ...(o.image && { image: o.image.name }),
      ...(o.photos && { photos: { ...o.photos } }),
    }
  },
  /** A read-only summary card of fields beside the main column. */
  sidebar: (fields: Ref[]): LayoutItemModel => ({
    kind: 'sidebar',
    fields: fields.map((ref) => ref.name),
  }),
  /** A table of the records of another resource that point at this one, directly or through a join table. */
  related: (title: string, o: Omit<RelatedModel, 'kind' | 'title'>): LayoutItemModel => ({ kind: 'related', title, ...structuredClone(o) }),
  /**
   * A map with a marker at the record's position, read from two fields in decimal degrees (WGS84), at `zoom` (default
   * 15): in the main column, or in the sidebar with `sidebar: true`. The app draws it with the map style of the server's
   * `maps` option or `PROTOBASE_MAP_STYLE_URL`, and leaves it out without one, or for a record without a position.
   */
  map: (title: string, o: { latitude: Ref; longitude: Ref; zoom?: number; sidebar?: boolean }): LayoutItemModel => ({
    kind: 'map',
    title,
    latitude: o.latitude.name,
    longitude: o.longitude.name,
    ...(o.zoom !== undefined && { zoom: o.zoom }),
    ...(o.sidebar && { sidebar: true as const }),
  }),
  /**
   * A component of the project, registered in `protobase.ui.tsx` under its name, drawn where it is listed: in the main
   * column, or in the sidebar with `sidebar: true`. The record page stays around it, with its title, breadcrumbs,
   * actions and save; the component reads the record with `useLayoutRecord()`.
   */
  custom: <P extends object>(component: ComponentRef<P>, o: { title?: string; props?: ViewProps<P>; sidebar?: boolean } = {}): LayoutItemModel => ({
    kind: 'custom',
    component: customComponent(component as ComponentRef<never>, 'l.custom'),
    ...(o.title !== undefined && { title: o.title }),
    ...(o.props && { props: markFieldRefs(o.props) as Record<string, JsonValue> }),
    ...(o.sidebar && { sidebar: true as const }),
  }),
}
