import { markFieldRefs } from './field-ref'
import type { JsonValue, LayoutItemModel, RelatedModel } from './model'
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
  /** A titled group of fields in the main column, editable where the user may write; `help` is a line under the title. */
  section: (title: string, fields: Ref[], o: { help?: string } = {}): LayoutItemModel => ({
    kind: 'section',
    title,
    fields: fields.map((ref) => ref.name),
    ...(o.help !== undefined && { help: o.help }),
  }),
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
