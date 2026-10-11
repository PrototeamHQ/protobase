import { markFieldRefs } from './field-ref'
import type { JsonValue, LayoutItemModel, RelatedModel } from './model'
import type { Ref } from './refs'
import { customComponent, type ComponentRef, type ViewProps } from './view-displays'

export const layout = {
  section: (title: string, fields: Ref[], o: { help?: string } = {}): LayoutItemModel => ({
    kind: 'section',
    title,
    fields: fields.map((ref) => ref.name),
    ...(o.help !== undefined && { help: o.help }),
  }),
  sidebar: (fields: Ref[]): LayoutItemModel => ({
    kind: 'sidebar',
    fields: fields.map((ref) => ref.name),
  }),
  /** A table of the records of another resource that point at this one, directly or through a join table. */
  related: (title: string, o: Omit<RelatedModel, 'kind' | 'title'>): LayoutItemModel => ({ kind: 'related', title, ...structuredClone(o) }),
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
